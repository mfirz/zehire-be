/**
 * Interviewer Self-Service Routes
 * ================================
 * Magic link authenticated routes for interviewers.
 *
 * Base path: /i/:token
 *
 * Endpoints:
 * - GET  /i/:token                      - Interviewer dashboard data
 * - GET  /i/:token/interviews           - List upcoming interviews
 * - GET  /i/:token/availability         - Get availability windows
 * - PUT  /i/:token/availability         - Update availability windows
 * - POST /i/:token/block-date           - Block a date
 * - DELETE /i/:token/block-date/:id     - Unblock a date
 * - POST /i/:token/unavailable-today    - Mark unavailable for today
 * - GET  /i/:token/calendar-status      - Check calendar connection status
 * - GET  /i/:token/connect/:provider    - Start OAuth flow for calendar
 * - POST /i/:token/disconnect           - Disconnect calendar
 *
 * These routes use magic token authentication, not JWT.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { InterviewerRepository } from "../../domain/interviewers";
import { createCalendarProvider, type CalendarProviderType } from "../../domain/calendar";
import {
  AvailabilityRepository,
  UpdateAvailabilitySchema,
  BlockDateSchema,
} from "../../domain/availability";
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
 * Get interviewer's availability windows and blocked dates.
 */
interviewerRoutes.get("/:token/availability", async (c) => {
  const interviewer = c.get("interviewer");
  const repo = new AvailabilityRepository(c.env.DB);

  const [windows, blockedDates] = await Promise.all([
    repo.getWindows(interviewer.id),
    repo.getBlockedDates(interviewer.id),
  ]);

  return c.json({
    timezone: interviewer.timezone ?? "UTC",
    windows: windows.map((w) => ({
      id: w.id,
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
    })),
    blockedDates: blockedDates.map((d) => repo.toBlockedDateResponse(d)),
  });
});

/**
 * PUT /i/:token/availability
 *
 * Update interviewer's availability windows (replaces all existing).
 */
interviewerRoutes.put(
  "/:token/availability",
  zValidator("json", UpdateAvailabilitySchema),
  async (c) => {
    const interviewer = c.get("interviewer");
    const input = c.req.valid("json");
    const repo = new AvailabilityRepository(c.env.DB);

    // Validate time windows (start < end)
    for (const window of input.windows) {
      if (window.startTime >= window.endTime) {
        return c.json(
          { error: `Invalid window: startTime must be before endTime (${window.startTime} >= ${window.endTime})` },
          400
        );
      }
    }

    // Update timezone if provided
    if (input.timezone) {
      await repo.updateTimezone(interviewer.id, input.timezone);
    }

    // Replace all windows
    const windows = await repo.replaceWindows(interviewer.id, input.windows);
    const blockedDates = await repo.getBlockedDates(interviewer.id);

    return c.json({
      timezone: input.timezone ?? interviewer.timezone ?? "UTC",
      windows: windows.map((w) => ({
        id: w.id,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
      blockedDates: blockedDates.map((d) => repo.toBlockedDateResponse(d)),
    });
  }
);

/**
 * POST /i/:token/block-date
 *
 * Block a specific date.
 */
interviewerRoutes.post(
  "/:token/block-date",
  zValidator("json", BlockDateSchema),
  async (c) => {
    const interviewer = c.get("interviewer");
    const input = c.req.valid("json");
    const repo = new AvailabilityRepository(c.env.DB);

    // Validate date is not in the past
    const today = new Date().toISOString().split("T")[0]!;
    if (input.date < today) {
      return c.json({ error: "Cannot block dates in the past" }, 400);
    }

    const blockedDate = await repo.blockDate(interviewer.id, input.date, input.reason);

    return c.json(repo.toBlockedDateResponse(blockedDate), 201);
  }
);

/**
 * DELETE /i/:token/block-date/:dateId
 *
 * Unblock a specific date.
 */
interviewerRoutes.delete("/:token/block-date/:dateId", async (c) => {
  const interviewer = c.get("interviewer");
  const dateId = c.req.param("dateId");
  const repo = new AvailabilityRepository(c.env.DB);

  const deleted = await repo.unblockDate(interviewer.id, dateId);

  if (!deleted) {
    return c.json({ error: "Blocked date not found" }, 404);
  }

  return c.body(null, 204);
});

/**
 * POST /i/:token/unavailable-today
 *
 * Quick action to mark interviewer unavailable for today.
 */
interviewerRoutes.post("/:token/unavailable-today", async (c) => {
  const interviewer = c.get("interviewer");
  const repo = new AvailabilityRepository(c.env.DB);

  const timezone = interviewer.timezone ?? "UTC";
  const blockedDate = await repo.blockToday(interviewer.id, timezone);

  return c.json({
    success: true,
    blockedDate: repo.toBlockedDateResponse(blockedDate),
  });
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

/**
 * GET /i/:token/connect/:provider
 *
 * Start OAuth flow for calendar connection.
 * Redirects to the provider's OAuth consent screen.
 */
interviewerRoutes.get("/:token/connect/:provider", async (c) => {
  const interviewer = c.get("interviewer");
  const providerType = c.req.param("provider") as CalendarProviderType;
  const token = c.req.param("token");

  // Validate provider type
  const validProviders: CalendarProviderType[] = ["google", "outlook", "apple"];
  if (!validProviders.includes(providerType)) {
    return c.json({ error: `Invalid provider. Supported: ${validProviders.join(", ")}` }, 400);
  }

  // Check if already connected
  if (interviewer.calendarConnected) {
    return c.json(
      { error: "Calendar already connected. Disconnect first to switch providers." },
      400
    );
  }

  try {
    // Create provider and get authorization URL
    const provider = createCalendarProvider(providerType, c.env as unknown as Record<string, string>);

    // State contains the magic token and provider for callback verification
    const state = JSON.stringify({ token, provider: providerType });
    const encodedState = btoa(state);

    const authUrl = provider.getAuthorizationUrl(encodedState);

    // Redirect to OAuth consent screen
    return c.redirect(authUrl);
  } catch (error) {
    console.error(`Failed to start OAuth flow for ${providerType}:`, error);
    if (error instanceof Error && error.message.includes("not yet implemented")) {
      return c.json({ error: error.message }, 501);
    }
    return c.json({ error: "Failed to start OAuth flow" }, 500);
  }
});

/**
 * POST /i/:token/disconnect
 *
 * Disconnect calendar from interviewer account.
 */
interviewerRoutes.post("/:token/disconnect", async (c) => {
  const interviewer = c.get("interviewer");

  if (!interviewer.calendarConnected) {
    return c.json({ error: "No calendar connected" }, 400);
  }

  const repo = new InterviewerRepository(c.env.DB);

  // Clear calendar connection
  await repo.updateCalendarConnection(interviewer.id, {
    calendarProvider: null,
    calendarConnected: false,
    calendarTokens: null,
    calendarId: null,
    connectedAt: null,
  });

  return c.json({ success: true, message: "Calendar disconnected successfully" });
});

export default interviewerRoutes;
