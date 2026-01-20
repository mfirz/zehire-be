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
 * - All 3 archetype questions must be answered for submission
 * - Custom questions validated based on required flag
 * - Screening questions checked against expected answers
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
  type CustomAnswerInput,
  type DraftAnswer,
} from "../../../domain/applications/schemas";
import { CustomQuestionsRepository } from "../../../domain/custom-questions";
import { JobRepository, type RenderedQuestionOutput } from "../../../domain/jobs";
import type { CustomQuestion } from "../../../db";
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
    customAnswers?: CustomAnswerInput[];
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
  const customQuestionsRepo = new CustomQuestionsRepository(c.env.DB);

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

  // 4. Validate CV requirements
  const appConfig = job.applicationConfig;
  const cvRequired = appConfig?.requireCv ?? false;

  if (cvRequired && !cvFile) {
    return c.json(
      {
        error: "CV is required for this application",
        code: "CV_REQUIRED",
      },
      400
    );
  }

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

  // 5. Parse archetype questions from job (trusted data from database)
  const questions = JSON.parse(job.questions) as RenderedQuestionOutput[];
  const questionData = questions.map((q) => ({
    archetypeId: q.archetypeId,
    questionText: q.questionText,
  }));

  // 6. Validate all archetype questions have answers
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

  // 7. Fetch and validate custom questions
  const customQuestions = await customQuestionsRepo.listByJobId(job.id);
  const customAnswersInput = validatedInput.customAnswers ?? [];

  // Validate custom answers
  const customValidation = validateCustomAnswers(
    customQuestions,
    customAnswersInput
  );

  if (!customValidation.valid) {
    return c.json(
      {
        error: customValidation.error,
        missingQuestions: customValidation.missingQuestions,
        invalidQuestions: customValidation.invalidQuestions,
      },
      400
    );
  }

  // 8. Capture geo data from Cloudflare
  const cf = c.req.raw.cf as { country?: string; timezone?: string } | undefined;
  const geoData: { country?: string; timezone?: string } = {};
  if (cf?.country) geoData.country = cf.country;
  if (cf?.timezone) geoData.timezone = cf.timezone;

  // 9. Create application with archetype answers
  const { applicationId } = await applicationRepository.createApplication(
    job.id,
    validatedInput,
    questionData,
    geoData
  );

  // 10. Store custom answers and check screening
  let hasScreeningFailure = false;

  if (customAnswersInput.length > 0 && customQuestions.length > 0) {
    // Store custom answers (this also checks screening)
    await customQuestionsRepo.createAnswers(
      applicationId,
      customAnswersInput,
      customQuestions
    );

    // Check for screening failures
    const failures = await customQuestionsRepo.getScreeningFailures(applicationId);

    if (failures.length > 0) {
      hasScreeningFailure = true;

      // Update application with screening failure flag
      await applicationRepository.updateScreeningFailure(applicationId, true);

      // Check if any screening question has "reject" fail action
      const hasAutoReject = failures.some((f) => f.question.failAction === "reject");

      if (hasAutoReject) {
        // Auto-reject the application
        await applicationRepository.updateStatus(applicationId, { status: "rejected" });

        return c.json(
          {
            success: false,
            applicationId,
            message: "Your application could not be submitted due to eligibility requirements.",
            screeningFailed: true,
          },
          200 // Return 200 since the request was processed correctly
        );
      }
    }
  }

  // 11. Upload CV if provided
  let cvInfo: { filename: string; size: number } | null = null;
  if (cvFile) {
    const cvService = new CvService(c.env.CV_BUCKET, applicationRepository);
    const result = await cvService.upload(applicationId, cvFile);
    cvInfo = { filename: result.filename, size: result.size };
  }

  // 12. Delete draft if exists (user might have saved progress)
  if (validatedInput.draftId) {
    await applicationRepository.deleteDraft(validatedInput.draftId);
  } else {
    // Also try to delete by email (in case draftId wasn't passed)
    const existingDraft = await applicationRepository.getDraftByEmail(job.id, validatedInput.email);
    if (existingDraft) {
      await applicationRepository.deleteDraft(existingDraft.id);
    }
  }

  // 13. Queue signal extraction job (includes custom evaluative questions)
  await c.env.JOB_QUEUE.send({
    type: "evaluate_application" as const,
    applicationId,
    jobId: job.id,
    createdAt: new Date().toISOString(),
  });

  // 14. Queue CV processing if CV was uploaded
  if (cvFile) {
    await c.env.JOB_QUEUE.send({
      type: "process_cv" as const,
      applicationId,
      createdAt: new Date().toISOString(),
    });
  }

  // 15. Return success (with screening warning if flagged)
  const response: {
    success: true;
    applicationId: string;
    message: string;
    cv: { filename: string; size: number } | null;
    screeningWarning?: boolean;
  } = {
    success: true,
    applicationId,
    message: hasScreeningFailure
      ? "Your application has been submitted. Some responses will be reviewed by the hiring team."
      : "Your application has been submitted successfully",
    cv: cvInfo,
  };

  if (hasScreeningFailure) {
    response.screeningWarning = true;
  }

  return c.json(response, 201);
});

// =============================================================================
// HELPER: Validate custom answers
// =============================================================================

type CustomAnswerValidationResult =
  | { valid: true }
  | {
      valid: false;
      error: string;
      missingQuestions: string[] | undefined;
      invalidQuestions: Array<{ questionId: string; reason: string }> | undefined;
    };

function validateCustomAnswers(
  questions: CustomQuestion[],
  answers: CustomAnswerInput[]
): CustomAnswerValidationResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const missingQuestions: string[] = [];
  const invalidQuestions: Array<{ questionId: string; reason: string }> = [];

  // Check all required questions are answered
  for (const question of questions) {
    const answer = answerMap.get(question.id);

    // Check required questions
    if (question.required) {
      if (answer === undefined || answer === null) {
        missingQuestions.push(question.id);
        continue;
      }

      // Check free_text minimum length
      if (question.answerType === "free_text") {
        if (typeof answer !== "string" || answer.trim().length < 50) {
          invalidQuestions.push({
            questionId: question.id,
            reason: "Answer must be at least 50 characters",
          });
        }
      }
    }

    // Validate answer type matches question type
    if (answer !== undefined && answer !== null) {
      const validation = validateAnswerType(question, answer);
      if (!validation.valid) {
        invalidQuestions.push({
          questionId: question.id,
          reason: validation.reason!,
        });
      }
    }
  }

  // Check for unknown questions
  for (const answer of answers) {
    if (!questionMap.has(answer.questionId)) {
      invalidQuestions.push({
        questionId: answer.questionId,
        reason: "Unknown question",
      });
    }
  }

  if (missingQuestions.length > 0 || invalidQuestions.length > 0) {
    return {
      valid: false,
      error: "Custom question validation failed",
      missingQuestions: missingQuestions.length > 0 ? missingQuestions : undefined,
      invalidQuestions: invalidQuestions.length > 0 ? invalidQuestions : undefined,
    };
  }

  return { valid: true };
}

function validateAnswerType(
  question: CustomQuestion,
  value: string | string[] | number | null
): { valid: boolean; reason?: string } {
  switch (question.answerType) {
    case "free_text":
    case "yes_no":
    case "single_choice":
    case "date":
    case "url":
      if (typeof value !== "string") {
        return { valid: false, reason: `Expected string for ${question.answerType}` };
      }
      // Validate single_choice against options
      if (question.answerType === "single_choice" && question.options) {
        const options = JSON.parse(question.options) as string[];
        if (!options.includes(value)) {
          return { valid: false, reason: "Value must be one of the options" };
        }
      }
      // Validate yes_no
      if (question.answerType === "yes_no") {
        if (value !== "Yes" && value !== "No") {
          return { valid: false, reason: "Value must be 'Yes' or 'No'" };
        }
      }
      break;

    case "multiple_choice":
      if (!Array.isArray(value)) {
        return { valid: false, reason: "Expected array for multiple_choice" };
      }
      // Validate all values are in options
      if (question.options) {
        const options = JSON.parse(question.options) as string[];
        for (const v of value) {
          if (!options.includes(v)) {
            return { valid: false, reason: `Invalid option: ${v}` };
          }
        }
      }
      break;

    case "number":
      if (typeof value !== "number") {
        return { valid: false, reason: "Expected number" };
      }
      // Validate min/max
      if (question.minValue !== null && value < question.minValue) {
        return { valid: false, reason: `Value must be at least ${question.minValue}` };
      }
      if (question.maxValue !== null && value > question.maxValue) {
        return { valid: false, reason: `Value must be at most ${question.maxValue}` };
      }
      break;
  }

  return { valid: true };
}

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
