import { Hono } from "hono";

import type { Env } from "../../types/bindings";
import jobs from "./jobs/route";
import root from "./root/route";

const v1 = new Hono<{ Bindings: Env }>();

v1.route("/", root);
v1.route("/jobs", jobs);

export default v1;
