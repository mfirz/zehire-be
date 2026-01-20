/**
 * CV Repository
 * =============
 * Data access layer for CV structured data using Drizzle ORM.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { eq, desc } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  applications,
  createDb,
  cvEducation,
  cvSkills,
  cvWorkExperiences,
  type CVEducationRecord,
  type CVSkill,
  type CVWorkExperience,
  type Database,
  type NewCVEducationRecord,
  type NewCVSkill,
  type NewCVWorkExperience,
} from "../../db";
import type { CVSummary } from "./summarizer";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// =============================================================================
// TYPES
// =============================================================================

export interface CVData {
  workExperiences: CVWorkExperience[];
  education: CVEducationRecord[];
  skills: CVSkill[];
  totalYearsExperience: number | null;
  hasManagementExperience: boolean;
  cvRawText: string | null;
  cvSummaryJson: string | null;
  cvExtractionStatus: string;
  cvContradictions: string | null;
}

export interface CrossApplicationResult {
  email: string;
  totalApplications: number;
  applications: Array<{
    id: string;
    jobId: string;
    jobTitle: string;
    appliedAt: string;
    status: string;
    hasCV: boolean;
  }>;
}

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

export class CVRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // STORE CV DATA
  // ===========================================================================

  /**
   * Store structured CV data from summarization.
   *
   * Clears existing CV data for the application before storing new data.
   */
  async storeCVData(
    applicationId: string,
    summary: CVSummary,
    rawText: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // Clear existing CV data first
    await this.clearCVData(applicationId);

    // Store work experiences
    if (summary.workExperiences.length > 0) {
      const workExpValues: NewCVWorkExperience[] = summary.workExperiences.map(
        (exp, index) => ({
          id: alphanumericId(),
          applicationId,
          title: exp.title,
          company: exp.company,
          startDate: exp.startDate,
          endDate: exp.endDate,
          isCurrent: exp.isCurrent,
          durationMonths: exp.durationMonths,
          highlights: exp.highlights.length > 0 ? JSON.stringify(exp.highlights) : null,
          orderIndex: index,
          createdAt: now,
        })
      );

      // Insert in chunks of 50 (D1 parameter limit)
      const CHUNK_SIZE = 50;
      for (let i = 0; i < workExpValues.length; i += CHUNK_SIZE) {
        const chunk = workExpValues.slice(i, i + CHUNK_SIZE);
        await this.db.insert(cvWorkExperiences).values(chunk);
      }
    }

    // Store education
    if (summary.education.length > 0) {
      const eduValues: NewCVEducationRecord[] = summary.education.map((edu, index) => ({
        id: alphanumericId(),
        applicationId,
        degree: edu.degree,
        field: edu.field,
        institution: edu.institution,
        year: edu.year,
        orderIndex: index,
        createdAt: now,
      }));

      await this.db.insert(cvEducation).values(eduValues);
    }

    // Store skills
    if (summary.skills.length > 0) {
      const skillValues: NewCVSkill[] = summary.skills.map((skill) => ({
        id: alphanumericId(),
        applicationId,
        skillName: skill.name,
        category: skill.category,
        createdAt: now,
      }));

      // Insert in chunks
      const CHUNK_SIZE = 50;
      for (let i = 0; i < skillValues.length; i += CHUNK_SIZE) {
        const chunk = skillValues.slice(i, i + CHUNK_SIZE);
        await this.db.insert(cvSkills).values(chunk);
      }
    }

    // Update application with summary data
    await this.db
      .update(applications)
      .set({
        cvRawText: rawText,
        cvSummaryJson: JSON.stringify(summary),
        cvExtractionStatus: "completed",
        totalYearsExperience: summary.totalYearsExperience,
        hasManagementExperience: summary.hasManagementExperience,
        updatedAt: now,
      })
      .where(eq(applications.id, applicationId));
  }

  /**
   * Clear existing CV data for an application.
   */
  async clearCVData(applicationId: string): Promise<void> {
    await this.db.batch([
      this.db.delete(cvWorkExperiences).where(eq(cvWorkExperiences.applicationId, applicationId)),
      this.db.delete(cvEducation).where(eq(cvEducation.applicationId, applicationId)),
      this.db.delete(cvSkills).where(eq(cvSkills.applicationId, applicationId)),
    ]);
  }

  /**
   * Update CV extraction status.
   */
  async updateExtractionStatus(
    applicationId: string,
    status: "pending" | "processing" | "completed" | "failed" | "skipped",
    error?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(applications)
      .set({
        cvExtractionStatus: status,
        updatedAt: now,
        // Store error in cvSummaryJson if failed
        ...(status === "failed" && error
          ? { cvSummaryJson: JSON.stringify({ error }) }
          : {}),
      })
      .where(eq(applications.id, applicationId));
  }

  /**
   * Save CV contradictions.
   */
  async saveContradictions(
    applicationId: string,
    contradictions: Array<{
      claim: string;
      cvEvidence: string;
      severity: "warning" | "info";
    }>
  ): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .update(applications)
      .set({
        cvContradictions: JSON.stringify(contradictions),
        updatedAt: now,
      })
      .where(eq(applications.id, applicationId));
  }

  /**
   * Get CV contradictions for an application.
   */
  async getContradictions(
    applicationId: string
  ): Promise<Array<{ claim: string; cvEvidence: string; severity: "warning" | "info" }>> {
    const result = await this.db
      .select({ cvContradictions: applications.cvContradictions })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    if (!result?.cvContradictions) {
      return [];
    }

    try {
      return JSON.parse(result.cvContradictions);
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // RETRIEVE CV DATA
  // ===========================================================================

  /**
   * Get full CV data for an application.
   */
  async getCVData(applicationId: string): Promise<CVData | null> {
    // Get application CV fields
    const app = await this.db
      .select({
        cvRawText: applications.cvRawText,
        cvSummaryJson: applications.cvSummaryJson,
        cvExtractionStatus: applications.cvExtractionStatus,
        cvContradictions: applications.cvContradictions,
        totalYearsExperience: applications.totalYearsExperience,
        hasManagementExperience: applications.hasManagementExperience,
      })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    if (!app) return null;

    // Get work experiences
    const workExperiences = await this.db
      .select()
      .from(cvWorkExperiences)
      .where(eq(cvWorkExperiences.applicationId, applicationId))
      .orderBy(cvWorkExperiences.orderIndex);

    // Get education
    const education = await this.db
      .select()
      .from(cvEducation)
      .where(eq(cvEducation.applicationId, applicationId))
      .orderBy(cvEducation.orderIndex);

    // Get skills
    const skills = await this.db
      .select()
      .from(cvSkills)
      .where(eq(cvSkills.applicationId, applicationId));

    return {
      workExperiences,
      education,
      skills,
      totalYearsExperience: app.totalYearsExperience,
      hasManagementExperience: app.hasManagementExperience ?? false,
      cvRawText: app.cvRawText,
      cvSummaryJson: app.cvSummaryJson,
      cvExtractionStatus: app.cvExtractionStatus ?? "pending",
      cvContradictions: app.cvContradictions,
    };
  }

  /**
   * Get work experiences for an application.
   */
  async getWorkExperiences(applicationId: string): Promise<CVWorkExperience[]> {
    return this.db
      .select()
      .from(cvWorkExperiences)
      .where(eq(cvWorkExperiences.applicationId, applicationId))
      .orderBy(cvWorkExperiences.orderIndex);
  }

  /**
   * Get education for an application.
   */
  async getEducation(applicationId: string): Promise<CVEducationRecord[]> {
    return this.db
      .select()
      .from(cvEducation)
      .where(eq(cvEducation.applicationId, applicationId))
      .orderBy(cvEducation.orderIndex);
  }

  /**
   * Get skills for an application.
   */
  async getSkills(applicationId: string): Promise<CVSkill[]> {
    return this.db
      .select()
      .from(cvSkills)
      .where(eq(cvSkills.applicationId, applicationId));
  }

  // ===========================================================================
  // CROSS-APPLICATION LOOKUP
  // ===========================================================================

  /**
   * Find all applications by candidate email.
   *
   * Returns applications with job details for cross-application visibility.
   */
  async findApplicationsByEmail(email: string): Promise<CrossApplicationResult | null> {
    // Import jobs table for join
    const { jobs } = await import("../../db/schema/jobs");

    const results = await this.db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        jobTitle: jobs.title,
        appliedAt: applications.createdAt,
        status: applications.status,
        hasCv: applications.cvPath,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(eq(applications.candidateEmail, email))
      .orderBy(desc(applications.createdAt));

    if (results.length === 0) {
      return null;
    }

    return {
      email,
      totalApplications: results.length,
      applications: results.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        appliedAt: r.appliedAt,
        status: r.status,
        hasCV: !!r.hasCv,
      })),
    };
  }

  /**
   * Check if an application has a CV file.
   */
  async hasCVFile(applicationId: string): Promise<boolean> {
    const result = await this.db
      .select({ cvPath: applications.cvPath })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    return !!result?.cvPath;
  }

  /**
   * Get CV file path for an application.
   */
  async getCVPath(applicationId: string): Promise<string | null> {
    const result = await this.db
      .select({ cvPath: applications.cvPath })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get();

    return result?.cvPath ?? null;
  }
}
