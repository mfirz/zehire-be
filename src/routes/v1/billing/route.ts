/**
 * Billing Routes
 * ==============
 * Route definitions for /v1/billing endpoints.
 *
 * All endpoints require JWT authentication.
 * User claims are available via `c.get("user")` in handlers.
 *
 * Endpoints:
 * - GET /         - Current month usage summary
 * - GET /preview  - Preview of current charges (up to now)
 * - GET /:year/:month - Usage for specific month
 * - GET /:year/:month/invoice - Invoice for specific month
 */

import { Hono } from "hono";
import { jwtAuth } from "../../../middleware/auth";
import type { AuthVariables, Env } from "../../../types/bindings";
import { getInvoice } from "./invoice";
import { getPreview } from "./preview";
import { getCurrentUsage, getMonthlyUsage } from "./usage";

const billing = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Apply JWT auth to all billing routes
billing.use("/*", jwtAuth);

// ===========================================================================
// USAGE ENDPOINTS
// ===========================================================================

// GET /v1/billing - Current month usage summary
billing.get("/", getCurrentUsage);

// GET /v1/billing/preview - Preview of current charges
billing.get("/preview", getPreview);

// GET /v1/billing/:year/:month - Usage for specific month
billing.get("/:year/:month", getMonthlyUsage);

// ===========================================================================
// INVOICE ENDPOINTS
// ===========================================================================

// GET /v1/billing/:year/:month/invoice - Invoice for specific month
billing.get("/:year/:month/invoice", getInvoice);

export default billing;
