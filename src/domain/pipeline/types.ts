/**
 * Pipeline Types
 * ==============
 * TypeScript types and Zod schemas for pipeline generation.
 */

import { z } from "zod";

// =============================================================================
// PIPELINE RECOMMENDATION (LLM Output)
// =============================================================================

/**
 * Assessment recommendation from the LLM.
 */
export const AssessmentRecommendationSchema = z.object({
  recommended: z.boolean(),
  reason: z.string(),
  suggestedType: z.string(),
  suggestedProviders: z.array(z.string()),
  whatToTest: z.array(z.string()),
});

export type AssessmentRecommendation = z.infer<typeof AssessmentRecommendationSchema>;

/**
 * Interview round recommendation from the LLM.
 */
export const InterviewRoundRecommendationSchema = z.object({
  name: z.string(),
  duration: z.number(),
  interviewerProfile: z.string(),
  focus: z.string(),
});

export type InterviewRoundRecommendation = z.infer<typeof InterviewRoundRecommendationSchema>;

/**
 * Interview panel recommendation from the LLM.
 */
export const InterviewPanelRecommendationSchema = z.object({
  rounds: z.array(InterviewRoundRecommendationSchema),
  totalTime: z.string(),
});

export type InterviewPanelRecommendation = z.infer<typeof InterviewPanelRecommendationSchema>;

/**
 * Evaluation criteria recommendation from the LLM.
 */
export const EvaluationCriteriaSchema = z.object({
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  redFlags: z.array(z.string()),
});

export type EvaluationCriteria = z.infer<typeof EvaluationCriteriaSchema>;

/**
 * Complete pipeline recommendation from the LLM.
 * This is stored as-is in pipeline_recommendation column.
 */
export const PipelineRecommendationSchema = z.object({
  assessment: AssessmentRecommendationSchema,
  interviewPanel: InterviewPanelRecommendationSchema,
  evaluationCriteria: EvaluationCriteriaSchema,
});

export type PipelineRecommendation = z.infer<typeof PipelineRecommendationSchema>;

// =============================================================================
// PIPELINE CONFIG (Recruiter Editable)
// =============================================================================

/**
 * Interview round configuration (editable by recruiter).
 */
export const InterviewRoundConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number(),
  interviewerIds: z.array(z.string()),
  focus: z.string(),
  mode: z.enum(["any_one", "all_required"]).optional(), // Interview mode
});

export type InterviewRoundConfig = z.infer<typeof InterviewRoundConfigSchema>;

/**
 * Complete pipeline configuration (editable by recruiter).
 * This is stored in pipeline column.
 */
export const PipelineConfigSchema = z.object({
  interviewRounds: z.array(InterviewRoundConfigSchema),
  totalDurationMinutes: z.number(), // Calculated from interviewRounds
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// =============================================================================
// PATCH REQUEST SCHEMA
// =============================================================================

/**
 * Interview round update schema (for PATCH requests).
 * - With ID: update existing stage (ID must exist)
 * - Without ID: create new stage
 *
 * Field requirements by job state:
 * - Draft: name, duration, focus (structure)
 * - Published/Paused: interviewerIds, mode (operations)
 */
export const InterviewRoundUpdateSchema = z.object({
  id: z.string().optional(), // Optional: omit to create new stage
  name: z.string().optional(),
  duration: z.number().optional(),
  focus: z.string().optional(),
  interviewerIds: z.array(z.string()).optional(),
  mode: z.enum(["any_one", "all_required"]).optional(),
});

export type InterviewRoundUpdate = z.infer<typeof InterviewRoundUpdateSchema>;

/**
 * Schema for PATCH /v1/jobs/:id/pipeline request body.
 * All fields are optional for partial updates.
 */
export const PipelineUpdateSchema = z.object({
  interviewRounds: z.array(InterviewRoundUpdateSchema).optional(),
});

export type PipelineUpdate = z.infer<typeof PipelineUpdateSchema>;
