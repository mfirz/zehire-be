import { Hono } from "hono";

import { createAuthRoutes } from "./modules/auth";
import assessRoutes from "./routes/assess";
import internal from "./routes/internal/route";
import interviewerRoutes from "./routes/interviewer";
import oauthRoutes from "./routes/oauth";
import publicRoutes from "./routes/public/route";
import scheduleRoutes from "./routes/schedule";
import v1 from "./routes/v1";
import type { Env } from "./types/bindings";

const app = new Hono<{ Bindings: Env }>();

// API routes (authenticated)
app.route("/v1", v1);

// Auth routes (not versioned - stable contract)
app.route("/auth", createAuthRoutes());

// OAuth callback routes (for external providers)
app.route("/oauth", oauthRoutes);

// Public routes (no auth required)
app.route("/public", publicRoutes);

// Interviewer self-service routes (magic link auth)
app.route("/i", interviewerRoutes);

// Candidate scheduling routes (scheduling token auth)
app.route("/schedule", scheduleRoutes);

// Candidate assessment portal (assessment token auth)
app.route("/assess", assessRoutes);

// Internal routes
app.route("/internal", internal);

export default app;
