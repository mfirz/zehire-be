/**
 * Interview Reminders Scheduled Handler
 * =====================================
 * Cloudflare Workers Cron Trigger for sending:
 * - Interview reminders (24h before)
 * - Feedback reminders (2h after interview ends)
 *
 * Runs hourly to catch interviews in the reminder windows.
 */

import type { ScheduledEvent } from "@cloudflare/workers-types";

import {
  SchedulingRepository,
  type InterviewReminderContext,
} from "../domain/scheduling";
import {
  createEmailGatewayFromEnv,
  type EmailGateway,
  type SendInterviewReminderInput,
  type SendFeedbackReminderInput,
} from "../modules/email";
import type { Env } from "../types/bindings";

/**
 * Main scheduled handler.
 * Routes to specific tasks based on the trigger time pattern.
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: Env
): Promise<void> {
  console.log(`[Scheduled] Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

  const schedulingRepo = new SchedulingRepository(env.DB);
  const emailGateway = createEmailGatewayFromEnv(env);

  // Run both reminder tasks in parallel
  const results = await Promise.allSettled([
    sendInterviewReminders(schedulingRepo, emailGateway, env),
    sendFeedbackReminders(schedulingRepo, emailGateway, env),
  ]);

  // Log results
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Scheduled] Task failed:", result.reason);
    }
  }

  console.log("[Scheduled] Cron completed");
}

/**
 * Send interview reminders (24 hours before).
 */
async function sendInterviewReminders(
  repo: SchedulingRepository,
  emailGateway: EmailGateway,
  env: Env
): Promise<void> {
  console.log("[Scheduled] Checking for interviews needing 24h reminder...");

  const interviews = await repo.getInterviewsNeedingReminder();

  if (interviews.length === 0) {
    console.log("[Scheduled] No interviews need reminders");
    return;
  }

  console.log(`[Scheduled] Found ${interviews.length} interviews needing reminders`);

  for (const interview of interviews) {
    try {
      const context = await repo.getInterviewWithContext(interview.id);

      if (!context) {
        console.warn(`[Scheduled] Could not get context for interview ${interview.id}`);
        continue;
      }

      // Send reminder to candidate
      await sendCandidateReminder(context, emailGateway, env);

      // Send reminder to each interviewer
      for (const participant of context.participants) {
        await sendInterviewerReminder(context, participant, emailGateway, env);
      }

      // Mark reminder as sent
      await repo.markReminderSent(interview.id);
      console.log(`[Scheduled] Sent reminders for interview ${interview.id}`);
    } catch (error) {
      console.error(`[Scheduled] Failed to send reminder for interview ${interview.id}:`, error);
      // Continue with next interview - don't let one failure stop others
    }
  }
}

/**
 * Send reminder email to candidate.
 */
async function sendCandidateReminder(
  context: InterviewReminderContext,
  emailGateway: EmailGateway,
  _env: Env
): Promise<void> {
  const input: SendInterviewReminderInput = {
    email: context.candidate.email,
    name: context.candidate.name,
    recipientType: "candidate",
    jobTitle: context.job.title,
    companyName: context.job.companyName ?? "the company",
    scheduledAt: context.interview.scheduledAt,
    durationMinutes: context.interview.durationMinutes,
    timezone: context.interview.timezone,
    videoCallLink: context.interview.videoCallLink,
  };

  await emailGateway.sendInterviewReminder(input);
}

/**
 * Send reminder email to interviewer.
 */
async function sendInterviewerReminder(
  context: InterviewReminderContext,
  participant: InterviewReminderContext["participants"][0],
  emailGateway: EmailGateway,
  env: Env
): Promise<void> {
  const appBaseUrl = env.APP_BASE_URL ?? "https://app.zehire.com";

  const input: SendInterviewReminderInput = {
    email: participant.interviewerEmail,
    name: participant.interviewerName ?? participant.interviewerEmail,
    recipientType: "interviewer",
    jobTitle: context.job.title,
    companyName: context.job.companyName ?? "the company",
    scheduledAt: context.interview.scheduledAt,
    durationMinutes: context.interview.durationMinutes,
    timezone: context.interview.timezone,
    videoCallLink: context.interview.videoCallLink,
    candidateName: context.candidate.name,
    interviewGuideUrl: `${appBaseUrl}/interviews/${context.interview.id}/guide`,
  };

  await emailGateway.sendInterviewReminder(input);
}

/**
 * Send feedback reminders (2 hours after interview ends).
 */
async function sendFeedbackReminders(
  repo: SchedulingRepository,
  emailGateway: EmailGateway,
  env: Env
): Promise<void> {
  console.log("[Scheduled] Checking for interviews needing feedback reminder...");

  const participants = await repo.getParticipantsNeedingFeedbackReminder();

  if (participants.length === 0) {
    console.log("[Scheduled] No participants need feedback reminders");
    return;
  }

  console.log(`[Scheduled] Found ${participants.length} participants needing feedback reminders`);

  const appBaseUrl = env.APP_BASE_URL ?? "https://app.zehire.com";

  for (const participant of participants) {
    try {
      const input: SendFeedbackReminderInput = {
        email: participant.interviewerEmail,
        interviewerName: participant.interviewerName ?? participant.interviewerEmail,
        candidateName: participant.candidateName,
        jobTitle: participant.jobTitle,
        feedbackUrl: `${appBaseUrl}/interviews/${participant.interviewId}/feedback`,
      };

      await emailGateway.sendFeedbackReminder(input);
      console.log(
        `[Scheduled] Sent feedback reminder to ${participant.interviewerEmail} for interview ${participant.interviewId}`
      );
    } catch (error) {
      console.error(
        `[Scheduled] Failed to send feedback reminder to ${participant.interviewerEmail}:`,
        error
      );
      // Continue with next participant
    }
  }
}
