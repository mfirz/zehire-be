/**
 * GET /v1/capacity
 * ================
 * Get organization capacity status for various resources.
 *
 * Requires JWT authentication. Organization ID is extracted from the JWT.
 *
 * Currently returns:
 * - jobs: Active roles capacity (published + paused jobs)
 *
 * Future expansion:
 * - users: Team member capacity
 * - candidates: Candidate pool capacity
 */

import { Hono } from "hono";
import { OrgRepository } from "../../domain/jobs";
import { jwtAuth } from "../../middleware/auth";
import type { AuthVariables, Env } from "../../types/bindings";

const capacity = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Apply JWT auth
capacity.use("/*", jwtAuth);

capacity.get("/", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;

  const orgRepository = new OrgRepository(c.env.DB);
  const jobsCapacity = await orgRepository.getCapacityStatus(orgId);

  return c.json({
    jobs: jobsCapacity,
  });
});

export default capacity;
