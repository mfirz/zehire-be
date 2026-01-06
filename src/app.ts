import { Hono } from "hono";

import internal from "./routes/internal/route";
import v1 from "./routes/v1";
import type { Env } from "./types/bindings";

const app = new Hono<{ Bindings: Env }>();

app.route("/v1", v1);
app.route("/internal", internal);

export default app;
