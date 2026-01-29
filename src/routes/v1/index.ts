import { Hono } from "hono";

import type { Env } from "../../types/bindings";
import applications from "./applications";
import applicationsCv from "./applications/cv";
import assessments from "./assessments";
import billing from "./billing/route";
import candidatesLookup from "./candidates/lookup";
import capacity from "./capacity";
import customQuestionsSuggest from "./custom-questions/suggest-signals";
import interviewers from "./interviewers/route";
import jobApplications from "./jobs/applications";
import jobAssessment from "./jobs/assessment";
import jobCustomQuestions from "./jobs/custom-questions";
import candidatesAssessment from "./jobs/candidates-assessment";
import jobs from "./jobs/route";
import organizationsSettings from "./organizations/settings";
import root from "./root/route";

const v1 = new Hono<{ Bindings: Env }>();

v1.route("/", root);
v1.route("/jobs", jobs);
v1.route("/jobs", jobApplications); // Mounts at /jobs/:jobId/applications
v1.route("/jobs", jobCustomQuestions); // Mounts at /jobs/:jobId/custom-questions
v1.route("/applications", applications);
v1.route("/applications", applicationsCv); // Mounts at /applications/:id/cv
v1.route("/candidates", candidatesLookup); // Mounts at /candidates/lookup
v1.route("/billing", billing);
v1.route("/capacity", capacity);
v1.route("/custom-questions", customQuestionsSuggest); // Mounts at /custom-questions/suggest-signals
v1.route("/interviewers", interviewers); // Phase 9: Interviewer management
v1.route("/organizations/settings", organizationsSettings); // Phase 9: Organization settings
v1.route("/assessments", assessments); // Phase 10: Assessment library + file download
v1.route("/jobs", jobAssessment); // Phase 10: Job assessment CRUD
v1.route("/jobs", candidatesAssessment); // Phase 10: Candidate assessment management

export default v1;
