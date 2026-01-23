import { Hono } from "hono";

import { createAuthRoutes } from "./modules/auth";
import internal from "./routes/internal/route";
import interviewerRoutes from "./routes/interviewer";
import publicRoutes from "./routes/public/route";
import scheduleRoutes from "./routes/schedule";
import v1 from "./routes/v1";
import type { Env } from "./types/bindings";

const app = new Hono<{ Bindings: Env }>();

// API routes (authenticated)
app.route("/v1", v1);

// Auth routes (not versioned - stable contract)
app.route("/auth", createAuthRoutes());

// Public routes (no auth required)
app.route("/public", publicRoutes);

// Interviewer self-service routes (magic link auth)
app.route("/i", interviewerRoutes);

// Candidate scheduling routes (scheduling token auth)
app.route("/schedule", scheduleRoutes);

// Internal routes
app.route("/internal", internal);

export default app;
