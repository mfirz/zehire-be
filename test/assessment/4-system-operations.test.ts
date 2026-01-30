import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { AssessmentService } from "../../src/domain/assessments/service";
import { createDb, candidateAssessments } from "../../src/db";
import { seedFullPipeline, seedApplication } from "../helpers/seed";
import { hoursFromNow, hoursAgo, daysAgo, minutesAgo } from "../helpers/time";

describe("System Operations", () => {
  let service: AssessmentService;

  beforeAll(() => {
    service = new AssessmentService(env.DB);
  });

  // ---------------------------------------------------------------------------
  // PROCESS EXPIRED SCHEDULE DEADLINES
  // ---------------------------------------------------------------------------

  describe("processExpiredScheduleDeadlines", () => {
    it("transitions invited assessments past schedule deadline to schedule_expired", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Set schedule deadline to the past
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduleDeadline: daysAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      const count = await service.processExpiredScheduleDeadlines();
      expect(count).toBeGreaterThanOrEqual(1);

      // Verify status changed
      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("schedule_expired");
    });

    it("does not transition non-expired invited assessments", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Schedule deadline is in the future (7 days default), should not be processed
      await service.processExpiredScheduleDeadlines();

      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("invited");
    });
  });

  // ---------------------------------------------------------------------------
  // PROCESS EXPIRED COMPLETION DEADLINES
  // ---------------------------------------------------------------------------

  describe("processExpiredCompletionDeadlines", () => {
    it("transitions in_progress assessments past completion deadline to expired", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });

      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({
          scheduledFor: hoursAgo(50),
          completionDeadline: hoursAgo(2),
          status: "in_progress",
        })
        .where(eq(candidateAssessments.id, invite.data.id));

      const count = await service.processExpiredCompletionDeadlines();
      expect(count).toBeGreaterThanOrEqual(1);

      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("expired");
    });

    it("respects grace period (does not expire if within grace)", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });

      const db = createDb(env.DB);
      // Set completion deadline to 5 minutes ago (within 10-minute grace period)
      await db
        .update(candidateAssessments)
        .set({
          scheduledFor: hoursAgo(50),
          completionDeadline: minutesAgo(5),
          status: "in_progress",
        })
        .where(eq(candidateAssessments.id, invite.data.id));

      const count = await service.processExpiredCompletionDeadlines();

      // Should not have expired this one (grace period is 10 minutes, only 5 minutes past deadline)
      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("in_progress");
    });
  });

  // ---------------------------------------------------------------------------
  // CANCEL ASSESSMENTS FOR JOB
  // ---------------------------------------------------------------------------

  describe("cancelAssessmentsForJob", () => {
    it("cancels all active assessments for a job", async () => {
      const pipeline = await seedFullPipeline();

      // Create 3 invited candidates
      const app1 = pipeline.application;
      const app2 = await seedApplication(pipeline.job.id);
      const app3 = await seedApplication(pipeline.job.id);

      await service.inviteCandidate(app1.id, pipeline.job.id);
      await service.inviteCandidate(app2.id, pipeline.job.id);
      await service.inviteCandidate(app3.id, pipeline.job.id);

      const count = await service.cancelAssessmentsForJob(pipeline.job.id);
      expect(count).toBe(3);
    });

    it("skips submitted assessments", async () => {
      const pipeline = await seedFullPipeline({
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: false }],
      });

      // Create one invited and one submitted
      const app1 = pipeline.application;
      const app2 = await seedApplication(pipeline.job.id);

      await service.inviteCandidate(app1.id, pipeline.job.id);

      const invite2 = await service.inviteCandidate(app2.id, pipeline.job.id);
      if (!invite2.success) throw new Error("Invite failed");

      // Advance app2 to submitted
      await service.scheduleAssessment(invite2.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduledFor: hoursAgo(1) })
        .where(eq(candidateAssessments.id, invite2.data.id));
      await service.startAssessment(invite2.data.token);
      await service.submitAssessment(invite2.data.token);

      const count = await service.cancelAssessmentsForJob(pipeline.job.id);

      // Only the invited one should be cancelled, not the submitted one
      expect(count).toBe(1);

      // Verify submitted is still submitted
      const result = await service.getCandidateAssessment(app2.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("submitted");
    });

    it("skips evaluated assessments", async () => {
      const pipeline = await seedFullPipeline({
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: false }],
      });

      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Advance to evaluated
      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduledFor: hoursAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));
      await service.startAssessment(invite.data.token);
      await service.submitAssessment(invite.data.token);
      await service.evaluateAssessment(pipeline.application.id, pipeline.user.id, {
        signal: "clear_evidence",
      });

      const count = await service.cancelAssessmentsForJob(pipeline.job.id);
      expect(count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // CANCEL INDIVIDUAL
  // ---------------------------------------------------------------------------

  describe("cancelAssessment", () => {
    it("cancels an invited assessment", async () => {
      const pipeline = await seedFullPipeline();
      await service.inviteCandidate(pipeline.application.id, pipeline.job.id);

      const result = await service.cancelAssessment(pipeline.application.id, "No longer needed");

      expect(result.success).toBe(true);
    });

    it("cancels a scheduled assessment", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(24),
        timezone: "UTC",
      });

      const result = await service.cancelAssessment(pipeline.application.id);

      expect(result.success).toBe(true);
    });

    it("cancels an in_progress assessment", async () => {
      const pipeline = await seedFullPipeline();
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
      await service.startAssessment(invite.data.token);

      const result = await service.cancelAssessment(pipeline.application.id);

      expect(result.success).toBe(true);
    });

    it("rejects cancellation of submitted assessment", async () => {
      const pipeline = await seedFullPipeline({
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: false }],
      });
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
      await service.startAssessment(invite.data.token);
      await service.submitAssessment(invite.data.token);

      const result = await service.cancelAssessment(pipeline.application.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ALREADY_SUBMITTED");
    });

    it("rejects cancellation of already cancelled assessment", async () => {
      const pipeline = await seedFullPipeline();
      await service.inviteCandidate(pipeline.application.id, pipeline.job.id);

      await service.cancelAssessment(pipeline.application.id);

      const result = await service.cancelAssessment(pipeline.application.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ALREADY_CANCELLED");
    });
  });

  // ---------------------------------------------------------------------------
  // LAZY STATUS TRANSITIONS
  // ---------------------------------------------------------------------------

  describe("lazy status transitions", () => {
    it("transitions invited to schedule_expired on read when past deadline", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Set schedule deadline to the past
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ scheduleDeadline: daysAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      // Reading via getCandidateAssessment triggers lazy transition
      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("schedule_expired");
    });

    it("transitions scheduled to expired on read when past completion deadline", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      await service.scheduleAssessment(invite.data.token, {
        scheduledFor: hoursFromNow(1),
        timezone: "UTC",
      });

      // Set completion deadline to well past (beyond grace)
      const db = createDb(env.DB);
      await db
        .update(candidateAssessments)
        .set({ completionDeadline: hoursAgo(1) })
        .where(eq(candidateAssessments.id, invite.data.id));

      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("expired");
    });

    it("does not transition when deadlines have not passed", async () => {
      const pipeline = await seedFullPipeline();
      const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
      if (!invite.success) throw new Error("Invite failed");

      // Schedule deadline is 7 days from now, no transition should happen
      const result = await service.getCandidateAssessment(pipeline.application.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessment.status).toBe("invited");
    });
  });
});
