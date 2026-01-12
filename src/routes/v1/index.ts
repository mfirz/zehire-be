import { Hono } from "hono";

import type { Env } from "../../types/bindings";
import assessmentProviders from "./assessment-providers";
import billing from "./billing/route";
import capacity from "./capacity";
import jobs from "./jobs/route";
import root from "./root/route";

const v1 = new Hono<{ Bindings: Env }>();

v1.route("/", root);
v1.route("/jobs", jobs);
v1.route("/billing", billing);
v1.route("/capacity", capacity);
v1.route("/assessment-providers", assessmentProviders);

export default v1;
