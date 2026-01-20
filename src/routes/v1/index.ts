import { Hono } from "hono";

import type { Env } from "../../types/bindings";
import applications from "./applications";
import applicationsCv from "./applications/cv";
import assessmentProviders from "./assessment-providers";
import billing from "./billing/route";
import candidatesLookup from "./candidates/lookup";
import capacity from "./capacity";
import customQuestionsSuggest from "./custom-questions/suggest-signals";
import jobApplications from "./jobs/applications";
import jobCustomQuestions from "./jobs/custom-questions";
import jobs from "./jobs/route";
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
v1.route("/assessment-providers", assessmentProviders);
v1.route("/custom-questions", customQuestionsSuggest); // Mounts at /custom-questions/suggest-signals

export default v1;
