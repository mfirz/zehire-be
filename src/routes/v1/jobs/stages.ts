/**
 * Stage Configuration Routes
 * ==========================
 * Endpoints for configuring interview stages on jobs.
 *
 * Endpoints:
 * - GET  /v1/jobs/:id/stages/:stageId/config        - Get stage config
 * - PUT  /v1/jobs/:id/stages/:stageId/config        - Update stage config
 * - GET  /v1/jobs/:id/stages/:stageId/interviewers  - List assigned interviewers
 * - POST /v1/jobs/:id/stages/:stageId/interviewers  - Assign interviewer
 * - DELETE /v1/jobs/:id/stages/:stageId/interviewers/:interviewerId - Remove interviewer
 * - GET  /v1/jobs/:id/stages/:stageId/availability  - Preview available slots
 */

import type { Context } from "hono";

import { JobRepository } from "../../../domain/jobs/repository";
import {
  StageConfigRepository,
  UpdateStageConfigSchema,
  AssignInterviewerSchema,
  type StageConfigResponse,
  type InterviewerSummary,
  type AvailabilityPreviewResponse,
} from "../../../domain/stage-config";
import {
  AvailabilityRepository,
  calculateSlots,
  type InterviewerFreeBusy,
} from "../../../domain/availability";
import type { AuthVariables, Env } from "../../../types/bindings";

type AppContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/**
 * GET /v1/jobs/:id/stages/:stageId/config
 *
 * Get stage configuration with assigned interviewers.
 */
export async function getStageConfig(c: AppContext) {
  const user = c.get("user");
  const jobId = c.req.param("id");
  const stageId = c.req.param("stageId");

  // Verify job ownership
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findByIdAndOrg(jobId, user.orgId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Get stage config
  const stageRepo = new StageConfigRepository(c.env.DB);
  const config = await stageRepo.getConfigWithInterviewers(jobId, stageId);

  // Return defaults if no config exists
  const response: StageConfigResponse = {
    stageId,
    mode: config?.mode ?? "any_one",
    durationMinutes: config?.durationMinutes ?? 45,
    bufferMinutes: config?.bufferMinutes ?? 15,
    interviewers: (config?.interviewers ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      calendarConnected: i.calendarConnected ?? false,
    })),
  };

  return c.json(response);
}

/**
 * PUT /v1/jobs/:id/stages/:stageId/config
 *
 * Update stage configuration.
 */
export async function updateStageConfig(c: AppContext) {
  const user = c.get("user");
  const jobId = c.req.param("id");
  const stageId = c.req.param("stageId");

  // Parse and validate body
  const body = await c.req.json();
  const parseResult = UpdateStageConfigSchema.safeParse(body);

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

  // Verify job ownership
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findByIdAndOrg(jobId, user.orgId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Update config
  const stageRepo = new StageConfigRepository(c.env.DB);
  await stageRepo.upsertConfig(jobId, stageId, input);

  // Return updated config with interviewers
  const config = await stageRepo.getConfigWithInterviewers(jobId, stageId);

  const response: StageConfigResponse = {
    stageId,
    mode: config?.mode ?? "any_one",
    durationMinutes: config?.durationMinutes ?? 45,
    bufferMinutes: config?.bufferMinutes ?? 15,
    interviewers: (config?.interviewers ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      calendarConnected: i.calendarConnected ?? false,
    })),
  };

  return c.json(response);
}

/**
 * GET /v1/jobs/:id/stages/:stageId/interviewers
 *
 * List interviewers assigned to a stage.
 */
export async function listStageInterviewers(c: AppContext) {
  const user = c.get("user");
  const jobId = c.req.param("id");
  const stageId = c.req.param("stageId");

  // Verify job ownership
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findByIdAndOrg(jobId, user.orgId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Get assigned interviewers
  const stageRepo = new StageConfigRepository(c.env.DB);
  const interviewers = await stageRepo.getAssignedInterviewerDetails(jobId, stageId);

  const response: InterviewerSummary[] = interviewers.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    calendarConnected: i.calendarConnected ?? false,
  }));

  return c.json({ interviewers: response });
}

/**
 * POST /v1/jobs/:id/stages/:stageId/interviewers
 *
 * Assign an interviewer to a stage.
 */
export async function assignStageInterviewer(c: AppContext) {
  const user = c.get("user");
  const jobId = c.req.param("id");
  const stageId = c.req.param("stageId");

  // Parse and validate body
  const body = await c.req.json();
  const parseResult = AssignInterviewerSchema.safeParse(body);

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

  // Verify job ownership
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findByIdAndOrg(jobId, user.orgId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Verify interviewer belongs to org
  const stageRepo = new StageConfigRepository(c.env.DB);
  const interviewer = await stageRepo.validateInterviewer(input.interviewerId, user.orgId);

  if (!interviewer) {
    return c.json({ error: "Interviewer not found" }, 404);
  }

  // Assign interviewer
  const assignment = await stageRepo.assignInterviewer(jobId, stageId, input.interviewerId);

  return c.json(
    {
      id: assignment.id,
      interviewerId: interviewer.id,
      email: interviewer.email,
      name: interviewer.name,
      calendarConnected: interviewer.calendarConnected ?? false,
    },
    201
  );
}

/**
 * DELETE /v1/jobs/:id/stages/:stageId/interviewers/:interviewerId
 *
 * Remove an interviewer from a stage.
 */
export async function removeStageInterviewer(c: AppContext) {
  const user = c.get("user");
  const jobId = c.req.param("id");
  const stageId = c.req.param("stageId");
  const interviewerId = c.req.param("interviewerId");

  // Verify job ownership
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findByIdAndOrg(jobId, user.orgId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Remove interviewer
  const stageRepo = new StageConfigRepository(c.env.DB);
  const removed = await stageRepo.removeInterviewer(jobId, stageId, interviewerId);

  if (!removed) {
    return c.json({ error: "Interviewer not assigned to this stage" }, 404);
  }

  return c.body(null, 204);
}

/**
 * GET /v1/jobs/:id/stages/:stageId/availability
 *
 * Preview available interview slots for a stage.
 * Shows next 2 weeks of availability.
 */
export async function previewStageAvailability(c: AppContext) {
  const user = c.get("user");
  const jobId = c.req.param("id");
  const stageId = c.req.param("stageId");

  // Verify job ownership
  const jobRepo = new JobRepository(c.env.DB);
  const job = await jobRepo.findByIdAndOrg(jobId, user.orgId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Get stage config
  const stageRepo = new StageConfigRepository(c.env.DB);
  const config = await stageRepo.getConfigWithInterviewers(jobId, stageId);

  const mode = config?.mode ?? "any_one";
  const durationMinutes = config?.durationMinutes ?? 45;
  const bufferMinutes = config?.bufferMinutes ?? 15;
  const interviewerList = config?.interviewers ?? [];

  if (interviewerList.length === 0) {
    return c.json({
      stageId,
      mode,
      durationMinutes,
      startDate: "",
      endDate: "",
      slotsPerDay: {},
      totalSlots: 0,
      interviewerAvailability: [],
    } satisfies AvailabilityPreviewResponse);
  }

  // Date range: next 2 weeks
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  const startDateStr = startDate.toISOString().split("T")[0]!;
  const endDateStr = endDate.toISOString().split("T")[0]!;

  // Get availability data for all interviewers
  const availRepo = new AvailabilityRepository(c.env.DB);
  const interviewerIds = interviewerList.map((i) => i.id);

  // Fetch availability windows and blocked dates for all interviewers
  const allWindows = await Promise.all(
    interviewerIds.map((id) => availRepo.getWindows(id))
  );
  const allBlockedDates = await Promise.all(
    interviewerIds.map((id) => availRepo.getBlockedDatesInRange(id, startDateStr, endDateStr))
  );

  // Flatten
  const windows = allWindows.flat();
  const blockedDates = allBlockedDates.flat();

  // For now, assume no calendar free/busy data (Phase 9B integration would add this)
  const freeBusy: InterviewerFreeBusy[] = interviewerIds.map((id) => ({
    interviewerId: id,
    busy: [],
  }));

  // Calculate slots
  const slots = calculateSlots({
    windows,
    blockedDates,
    freeBusy,
    durationMinutes,
    bufferMinutes,
    mode,
    startDate,
    endDate,
    timezone: "UTC", // TODO: Use job or org timezone
  });

  // Aggregate slots per day
  const slotsPerDay: Record<string, number> = {};
  for (const slot of slots) {
    slotsPerDay[slot.date] = (slotsPerDay[slot.date] ?? 0) + 1;
  }

  // Count slots contributed by each interviewer
  const slotsByInterviewer: Record<string, number> = {};
  for (const slot of slots) {
    for (const interviewerId of slot.interviewerIds) {
      slotsByInterviewer[interviewerId] = (slotsByInterviewer[interviewerId] ?? 0) + 1;
    }
  }

  const response: AvailabilityPreviewResponse = {
    stageId,
    mode,
    durationMinutes,
    startDate: startDateStr,
    endDate: endDateStr,
    slotsPerDay,
    totalSlots: slots.length,
    interviewerAvailability: interviewerList.map((i) => ({
      id: i.id,
      name: i.name,
      slotsContributed: slotsByInterviewer[i.id] ?? 0,
      calendarConnected: i.calendarConnected ?? false,
    })),
  };

  return c.json(response);
}
