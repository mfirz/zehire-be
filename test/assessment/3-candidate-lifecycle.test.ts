import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { AssessmentService } from "../../src/domain/assessments/service";
import { createDb, candidateAssessments } from "../../src/db";
import { seedOrg, seedJob, seedApplication, seedFullPipeline } from "../helpers/seed";
import { hoursFromNow, hoursAgo, daysAgo } from "../helpers/time";

function makeFile(
  name = "test.pdf",
  size = 1024,
  type = "application/pdf"
) {
  const content = new Uint8Array(Math.min(size, 100));
  const { readable, writable } = new FixedLengthStream(content.byteLength);
  const writer = writable.getWriter();
  writer.write(content);
  writer.close();
  return {
    name,
    size,
    type,
    stream: readable,
  };
}

/** Advance an invited candidate to in_progress state. */
async function advanceToInProgress(
  service: AssessmentService,
  pipeline: Awaited<ReturnType<typeof seedFullPipeline>>
) {
  const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
  if (!invite.success) throw new Error("Invite failed");

  await service.scheduleAssessment(invite.data.token, {
    scheduledFor: hoursFromNow(1),
    timezone: "UTC",
  });

  const db = createDb(env.DB);
  await db
    .update(candidateAssessments)
    .set({ scheduledFor: hoursAgo(1) })
    .where(eq(candidateAssessments.id, invite.data.id));

  const start = await service.startAssessment(invite.data.token);
  if (!start.success) throw new Error("Start failed");

  return { token: invite.data.token, assessment: start.data };
}

describe("Candidate Assessment Lifecycle", () => {
  let service: AssessmentService;

  beforeAll(() => {
    service = new AssessmentService(env.DB);
  });

  // ---------------------------------------------------------------------------
  // INVITE
  // ---------------------------------------------------------------------------

  describe("inviteCandidate", () => {
    it("invites a candidate successfully", async () => {
      const pipeline = await seedFullPipeline();
      const result = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.applicationId).toBe(pipeline.application.id);
      expect(result.data.jobId).toBe(pipeline.job.id);
      expect(result.data.status).toBe("invited");
      expect(result.data.token).toBeTruthy();
      expect(result.data.token.length).toBe(32);
      expect(result.data.scheduleDeadline).toBeTruthy();
    });

    it("rejects duplicate invitation", async () => {
      const pipeline = await seedFullPipeline();
      await service.inviteCandidate(pipeline.application.id, pipeline.job.id);

      const result = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ALREADY_INVITED");
    });

    it("rejects when no assessment is linked to job", async () => {
      const org = await seedOrg();
      const job = await seedJob(org.id);
      const app = await seedApplication(job.id);

      const result = await service.inviteCandidate(app.id, job.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NO_ASSESSMENT");
    });
  });

  // ---------------------------------------------------------------------------
  // INSTRUCTION VISIBILITY
  // ---------------------------------------------------------------------------

  describe("instruction visibility by status", () => {
    it("hides instructions and evidenceDescription when status is invited", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Task", instructions: "Secret instructions", evidenceDescription: "Secret evidence", required: true },
        ],
      });
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      const result = await service.getAssessmentByToken(invite.data.token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts[0].instructions).toBeNull();
      expect(result.data.parts[0].evidenceDescription).toBeNull();
      expect(result.data.parts[0].name).toBe("Task");
    });

    it("hides instructions when status is scheduled", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Task", instructions: "Secret instructions", evidenceDescription: "Secret evidence", required: true },
        ],
      });
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      const result = await service.getAssessmentByToken(invite.data.token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts[0].instructions).toBeNull();
      expect(result.data.parts[0].evidenceDescription).toBeNull();
    });

    it("reveals instructions when status is in_progress", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Task", instructions: "Secret instructions", evidenceDescription: "Secret evidence", required: true },
        ],
      });
      const { token } = await advanceToInProgress(service, pipeline);

      const result = await service.getAssessmentByToken(token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts[0].instructions).toBe("Secret instructions");
      expect(result.data.parts[0].evidenceDescription).toBe("Secret evidence");
    });

    it("reveals instructions when status is submitted", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Task", instructions: "Secret instructions", evidenceDescription: "Secret evidence", required: false },
        ],
      });
      const { token } = await advanceToInProgress(service, pipeline);
      await service.submitAssessment(token);

      const result = await service.getAssessmentByToken(token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts[0].instructions).toBe("Secret instructions");
      expect(result.data.parts[0].evidenceDescription).toBe("Secret evidence");
    });
  });

  // ---------------------------------------------------------------------------
  // SCHEDULE
  // ---------------------------------------------------------------------------

  describe("scheduleAssessment", () => {
    it("schedules with a future time", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      const result = await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "America/New_York",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe("scheduled");
      expect(result.data.scheduledFor).toBeTruthy();
      expect(result.data.scheduledTimezone).toBe("America/New_York");
      expect(result.data.completionDeadline).toBeTruthy();
    });

    it("rejects past scheduled time", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      const result = await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursAgo(1),
        timezone: "UTC",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("INVALID_TIME");
    });

    it("rejects when already scheduled", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      const result = await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(48),
        timezone: "UTC",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ALREADY_SCHEDULED");
    });

    it("rejects when past schedule deadline", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Directly set status to schedule_expired (simulates lazy transition)
      // to avoid miniflare isolated storage issue with SQLite WAL files
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ status: "schedule_expired", scheduleDeadline: daysAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      const result = await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("EXPIRED");
    });
  });

  // ---------------------------------------------------------------------------
  // RESCHEDULE
  // ---------------------------------------------------------------------------

  describe("rescheduleAssessment", () => {
    it("reschedules within limit", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      const result = await service.rescheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(48),
        timezone: "Europe/London",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.rescheduleCount).toBe(1);
      expect(result.data.scheduledTimezone).toBe("Europe/London");
    });

    it("rejects when reschedule limit exhausted", async () => {
      const pipeline = await seedFullPipeline({
        scheduling: { maxReschedules: 1 },
      });
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      // First reschedule succeeds
      await service.rescheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(48),
        timezone: "UTC",
      });

      // Second reschedule fails (max is 1)
      const result = await service.rescheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(72),
        timezone: "UTC",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NO_RESCHEDULES_LEFT");
    });

    it("rejects when not in scheduled state", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Still "invited", not scheduled
      const result = await service.rescheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NOT_SCHEDULED");
    });
  });

  // ---------------------------------------------------------------------------
  // START
  // ---------------------------------------------------------------------------

  describe("startAssessment", () => {
    it("starts a scheduled assessment", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });

      // Set scheduledFor to the past so the start check passes
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduledFor: hoursAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      const result = await service.startAssessment(invite.data.token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe("in_progress");
    });

    it("rejects when not scheduled", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      const result = await service.startAssessment(invite.data.token);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NOT_SCHEDULED");
    });

    it("rejects when already started", async () => {
      const pipeline = await seedFullPipeline();
      const { token } = await advanceToInProgress(service, pipeline);

      const result = await service.startAssessment(token);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ALREADY_STARTED");
    });

    it("rejects when completion deadline has passed", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });

      // Set both scheduledFor and completionDeadline to the past
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduledFor: hoursAgo(49), completionDeadline: hoursAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      const result = await service.startAssessment(invite.data.token);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("EXPIRED");
    });
  });

  // ---------------------------------------------------------------------------
  // UPLOAD FILE
  // ---------------------------------------------------------------------------

  describe("uploadFile", () => {
    it("uploads a file successfully", async () => {
      const pipeline = await seedFullPipeline();
      const { token } = await advanceToInProgress(service, pipeline);
      const partId = pipeline.parts[0].id;

      const result = await service.uploadFile(token, partId, makeFile(), env.CV_BUCKET);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.partId).toBe(partId);
      expect(result.data.fileName).toBe("test.pdf");
      expect(result.data.mimeType).toBe("application/pdf");
      expect(result.data.r2Key).toContain("assessments/");
    });

    it("rejects file exceeding size limit", async () => {
      const pipeline = await seedFullPipeline();
      const { token } = await advanceToInProgress(service, pipeline);
      const partId = pipeline.parts[0].id;

      const oversizedFile = makeFile("big.pdf", 51 * 1024 * 1024, "application/pdf");
      const result = await service.uploadFile(token, partId, oversizedFile, env.CV_BUCKET);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("FILE_TOO_LARGE");
    });

    it("rejects disallowed file type", async () => {
      const pipeline = await seedFullPipeline();
      const { token } = await advanceToInProgress(service, pipeline);
      const partId = pipeline.parts[0].id;

      const badFile = makeFile("malware.exe", 1024, "application/x-msdownload");
      const result = await service.uploadFile(token, partId, badFile, env.CV_BUCKET);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("INVALID_FILE_TYPE");
    });

    it("rejects when not in_progress", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Still "invited"
      const result = await service.uploadFile(
        invite.data.token,
        pipeline.parts[0].id,
        makeFile(),
        env.CV_BUCKET
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NOT_IN_PROGRESS");
    });

    it("rejects nonexistent part ID", async () => {
      const pipeline = await seedFullPipeline();
      const { token } = await advanceToInProgress(service, pipeline);

      const result = await service.uploadFile(token, "bad_part_id", makeFile(), env.CV_BUCKET);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("PART_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE FILE
  // ---------------------------------------------------------------------------

  describe("deleteFile", () => {
    it("deletes an uploaded file", async () => {
      const pipeline = await seedFullPipeline();
      const { token } = await advanceToInProgress(service, pipeline);
      const partId = pipeline.parts[0].id;

      const upload = await service.uploadFile(token, partId, makeFile(), env.CV_BUCKET);
      if (!upload.success) throw new Error("Upload failed");

      const result = await service.deleteFile(token, partId, upload.data.id, env.CV_BUCKET);

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // SUBMIT
  // ---------------------------------------------------------------------------

  describe("submitAssessment", () => {
    it("submits when all required parts have files", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Required Part", instructions: "I", evidenceDescription: "E", required: true },
          { name: "Optional Part", instructions: "I", evidenceDescription: "E", required: false },
        ],
      });
      const { token } = await advanceToInProgress(service, pipeline);

      // Upload file for required part only
      await service.uploadFile(token, pipeline.parts[0].id, makeFile(), env.CV_BUCKET);

      const result = await service.submitAssessment(token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe("submitted");
      expect(result.data.submittedAt).toBeTruthy();
    });

    it("rejects when required part is missing files", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Required Part 1", instructions: "I", evidenceDescription: "E", required: true },
          { name: "Required Part 2", instructions: "I", evidenceDescription: "E", required: true },
        ],
      });
      const { token } = await advanceToInProgress(service, pipeline);

      // Only upload for the first required part
      await service.uploadFile(token, pipeline.parts[0].id, makeFile(), env.CV_BUCKET);

      const result = await service.submitAssessment(token);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("MISSING_PARTS");
    });

    it("submits when only optional parts exist and none have files", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Optional Part", instructions: "I", evidenceDescription: "E", required: false },
        ],
      });
      const { token } = await advanceToInProgress(service, pipeline);

      const result = await service.submitAssessment(token);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe("submitted");
    });

    it("rejects when not in_progress", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Still "invited"
      const result = await service.submitAssessment(invite.data.token);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NOT_IN_PROGRESS");
    });
  });

  // ---------------------------------------------------------------------------
  // EVALUATE
  // ---------------------------------------------------------------------------

  describe("evaluateAssessment", () => {
    it("evaluates a submitted assessment with signal and notes", async () => {
      const pipeline = await seedFullPipeline({
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: false }],
      });
      const { token } = await advanceToInProgress(service, pipeline);
      await service.submitAssessment(token);

      const result = await service.evaluateAssessment(
        pipeline.application.id,
        pipeline.user.id,
        { signal: "clear_evidence", notes: "Excellent work" }
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe("evaluated");
      expect(result.data.evaluationSignal).toBe("clear_evidence");
      expect(result.data.evaluationNotes).toBe("Excellent work");
      expect(result.data.evaluatedBy).toBe(pipeline.user.id);
      expect(result.data.evaluatedAt).toBeTruthy();
    });

    it("allows re-evaluation", async () => {
      const pipeline = await seedFullPipeline({
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: false }],
      });
      const { token } = await advanceToInProgress(service, pipeline);
      await service.submitAssessment(token);

      // First evaluation
      await service.evaluateAssessment(pipeline.application.id, pipeline.user.id, {
        signal: "some_gaps",
        notes: "Needs improvement",
      });

      // Re-evaluation
      const result = await service.evaluateAssessment(pipeline.application.id, pipeline.user.id, {
        signal: "clear_evidence",
        notes: "Revised: actually good",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.evaluationSignal).toBe("clear_evidence");
      expect(result.data.evaluationNotes).toBe("Revised: actually good");
      expect(result.data.evaluationUpdatedBy).toBe(pipeline.user.id);
      expect(result.data.evaluationUpdatedAt).toBeTruthy();
    });

    it("rejects when not submitted", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      const result = await service.evaluateAssessment(
        pipeline.application.id,
        pipeline.user.id,
        { signal: "clear_evidence" }
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("NOT_SUBMITTED");
    });
  });

  // ---------------------------------------------------------------------------
  // FULL HAPPY PATH
  // ---------------------------------------------------------------------------

  describe("full happy path", () => {
    it("invite -> schedule -> start -> upload -> submit -> evaluate", async () => {
      const pipeline = await seedFullPipeline({
        parts: [
          { name: "Coding Task", instructions: "Build an API", evidenceDescription: "Source code", required: true },
          { name: "Documentation", instructions: "Write docs", evidenceDescription: "Docs file", required: false },
        ],
      });

      // 1. Invite
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      expect(invite.success).toBe(true);
      if (!invite.success) return;
      const token = invite.data.token;

      // 2. Schedule
      const schedule = await service.scheduleAssessment(token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });
      expect(schedule.success).toBe(true);

      // 3. Start (set scheduledFor to past)
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduledFor: hoursAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      const start = await service.startAssessment(token);
      expect(start.success).toBe(true);

      // 4. Upload file for required part
      const upload = await service.uploadFile(
        token,
        pipeline.parts[0].id,
        makeFile("solution.zip", 2048, "application/zip"),
        env.CV_BUCKET
      );
      expect(upload.success).toBe(true);

      // 5. Submit
      const submit = await service.submitAssessment(token);
      expect(submit.success).toBe(true);
      if (!submit.success) return;
      expect(submit.data.status).toBe("submitted");
      expect(submit.data.submittedAt).toBeTruthy();

      // 6. Evaluate
      const evaluate = await service.evaluateAssessment(
        pipeline.application.id,
        pipeline.user.id,
        { signal: "clear_evidence", notes: "Excellent implementation" }
      );
      expect(evaluate.success).toBe(true);
      if (!evaluate.success) return;
      expect(evaluate.data.status).toBe("evaluated");
      expect(evaluate.data.evaluationSignal).toBe("clear_evidence");
      expect(evaluate.data.evaluationNotes).toBe("Excellent implementation");
      expect(evaluate.data.evaluatedBy).toBe(pipeline.user.id);
    });
  });
});
