/**
 * Interview Stages Module
 * =======================
 * Interview stage configuration and interviewer assignments.
 *
 * This module consolidates stage management that was previously split between:
 * - jobs.pipeline JSON
 * - interview_stage_config table
 * - interview_stage_interviewers table
 */

export {
  InterviewStagesRepository,
  type StageWithInterviewers,
  type StageInput,
  type RecommendationRound,
} from "./repository";
