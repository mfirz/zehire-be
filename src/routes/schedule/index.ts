/**
 * Candidate Scheduling Routes
 * ===========================
 * Public routes for candidates to self-schedule interviews.
 *
 * Base path: /schedule/:token
 *
 * Endpoints:
 * - GET  /schedule/:token              - Get scheduling page data
 * - GET  /schedule/:token/slots        - Get available time slots
 * - POST /schedule/:token/book         - Book an interview slot
 * - GET  /schedule/:token/confirmation - Get booking confirmation
 * - POST /schedule/:token/reschedule   - Reschedule interview
 * - POST /schedule/:token/cancel       - Cancel interview
 *
 * These routes use scheduling token authentication, not JWT.
 */

import { Hono } from "hono";

import {
  SchedulingRepository,
  BookSlotSchema,
  RescheduleSchema,
  CancelSchema,
  type SchedulingContext,
  type SchedulingPageResponse,
  type SlotsResponse,
  type BookingResponse,
} from "../../domain/scheduling";
import { InterviewStagesRepository } from "../../domain/interview-stages";
import {
  AvailabilityRepository,
  calculateSlots,
  type InterviewerFreeBusy,
} from "../../domain/availability";
import { InterviewerRepository } from "../../domain/interviewers";
import { CalendarService, type CalendarTokens } from "../../domain/calendar";
import { VideoCallService, type VideoTokens, type VideoMeetingInput } from "../../domain/video";
import { createDb, orgs, jobs } from "../../db";
import { eq } from "drizzle-orm";
import type { Env } from "../../types/bindings";

// Variables available in the scheduling context
interface SchedulingVariables {
  schedulingContext: SchedulingContext;
}

const scheduleRoutes = new Hono<{
  Bindings: Env;
  Variables: SchedulingVariables;
}>();

/**
 * Middleware to validate scheduling token and attach context.
 */
scheduleRoutes.use("/:token/*", async (c, next): Promise<Response | void> => {
  const token = c.req.param("token");

  if (!token) {
    return c.json({ error: "Scheduling token required" }, 401);
  }

  const repo = new SchedulingRepository(c.env.DB);
  const context = await repo.getSchedulingContext(token);

  if (!context) {
    return c.json({ error: "Invalid or expired scheduling link" }, 401);
  }

  c.set("schedulingContext", context);
  await next();
});

/**
 * GET /schedule/:token
 *
 * Get scheduling page data.
 */
scheduleRoutes.get("/:token", async (c) => {
  const ctx = c.get("schedulingContext");

  // Get stage config for duration and interviewers
  const stageRepo = new InterviewStagesRepository(c.env.DB);
  const stageConfig = await stageRepo.getStageByJobAndStageId(ctx.job.id, ctx.stageId);

  const response: SchedulingPageResponse = {
    job: {
      title: ctx.job.title,
      company: ctx.job.companyName,
    },
    stage: {
      name: ctx.stageName,
      durationMinutes: stageConfig?.durationMinutes ?? 45,
    },
    interviewers: (stageConfig?.interviewers ?? []).map((i) => ({
      name: i.name,
    })),
    candidate: {
      name: ctx.application.candidateName,
      email: ctx.application.candidateEmail,
    },
  };

  return c.json(response);
});

/**
 * GET /schedule/:token/slots
 *
 * Get available time slots for scheduling.
 */
scheduleRoutes.get("/:token/slots", async (c) => {
  const ctx = c.get("schedulingContext");

  // Parse query params
  const timezone = c.req.query("timezone") ?? "UTC";
  const startDateParam = c.req.query("startDate");
  const endDateParam = c.req.query("endDate");

  // Date range: default to next 14 days
  const startDate = startDateParam ? new Date(startDateParam) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = endDateParam ? new Date(endDateParam) : new Date(startDate);
  if (!endDateParam) {
    endDate.setDate(endDate.getDate() + 14);
  }

  const startDateStr = startDate.toISOString().split("T")[0]!;
  const endDateStr = endDate.toISOString().split("T")[0]!;

  // Get stage config
  const stageRepo = new InterviewStagesRepository(c.env.DB);
  const stageConfig = await stageRepo.getStageByJobAndStageId(ctx.job.id, ctx.stageId);

  const mode = stageConfig?.mode ?? "any_one";
  const durationMinutes = stageConfig?.durationMinutes ?? 45;
  const interviewerList = stageConfig?.interviewers ?? [];

  if (interviewerList.length === 0) {
    return c.json({
      timezone,
      slots: [],
    } satisfies SlotsResponse);
  }

  // Get availability data
  const availRepo = new AvailabilityRepository(c.env.DB);
  const interviewerRepo = new InterviewerRepository(c.env.DB);
  const interviewerIds = interviewerList.map((i) => i.id);

  const allWindows = await Promise.all(
    interviewerIds.map((id) => availRepo.getWindows(id))
  );
  const allBlockedDates = await Promise.all(
    interviewerIds.map((id) => availRepo.getBlockedDatesInRange(id, startDateStr, endDateStr))
  );

  const windows = allWindows.flat();
  const blockedDates = allBlockedDates.flat();

  // Get calendar free/busy if available
  let freeBusy: InterviewerFreeBusy[] = interviewerIds.map((id) => ({
    interviewerId: id,
    busy: [],
  }));

  // Try to get calendar free/busy data (requires TOKEN_ENCRYPTION_KEY)
  if (c.env.TOKEN_ENCRYPTION_KEY) {
    try {
      const calendarService = new CalendarService(c.env as unknown as Record<string, string>);

      // Get full interviewer records for calendar access
      const fullInterviewers = await Promise.all(
        interviewerIds.map((id) => interviewerRepo.findById(id))
      );
      const validInterviewers = fullInterviewers.filter(
        (i): i is NonNullable<typeof i> => i !== null
      );

      // Token update callback
      const updateTokens = async (interviewerId: string, tokens: CalendarTokens) => {
        const encrypted = await calendarService.encryptTokensForStorage(tokens);
        await interviewerRepo.updateCalendarTokens(interviewerId, encrypted);
      };

      // Get free/busy from calendar providers
      const busyMap = await calendarService.getFreeBusy(
        validInterviewers,
        startDate,
        endDate,
        updateTokens
      );

      // Convert to InterviewerFreeBusy format
      freeBusy = interviewerIds.map((id) => ({
        interviewerId: id,
        busy: (busyMap.get(id) ?? []).map((period) => ({
          start: period.start,
          end: period.end,
        })),
      }));
    } catch (error) {
      console.error("Failed to get calendar free/busy, proceeding with availability only:", error);
      // Continue with empty free/busy - slots will be based on availability windows only
    }
  }

  // Calculate slots (buffer is hardcoded via INTERVIEW_BUFFER_MINUTES constant)
  const slots = calculateSlots({
    windows,
    blockedDates,
    freeBusy,
    durationMinutes,
    mode,
    startDate,
    endDate,
    timezone,
  });

  // Group slots by date
  const slotsByDate = new Map<string, string[]>();
  for (const slot of slots) {
    const existing = slotsByDate.get(slot.date) ?? [];
    if (!existing.includes(slot.time)) {
      existing.push(slot.time);
    }
    slotsByDate.set(slot.date, existing);
  }

  // Format response
  const response: SlotsResponse = {
    timezone,
    slots: [...slotsByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, times]) => ({
        date,
        times: times.sort(),
      })),
  };

  return c.json(response);
});

/**
 * POST /schedule/:token/book
 *
 * Book an interview slot.
 */
scheduleRoutes.post("/:token/book", async (c) => {
  const ctx = c.get("schedulingContext");

  // Parse and validate body
  const body = await c.req.json();
  const parseResult = BookSlotSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      400
    );
  }

  const input = parseResult.data;

  // Get stage config
  const stageRepo = new InterviewStagesRepository(c.env.DB);
  const stageConfig = await stageRepo.getStageByJobAndStageId(ctx.job.id, ctx.stageId);

  const durationMinutes = stageConfig?.durationMinutes ?? 45;
  const interviewerIds = (stageConfig?.interviewers ?? []).map((i) => i.id);

  if (interviewerIds.length === 0) {
    return c.json({ error: "No interviewers assigned to this stage" }, 400);
  }

  // Construct scheduled time
  const scheduledAt = `${input.date}T${input.time}:00`;

  // Check slot availability (prevent double booking)
  const schedulingRepo = new SchedulingRepository(c.env.DB);
  const isAvailable = await schedulingRepo.isSlotAvailable(
    interviewerIds,
    scheduledAt,
    durationMinutes
  );

  if (!isAvailable) {
    return c.json(
      {
        error: "This time slot is no longer available. Please select another time.",
        code: "SLOT_UNAVAILABLE",
      },
      409
    );
  }

  // Try to create video call link
  let videoCallLink: string | undefined;
  let videoCallProvider: "google_meet" | "zoom" | "teams" | "other" | undefined;

  if (c.env.TOKEN_ENCRYPTION_KEY) {
    try {
      const db = createDb(c.env.DB);
      const interviewerRepo = new InterviewerRepository(c.env.DB);

      // Get job's org for video provider settings
      const jobRecord = await db.select({ orgId: jobs.orgId }).from(jobs).where(eq(jobs.id, ctx.job.id)).get();
      const org = jobRecord?.orgId
        ? await db.select().from(orgs).where(eq(orgs.id, jobRecord.orgId)).get()
        : null;

      // Get the first interviewer with connected calendar
      const interviewersData = await Promise.all(
        interviewerIds.map((id) => interviewerRepo.findById(id))
      );
      const primaryInterviewer = interviewersData.find(
        (i) => i?.calendarConnected && i.calendarProvider
      );

      if (primaryInterviewer && org) {
        const videoService = new VideoCallService(c.env as unknown as Record<string, string>);

        const startTime = new Date(scheduledAt);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        const meetingInput: VideoMeetingInput = {
          title: `Interview: ${ctx.application.candidateName} - ${ctx.job.title}`,
          description: `Interview for ${ctx.job.title} position`,
          startTime,
          endTime,
          timezone: input.timezone,
          attendees: [
            { email: ctx.application.candidateEmail, name: ctx.application.candidateName },
          ],
        };

        const meeting = await videoService.createMeeting(
          org,
          primaryInterviewer,
          meetingInput,
          async (tokens: VideoTokens) => {
            const encrypted = await videoService.encryptTokensForStorage(tokens);
            await db.update(orgs).set({ videoTokens: encrypted }).where(eq(orgs.id, org.id));
          },
          async (tokens: CalendarTokens) => {
            const calService = new CalendarService(c.env as unknown as Record<string, string>);
            const encrypted = await calService.encryptTokensForStorage(tokens);
            await interviewerRepo.updateCalendarTokens(primaryInterviewer.id, encrypted);
          }
        );

        videoCallLink = meeting.joinUrl;
        // Infer provider from org settings
        if (org.videoCallProvider === "zoom") {
          videoCallProvider = "zoom";
        } else if (primaryInterviewer.calendarProvider === "google") {
          videoCallProvider = "google_meet";
        } else if (primaryInterviewer.calendarProvider === "outlook") {
          videoCallProvider = "teams";
        }
      }
    } catch (error) {
      // Video call creation failed - log but continue with booking
      console.error("Failed to create video call:", error);
    }
  }

  // Create the interview
  const interview = await schedulingRepo.createInterview(
    {
      applicationId: ctx.application.id,
      jobId: ctx.job.id,
      stageId: ctx.stageId,
      scheduledAt,
      durationMinutes,
      timezone: input.timezone,
      videoCallLink,
      videoCallProvider,
    },
    interviewerIds
  );

  // Mark scheduling token as used
  await schedulingRepo.markTokenUsed(ctx.token.id);

  // Build calendar links
  const calendarTitle = encodeURIComponent(
    `Interview: ${ctx.application.candidateName} - ${ctx.job.title}`
  );
  const calendarDetails = encodeURIComponent(
    `Interview for ${ctx.job.title} position`
  );

  const response: BookingResponse = {
    success: true,
    interview: {
      id: interview.id,
      scheduledAt: interview.scheduledAt,
      durationMinutes: interview.durationMinutes,
      videoCallLink: interview.videoCallLink,
      interviewers: interview.participants.map((p) => p.interviewerName ?? p.interviewerEmail),
      addToCalendar: {
        google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calendarTitle}&details=${calendarDetails}&dates=${formatGoogleCalendarDate(scheduledAt, durationMinutes)}`,
        outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${calendarTitle}&body=${calendarDetails}&startdt=${scheduledAt}&enddt=${formatEndTime(scheduledAt, durationMinutes)}`,
        ical: `/schedule/${ctx.token.token}/calendar.ics`,
      },
    },
    message: "Interview scheduled! You'll receive a confirmation email.",
  };

  return c.json(response, 201);
});

/**
 * GET /schedule/:token/confirmation
 *
 * Get booking confirmation details.
 */
scheduleRoutes.get("/:token/confirmation", async (c) => {
  const ctx = c.get("schedulingContext");

  // Check if token was used (interview booked)
  if (!ctx.token.usedAt) {
    return c.json({ error: "No interview has been booked yet" }, 404);
  }

  // Get the booked interview
  const schedulingRepo = new SchedulingRepository(c.env.DB);
  const interviews = await schedulingRepo.getInterviewsForApplication(ctx.application.id);

  const interview = interviews.find((i) => i.stageId === ctx.stageId && i.status === "scheduled");

  if (!interview) {
    return c.json({ error: "Interview not found" }, 404);
  }

  return c.json({
    interview: {
      id: interview.id,
      scheduledAt: interview.scheduledAt,
      durationMinutes: interview.durationMinutes,
      videoCallLink: interview.videoCallLink,
      interviewers: interview.participants.map((p) => p.interviewerName ?? p.interviewerEmail),
    },
    job: {
      title: ctx.job.title,
      company: ctx.job.companyName,
    },
    stage: {
      name: ctx.stageId,
    },
  });
});

/**
 * POST /schedule/:token/reschedule
 *
 * Reschedule an interview.
 */
scheduleRoutes.post("/:token/reschedule", async (c) => {
  const ctx = c.get("schedulingContext");

  // Parse and validate body
  const body = await c.req.json();
  const parseResult = RescheduleSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      400
    );
  }

  const input = parseResult.data;

  // Get the existing interview
  const schedulingRepo = new SchedulingRepository(c.env.DB);
  const interviews = await schedulingRepo.getInterviewsForApplication(ctx.application.id);
  const existingInterview = interviews.find(
    (i) => i.stageId === ctx.stageId && i.status === "scheduled"
  );

  if (!existingInterview) {
    return c.json({ error: "No scheduled interview found to reschedule" }, 404);
  }

  // Get stage config
  const stageRepo = new InterviewStagesRepository(c.env.DB);
  const stageConfig = await stageRepo.getStageByJobAndStageId(ctx.job.id, ctx.stageId);

  const durationMinutes = stageConfig?.durationMinutes ?? 45;
  const interviewerIds = (stageConfig?.interviewers ?? []).map((i) => i.id);

  // Construct new scheduled time
  const scheduledAt = `${input.date}T${input.time}:00`;

  // Check slot availability
  const isAvailable = await schedulingRepo.isSlotAvailable(
    interviewerIds,
    scheduledAt,
    durationMinutes
  );

  if (!isAvailable) {
    return c.json(
      {
        error: "This time slot is no longer available. Please select another time.",
        code: "SLOT_UNAVAILABLE",
      },
      409
    );
  }

  // Mark old interview as rescheduled
  await schedulingRepo.updateInterviewStatus(existingInterview.id, "rescheduled");

  // Create new interview
  const newInterview = await schedulingRepo.createInterview(
    {
      applicationId: ctx.application.id,
      jobId: ctx.job.id,
      stageId: ctx.stageId,
      scheduledAt,
      durationMinutes,
      timezone: input.timezone,
      videoCallLink: undefined,
      videoCallProvider: undefined,
    },
    interviewerIds
  );

  return c.json({
    success: true,
    interview: {
      id: newInterview.id,
      scheduledAt: newInterview.scheduledAt,
      durationMinutes: newInterview.durationMinutes,
      videoCallLink: newInterview.videoCallLink,
      interviewers: newInterview.participants.map((p) => p.interviewerName ?? p.interviewerEmail),
    },
    message: "Interview rescheduled. Updated confirmation sent to your email.",
  });
});

/**
 * POST /schedule/:token/cancel
 *
 * Cancel an interview.
 */
scheduleRoutes.post("/:token/cancel", async (c) => {
  const ctx = c.get("schedulingContext");

  // Parse body
  const body = await c.req.json();
  const parseResult = CancelSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      400
    );
  }

  const input = parseResult.data;

  // Get the existing interview
  const schedulingRepo = new SchedulingRepository(c.env.DB);
  const interviews = await schedulingRepo.getInterviewsForApplication(ctx.application.id);
  const existingInterview = interviews.find(
    (i) => i.stageId === ctx.stageId && i.status === "scheduled"
  );

  if (!existingInterview) {
    return c.json({ error: "No scheduled interview found to cancel" }, 404);
  }

  // Cancel the interview
  await schedulingRepo.updateInterviewStatus(
    existingInterview.id,
    "cancelled",
    input.reason
  );

  return c.json({
    success: true,
    message: "Interview cancelled.",
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format date for Google Calendar link.
 */
function formatGoogleCalendarDate(scheduledAt: string, durationMinutes: number): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const formatDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  return `${formatDate(start)}/${formatDate(end)}`;
}

/**
 * Format end time for Outlook calendar link.
 */
function formatEndTime(scheduledAt: string, durationMinutes: number): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return end.toISOString();
}

export default scheduleRoutes;
