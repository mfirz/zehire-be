/**
 * Public Apply Routes
 * ===================
 * Public endpoints for candidate job applications.
 *
 * Endpoints:
 * - POST /:slug/apply - Submit complete application (multipart, with optional CV)
 * - POST /:slug/apply/draft - Save progress (Save & Continue)
 * - GET /:slug/apply/draft/:draftId - Resume saved progress
 *
 * Design: All Required + Smart Design
 * - All 3 questions must be answered for submission
 * - Drafts can have partial answers and expire after 7 days
 * - CV can be included in the same request (multipart/form-data)
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { CvService } from "../../../domain/applications/cv.service";
import { ApplicationRepository } from "../../../domain/applications/repository";
import {
  DRAFT_EXPIRY_DAYS,
  PublicApplySchema,
  SaveDraftSchema,
  type DraftAnswer,
} from "../../../domain/applications/schemas";
import { JobRepository, type RenderedQuestionOutput } from "../../../domain/jobs";
import type { Env } from "../../../types/bindings";

// =============================================================================
// ROUTE SETUP
// =============================================================================

const applyRoutes = new Hono<{ Bindings: Env }>();

// =============================================================================
// POST /:slug/apply - Submit complete application (with optional CV)
// =============================================================================
// Requires multipart/form-data:
// - 'data' field: JSON string with application data
// - 'cv' field: optional CV file (PDF, DOC, DOCX)

applyRoutes.post("/apply", async (c) => {
  const slug = c.req.param("slug")!;
  const contentType = c.req.header("content-type") || "";

  // Require multipart/form-data
  if (!contentType.includes("multipart/form-data")) {
    return c.json(
      {
        error: "Content-Type must be multipart/form-data",
        hint: "Send 'data' field with JSON string and optional 'cv' file",
      },
      415
    );
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const dataField = formData.get("data");

  if (!dataField || typeof dataField !== "string") {
    return c.json({ error: "Missing 'data' field in form data" }, 400);
  }

  let input: {
    email: string;
    name: string;
    preferredName?: string;
    phone?: string;
    answers: Array<{ archetypeId: string; answerText: string }>;
    draftId?: string;
  };

  try {
    input = JSON.parse(dataField);
  } catch {
    return c.json({ error: "Invalid JSON in 'data' field" }, 400);
  }

  // Get optional CV file
  let cvFile: File | null = null;
  const file = formData.get("cv");
  if (file && typeof file === "object" && "stream" in file) {
    cvFile = file as File;
  }

  // Validate input with Zod
  const parseResult = PublicApplySchema.safeParse(input);
  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      400
    );
  }
  const validatedInput = parseResult.data;

  const jobRepository = new JobRepository(c.env.DB);
  const applicationRepository = new ApplicationRepository(c.env.DB);

  // 1. Find the job by slug (returns any status, allows better error messages)
  const job = await jobRepository.findBySlug(slug);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // 2. Verify job is published and has questions
  if (job.status !== "published") {
    return c.json({ error: "This job is not accepting applications" }, 400);
  }

  if (job.questionsStatus !== "completed" || !job.questions) {
    return c.json({ error: "This job is not ready for applications" }, 400);
  }

  // 3. Check for existing application (prevent duplicates)
  const existing = await applicationRepository.findExistingApplication(job.id, validatedInput.email);

  if (existing) {
    return c.json(
      {
        error: "You have already applied to this job",
        applicationId: existing.id,
      },
      409
    );
  }

  // 4. Validate CV if provided
  if (cvFile) {
    const cvService = new CvService(c.env.CV_BUCKET, applicationRepository);
    const cvError = cvService.validateFile(cvFile);
    if (cvError) {
      return c.json(
        {
          error: {
            code: cvError.code,
            message: cvError.message,
          },
        },
        400
      );
    }
  }

  // 5. Parse questions from job (trusted data from database)
  const questions = JSON.parse(job.questions) as RenderedQuestionOutput[];
  const questionData = questions.map((q) => ({
    archetypeId: q.archetypeId,
    questionText: q.questionText,
  }));

  // 6. Validate all questions have answers
  const questionArchetypeIds = new Set(questions.map((q) => q.archetypeId));
  const answerArchetypeIds = new Set(validatedInput.answers.map((a) => a.archetypeId));

  // Check for missing answers
  const missingAnswers: string[] = [];
  for (const archetypeId of questionArchetypeIds) {
    if (!answerArchetypeIds.has(archetypeId)) {
      missingAnswers.push(archetypeId);
    }
  }

  if (missingAnswers.length > 0) {
    return c.json(
      {
        error: "All questions must be answered",
        missingQuestions: missingAnswers,
        message: `Please answer all ${questions.length} questions to submit your application`,
      },
      400
    );
  }

  // Check for extra answers (questions not in the job)
  for (const archetypeId of answerArchetypeIds) {
    if (!questionArchetypeIds.has(archetypeId)) {
      return c.json({ error: `Unknown question: ${archetypeId}` }, 400);
    }
  }

  // 7. Capture geo data from Cloudflare
  const cf = c.req.raw.cf as { country?: string; timezone?: string } | undefined;
  const geoData: { country?: string; timezone?: string } = {};
  if (cf?.country) geoData.country = cf.country;
  if (cf?.timezone) geoData.timezone = cf.timezone;

  // 8. Create application with answers
  const { applicationId } = await applicationRepository.createApplication(
    job.id,
    validatedInput,
    questionData,
    geoData
  );

  // 9. Upload CV if provided
  let cvInfo: { filename: string; size: number } | null = null;
  if (cvFile) {
    const cvService = new CvService(c.env.CV_BUCKET, applicationRepository);
    const result = await cvService.upload(applicationId, cvFile);
    cvInfo = { filename: result.filename, size: result.size };
  }

  // 10. Delete draft if exists (user might have saved progress)
  if (validatedInput.draftId) {
    await applicationRepository.deleteDraft(validatedInput.draftId);
  } else {
    // Also try to delete by email (in case draftId wasn't passed)
    const existingDraft = await applicationRepository.getDraftByEmail(job.id, validatedInput.email);
    if (existingDraft) {
      await applicationRepository.deleteDraft(existingDraft.id);
    }
  }

  // 11. Queue signal extraction job
  await c.env.JOB_QUEUE.send({
    type: "evaluate_application" as const,
    applicationId,
    jobId: job.id,
    createdAt: new Date().toISOString(),
  });

  // 12. Return success
  return c.json(
    {
      success: true,
      applicationId,
      message: "Your application has been submitted successfully",
      cv: cvInfo,
    },
    201
  );
});

// =============================================================================
// POST /:slug/apply/draft - Save progress (Save & Continue)
// =============================================================================

applyRoutes.post("/apply/draft", zValidator("json", SaveDraftSchema), async (c) => {
  const slug = c.req.param("slug")!;
  const input = c.req.valid("json");

  const jobRepository = new JobRepository(c.env.DB);
  const applicationRepository = new ApplicationRepository(c.env.DB);

  // 1. Find the job by slug
  const job = await jobRepository.findBySlug(slug);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // 2. Verify job is published
  if (job.status !== "published") {
    return c.json({ error: "This job is not accepting applications" }, 400);
  }

  // 3. Check if already applied
  const existing = await applicationRepository.findExistingApplication(job.id, input.email);

  if (existing) {
    return c.json(
      {
        error: "You have already applied to this job",
        applicationId: existing.id,
      },
      409
    );
  }

  // 4. Save or update draft
  const { draftId, resumeToken, expiresAt } = await applicationRepository.saveDraft(job.id, input);

  // 5. Calculate progress
  const questions = (job.questions ? JSON.parse(job.questions) : []) as RenderedQuestionOutput[];
  const answeredCount = input.answers.filter((a) => a.answerText.trim().length > 0).length;

  return c.json(
    {
      success: true,
      draftId,
      resumeToken,
      expiresAt,
      progress: {
        answered: answeredCount,
        total: questions.length,
      },
      message: `Progress saved! You have ${DRAFT_EXPIRY_DAYS} days to complete your application.`,
    },
    200
  );
});

// =============================================================================
// GET /:slug/apply/draft/:draftId - Resume saved progress
// =============================================================================

applyRoutes.get("/apply/draft/:draftId", async (c) => {
  const slug = c.req.param("slug")!;
  const draftId = c.req.param("draftId")!;
  const resumeToken = c.req.query("token") ?? c.req.header("X-Resume-Token");

  if (!resumeToken) {
    return c.json({ error: "Resume token is required" }, 400);
  }

  const jobRepository = new JobRepository(c.env.DB);
  const applicationRepository = new ApplicationRepository(c.env.DB);

  // 1. Find the job
  const job = await jobRepository.findBySlug(slug);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // 2. Get draft with token validation
  const draft = await applicationRepository.getDraftByToken(draftId, resumeToken);

  if (!draft) {
    return c.json(
      {
        error: "Draft not found or expired",
        message: "Your saved progress may have expired. Please start a new application.",
      },
      404
    );
  }

  // 3. Verify draft is for this job
  if (draft.jobId !== job.id) {
    return c.json({ error: "Draft not found" }, 404);
  }

  // 4. Check if already applied (race condition protection)
  const existing = await applicationRepository.findExistingApplication(
    job.id,
    draft.candidateEmail
  );

  if (existing) {
    // Clean up the draft
    await applicationRepository.deleteDraft(draftId);
    return c.json(
      {
        error: "You have already applied to this job",
        applicationId: existing.id,
      },
      409
    );
  }

  // 5. Parse saved answers
  const savedAnswers: DraftAnswer[] = JSON.parse(draft.answers);
  const questions: RenderedQuestionOutput[] = job.questions ? JSON.parse(job.questions) : [];
  const answeredCount = savedAnswers.filter(
    (a) => a.answerText?.trim().length > 0
  ).length;

  return c.json({
    draftId: draft.id,
    candidateEmail: draft.candidateEmail,
    candidateName: draft.candidateName,
    preferredName: draft.preferredName,
    phone: draft.phone,
    answers: savedAnswers,
    expiresAt: draft.expiresAt,
    progress: {
      answered: answeredCount,
      total: questions.length,
    },
  });
});

export default applyRoutes;
