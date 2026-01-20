/**
 * CV Processing Service
 * =====================
 * Orchestrates CV extraction, summarization, and storage.
 */

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import type { LLMClient } from "../jobs/archetypes/inference";
import {
  detectContradictions,
  type CVContradiction,
  type ContradictionDetectionInput,
} from "./contradiction-detector";
import { extractTextFromCV, type ExtractionResult } from "./extractor";
import { CVRepository, type CrossApplicationResult } from "./repository";
import { summarizeCV, type CVSummary } from "./summarizer";

// =============================================================================
// TYPES
// =============================================================================

export interface ProcessCVResult {
  success: boolean;
  extractionResult?: ExtractionResult;
  summary?: CVSummary;
  error?: string;
}

export interface CVSummaryOutput {
  extractionStatus: string;
  totalYearsExperience: number | null;
  hasManagementExperience: boolean;
  workExperiences: Array<{
    id: string;
    title: string;
    company: string;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    durationMonths: number | null;
    highlights: string[];
  }>;
  education: Array<{
    id: string;
    degree: string | null;
    field: string | null;
    institution: string;
    year: string | null;
  }>;
  skills: Array<{
    id: string;
    name: string;
    category: string | null;
  }>;
  gaps: string[];
  contradictions: Array<{
    claim: string;
    cvEvidence: string;
    severity: string;
  }>;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class CVService {
  private repository: CVRepository;
  private cvBucket: R2Bucket;

  constructor(d1: D1Database, cvBucket: R2Bucket) {
    this.repository = new CVRepository(d1);
    this.cvBucket = cvBucket;
  }

  // ===========================================================================
  // CV PROCESSING PIPELINE
  // ===========================================================================

  /**
   * Process a CV file for an application.
   *
   * Pipeline:
   * 1. Fetch CV from R2
   * 2. Extract text from PDF/DOCX
   * 3. Summarize with LLM
   * 4. Store structured data
   *
   * @param llmClient - LLM client for summarization
   * @param applicationId - Application ID to process
   * @returns Processing result
   */
  async processCV(
    llmClient: LLMClient,
    applicationId: string
  ): Promise<ProcessCVResult> {
    console.log(`[CV Service] Starting CV processing for application ${applicationId}`);

    // Update status to processing
    await this.repository.updateExtractionStatus(applicationId, "processing");

    try {
      // 1. Check if application has a CV file
      const cvPath = await this.repository.getCVPath(applicationId);

      if (!cvPath) {
        await this.repository.updateExtractionStatus(applicationId, "skipped");
        return {
          success: true,
          error: "No CV file uploaded",
        };
      }

      // 2. Fetch CV from R2
      const cvObject = await this.cvBucket.get(cvPath);

      if (!cvObject) {
        await this.repository.updateExtractionStatus(
          applicationId,
          "failed",
          "CV file not found in storage"
        );
        return {
          success: false,
          error: "CV file not found in storage",
        };
      }

      // 3. Extract filename from path
      const filename = cvPath.split("/").pop() ?? "unknown.pdf";

      // 4. Extract text from CV
      const buffer = await cvObject.arrayBuffer();
      const extractionResult = await extractTextFromCV(buffer, filename);

      if (!extractionResult.success || !extractionResult.text) {
        const errorMsg = extractionResult.error ?? "Text extraction failed";
        await this.repository.updateExtractionStatus(
          applicationId,
          "failed",
          errorMsg
        );
        return {
          success: false,
          extractionResult,
          error: errorMsg,
        };
      }

      console.log(
        `[CV Service] Text extracted successfully: ${extractionResult.text.length} chars, ${extractionResult.pageCount ?? "unknown"} pages`
      );

      // 5. Summarize with LLM
      const summarizationResult = await summarizeCV(llmClient, extractionResult.text);

      if (!summarizationResult.success || !summarizationResult.summary) {
        const errorMsg = summarizationResult.error ?? "Summarization failed";
        await this.repository.updateExtractionStatus(
          applicationId,
          "failed",
          errorMsg
        );
        return {
          success: false,
          extractionResult,
          error: errorMsg,
        };
      }

      console.log(
        `[CV Service] Summarization complete: ${summarizationResult.summary.workExperiences.length} jobs, ${summarizationResult.summary.education.length} education, ${summarizationResult.summary.skills.length} skills`
      );

      // 6. Store structured data
      await this.repository.storeCVData(
        applicationId,
        summarizationResult.summary,
        extractionResult.text
      );

      console.log(`[CV Service] CV processing completed for application ${applicationId}`);

      return {
        success: true,
        extractionResult,
        summary: summarizationResult.summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[CV Service] CV processing failed: ${errorMessage}`);

      await this.repository.updateExtractionStatus(applicationId, "failed", errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Reprocess CV for an application.
   *
   * Clears existing data and runs the pipeline again.
   */
  async reprocessCV(
    llmClient: LLMClient,
    applicationId: string
  ): Promise<ProcessCVResult> {
    // Clear existing CV data
    await this.repository.clearCVData(applicationId);
    await this.repository.updateExtractionStatus(applicationId, "pending");

    // Run processing pipeline
    return this.processCV(llmClient, applicationId);
  }

  // ===========================================================================
  // CV SUMMARY RETRIEVAL
  // ===========================================================================

  /**
   * Get CV summary for an application.
   */
  async getCVSummary(applicationId: string): Promise<CVSummaryOutput | null> {
    const data = await this.repository.getCVData(applicationId);

    if (!data) return null;

    // Parse gaps and contradictions from stored JSON
    let gaps: string[] = [];
    let contradictions: Array<{
      claim: string;
      cvEvidence: string;
      severity: string;
    }> = [];

    if (data.cvSummaryJson) {
      try {
        const summary = JSON.parse(data.cvSummaryJson);
        gaps = summary.gaps ?? [];
      } catch {
        // Ignore parse errors
      }
    }

    if (data.cvContradictions) {
      try {
        contradictions = JSON.parse(data.cvContradictions);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      extractionStatus: data.cvExtractionStatus,
      totalYearsExperience: data.totalYearsExperience,
      hasManagementExperience: data.hasManagementExperience,
      workExperiences: data.workExperiences.map((exp) => ({
        id: exp.id,
        title: exp.title,
        company: exp.company,
        startDate: exp.startDate,
        endDate: exp.endDate,
        isCurrent: exp.isCurrent ?? false,
        durationMonths: exp.durationMonths,
        highlights: exp.highlights ? JSON.parse(exp.highlights) : [],
      })),
      education: data.education.map((edu) => ({
        id: edu.id,
        degree: edu.degree,
        field: edu.field,
        institution: edu.institution,
        year: edu.year,
      })),
      skills: data.skills.map((skill) => ({
        id: skill.id,
        name: skill.skillName,
        category: skill.category,
      })),
      gaps,
      contradictions,
    };
  }

  // ===========================================================================
  // CROSS-APPLICATION LOOKUP
  // ===========================================================================

  /**
   * Find all applications by candidate email.
   */
  async findApplicationsByEmail(email: string): Promise<CrossApplicationResult | null> {
    return this.repository.findApplicationsByEmail(email);
  }

  // ===========================================================================
  // CONTRADICTION DETECTION
  // ===========================================================================

  /**
   * Detect contradictions between answer claims and CV data.
   *
   * @param llmClient - LLM client for analysis
   * @param applicationId - Application to analyze
   * @param answerTexts - All answer texts from the application
   * @returns Array of detected contradictions
   */
  async detectContradictions(
    llmClient: LLMClient,
    applicationId: string,
    answerTexts: ContradictionDetectionInput["answerTexts"]
  ): Promise<CVContradiction[]> {
    // Get CV structured data
    const cvData = await this.repository.getCVData(applicationId);

    if (!cvData || cvData.cvExtractionStatus !== "completed") {
      console.log(
        `[CV Service] Skipping contradiction detection - CV not processed for ${applicationId}`
      );
      return [];
    }

    // Skip if no work experiences (nothing to compare)
    if (cvData.workExperiences.length === 0) {
      console.log(
        `[CV Service] Skipping contradiction detection - no work experiences for ${applicationId}`
      );
      return [];
    }

    // Build input for contradiction detection
    const input: ContradictionDetectionInput = {
      answerTexts,
      cvData: {
        workExperiences: cvData.workExperiences.map((exp) => ({
          title: exp.title,
          company: exp.company,
          startDate: exp.startDate,
          endDate: exp.endDate,
          isCurrent: exp.isCurrent ?? false,
          durationMonths: exp.durationMonths,
          highlights: exp.highlights ? JSON.parse(exp.highlights) : [],
        })),
        totalYearsExperience: cvData.totalYearsExperience,
        hasManagementExperience: cvData.hasManagementExperience,
      },
    };

    // Run detection
    const result = await detectContradictions(llmClient, input);

    if (!result.success) {
      console.error(
        `[CV Service] Contradiction detection failed for ${applicationId}: ${result.error}`
      );
      return [];
    }

    // Store contradictions in DB
    if (result.contradictions.length > 0) {
      await this.repository.saveContradictions(applicationId, result.contradictions);
      console.log(
        `[CV Service] Found ${result.contradictions.length} contradictions for ${applicationId}`
      );
    }

    return result.contradictions;
  }

  /**
   * Get stored contradictions for an application.
   */
  async getContradictions(applicationId: string): Promise<CVContradiction[]> {
    return this.repository.getContradictions(applicationId);
  }

  // ===========================================================================
  // STATUS CHECK
  // ===========================================================================

  /**
   * Check if CV processing is needed for an application.
   */
  async needsProcessing(applicationId: string): Promise<boolean> {
    const data = await this.repository.getCVData(applicationId);

    if (!data) return false;

    // Skip if no CV file
    const hasCv = await this.repository.hasCVFile(applicationId);
    if (!hasCv) return false;

    // Process if status is pending
    return data.cvExtractionStatus === "pending";
  }
}
