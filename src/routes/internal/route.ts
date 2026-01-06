import { Hono } from "hono";

import health from "./health/route";

const internal = new Hono();

internal.route("/health", health);

export default internal;
