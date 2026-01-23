/**
 * Organization Settings Routes
 * =============================
 * Endpoints for managing organization settings.
 *
 * Endpoints:
 * - GET  /v1/organizations/settings - Get org settings
 * - PATCH /v1/organizations/settings - Update settings
 *
 * All endpoints require authentication.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { createDb, orgs } from "../../../db";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";

const organizationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

// Apply JWT auth to all organization routes
organizationsRoute.use("/*", jwtAuth);

/**
 * Schema for updating organization settings.
 */
const UpdateOrgSettingsSchema = z.object({
  videoCallProvider: z
    .enum(["calendar_native", "zoom", "google_meet", "teams"])
    .optional(),
});

/**
 * GET /v1/organizations/settings
 *
 * Get organization settings.
 */
organizationsRoute.get("/", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;

  const db = createDb(c.env.DB);

  const org = await db.select().from(orgs).where(eq(orgs.id, orgId)).get();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  return c.json({
    id: org.id,
    name: org.name,
    videoCallProvider: org.videoCallProvider ?? "calendar_native",
    videoConnected: !!org.videoTokens,
    videoAccountId: org.videoAccountId,
    videoConnectedAt: org.videoConnectedAt,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  });
});

/**
 * PATCH /v1/organizations/settings
 *
 * Update organization settings.
 */
organizationsRoute.patch(
  "/",
  zValidator("json", UpdateOrgSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const orgId = user.orgId;
    const input = c.req.valid("json");

    const db = createDb(c.env.DB);

    // Check org exists
    const org = await db.select().from(orgs).where(eq(orgs.id, orgId)).get();

    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }

    const now = new Date().toISOString();

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (input.videoCallProvider !== undefined) {
      updates.videoCallProvider = input.videoCallProvider;

      // If changing to calendar_native, clear video tokens
      // (other providers require OAuth connection)
      if (
        input.videoCallProvider === "calendar_native" &&
        org.videoCallProvider !== "calendar_native"
      ) {
        updates.videoTokens = null;
        updates.videoAccountId = null;
        updates.videoConnectedAt = null;
      }
    }

    await db.update(orgs).set(updates).where(eq(orgs.id, orgId));

    // Fetch updated org
    const updated = await db.select().from(orgs).where(eq(orgs.id, orgId)).get();

    if (!updated) {
      return c.json({ error: "Failed to update organization" }, 500);
    }

    return c.json({
      id: updated.id,
      name: updated.name,
      videoCallProvider: updated.videoCallProvider ?? "calendar_native",
      videoConnected: !!updated.videoTokens,
      videoAccountId: updated.videoAccountId,
      videoConnectedAt: updated.videoConnectedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }
);

export default organizationsRoute;
