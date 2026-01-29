import { createMiddleware } from "hono/factory";
import type { Env } from "../types/bindings";
import type { CandidateAssessment } from "../db/schema/assessments";

/**
 * Variables set by the assessment auth middleware.
 */
export interface AssessmentAuthVariables {
  candidateAssessment: CandidateAssessment;
}

/**
 * Middleware that validates assessment tokens from URL path.
 * The token is expected in c.req.param("token").
 * Sets c.var.candidateAssessment on success.
 */
export const assessAuth = createMiddleware<{
  Bindings: Env;
  Variables: AssessmentAuthVariables;
}>(async (c, next) => {
  const token = c.req.param("token");

  if (!token) {
    return c.json({ error: "Assessment token is required" }, 401);
  }

  const { AssessmentRepository } = await import("../domain/assessments/repository");
  const repo = new AssessmentRepository(c.env.DB);

  const assessment = await repo.findByToken(token);

  if (!assessment) {
    return c.json({ error: "Invalid or expired assessment token" }, 401);
  }

  if (new Date(assessment.tokenExpiresAt) < new Date()) {
    return c.json({ error: "Assessment token has expired" }, 401);
  }

  if (assessment.status === "cancelled") {
    return c.json({ error: "This assessment has been cancelled" }, 410);
  }

  c.set("candidateAssessment", assessment);
  return next();
});
