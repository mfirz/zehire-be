/**
 * Interviewer Repository
 * ======================
 * Data access layer for interviewers using Drizzle ORM.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, count, desc, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  interviewers,
  type Database,
  type Interviewer,
  type InterviewerStatus,
  type NewInterviewer,
} from "../../db";
import { MAGIC_LINK_EXPIRY_DAYS, MAGIC_TOKEN_LENGTH, type InterviewerResponse } from "./schemas";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// URL-safe nanoid for magic tokens (longer for security)
const magicTokenId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  MAGIC_TOKEN_LENGTH
);

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

export class InterviewerRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new interviewer with a magic token.
   */
  async create(orgId: string, email: string, name?: string): Promise<Interviewer> {
    const now = new Date().toISOString();
    const magicToken = magicTokenId();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const interviewer: NewInterviewer = {
      id: alphanumericId(),
      orgId,
      email: email.toLowerCase(),
      name: name || null,
      magicToken,
      magicTokenExpiresAt: expiresAt,
      status: "invited",
      invitedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(interviewers).values(interviewer);

    return interviewer as Interviewer;
  }

  /**
   * Find interviewer by ID.
   */
  async findById(id: string): Promise<Interviewer | undefined> {
    return this.db.select().from(interviewers).where(eq(interviewers.id, id)).get();
  }

  /**
   * Find interviewer by ID and org (for authorization).
   */
  async findByIdAndOrg(id: string, orgId: string): Promise<Interviewer | undefined> {
    return this.db
      .select()
      .from(interviewers)
      .where(and(eq(interviewers.id, id), eq(interviewers.orgId, orgId)))
      .get();
  }

  /**
   * Find interviewer by email within an org.
   */
  async findByEmail(orgId: string, email: string): Promise<Interviewer | undefined> {
    return this.db
      .select()
      .from(interviewers)
      .where(and(eq(interviewers.orgId, orgId), eq(interviewers.email, email.toLowerCase())))
      .get();
  }

  /**
   * Find interviewer by magic token.
   */
  async findByMagicToken(token: string): Promise<Interviewer | undefined> {
    return this.db.select().from(interviewers).where(eq(interviewers.magicToken, token)).get();
  }

  /**
   * List all interviewers for an org.
   */
  async listByOrg(orgId: string): Promise<Interviewer[]> {
    return this.db
      .select()
      .from(interviewers)
      .where(eq(interviewers.orgId, orgId))
      .orderBy(desc(interviewers.createdAt))
      .all();
  }

  /**
   * Count interviewers for an org.
   */
  async countByOrg(orgId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(interviewers)
      .where(eq(interviewers.orgId, orgId))
      .get();

    return result?.count ?? 0;
  }

  /**
   * Update an interviewer.
   */
  async update(
    id: string,
    updates: Partial<Pick<Interviewer, "name" | "timezone" | "status">>
  ): Promise<Interviewer | undefined> {
    const now = new Date().toISOString();

    await this.db
      .update(interviewers)
      .set({
        ...updates,
        updatedAt: now,
      })
      .where(eq(interviewers.id, id));

    return this.findById(id);
  }

  /**
   * Update calendar connection.
   */
  async updateCalendarConnection(
    id: string,
    updates: {
      calendarProvider: "google" | "outlook" | "apple" | null;
      calendarConnected: boolean;
      calendarTokens: string | null;
      calendarId: string | null;
      connectedAt: string | null;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(interviewers)
      .set({
        calendarProvider: updates.calendarProvider,
        calendarConnected: updates.calendarConnected,
        calendarTokens: updates.calendarTokens,
        calendarId: updates.calendarId,
        connectedAt: updates.connectedAt,
        status: updates.calendarConnected ? "active" : undefined,
        updatedAt: now,
      })
      .where(eq(interviewers.id, id));
  }

  /**
   * Disconnect calendar.
   */
  async disconnectCalendar(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(interviewers)
      .set({
        calendarProvider: null,
        calendarConnected: false,
        calendarTokens: null,
        calendarId: null,
        updatedAt: now,
      })
      .where(eq(interviewers.id, id));
  }

  /**
   * Regenerate magic token (for resend invite).
   */
  async regenerateMagicToken(id: string): Promise<string> {
    const now = new Date().toISOString();
    const newToken = magicTokenId();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .update(interviewers)
      .set({
        magicToken: newToken,
        magicTokenExpiresAt: expiresAt,
        invitedAt: now,
        updatedAt: now,
      })
      .where(eq(interviewers.id, id));

    return newToken;
  }

  /**
   * Delete an interviewer.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(interviewers).where(eq(interviewers.id, id)).returning();
    return result.length > 0;
  }

  /**
   * Activate interviewer (when they first access via magic link).
   */
  async activate(id: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(interviewers)
      .set({
        status: "active",
        updatedAt: now,
      })
      .where(eq(interviewers.id, id));
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Transform database record to API response.
   */
  toResponse(interviewer: Interviewer): InterviewerResponse {
    return {
      id: interviewer.id,
      email: interviewer.email,
      name: interviewer.name,
      timezone: interviewer.timezone ?? "UTC",
      status: (interviewer.status ?? "invited") as InterviewerStatus,
      calendarConnected: interviewer.calendarConnected ?? false,
      calendarProvider: interviewer.calendarProvider ?? null,
      invitedAt: interviewer.invitedAt,
      connectedAt: interviewer.connectedAt,
      createdAt: interviewer.createdAt,
      updatedAt: interviewer.updatedAt,
    };
  }
}
