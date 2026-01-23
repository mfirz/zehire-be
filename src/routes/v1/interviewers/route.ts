/**
 * Interviewers Routes (v1)
 * ========================
 * Recruiter-facing endpoints for managing interviewers.
 *
 * Endpoints:
 * - POST   /v1/interviewers              - Create/invite interviewer
 * - GET    /v1/interviewers              - List org's interviewers
 * - GET    /v1/interviewers/:id          - Get interviewer details
 * - PATCH  /v1/interviewers/:id          - Update interviewer
 * - DELETE /v1/interviewers/:id          - Remove interviewer
 * - POST   /v1/interviewers/:id/resend   - Resend invite email
 *
 * All endpoints require authentication.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { createDb, orgs } from "../../../db";
import {
  CreateInterviewerSchema,
  InterviewerRepository,
  UpdateInterviewerSchema,
} from "../../../domain/interviewers";
import { createEmailGatewayFromEnv } from "../../../modules/email";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const interviewersRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth to all interviewers routes
interviewersRoute.use("/*", jwtAuth);

/**
 * POST /v1/interviewers
 *
 * Create/invite a new interviewer.
 */
interviewersRoute.post("/", zValidator("json", CreateInterviewerSchema), async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;
  const input = c.req.valid("json");

  const repo = new InterviewerRepository(c.env.DB);
  const db = createDb(c.env.DB);

  // Check if interviewer already exists
  const existing = await repo.findByEmail(orgId, input.email);
  if (existing) {
    return c.json({ error: "Interviewer with this email already exists" }, 409);
  }

  // Get org name for email
  const org = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).get();
  const companyName = org?.name ?? "Your company";

  // Create interviewer
  const interviewer = await repo.create(orgId, input.email, input.name);
  const magicLink = `${c.env.APP_BASE_URL}/i/${interviewer.magicToken}`;

  // Send invite email
  try {
    const emailGateway = createEmailGatewayFromEnv(c.env);
    await emailGateway.sendInterviewerInvite({
      email: interviewer.email,
      name: interviewer.name,
      companyName,
      setupUrl: magicLink,
    });
  } catch (error) {
    // Log but don't fail - interviewer is created, email can be resent
    console.error("Failed to send interviewer invite email:", error);
  }

  return c.json(
    {
      ...repo.toResponse(interviewer),
      // Include magic link in dev for testing
      _magicLink: c.env.ENVIRONMENT === "development" ? magicLink : undefined,
    },
    201
  );
});

/**
 * GET /v1/interviewers
 *
 * List all interviewers for the org.
 */
interviewersRoute.get("/", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;

  const repo = new InterviewerRepository(c.env.DB);

  const [interviewers, total] = await Promise.all([repo.listByOrg(orgId), repo.countByOrg(orgId)]);

  return c.json({
    interviewers: interviewers.map((i) => repo.toResponse(i)),
    total,
  });
});

/**
 * GET /v1/interviewers/:id
 *
 * Get interviewer details.
 */
interviewersRoute.get("/:id", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;
  const interviewerId = c.req.param("id");

  const repo = new InterviewerRepository(c.env.DB);

  const interviewer = await repo.findByIdAndOrg(interviewerId, orgId);
  if (!interviewer) {
    return c.json({ error: "Interviewer not found" }, 404);
  }

  return c.json(repo.toResponse(interviewer));
});

/**
 * PATCH /v1/interviewers/:id
 *
 * Update an interviewer.
 */
interviewersRoute.patch("/:id", zValidator("json", UpdateInterviewerSchema), async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;
  const interviewerId = c.req.param("id");
  const input = c.req.valid("json");

  const repo = new InterviewerRepository(c.env.DB);

  // Verify interviewer belongs to org
  const existing = await repo.findByIdAndOrg(interviewerId, orgId);
  if (!existing) {
    return c.json({ error: "Interviewer not found" }, 404);
  }

  // Transform undefined to null for database compatibility
  const updates: Parameters<typeof repo.update>[1] = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.timezone !== undefined) updates.timezone = input.timezone;
  if (input.status !== undefined) updates.status = input.status;

  // Update
  const updated = await repo.update(interviewerId, updates);
  if (!updated) {
    return c.json({ error: "Failed to update interviewer" }, 500);
  }

  return c.json(repo.toResponse(updated));
});

/**
 * DELETE /v1/interviewers/:id
 *
 * Remove an interviewer.
 */
interviewersRoute.delete("/:id", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;
  const interviewerId = c.req.param("id");

  const repo = new InterviewerRepository(c.env.DB);

  // Verify interviewer belongs to org
  const existing = await repo.findByIdAndOrg(interviewerId, orgId);
  if (!existing) {
    return c.json({ error: "Interviewer not found" }, 404);
  }

  // Delete
  const deleted = await repo.delete(interviewerId);
  if (!deleted) {
    return c.json({ error: "Failed to delete interviewer" }, 500);
  }

  return c.body(null, 204);
});

/**
 * POST /v1/interviewers/:id/resend
 *
 * Resend invite email with a new magic link.
 */
interviewersRoute.post("/:id/resend", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;
  const interviewerId = c.req.param("id");

  const repo = new InterviewerRepository(c.env.DB);
  const db = createDb(c.env.DB);

  // Verify interviewer belongs to org
  const existing = await repo.findByIdAndOrg(interviewerId, orgId);
  if (!existing) {
    return c.json({ error: "Interviewer not found" }, 404);
  }

  // Get org name for email
  const org = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).get();
  const companyName = org?.name ?? "Your company";

  // Regenerate magic token
  const newToken = await repo.regenerateMagicToken(interviewerId);
  const magicLink = `${c.env.APP_BASE_URL}/i/${newToken}`;

  // Send invite email
  try {
    const emailGateway = createEmailGatewayFromEnv(c.env);
    await emailGateway.sendInterviewerInvite({
      email: existing.email,
      name: existing.name,
      companyName,
      setupUrl: magicLink,
    });
  } catch (error) {
    console.error("Failed to send interviewer invite email:", error);
    return c.json({ error: "Failed to send invite email" }, 500);
  }

  return c.json({
    success: true,
    message: "Invite resent successfully",
    _magicLink: c.env.ENVIRONMENT === "development" ? magicLink : undefined,
  });
});

export default interviewersRoute;
