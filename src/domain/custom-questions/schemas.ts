/**
 * Custom Questions Schemas
 * ========================
 * Zod validation schemas for custom questions API.
 */

import { z } from "zod";
import {
  answerTypes,
  failActions,
  questionCategories,
  type AnswerType,
  type FailAction,
  type QuestionCategory,
} from "../../db/schema";
import { SIGNAL_IDS, type SignalId } from "../jobs/archetypes/types";

// =============================================================================
// QUESTION CATEGORY SCHEMAS
// =============================================================================

export const QuestionCategorySchema = z.enum(questionCategories);
export const AnswerTypeSchema = z.enum(answerTypes);
export const FailActionSchema = z.enum(failActions);

// =============================================================================
// SIGNAL ID SCHEMA
// =============================================================================

export const SignalIdSchema = z.enum(SIGNAL_IDS);

// =============================================================================
// CREATE CUSTOM QUESTION
// =============================================================================

/**
 * Base schema for creating a custom question.
 */
const BaseCreateCustomQuestionSchema = z.object({
  category: QuestionCategorySchema,
  answerType: AnswerTypeSchema,
  questionText: z.string().min(10, "Question must be at least 10 characters").max(500),
  required: z.boolean().optional().default(true),
});

/**
 * Evaluative question schema.
 * - Must be free_text
 * - Can have target signals
 */
const EvaluativeQuestionSchema = BaseCreateCustomQuestionSchema.extend({
  category: z.literal("evaluative"),
  answerType: z.literal("free_text"),
  targetSignals: z.array(SignalIdSchema).min(1).max(5).optional(),
  // Not applicable to evaluative
  expectedAnswer: z.undefined(),
  failAction: z.undefined(),
  options: z.undefined(),
  minValue: z.undefined(),
  maxValue: z.undefined(),
});

/**
 * Screening question schema.
 * - Must be yes_no or single_choice
 * - Must have expected answer
 * - Can configure fail action
 */
const ScreeningQuestionSchema = BaseCreateCustomQuestionSchema.extend({
  category: z.literal("screening"),
  answerType: z.enum(["yes_no", "single_choice"]),
  expectedAnswer: z.union([z.string(), z.array(z.string())]),
  failAction: FailActionSchema.optional().default("flag"),
  options: z.array(z.string()).min(2).max(10).optional(), // Required for single_choice
  // Not applicable to screening
  targetSignals: z.undefined(),
  minValue: z.undefined(),
  maxValue: z.undefined(),
});

/**
 * Logistical question schema.
 * - Can be any type except free_text (that's for evaluative)
 * - Different constraints based on type
 */
const LogisticalQuestionSchema = BaseCreateCustomQuestionSchema.extend({
  category: z.literal("logistical"),
  answerType: z.enum(["single_choice", "multiple_choice", "number", "date", "url"]),
  options: z.array(z.string()).min(2).max(20).optional(), // For choice types
  minValue: z.number().optional(), // For number type
  maxValue: z.number().optional(), // For number type
  // Not applicable to logistical
  targetSignals: z.undefined(),
  expectedAnswer: z.undefined(),
  failAction: z.undefined(),
});

/**
 * Combined create schema with discriminated union.
 */
export const CreateCustomQuestionSchema = z.discriminatedUnion("category", [
  EvaluativeQuestionSchema,
  ScreeningQuestionSchema,
  LogisticalQuestionSchema,
]).refine(
  (data) => {
    // Validate options required for choice types
    if (
      (data.answerType === "single_choice" || data.answerType === "multiple_choice") &&
      !data.options
    ) {
      return false;
    }
    return true;
  },
  { message: "Options are required for choice-type questions" }
).refine(
  (data) => {
    // Validate expected answer matches options for screening
    if (data.category === "screening" && data.answerType === "single_choice") {
      const expected = Array.isArray(data.expectedAnswer)
        ? data.expectedAnswer
        : [data.expectedAnswer];
      const options = data.options ?? [];
      return expected.every((e) => options.includes(e));
    }
    return true;
  },
  { message: "Expected answer must be one of the options" }
);

export type CreateCustomQuestionInput = z.infer<typeof CreateCustomQuestionSchema>;

// =============================================================================
// UPDATE CUSTOM QUESTION
// =============================================================================

export const UpdateCustomQuestionSchema = z.object({
  category: QuestionCategorySchema.optional(),
  answerType: AnswerTypeSchema.optional(),
  questionText: z.string().min(10).max(500).optional(),
  required: z.boolean().optional(),
  targetSignals: z.array(SignalIdSchema).min(1).max(5).nullable().optional(),
  expectedAnswer: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  failAction: FailActionSchema.optional(),
  options: z.array(z.string()).min(2).max(20).nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
});

export type UpdateCustomQuestionInput = z.infer<typeof UpdateCustomQuestionSchema>;

// =============================================================================
// REORDER QUESTIONS
// =============================================================================

export const ReorderQuestionsSchema = z.object({
  questionIds: z.array(z.string()).min(1),
});

export type ReorderQuestionsInput = z.infer<typeof ReorderQuestionsSchema>;

// =============================================================================
// CUSTOM ANSWER INPUT
// =============================================================================

export const CustomAnswerInputSchema = z.object({
  questionId: z.string(),
  value: z.union([
    z.string(),
    z.array(z.string()),
    z.number(),
    z.null(),
  ]),
});

export type CustomAnswerInput = z.infer<typeof CustomAnswerInputSchema>;

// =============================================================================
// SIGNAL SUGGESTION
// =============================================================================

export const SuggestSignalsInputSchema = z.object({
  questionText: z.string().min(10).max(500),
  jobContext: z.unknown().optional(), // Optional JobContext for better suggestions
});

export type SuggestSignalsInput = z.infer<typeof SuggestSignalsInputSchema>;

export interface SuggestSignalsOutput {
  signals: SignalId[];
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

// =============================================================================
// OUTPUT SCHEMAS
// =============================================================================

export interface CustomQuestionOutput {
  id: string;
  jobId: string;
  category: QuestionCategory;
  answerType: AnswerType;
  questionText: string;
  required: boolean;
  orderIndex: number;
  targetSignals: SignalId[] | null;
  expectedAnswer: string | string[] | null;
  failAction: FailAction | null;
  options: string[] | null;
  minValue: number | null;
  maxValue: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomAnswerOutput {
  id: string;
  questionId: string;
  question: CustomQuestionOutput;
  value: string | string[] | number | null;
  screeningPassed: boolean | null;
  extractionStatus: string;
  extractedSignals: unknown | null;
  createdAt: string;
}

// =============================================================================
// PUBLIC QUESTION OUTPUT (for candidate-facing)
// =============================================================================

export interface PublicCustomQuestionOutput {
  id: string;
  category: QuestionCategory;
  answerType: AnswerType;
  questionText: string;
  required: boolean;
  orderIndex: number;
  options: string[] | null;
  minValue: number | null;
  maxValue: number | null;
}
