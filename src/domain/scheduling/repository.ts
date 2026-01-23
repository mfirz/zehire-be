/**
 * Scheduling Repository
 * =====================
 * Data access layer for scheduling tokens, interviews, and participants.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, eq, inArray, gt, isNull } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  schedulingTokens,
  scheduledInterviews,
  interviewParticipants,
  applications,
  jobs,
  interviewers,
  type Database,
  type SchedulingToken,
  type NewSchedulingToken,
  type ScheduledInterview,
  type NewScheduledInterview,
  type InterviewParticipant,
  type NewInterviewParticipant,
} from "../../db";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// URL-safe token for scheduling links
const urlSafeToken = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  32
);

export interface SchedulingContext {
  token: SchedulingToken;
  application: {
    id: string;
    candidateName: string;
    candidateEmail: string;
  };
  job: {
    id: string;
    title: string;
    companyName: string | null;
    pipeline: string | null;
  };
  stageId: string;
  stageName: string;
}

export interface InterviewWithParticipants extends ScheduledInterview {
  participants: Array<{
    id: string;
    interviewerId: string;
    interviewerName: string | null;
    interviewerEmail: string;
    feedbackStatus: string | null;
  }>;
}

export class SchedulingRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // SCHEDULING TOKENS
  // ===========================================================================

  /**
   * Create a scheduling token for a candidate.
   */
  async createToken(
    applicationId: string,
    stageId: string,
    expiresInDays: number = 7
  ): Promise<SchedulingToken> {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const token: NewSchedulingToken = {
      id: alphanumericId(),
      applicationId,
      stageId,
      token: urlSafeToken(),
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };

    await this.db.insert(schedulingTokens).values(token);

    return token as SchedulingToken;
  }

  /**
   * Find a scheduling token by token string.
   * Returns null if not found, expired, or already used.
   */
  async findValidToken(token: string): Promise<SchedulingToken | null> {
    const now = new Date().toISOString();

    const result = await this.db
      .select()
      .from(schedulingTokens)
      .where(
        and(
          eq(schedulingTokens.token, token),
          gt(schedulingTokens.expiresAt, now),
          isNull(schedulingTokens.usedAt)
        )
      )
      .get();

    return result ?? null;
  }

  /**
   * Get full scheduling context for a token.
   */
  async getSchedulingContext(token: string): Promise<SchedulingContext | null> {
    const tokenRecord = await this.findValidToken(token);

    if (!tokenRecord) {
      return null;
    }

    // Get application details
    const application = await this.db
      .select({
        id: applications.id,
        candidateName: applications.candidateName,
        candidateEmail: applications.candidateEmail,
      })
      .from(applications)
      .where(eq(applications.id, tokenRecord.applicationId))
      .get();

    if (!application) {
      return null;
    }

    // Get job details including pipeline for stage name
    const job = await this.db
      .select({
        id: jobs.id,
        title: jobs.title,
        companyName: jobs.companyName,
        pipeline: jobs.pipeline,
      })
      .from(jobs)
      .innerJoin(applications, eq(applications.jobId, jobs.id))
      .where(eq(applications.id, tokenRecord.applicationId))
      .get();

    if (!job) {
      return null;
    }

    return {
      token: tokenRecord,
      application: {
        id: application.id,
        candidateName: application.candidateName,
        candidateEmail: application.candidateEmail,
      },
      job: {
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        pipeline: job.pipeline,
      },
      stageId: tokenRecord.stageId,
      stageName: getStageName(job.pipeline, tokenRecord.stageId),
    };
  }

  /**
   * Mark token as used.
   */
  async markTokenUsed(tokenId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(schedulingTokens)
      .set({ usedAt: now })
      .where(eq(schedulingTokens.id, tokenId));
  }

  // ===========================================================================
  // SCHEDULED INTERVIEWS
  // ===========================================================================

  /**
   * Create a scheduled interview with participants.
   */
  async createInterview(
    data: {
      applicationId: string;
      jobId: string;
      stageId: string;
      scheduledAt: string;
      durationMinutes: number;
      timezone: string;
      videoCallLink?: string | undefined;
      videoCallProvider?: "google_meet" | "zoom" | "teams" | "other" | undefined;
    },
    interviewerIds: string[]
  ): Promise<InterviewWithParticipants> {
    const now = new Date().toISOString();

    // Create the interview
    const interview: NewScheduledInterview = {
      id: alphanumericId(),
      applicationId: data.applicationId,
      jobId: data.jobId,
      stageId: data.stageId,
      scheduledAt: data.scheduledAt,
      durationMinutes: data.durationMinutes,
      timezone: data.timezone,
      videoCallLink: data.videoCallLink ?? null,
      videoCallProvider: data.videoCallProvider ?? null,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(scheduledInterviews).values(interview);

    // Create participants
    const participants: NewInterviewParticipant[] = interviewerIds.map((interviewerId) => ({
      id: alphanumericId(),
      interviewId: interview.id!,
      interviewerId,
      feedbackStatus: "pending",
      createdAt: now,
    }));

    if (participants.length > 0) {
      await this.db.insert(interviewParticipants).values(participants);
    }

    // Return with participant details
    const result = await this.getInterviewWithParticipants(interview.id!);
    return result!;
  }

  /**
   * Get interview with participant details.
   */
  async getInterviewWithParticipants(
    interviewId: string
  ): Promise<InterviewWithParticipants | null> {
    const interview = await this.db
      .select()
      .from(scheduledInterviews)
      .where(eq(scheduledInterviews.id, interviewId))
      .get();

    if (!interview) {
      return null;
    }

    // Get participants with interviewer details
    const participantRecords = await this.db
      .select({
        id: interviewParticipants.id,
        interviewerId: interviewParticipants.interviewerId,
        interviewerName: interviewers.name,
        interviewerEmail: interviewers.email,
        feedbackStatus: interviewParticipants.feedbackStatus,
      })
      .from(interviewParticipants)
      .innerJoin(interviewers, eq(interviewParticipants.interviewerId, interviewers.id))
      .where(eq(interviewParticipants.interviewId, interviewId))
      .all();

    return {
      ...interview,
      participants: participantRecords,
    };
  }

  /**
   * Find interview by ID.
   */
  async findInterviewById(id: string): Promise<ScheduledInterview | null> {
    const result = await this.db
      .select()
      .from(scheduledInterviews)
      .where(eq(scheduledInterviews.id, id))
      .get();

    return result ?? null;
  }

  /**
   * Check if a slot is still available (no double booking).
   */
  async isSlotAvailable(
    interviewerIds: string[],
    scheduledAt: string,
    durationMinutes: number
  ): Promise<boolean> {
    // Calculate time range for overlap check
    const startTime = new Date(scheduledAt);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    // Check for overlapping interviews for any of the interviewers
    for (const interviewerId of interviewerIds) {
      // Find scheduled interviews for this interviewer
      const existing = await this.db
        .select({
          id: scheduledInterviews.id,
          scheduledAt: scheduledInterviews.scheduledAt,
          durationMinutes: scheduledInterviews.durationMinutes,
        })
        .from(scheduledInterviews)
        .innerJoin(
          interviewParticipants,
          eq(interviewParticipants.interviewId, scheduledInterviews.id)
        )
        .where(
          and(
            eq(interviewParticipants.interviewerId, interviewerId),
            eq(scheduledInterviews.status, "scheduled")
          )
        )
        .all();

      // Check for overlap with each existing interview
      for (const interview of existing) {
        const existingStart = new Date(interview.scheduledAt);
        const existingEnd = new Date(
          existingStart.getTime() + interview.durationMinutes * 60 * 1000
        );

        // Overlap check: new.start < existing.end AND new.end > existing.start
        if (startTime < existingEnd && endTime > existingStart) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Update interview status.
   */
  async updateInterviewStatus(
    interviewId: string,
    status: "scheduled" | "completed" | "cancelled" | "rescheduled" | "no_show",
    reason?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(scheduledInterviews)
      .set({
        status,
        cancelledReason: reason ?? null,
        updatedAt: now,
      })
      .where(eq(scheduledInterviews.id, interviewId));
  }

  /**
   * Get interviews for an application.
   */
  async getInterviewsForApplication(
    applicationId: string
  ): Promise<InterviewWithParticipants[]> {
    const interviews = await this.db
      .select()
      .from(scheduledInterviews)
      .where(eq(scheduledInterviews.applicationId, applicationId))
      .all();

    const results: InterviewWithParticipants[] = [];

    for (const interview of interviews) {
      const withParticipants = await this.getInterviewWithParticipants(interview.id);
      if (withParticipants) {
        results.push(withParticipants);
      }
    }

    return results;
  }

  // ===========================================================================
  // INTERVIEW PARTICIPANTS & FEEDBACK
  // ===========================================================================

  /**
   * Get participant record for an interviewer.
   */
  async getParticipant(
    interviewId: string,
    interviewerId: string
  ): Promise<InterviewParticipant | null> {
    const result = await this.db
      .select()
      .from(interviewParticipants)
      .where(
        and(
          eq(interviewParticipants.interviewId, interviewId),
          eq(interviewParticipants.interviewerId, interviewerId)
        )
      )
      .get();

    return result ?? null;
  }

  /**
   * Submit feedback for an interview.
   */
  async submitFeedback(
    interviewId: string,
    interviewerId: string,
    feedbackContent: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(interviewParticipants)
      .set({
        feedbackStatus: "submitted",
        feedbackSubmittedAt: now,
        feedbackContent,
      })
      .where(
        and(
          eq(interviewParticipants.interviewId, interviewId),
          eq(interviewParticipants.interviewerId, interviewerId)
        )
      );
  }

  /**
   * Get interviews pending feedback for an interviewer.
   */
  async getPendingFeedback(interviewerId: string): Promise<ScheduledInterview[]> {
    const participants = await this.db
      .select({ interviewId: interviewParticipants.interviewId })
      .from(interviewParticipants)
      .where(
        and(
          eq(interviewParticipants.interviewerId, interviewerId),
          eq(interviewParticipants.feedbackStatus, "pending")
        )
      )
      .all();

    if (participants.length === 0) {
      return [];
    }

    const interviewIds = participants.map((p) => p.interviewId);

    // Get completed interviews (past scheduled time)
    const now = new Date().toISOString();
    const interviews = await this.db
      .select()
      .from(scheduledInterviews)
      .where(
        and(
          inArray(scheduledInterviews.id, interviewIds),
          eq(scheduledInterviews.status, "scheduled")
          // scheduledAt < now would filter to past interviews
        )
      )
      .all();

    // Filter to past interviews
    return interviews.filter((i) => i.scheduledAt < now);
  }

  /**
   * Get upcoming interviews for an interviewer.
   */
  async getUpcomingInterviews(interviewerId: string): Promise<InterviewWithParticipants[]> {
    const now = new Date().toISOString();

    const participants = await this.db
      .select({ interviewId: interviewParticipants.interviewId })
      .from(interviewParticipants)
      .where(eq(interviewParticipants.interviewerId, interviewerId))
      .all();

    if (participants.length === 0) {
      return [];
    }

    const interviewIds = participants.map((p) => p.interviewId);

    const interviews = await this.db
      .select()
      .from(scheduledInterviews)
      .where(
        and(
          inArray(scheduledInterviews.id, interviewIds),
          eq(scheduledInterviews.status, "scheduled"),
          gt(scheduledInterviews.scheduledAt, now)
        )
      )
      .all();

    const results: InterviewWithParticipants[] = [];

    for (const interview of interviews) {
      const withParticipants = await this.getInterviewWithParticipants(interview.id);
      if (withParticipants) {
        results.push(withParticipants);
      }
    }

    return results;
  }

  /**
   * Get upcoming interviews with candidate and job details.
   */
  async getUpcomingInterviewsWithDetails(
    interviewerId: string
  ): Promise<InterviewWithDetails[]> {
    const now = new Date().toISOString();

    const results = await this.db
      .select({
        id: scheduledInterviews.id,
        scheduledAt: scheduledInterviews.scheduledAt,
        durationMinutes: scheduledInterviews.durationMinutes,
        videoCallLink: scheduledInterviews.videoCallLink,
        stageId: scheduledInterviews.stageId,
        candidateName: applications.candidateName,
        jobTitle: jobs.title,
        companyName: jobs.companyName,
        pipeline: jobs.pipeline,
      })
      .from(scheduledInterviews)
      .innerJoin(
        interviewParticipants,
        eq(interviewParticipants.interviewId, scheduledInterviews.id)
      )
      .innerJoin(applications, eq(scheduledInterviews.applicationId, applications.id))
      .innerJoin(jobs, eq(scheduledInterviews.jobId, jobs.id))
      .where(
        and(
          eq(interviewParticipants.interviewerId, interviewerId),
          eq(scheduledInterviews.status, "scheduled"),
          gt(scheduledInterviews.scheduledAt, now)
        )
      )
      .orderBy(scheduledInterviews.scheduledAt)
      .all();

    return results.map((r) => ({
      id: r.id,
      scheduledAt: r.scheduledAt,
      durationMinutes: r.durationMinutes,
      videoCallLink: r.videoCallLink,
      stageId: r.stageId,
      stageName: getStageName(r.pipeline, r.stageId),
      candidateName: r.candidateName,
      jobTitle: r.jobTitle,
      companyName: r.companyName,
    }));
  }

  /**
   * Get pending feedback with candidate and job details.
   */
  async getPendingFeedbackWithDetails(
    interviewerId: string
  ): Promise<InterviewWithDetails[]> {
    const now = new Date().toISOString();

    const results = await this.db
      .select({
        id: scheduledInterviews.id,
        scheduledAt: scheduledInterviews.scheduledAt,
        durationMinutes: scheduledInterviews.durationMinutes,
        videoCallLink: scheduledInterviews.videoCallLink,
        stageId: scheduledInterviews.stageId,
        candidateName: applications.candidateName,
        jobTitle: jobs.title,
        companyName: jobs.companyName,
        pipeline: jobs.pipeline,
      })
      .from(scheduledInterviews)
      .innerJoin(
        interviewParticipants,
        eq(interviewParticipants.interviewId, scheduledInterviews.id)
      )
      .innerJoin(applications, eq(scheduledInterviews.applicationId, applications.id))
      .innerJoin(jobs, eq(scheduledInterviews.jobId, jobs.id))
      .where(
        and(
          eq(interviewParticipants.interviewerId, interviewerId),
          eq(interviewParticipants.feedbackStatus, "pending"),
          eq(scheduledInterviews.status, "scheduled")
        )
      )
      .all();

    // Filter to past interviews (interview has ended) and map to include stage name
    return results
      .filter((r) => {
        const endTime = new Date(r.scheduledAt);
        endTime.setMinutes(endTime.getMinutes() + r.durationMinutes);
        return endTime.toISOString() < now;
      })
      .map((r) => ({
        id: r.id,
        scheduledAt: r.scheduledAt,
        durationMinutes: r.durationMinutes,
        videoCallLink: r.videoCallLink,
        stageId: r.stageId,
        stageName: getStageName(r.pipeline, r.stageId),
        candidateName: r.candidateName,
        jobTitle: r.jobTitle,
        companyName: r.companyName,
      }));
  }

  // ===========================================================================
  // REMINDER QUERIES (Cron Jobs)
  // ===========================================================================

  /**
   * Interview with full context for sending reminders.
   */
  async getInterviewWithContext(interviewId: string): Promise<InterviewReminderContext | null> {
    // Get interview with application and job info
    const result = await this.db
      .select({
        interview: scheduledInterviews,
        candidateName: applications.candidateName,
        candidateEmail: applications.candidateEmail,
        jobTitle: jobs.title,
        companyName: jobs.companyName,
      })
      .from(scheduledInterviews)
      .innerJoin(applications, eq(scheduledInterviews.applicationId, applications.id))
      .innerJoin(jobs, eq(scheduledInterviews.jobId, jobs.id))
      .where(eq(scheduledInterviews.id, interviewId))
      .get();

    if (!result) {
      return null;
    }

    // Get participants with interviewer details
    const participantRecords = await this.db
      .select({
        id: interviewParticipants.id,
        interviewerId: interviewParticipants.interviewerId,
        interviewerName: interviewers.name,
        interviewerEmail: interviewers.email,
        feedbackStatus: interviewParticipants.feedbackStatus,
      })
      .from(interviewParticipants)
      .innerJoin(interviewers, eq(interviewParticipants.interviewerId, interviewers.id))
      .where(eq(interviewParticipants.interviewId, interviewId))
      .all();

    return {
      interview: result.interview,
      candidate: {
        name: result.candidateName,
        email: result.candidateEmail,
      },
      job: {
        title: result.jobTitle,
        companyName: result.companyName,
      },
      participants: participantRecords,
    };
  }

  /**
   * Find interviews that need 24h reminder.
   * Returns interviews scheduled between 23-24 hours from now
   * that haven't had their reminder sent yet.
   */
  async getInterviewsNeedingReminder(): Promise<ScheduledInterview[]> {
    const now = new Date();
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const interviews = await this.db
      .select()
      .from(scheduledInterviews)
      .where(
        and(
          eq(scheduledInterviews.status, "scheduled"),
          isNull(scheduledInterviews.reminderSentAt),
          gt(scheduledInterviews.scheduledAt, in23Hours.toISOString()),
          // scheduledAt <= in24Hours
        )
      )
      .all();

    // Filter to only interviews within 23-24h window
    return interviews.filter((i) => i.scheduledAt <= in24Hours.toISOString());
  }

  /**
   * Mark interview reminder as sent.
   */
  async markReminderSent(interviewId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(scheduledInterviews)
      .set({ reminderSentAt: now })
      .where(eq(scheduledInterviews.id, interviewId));
  }

  /**
   * Find participants who need feedback reminder.
   * Returns participants for interviews that ended 2-3 hours ago
   * who haven't submitted feedback yet.
   */
  async getParticipantsNeedingFeedbackReminder(): Promise<FeedbackReminderRecord[]> {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    // Get completed interviews (past scheduled time + duration) with pending feedback
    const results = await this.db
      .select({
        interviewId: scheduledInterviews.id,
        scheduledAt: scheduledInterviews.scheduledAt,
        durationMinutes: scheduledInterviews.durationMinutes,
        participantId: interviewParticipants.id,
        interviewerId: interviewParticipants.interviewerId,
        interviewerEmail: interviewers.email,
        interviewerName: interviewers.name,
        feedbackStatus: interviewParticipants.feedbackStatus,
        candidateName: applications.candidateName,
        jobTitle: jobs.title,
      })
      .from(scheduledInterviews)
      .innerJoin(
        interviewParticipants,
        eq(interviewParticipants.interviewId, scheduledInterviews.id)
      )
      .innerJoin(interviewers, eq(interviewParticipants.interviewerId, interviewers.id))
      .innerJoin(applications, eq(scheduledInterviews.applicationId, applications.id))
      .innerJoin(jobs, eq(scheduledInterviews.jobId, jobs.id))
      .where(
        and(
          eq(scheduledInterviews.status, "scheduled"),
          eq(interviewParticipants.feedbackStatus, "pending"),
          isNull(interviewParticipants.feedbackSubmittedAt)
        )
      )
      .all();

    // Filter to interviews that ended 2-3 hours ago
    return results.filter((r) => {
      const interviewEnd = new Date(r.scheduledAt);
      interviewEnd.setMinutes(interviewEnd.getMinutes() + r.durationMinutes);

      return interviewEnd >= threeHoursAgo && interviewEnd <= twoHoursAgo;
    });
  }
}

// Types for cron job queries
export interface InterviewReminderContext {
  interview: ScheduledInterview;
  candidate: {
    name: string;
    email: string;
  };
  job: {
    title: string;
    companyName: string | null;
  };
  participants: Array<{
    id: string;
    interviewerId: string;
    interviewerName: string | null;
    interviewerEmail: string;
    feedbackStatus: string | null;
  }>;
}

export interface FeedbackReminderRecord {
  interviewId: string;
  scheduledAt: string;
  durationMinutes: number;
  participantId: string;
  interviewerId: string;
  interviewerEmail: string;
  interviewerName: string | null;
  feedbackStatus: string | null;
  candidateName: string;
  jobTitle: string;
}

// Types for interviewer dashboard
export interface InterviewWithDetails {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  videoCallLink: string | null;
  stageId: string;
  stageName: string;
  candidateName: string;
  jobTitle: string;
  companyName: string | null;
}

/**
 * Helper to extract stage name from pipeline JSON.
 */
function getStageName(pipelineJson: string | null, stageId: string): string {
  if (!pipelineJson) {
    return stageId;
  }
  try {
    const pipeline = JSON.parse(pipelineJson);
    const round = pipeline.interviewRounds?.find((r: { id: string }) => r.id === stageId);
    return round?.name ?? stageId;
  } catch {
    return stageId;
  }
}
