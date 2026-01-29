import { Hono } from "hono";
import type { Env } from "../../../types/bindings";
import type { AuthVariables } from "../../../types/bindings";
import { AssessmentService } from "../../../domain/assessments/service";
import { CreateAssessmentInputSchema, UpdateAssessmentInputSchema } from "../../../domain/assessments/types";

const library = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// GET /v1/assessments — List assessment definitions for the org
library.get("/", async (c) => {
  const user = c.get("user");
  const status = c.req.query("status") as "active" | "archived" | undefined;

  const service = new AssessmentService(c.env.DB);
  const result = await service.listAssessments(user.orgId, status);

  if (!result.success) {
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json(result.data);
});

// POST /v1/assessments — Create new assessment definition
library.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const parsed = CreateAssessmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message, code: "VALIDATION_ERROR" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.createAssessment(user.orgId, user.userId, parsed.data);

  if (!result.success) {
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json(result.data, 201);
});

// GET /v1/assessments/:id — Get assessment definition with parts
library.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const service = new AssessmentService(c.env.DB);
  const result = await service.getAssessment(id, user.orgId);

  if (!result.success) {
    if (result.error.code === "ASSESSMENT_NOT_FOUND") {
      return c.json({ error: result.error.message, code: result.error.code }, 404);
    }
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json(result.data);
});

// PATCH /v1/assessments/:id — Update or archive assessment definition
library.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  const parsed = UpdateAssessmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message, code: "VALIDATION_ERROR" }, 400);
  }

  const service = new AssessmentService(c.env.DB);
  const result = await service.updateAssessment(id, user.orgId, parsed.data);

  if (!result.success) {
    if (result.error.code === "ASSESSMENT_NOT_FOUND") {
      return c.json({ error: result.error.message, code: result.error.code }, 404);
    }
    return c.json({ error: result.error.message, code: result.error.code }, 400);
  }

  return c.json(result.data);
});

export default library;
