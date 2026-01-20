/**
 * Custom Questions Repository
 * ===========================
 * Data access layer for custom questions and answers using Drizzle ORM.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { and, asc, eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import {
  createDb,
  customAnswers,
  customQuestions,
  type CustomAnswer,
  type CustomQuestion,
  type Database,
  type NewCustomAnswer,
  type NewCustomQuestion,
} from "../../db";
import type {
  CreateCustomQuestionInput,
  CustomQuestionOutput,
  UpdateCustomQuestionInput,
} from "./schemas";

// Alphanumeric-only nanoid for IDs
const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

// =============================================================================
// REPOSITORY CLASS
// =============================================================================

export class CustomQuestionsRepository {
  private db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ===========================================================================
  // CUSTOM QUESTIONS CRUD
  // ===========================================================================

  /**
   * Create a new custom question for a job.
   */
  async create(jobId: string, input: CreateCustomQuestionInput): Promise<CustomQuestion> {
    const id = alphanumericId();
    const now = new Date().toISOString();

    // Get next order index
    const maxOrderResult = await this.db
      .select({ maxOrder: sql<number>`MAX(${customQuestions.orderIndex})` })
      .from(customQuestions)
      .where(eq(customQuestions.jobId, jobId))
      .get();

    const orderIndex = (maxOrderResult?.maxOrder ?? -1) + 1;

    const values: NewCustomQuestion = {
      id,
      jobId,
      category: input.category,
      answerType: input.answerType,
      questionText: input.questionText,
      required: input.required ?? true,
      orderIndex,
      targetSignals: input.targetSignals ? JSON.stringify(input.targetSignals) : null,
      expectedAnswer: input.expectedAnswer
        ? JSON.stringify(input.expectedAnswer)
        : null,
      failAction: input.failAction ?? "flag",
      options: input.options ? JSON.stringify(input.options) : null,
      minValue: input.minValue ?? null,
      maxValue: input.maxValue ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const [result] = await this.db.insert(customQuestions).values(values).returning();

    if (!result) {
      throw new Error("Failed to create custom question");
    }

    return result;
  }

  /**
   * Get a custom question by ID.
   */
  async findById(id: string): Promise<CustomQuestion | null> {
    const result = await this.db
      .select()
      .from(customQuestions)
      .where(eq(customQuestions.id, id))
      .get();

    return result ?? null;
  }

  /**
   * Get a custom question by ID and job ID (for authorization).
   */
  async findByIdAndJob(id: string, jobId: string): Promise<CustomQuestion | null> {
    const result = await this.db
      .select()
      .from(customQuestions)
      .where(and(eq(customQuestions.id, id), eq(customQuestions.jobId, jobId)))
      .get();

    return result ?? null;
  }

  /**
   * List all custom questions for a job, ordered by orderIndex.
   */
  async listByJobId(jobId: string): Promise<CustomQuestion[]> {
    const results = await this.db
      .select()
      .from(customQuestions)
      .where(eq(customQuestions.jobId, jobId))
      .orderBy(asc(customQuestions.orderIndex));

    return results;
  }

  /**
   * Update a custom question.
   */
  async update(id: string, input: UpdateCustomQuestionInput): Promise<CustomQuestion | null> {
    const now = new Date().toISOString();

    const updates: Partial<NewCustomQuestion> = { updatedAt: now };

    if (input.category !== undefined) {
      updates.category = input.category;
    }
    if (input.answerType !== undefined) {
      updates.answerType = input.answerType;
    }
    if (input.questionText !== undefined) {
      updates.questionText = input.questionText;
    }
    if (input.required !== undefined) {
      updates.required = input.required;
    }
    if (input.targetSignals !== undefined) {
      updates.targetSignals = input.targetSignals ? JSON.stringify(input.targetSignals) : null;
    }
    if (input.expectedAnswer !== undefined) {
      updates.expectedAnswer = input.expectedAnswer
        ? JSON.stringify(input.expectedAnswer)
        : null;
    }
    if (input.failAction !== undefined) {
      updates.failAction = input.failAction;
    }
    if (input.options !== undefined) {
      updates.options = input.options ? JSON.stringify(input.options) : null;
    }
    if (input.minValue !== undefined) {
      updates.minValue = input.minValue;
    }
    if (input.maxValue !== undefined) {
      updates.maxValue = input.maxValue;
    }

    await this.db
      .update(customQuestions)
      .set(updates)
      .where(eq(customQuestions.id, id));

    return this.findById(id);
  }

  /**
   * Delete a custom question.
   * Cascades to delete associated answers.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(customQuestions)
      .where(eq(customQuestions.id, id))
      .returning({ id: customQuestions.id });

    return result.length > 0;
  }

  /**
   * Reorder questions for a job.
   * Takes an array of question IDs in the desired order.
   */
  async reorder(jobId: string, questionIds: string[]): Promise<void> {
    const now = new Date().toISOString();

    // Update order indexes in a batch
    const updates = questionIds.map((id, index) =>
      this.db
        .update(customQuestions)
        .set({ orderIndex: index, updatedAt: now })
        .where(and(eq(customQuestions.id, id), eq(customQuestions.jobId, jobId)))
    );

    await this.db.batch(updates as [typeof updates[0], ...typeof updates]);
  }

  // ===========================================================================
  // CUSTOM ANSWERS
  // ===========================================================================

  /**
   * Create custom answers for an application.
   * Called during application submission.
   */
  async createAnswers(
    applicationId: string,
    answers: Array<{
      questionId: string;
      value: string | string[] | number | null;
    }>,
    questions: CustomQuestion[]
  ): Promise<string[]> {
    const now = new Date().toISOString();
    const answerIds: string[] = [];

    // Create a map of question ID to question for quick lookup
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const answerValues: NewCustomAnswer[] = answers.map((answer) => {
      const id = alphanumericId();
      answerIds.push(id);

      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new Error(`Question not found: ${answer.questionId}`);
      }

      // Determine answer field based on type
      let answerText: string | null = null;
      let answerValues: string | null = null;
      let answerNumber: number | null = null;
      let answerDate: string | null = null;
      let answerUrl: string | null = null;
      let screeningPassed: boolean | null = null;

      switch (question.answerType) {
        case "free_text":
        case "yes_no":
        case "single_choice":
          answerText = answer.value as string;
          break;
        case "multiple_choice":
          answerValues = JSON.stringify(answer.value);
          break;
        case "number":
          answerNumber = answer.value as number;
          break;
        case "date":
          answerDate = answer.value as string;
          break;
        case "url":
          answerUrl = answer.value as string;
          break;
      }

      // Check screening questions
      if (question.category === "screening" && question.expectedAnswer) {
        const expected = JSON.parse(question.expectedAnswer);
        if (Array.isArray(expected)) {
          screeningPassed = expected.includes(answerText);
        } else {
          screeningPassed = answerText === expected;
        }
      }

      // Determine extraction status
      const extractionStatus =
        question.category === "evaluative" ? "pending" : "skipped";

      return {
        id,
        applicationId,
        questionId: answer.questionId,
        answerText,
        answerValues,
        answerNumber,
        answerDate,
        answerUrl,
        screeningPassed,
        extractionStatus,
        extractedSignals: null,
        createdAt: now,
      };
    });

    if (answerValues.length > 0) {
      await this.db.insert(customAnswers).values(answerValues);
    }

    return answerIds;
  }

  /**
   * Get custom answers for an application.
   */
  async getAnswersByApplication(applicationId: string): Promise<CustomAnswer[]> {
    const results = await this.db
      .select()
      .from(customAnswers)
      .where(eq(customAnswers.applicationId, applicationId));

    return results;
  }

  /**
   * Get custom answers with their questions for an application.
   */
  async getAnswersWithQuestions(
    applicationId: string
  ): Promise<Array<{ answer: CustomAnswer; question: CustomQuestion }>> {
    const results = await this.db
      .select({
        answer: customAnswers,
        question: customQuestions,
      })
      .from(customAnswers)
      .innerJoin(customQuestions, eq(customAnswers.questionId, customQuestions.id))
      .where(eq(customAnswers.applicationId, applicationId))
      .orderBy(asc(customQuestions.orderIndex));

    return results;
  }

  /**
   * Get evaluative answers pending extraction.
   */
  async getPendingEvaluativeAnswers(applicationId: string): Promise<CustomAnswer[]> {
    const results = await this.db
      .select()
      .from(customAnswers)
      .innerJoin(customQuestions, eq(customAnswers.questionId, customQuestions.id))
      .where(
        and(
          eq(customAnswers.applicationId, applicationId),
          eq(customQuestions.category, "evaluative"),
          eq(customAnswers.extractionStatus, "pending")
        )
      );

    return results.map((r) => r.custom_answers);
  }

  /**
   * Save extracted signals for a custom answer.
   */
  async saveExtractedSignals(
    answerId: string,
    signals: unknown
  ): Promise<void> {
    await this.db
      .update(customAnswers)
      .set({
        extractedSignals: JSON.stringify(signals),
        extractionStatus: "completed",
      })
      .where(eq(customAnswers.id, answerId));
  }

  /**
   * Update extraction status for a custom answer.
   */
  async updateExtractionStatus(
    answerId: string,
    status: "pending" | "processing" | "completed" | "failed" | "skipped"
  ): Promise<void> {
    await this.db
      .update(customAnswers)
      .set({ extractionStatus: status })
      .where(eq(customAnswers.id, answerId));
  }

  /**
   * Check if any screening questions failed for an application.
   */
  async hasScreeningFailures(applicationId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: customAnswers.id })
      .from(customAnswers)
      .innerJoin(customQuestions, eq(customAnswers.questionId, customQuestions.id))
      .where(
        and(
          eq(customAnswers.applicationId, applicationId),
          eq(customQuestions.category, "screening"),
          eq(customAnswers.screeningPassed, false)
        )
      )
      .limit(1)
      .get();

    return result !== undefined;
  }

  /**
   * Get screening failures with their configured actions.
   */
  async getScreeningFailures(
    applicationId: string
  ): Promise<Array<{ question: CustomQuestion; answer: CustomAnswer }>> {
    const results = await this.db
      .select({
        question: customQuestions,
        answer: customAnswers,
      })
      .from(customAnswers)
      .innerJoin(customQuestions, eq(customAnswers.questionId, customQuestions.id))
      .where(
        and(
          eq(customAnswers.applicationId, applicationId),
          eq(customQuestions.category, "screening"),
          eq(customAnswers.screeningPassed, false)
        )
      );

    return results;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Transform a CustomQuestion to API output format.
   */
  toOutput(question: CustomQuestion): CustomQuestionOutput {
    return {
      id: question.id,
      jobId: question.jobId,
      category: question.category,
      answerType: question.answerType,
      questionText: question.questionText,
      required: question.required,
      orderIndex: question.orderIndex,
      targetSignals: question.targetSignals
        ? JSON.parse(question.targetSignals)
        : null,
      expectedAnswer: question.expectedAnswer
        ? JSON.parse(question.expectedAnswer)
        : null,
      failAction: question.failAction,
      options: question.options ? JSON.parse(question.options) : null,
      minValue: question.minValue,
      maxValue: question.maxValue,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }
}
