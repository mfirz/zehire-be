import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { AssessmentService } from "../../src/domain/assessments/service";
import { SessionService } from "../../src/modules/auth/session.service";
import { createDb, candidateAssessments } from "../../src/db";
import { seedFullPipeline } from "../helpers/seed";
import { daysAgo, hoursFromNow, hoursAgo } from "../helpers/time";

/** Create a JWT for a seeded user so we can call authenticated routes. */
async function createTestJwt(user: { id: string; email: string; orgId: string }): Promise<string> {
  const sessionService = new SessionService({ secret: env.AUTH_JWT_SECRET });
  return sessionService.createSession({
    userId: user.id,
    email: user.email,
    role: "admin",
    orgId: user.orgId,
  });
}

/** Helper to call the resend-invite endpoint. */
async function resendInvite(
  jobId: string,
  applicationId: string,
  jwt: string
): Promise<Response> {
  return SELF.fetch(
    `http://localhost/v1/jobs/${jobId}/candidates/${applicationId}/assessment/resend-invite`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    }
  );
}

describe("Resend Assessment Invite", () => {
  let service: AssessmentService;

  beforeAll(() => {
    service = new AssessmentService(env.DB);
  });

  // ---------------------------------------------------------------------------
  // SUCCESS CASES
  // ---------------------------------------------------------------------------

  it("resends invite when status is 'invited'", async () => {
    const pipeline = await seedFullPipeline();
    const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
    if (!invite.success) throw new Error("Invite failed");

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; message: string };
    expect(body.success).toBe(true);
    expect(body.message).toBe("Assessment invite resent successfully");
  });

  it("resends invite when status is 'schedule_expired'", async () => {
    const pipeline = await seedFullPipeline();
    const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
    if (!invite.success) throw new Error("Invite failed");

    // Set schedule deadline to the past so lazy transition fires
    const db = createDb(env.DB);
    await db
      .update(candidateAssessments)
      .set({ status: "schedule_expired", scheduleDeadline: daysAgo(1) })
      .where(eq(candidateAssessments.id, invite.data.id));

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; message: string };
    expect(body.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // REJECTION CASES
  // ---------------------------------------------------------------------------

  it("returns 404 when no candidate assessment exists", async () => {
    const pipeline = await seedFullPipeline();
    // Don't invite — no candidate assessment exists

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 when status is 'scheduled'", async () => {
    const pipeline = await seedFullPipeline();
    const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
    if (!invite.success) throw new Error("Invite failed");

    await service.scheduleAssessment(invite.data.token, {
      scheduledFor: hoursFromNow(24),
      timezone: "UTC",
    });

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("returns 409 when status is 'in_progress'", async () => {
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

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("returns 409 when status is 'submitted'", async () => {
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

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("returns 409 when status is 'cancelled'", async () => {
    const pipeline = await seedFullPipeline();
    const invite = await service.inviteCandidate(pipeline.application.id, pipeline.job.id);
    if (!invite.success) throw new Error("Invite failed");

    await service.cancelAssessment(pipeline.application.id, "Testing");

    const jwt = await createTestJwt(pipeline.user);
    const res = await resendInvite(pipeline.job.id, pipeline.application.id, jwt);

    expect(res.status).toBe(409);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("INVALID_STATUS");
  });
});
