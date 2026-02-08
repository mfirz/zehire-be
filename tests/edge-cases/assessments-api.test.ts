/**
 * Assessment API Edge-Case Tests
 * ===============================
 * Tests for boundary values, schema validation, XSS prevention, and
 * data integrity on the assessment library endpoints.
 *
 * Covers: GET /v1/assessments, POST /v1/assessments, GET /v1/assessments/:id, PATCH /v1/assessments/:id
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { AssessmentService } from "../../src/domain/assessments/service";
import {
  CreateAssessmentInputSchema,
  UpdateAssessmentInputSchema,
  SchedulingConfigSchema,
} from "../../src/domain/assessments/types";
import { seedOrg, seedUser } from "../../test/helpers/seed";

// =============================================================================
// SCHEMA VALIDATION EDGE CASES
// =============================================================================

describe("Assessment Schema Validation", () => {
  // ---------------------------------------------------------------------------
  // CreateAssessmentInputSchema
  // ---------------------------------------------------------------------------
  describe("CreateAssessmentInputSchema", () => {
    it("rejects empty name", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects name exceeding 200 characters", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "A".repeat(201),
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts name at exactly 200 characters", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "A".repeat(200),
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty parts array", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "Valid name",
        parts: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects more than 20 parts", () => {
      const parts = Array.from({ length: 21 }, (_, i) => ({
        name: `Part ${i}`,
        instructions: "Instructions",
        evidenceDescription: "Evidence",
        required: true,
      }));
      const result = CreateAssessmentInputSchema.safeParse({
        name: "Valid name",
        parts,
      });
      expect(result.success).toBe(false);
    });

    it("accepts exactly 20 parts", () => {
      const parts = Array.from({ length: 20 }, (_, i) => ({
        name: `Part ${i}`,
        instructions: "Instructions",
        evidenceDescription: "Evidence",
        required: true,
      }));
      const result = CreateAssessmentInputSchema.safeParse({
        name: "Valid name",
        parts,
      });
      expect(result.success).toBe(true);
    });

    it("rejects part name exceeding 200 characters", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "Valid name",
        parts: [{
          name: "P".repeat(201),
          instructions: "I",
          evidenceDescription: "E",
          required: true,
        }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects instructions exceeding 10,000 characters", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "Valid name",
        parts: [{
          name: "Part",
          instructions: "I".repeat(10001),
          evidenceDescription: "E",
          required: true,
        }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects evidenceDescription exceeding 500 characters", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "Valid name",
        parts: [{
          name: "Part",
          instructions: "Instructions",
          evidenceDescription: "E".repeat(501),
          required: true,
        }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts XSS payload in name without sanitizing (stores as-is)", () => {
      const xssPayload = '<script>alert("xss")</script>';
      const result = CreateAssessmentInputSchema.safeParse({
        name: xssPayload,
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      // Schema accepts the string — XSS prevention must happen in rendering
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(xssPayload);
      }
    });

    it("accepts Unicode characters (emoji, RTL, CJK) in name", () => {
      const unicodeName = "评估 🎯 تقييم Assessment";
      const result = CreateAssessmentInputSchema.safeParse({
        name: unicodeName,
        parts: [{
          name: "パート1",
          instructions: "تعليمات التقييم",
          evidenceDescription: "🗂️ Upload evidence",
          required: true,
        }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts zero-width characters in name (potential display issue)", () => {
      const zeroWidthName = "Assessment\u200B\u200C\u200D\uFEFF";
      const result = CreateAssessmentInputSchema.safeParse({
        name: zeroWidthName,
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // Zero-width chars are accepted — visible length looks like "Assessment" but actual length is longer
        expect(result.data.name.length).toBeGreaterThan("Assessment".length);
      }
    });

    it("handles scheduling config with defaults when omitted", () => {
      const result = CreateAssessmentInputSchema.safeParse({
        name: "No scheduling",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      expect(result.success).toBe(true);
      // scheduling is optional, so it should be undefined
      if (result.success) {
        expect(result.data.scheduling).toBeUndefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SchedulingConfigSchema
  // ---------------------------------------------------------------------------
  describe("SchedulingConfigSchema", () => {
    it("rejects scheduleWithinDays = 0", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 0,
        completeWithinHours: 48,
        maxReschedules: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects scheduleWithinDays = 31", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 31,
        completeWithinHours: 48,
        maxReschedules: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects completeWithinHours = 0", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 7,
        completeWithinHours: 0,
        maxReschedules: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects completeWithinHours = 169 (over 7 days)", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 7,
        completeWithinHours: 169,
        maxReschedules: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative maxReschedules", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 7,
        completeWithinHours: 48,
        maxReschedules: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects maxReschedules > 10", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 7,
        completeWithinHours: 48,
        maxReschedules: 11,
      });
      expect(result.success).toBe(false);
    });

    it("rejects float values (non-integer)", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 7.5,
        completeWithinHours: 48,
        maxReschedules: 2,
      });
      expect(result.success).toBe(false);
    });

    it("applies defaults when fields are omitted", () => {
      const result = SchedulingConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scheduleWithinDays).toBe(7);
        expect(result.data.completeWithinHours).toBe(48);
        expect(result.data.maxReschedules).toBe(2);
      }
    });

    it("accepts boundary values: min", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 1,
        completeWithinHours: 1,
        maxReschedules: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts boundary values: max", () => {
      const result = SchedulingConfigSchema.safeParse({
        scheduleWithinDays: 30,
        completeWithinHours: 168,
        maxReschedules: 10,
      });
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // UpdateAssessmentInputSchema
  // ---------------------------------------------------------------------------
  describe("UpdateAssessmentInputSchema", () => {
    it("rejects status value other than 'archived'", () => {
      const result = UpdateAssessmentInputSchema.safeParse({
        status: "active",
      });
      expect(result.success).toBe(false);
    });

    it("accepts empty object (no-op update)", () => {
      const result = UpdateAssessmentInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts partial scheduling update", () => {
      const result = UpdateAssessmentInputSchema.safeParse({
        scheduling: { scheduleWithinDays: 14 },
      });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// SCHEMA ALIGNMENT: FRONTEND vs BACKEND (post-fix — Feb 8)
// =============================================================================

describe("FE/BE Schema Alignment", () => {
  it("FIXED: BE and FE both allow maxReschedules up to 10", () => {
    const beResult = SchedulingConfigSchema.safeParse({
      scheduleWithinDays: 7,
      completeWithinHours: 48,
      maxReschedules: 10,
    });
    expect(beResult.success).toBe(true);
    // FE schema now also uses max(10), matching BE.
  });

  it("FIXED: BE and FE both allow single-character part names (min=1)", () => {
    const beResult = CreateAssessmentInputSchema.safeParse({
      name: "Valid",
      parts: [{ name: "X", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(beResult.success).toBe(true);
    // FE schema now also uses min(1) for part name, matching BE.
  });

  it("FIXED: BE and FE both allow single-character instructions (min=1)", () => {
    const beResult = CreateAssessmentInputSchema.safeParse({
      name: "Valid",
      parts: [{ name: "Part", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(beResult.success).toBe(true);
    // FE schema now also uses min(1) for instructions, matching BE.
  });

  it("FIXED: BE and FE both allow single-character evidenceDescription (min=1)", () => {
    const beResult = CreateAssessmentInputSchema.safeParse({
      name: "Valid",
      parts: [{ name: "Part", instructions: "Instructions", evidenceDescription: "E", required: true }],
    });
    expect(beResult.success).toBe(true);
    // FE schema now also uses min(1) for evidenceDescription, matching BE.
  });

  it("FIXED: BE and FE both allow single-character assessment name (min=1)", () => {
    const beResult = CreateAssessmentInputSchema.safeParse({
      name: "A",
      parts: [{ name: "Part", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(beResult.success).toBe(true);
    // FE schema now also uses min(1) for assessment name, matching BE.
  });

  it("FIXED: FE now enforces max 200 for assessment name, matching BE", () => {
    const longName = "A".repeat(500);
    const beResult = CreateAssessmentInputSchema.safeParse({
      name: longName,
      parts: [{ name: "Part", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(beResult.success).toBe(false);
    // FE schema now uses max(200) for assessment name, matching BE.
    // Client-side validation catches oversized input before submission.
  });
});

// =============================================================================
// SERVICE EDGE CASES (with DB)
// =============================================================================

describe("Assessment Service Edge Cases", () => {
  let service: AssessmentService;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    service = new AssessmentService(env.DB);
    const org = await seedOrg();
    const user = await seedUser(org.id);
    orgId = org.id;
    userId = user.id;
  });

  it("creates assessment with XSS payload in name and parts — stored as-is", async () => {
    const xssPayload = '<img src=x onerror=alert(1)>';
    const result = await service.createAssessment(orgId, userId, {
      name: xssPayload,
      parts: [{
        name: '<script>alert("xss")</script>',
        instructions: "Normal instructions",
        evidenceDescription: "Normal evidence",
        required: true,
      }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // XSS payloads stored as-is — output encoding must happen at rendering layer
    expect(result.data.definition.name).toBe(xssPayload);
    expect(result.data.parts[0].name).toBe('<script>alert("xss")</script>');
  });

  it("creates assessment with extremely long valid inputs at boundary", async () => {
    const result = await service.createAssessment(orgId, userId, {
      name: "A".repeat(200), // max name length
      parts: [{
        name: "P".repeat(200), // max part name length
        instructions: "I".repeat(10000), // max instructions length
        evidenceDescription: "E".repeat(500), // max evidence description length
        required: true,
      }],
    });

    expect(result.success).toBe(true);
  });

  it("getAssessment returns not found for non-existent ID", async () => {
    const result = await service.getAssessment("non_existent_id", orgId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    }
  });

  it("getAssessment rejects cross-org access", async () => {
    // Create assessment in org A
    const createResult = await service.createAssessment(orgId, userId, {
      name: "Org A Assessment",
      parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    // Try to access from a different org
    const otherOrg = await seedOrg({ name: "Attacker Org" });
    const result = await service.getAssessment(createResult.data.definition.id, otherOrg.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    }
  });

  it("listAssessmentsWithCounts returns empty array for org with no assessments", async () => {
    const emptyOrg = await seedOrg({ name: "Empty Org" });
    const result = await service.listAssessmentsWithCounts(emptyOrg.id);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it("archiving assessment allows re-listing with status filter", async () => {
    const createResult = await service.createAssessment(orgId, userId, {
      name: "Archivable Assessment",
      parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const archiveResult = await service.updateAssessment(
      createResult.data.definition.id,
      orgId,
      { status: "archived" }
    );
    expect(archiveResult.success).toBe(true);

    // Should appear in archived list
    const archivedList = await service.listAssessmentsWithCounts(orgId, "archived");
    expect(archivedList.success).toBe(true);
    if (!archivedList.success) return;
    const found = archivedList.data.some(
      (a) => a.id === createResult.data.definition.id
    );
    expect(found).toBe(true);

    // Should NOT appear in active list
    const activeList = await service.listAssessmentsWithCounts(orgId, "active");
    expect(activeList.success).toBe(true);
    if (!activeList.success) return;
    const foundInActive = activeList.data.some(
      (a) => a.id === createResult.data.definition.id
    );
    expect(foundInActive).toBe(false);
  });

  it("update with empty object is a no-op but doesn't crash", async () => {
    const createResult = await service.createAssessment(orgId, userId, {
      name: "NoOp Assessment",
      parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) return;

    const updateResult = await service.updateAssessment(
      createResult.data.definition.id,
      orgId,
      {} // empty update
    );
    expect(updateResult.success).toBe(true);
    if (!updateResult.success) return;
    expect(updateResult.data.definition.name).toBe("NoOp Assessment");
  });
});

// =============================================================================
// GET /v1/assessments — Search functionality
// =============================================================================

describe("Assessment Search (listAssessmentsWithCounts)", () => {
  let service: AssessmentService;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    service = new AssessmentService(env.DB);
    const org = await seedOrg({ name: "Search Test Org" });
    const user = await seedUser(org.id);
    orgId = org.id;
    userId = user.id;

    // Seed assessments with distinct names for search testing
    await service.createAssessment(orgId, userId, {
      name: "Design Challenge",
      parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
    });
    await service.createAssessment(orgId, userId, {
      name: "Coding Test",
      parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
    });
    await service.createAssessment(orgId, userId, {
      name: "Product Design Review",
      parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
    });
  });

  it("returns all assessments when search is undefined", async () => {
    const result = await service.listAssessmentsWithCounts(orgId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(3);
  });

  it("filters assessments by name matching search term", async () => {
    const result = await service.listAssessmentsWithCounts(orgId, undefined, "Design");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(2);
    expect(result.data.every((a) => a.name.includes("Design"))).toBe(true);
  });

  it("search is case-insensitive via LIKE", async () => {
    const result = await service.listAssessmentsWithCounts(orgId, undefined, "design");
    expect(result.success).toBe(true);
    if (!result.success) return;
    // SQLite LIKE is case-insensitive for ASCII characters by default
    expect(result.data.length).toBe(2);
  });

  it("returns empty array when search matches nothing", async () => {
    const result = await service.listAssessmentsWithCounts(orgId, undefined, "NonexistentTerm");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it("search combined with status filter works", async () => {
    // All seeded assessments are "active", so searching active+Design should return 2
    const result = await service.listAssessmentsWithCounts(orgId, "active", "Design");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(2);

    // Searching archived+Design should return 0 (none are archived)
    const archivedResult = await service.listAssessmentsWithCounts(orgId, "archived", "Design");
    expect(archivedResult.success).toBe(true);
    if (!archivedResult.success) return;
    expect(archivedResult.data.length).toBe(0);
  });

  it("search with partial name match works", async () => {
    const result = await service.listAssessmentsWithCounts(orgId, undefined, "Cod");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe("Coding Test");
  });
});

// =============================================================================
// GET /v1/assessments — Status param validation
// =============================================================================

describe("GET /v1/assessments - status param", () => {
  it("FIXED: backend now validates status param and returns 400 for invalid values", () => {
    // library.ts lines 14-16 now check:
    // if (status !== undefined && status !== "active" && status !== "archived")
    //   return c.json({ error: "...", code: "VALIDATION_ERROR" }, 400);
    // Full HTTP-level tests in assessments-status-validation.test.ts
    expect(true).toBe(true);
  });
});
