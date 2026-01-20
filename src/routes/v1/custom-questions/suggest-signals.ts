/**
 * Signal Suggestion Route
 * =======================
 * LLM-powered signal suggestion for custom evaluative questions.
 *
 * POST /v1/custom-questions/suggest-signals
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  CustomQuestionsService,
  SuggestSignalsInputSchema,
} from "../../../domain/custom-questions";
import { createLLMClient } from "../../../lib/llm";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const suggestSignalsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth
suggestSignalsRoute.use("/*", jwtAuth);

/**
 * POST /v1/custom-questions/suggest-signals
 *
 * Analyze a question and suggest which signals it evaluates.
 */
suggestSignalsRoute.post(
  "/suggest-signals",
  zValidator("json", SuggestSignalsInputSchema),
  async (c) => {
    const input = c.req.valid("json");

    // Create LLM client for signal suggestion
    const llmClient = createLLMClient({ env: c.env });

    const service = new CustomQuestionsService(c.env.DB, llmClient);
    const result = await service.suggestSignals(input);

    return c.json(result);
  }
);

export default suggestSignalsRoute;
