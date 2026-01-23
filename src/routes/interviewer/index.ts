/**
 * Interviewer Self-Service Routes
 * ================================
 * Magic link authenticated routes for interviewers.
 *
 * Base path: /i/:token
 *
 * Endpoints:
 * - GET  /i/:token                    - Interviewer dashboard data
 * - GET  /i/:token/interviews         - List upcoming interviews
 * - GET  /i/:token/availability       - Get availability windows
 * - PUT  /i/:token/availability       - Update availability windows
 * - POST /i/:token/block-date         - Block a date
 * - DELETE /i/:token/block-date/:id   - Unblock a date
 * - POST /i/:token/unavailable-today  - Mark unavailable for today
 * - GET  /i/:token/calendar-status    - Check calendar connection status
 *
 * These routes use magic token authentication, not JWT.
 */

import { Hono } from "hono";

import { InterviewerRepository } from "../../domain/interviewers";
import type { Interviewer } from "../../db";
import type { Env } from "../../types/bindings";

// Variables available in the interviewer context
interface InterviewerVariables {
  interviewer: Interviewer;
}

const interviewerRoutes = new Hono<{
  Bindings: Env;
  Variables: InterviewerVariables;
}>();

/**
 * Middleware to validate magic token and attach interviewer to context.
 */
interviewerRoutes.use("/:token/*", async (c, next): Promise<Response | void> => {
  const token = c.req.param("token");

  if (!token) {
    return c.json({ error: "Magic token required" }, 401);
  }

  const repo = new InterviewerRepository(c.env.DB);
  const interviewer = await repo.findByMagicToken(token);

  if (!interviewer) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Check token expiry
  if (interviewer.magicTokenExpiresAt) {
    const expiresAt = new Date(interviewer.magicTokenExpiresAt);
    if (expiresAt < new Date()) {
      return c.json({ error: "Token expired. Please request a new invite." }, 401);
    }
  }

  // Attach interviewer to context
  c.set("interviewer", interviewer);

  // Activate interviewer on first access if still in 'invited' status
  if (interviewer.status === "invited") {
    await repo.activate(interviewer.id);
  }

  await next();
});

/**
 * GET /i/:token
 *
 * Get interviewer dashboard data.
 * Returns interviewer info, upcoming interviews, and pending feedback.
 */
interviewerRoutes.get("/:token", async (c) => {
  const interviewer = c.get("interviewer");

  // TODO: Get upcoming interviews and pending feedback
  // For now, return basic interviewer info

  return c.json({
    id: interviewer.id,
    email: interviewer.email,
    name: interviewer.name,
    timezone: interviewer.timezone ?? "UTC",
    status: interviewer.status,
    calendarConnected: interviewer.calendarConnected ?? false,
    calendarProvider: interviewer.calendarProvider,
    // Placeholder for future data
    upcomingInterviews: [],
    pendingFeedback: [],
  });
});

/**
 * GET /i/:token/interviews
 *
 * List interviewer's upcoming interviews.
 */
interviewerRoutes.get("/:token/interviews", async (c) => {
  // TODO: Query scheduled_interviews and interview_participants (Phase 9E)
  // const interviewer = c.get("interviewer");
  // For now, return empty list

  return c.json({
    interviews: [],
  });
});

/**
 * GET /i/:token/availability
 *
 * Get interviewer's availability windows.
 */
interviewerRoutes.get("/:token/availability", async (c) => {
  const interviewer = c.get("interviewer");

  // TODO: Query interviewer_availability table
  // For now, return empty windows

  return c.json({
    timezone: interviewer.timezone ?? "UTC",
    windows: [],
    blockedDates: [],
  });
});

/**
 * PUT /i/:token/availability
 *
 * Update interviewer's availability windows.
 */
interviewerRoutes.put("/:token/availability", async (c) => {
  // TODO: Implement availability update (Phase 9C)
  // const interviewer = c.get("interviewer");
  return c.json({ error: "Not implemented yet" }, 501);
});

/**
 * POST /i/:token/block-date
 *
 * Block a specific date.
 */
interviewerRoutes.post("/:token/block-date", async (c) => {
  // TODO: Implement date blocking (Phase 9C)
  // const interviewer = c.get("interviewer");
  return c.json({ error: "Not implemented yet" }, 501);
});

/**
 * DELETE /i/:token/block-date/:dateId
 *
 * Unblock a specific date.
 */
interviewerRoutes.delete("/:token/block-date/:dateId", async (c) => {
  // TODO: Implement date unblocking (Phase 9C)
  // const interviewer = c.get("interviewer");
  return c.json({ error: "Not implemented yet" }, 501);
});

/**
 * POST /i/:token/unavailable-today
 *
 * Quick action to mark interviewer unavailable for today.
 */
interviewerRoutes.post("/:token/unavailable-today", async (c) => {
  // TODO: Implement "unavailable today" feature (Phase 9C)
  // const interviewer = c.get("interviewer");
  return c.json({ error: "Not implemented yet" }, 501);
});

/**
 * GET /i/:token/calendar-status
 *
 * Check calendar connection status.
 */
interviewerRoutes.get("/:token/calendar-status", async (c) => {
  const interviewer = c.get("interviewer");

  return c.json({
    connected: interviewer.calendarConnected ?? false,
    provider: interviewer.calendarProvider,
    connectedAt: interviewer.connectedAt,
  });
});

export default interviewerRoutes;
