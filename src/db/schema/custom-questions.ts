/**
 * Custom Questions Schema
 * =======================
 * Recruiter-defined custom questions and CV structured data.
 */

import { sqliteTable, text, real, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { jobs } from "./jobs";
import { applications } from "./applications";

// Enums for custom questions
export const questionCategories = ["evaluative", "screening", "logistical"] as const;
export type QuestionCategory = (typeof questionCategories)[number];

export const answerTypes = [
  "free_text",
  "yes_no",
  "single_choice",
  "multiple_choice",
  "number",
  "date",
  "url",
] as const;
export type AnswerType = (typeof answerTypes)[number];

export const failActions = ["flag", "reject", "allow"] as const;
export type FailAction = (typeof failActions)[number];

export const cvExtractionStatuses = ["pending", "processing", "completed", "failed", "skipped"] as const;
export type CVExtractionStatus = (typeof cvExtractionStatuses)[number];

export const skillCategories = ["language", "framework", "tool", "soft_skill", "other"] as const;
export type SkillCategory = (typeof skillCategories)[number];

/**
 * Custom Questions
 * Recruiter-defined questions for job applications.
 */
export const customQuestions = sqliteTable(
  "custom_questions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    // Question definition
    category: text("category", { enum: questionCategories }).notNull(),
    answerType: text("answer_type", { enum: answerTypes }).notNull(),
    questionText: text("question_text").notNull(),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    orderIndex: integer("order_index").notNull(),

    // For evaluative questions
    targetSignals: text("target_signals"), // JSON array of SignalId[]

    // For screening questions
    expectedAnswer: text("expected_answer"), // JSON: string or string[]
    failAction: text("fail_action", { enum: failActions }).default("flag"),

    // For choice questions
    options: text("options"), // JSON array of strings

    // For number questions
    minValue: real("min_value"),
    maxValue: real("max_value"),

    // Metadata
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_custom_questions_job").on(table.jobId),
    index("idx_custom_questions_job_order").on(table.jobId, table.orderIndex),
  ]
);

/**
 * Custom Answers
 * Candidate responses to custom questions.
 */
export const customAnswers = sqliteTable(
  "custom_answers",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => customQuestions.id, { onDelete: "cascade" }),

    // Answer content (one of these based on answer_type)
    answerText: text("answer_text"), // For free_text, yes_no, single_choice
    answerValues: text("answer_values"), // JSON array for multiple_choice
    answerNumber: real("answer_number"), // For number
    answerDate: text("answer_date"), // For date (ISO string)
    answerUrl: text("answer_url"), // For url

    // Screening result
    screeningPassed: integer("screening_passed", { mode: "boolean" }), // NULL if not screening, true/false if screening

    // Signal extraction (for evaluative only)
    extractionStatus: text("extraction_status", { enum: cvExtractionStatuses }).default("pending"),
    extractedSignals: text("extracted_signals"), // JSON: same format as archetype answers

    // Metadata
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_custom_answers_application").on(table.applicationId),
    index("idx_custom_answers_question").on(table.questionId),
    index("idx_custom_answers_extraction").on(table.extractionStatus),
    uniqueIndex("idx_custom_answers_unique").on(table.applicationId, table.questionId),
  ]
);

/**
 * CV Work Experiences
 * Structured work history extracted from CV.
 */
export const cvWorkExperiences = sqliteTable(
  "cv_work_experiences",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company").notNull(),
    startDate: text("start_date"), // YYYY-MM or YYYY
    endDate: text("end_date"), // YYYY-MM, YYYY, or "present"
    isCurrent: integer("is_current", { mode: "boolean" }).default(false),
    durationMonths: integer("duration_months"), // Computed by LLM or application
    highlights: text("highlights"), // JSON array of strings
    orderIndex: integer("order_index").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_cv_work_exp_application").on(table.applicationId)]
);

/**
 * CV Education
 * Education history extracted from CV.
 */
export const cvEducation = sqliteTable(
  "cv_education",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    degree: text("degree"), // "Bachelor's", "Master's", "PhD", "High School"
    field: text("field"), // "Computer Science", "Business Administration"
    institution: text("institution").notNull(),
    year: text("year"), // Graduation year
    orderIndex: integer("order_index").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_cv_education_application").on(table.applicationId)]
);

/**
 * CV Skills
 * Skills extracted from CV.
 */
export const cvSkills = sqliteTable(
  "cv_skills",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    category: text("category", { enum: skillCategories }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_cv_skills_application").on(table.applicationId),
    index("idx_cv_skills_name").on(table.skillName),
  ]
);

// Inferred types
export type CustomQuestion = typeof customQuestions.$inferSelect;
export type NewCustomQuestion = typeof customQuestions.$inferInsert;
export type CustomAnswer = typeof customAnswers.$inferSelect;
export type NewCustomAnswer = typeof customAnswers.$inferInsert;
export type CVWorkExperience = typeof cvWorkExperiences.$inferSelect;
export type NewCVWorkExperience = typeof cvWorkExperiences.$inferInsert;
export type CVEducationRecord = typeof cvEducation.$inferSelect;
export type NewCVEducationRecord = typeof cvEducation.$inferInsert;
export type CVSkill = typeof cvSkills.$inferSelect;
export type NewCVSkill = typeof cvSkills.$inferInsert;
