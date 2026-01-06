import { Hono } from "hono";

import { createAuthRoutes } from "./modules/auth";
import internal from "./routes/internal/route";
import v1 from "./routes/v1";
import type { Env } from "./types/bindings";

const app = new Hono<{ Bindings: Env }>();

// API routes
app.route("/v1", v1);

// Auth routes (not versioned - stable contract)
app.route("/auth", createAuthRoutes());

// Internal routes
app.route("/internal", internal);

export default app;
