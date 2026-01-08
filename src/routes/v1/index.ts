import { Hono } from "hono";

import type { Env } from "../../types/bindings";
import billing from "./billing/route";
import jobs from "./jobs/route";
import root from "./root/route";

const v1 = new Hono<{ Bindings: Env }>();

v1.route("/", root);
v1.route("/jobs", jobs);
v1.route("/billing", billing);

export default v1;
