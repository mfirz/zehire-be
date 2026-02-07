/**
 * Organization Settings Routes
 * =============================
 * Endpoints for managing organization settings.
 *
 * Endpoints:
 * - GET   /v1/organizations/settings               - Get org settings
 * - PATCH /v1/organizations/settings               - Update settings
 * - GET   /v1/organizations/video/:provider/connect - Start OAuth for video provider
 * - GET   /v1/organizations/video/status           - Check video connection status
 * - POST  /v1/organizations/video/disconnect       - Disconnect video provider
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
import { createVideoProvider, type VideoProviderType } from "../../../domain/video";
import { createSignedState } from "../../../lib/crypto";

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

/**
 * GET /v1/organizations/video/:provider/connect
 *
 * Start OAuth flow for video provider connection.
 * Redirects to the provider's OAuth consent screen.
 */
organizationsRoute.get("/video/:provider/connect", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;
  const providerType = c.req.param("provider") as VideoProviderType;

  // Validate provider type - only standalone providers need OAuth
  const validProviders: VideoProviderType[] = ["zoom"];
  if (!validProviders.includes(providerType)) {
    return c.json(
      {
        error: `Invalid provider. OAuth is only needed for: ${validProviders.join(", ")}. ` +
          "For calendar-native video calls, connect calendar via interviewer settings.",
      },
      400
    );
  }

  const db = createDb(c.env.DB);
  const org = await db.select().from(orgs).where(eq(orgs.id, orgId)).get();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  // Check if already connected
  if (org.videoTokens && org.videoCallProvider === providerType) {
    return c.json(
      { error: "Video provider already connected. Disconnect first to reconnect." },
      400
    );
  }

  try {
    // Create provider and get authorization URL
    const provider = createVideoProvider(providerType, c.env as unknown as Record<string, string>);

    // HMAC-signed state for callback verification and integrity
    const encodedState = await createSignedState(
      { orgId, provider: providerType },
      c.env.AUTH_JWT_SECRET,
    );

    const authUrl = provider.getAuthorizationUrl(encodedState);

    // Redirect to OAuth consent screen
    return c.redirect(authUrl);
  } catch (error) {
    console.error(`Failed to start OAuth flow for ${providerType}:`, error);
    return c.json({ error: "Failed to start OAuth flow" }, 500);
  }
});

/**
 * GET /v1/organizations/video/status
 *
 * Check video provider connection status.
 */
organizationsRoute.get("/video/status", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;

  const db = createDb(c.env.DB);
  const org = await db.select().from(orgs).where(eq(orgs.id, orgId)).get();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  return c.json({
    provider: org.videoCallProvider ?? "calendar_native",
    connected: !!org.videoTokens,
    accountId: org.videoAccountId,
    connectedAt: org.videoConnectedAt,
  });
});

/**
 * POST /v1/organizations/video/disconnect
 *
 * Disconnect video provider from organization.
 */
organizationsRoute.post("/video/disconnect", async (c) => {
  const user = c.get("user");
  const orgId = user.orgId;

  const db = createDb(c.env.DB);
  const org = await db.select().from(orgs).where(eq(orgs.id, orgId)).get();

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (!org.videoTokens) {
    return c.json({ error: "No video provider connected" }, 400);
  }

  const now = new Date().toISOString();

  // Clear video connection, revert to calendar_native
  await db
    .update(orgs)
    .set({
      videoCallProvider: "calendar_native",
      videoTokens: null,
      videoAccountId: null,
      videoConnectedAt: null,
      updatedAt: now,
    })
    .where(eq(orgs.id, orgId));

  return c.json({ success: true, message: "Video provider disconnected" });
});

export default organizationsRoute;
