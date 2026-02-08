/**
 * Assessment Archive Edge-Case Tests
 * ====================================
 * Tests for archive-related business logic:
 * - Double-archive attempt (already archived → should reject)
 * - GET archived assessment returns correct status
 * - Content update on archived assessment
 * - Archive non-existent assessment
 * - Cross-org archive attempt
 */
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { AssessmentService } from "../../src/domain/assessments/service";
import { seedOrg, seedUser } from "../../test/helpers/seed";

// =============================================================================
// SETUP
// =============================================================================

let service: AssessmentService;
let orgId: string;
let userId: string;

beforeAll(async () => {
  service = new AssessmentService(env.DB);
  const org = await seedOrg({ name: "Archive Test Org" });
  const user = await seedUser(org.id);
  orgId = org.id;
  userId = user.id;
});

// Helper: create a minimal assessment
function createMinimalAssessment() {
  return service.createAssessment(orgId, userId, {
    name: "Test Assessment",
    parts: [
      {
        name: "Part 1",
        instructions: "Do something",
        evidenceDescription: "Show your work",
        required: true,
      },
    ],
  });
}

// =============================================================================
// ARCHIVE EDGE CASES
// =============================================================================

describe("Assessment Archive Edge Cases", () => {
  it("archives an active assessment successfully", async () => {
    const created = await createMinimalAssessment();
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await service.updateAssessment(
      created.data.definition.id,
      orgId,
      { status: "archived" }
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.definition.status).toBe("archived");
  });

  it("rejects double-archive on already-archived assessment with ALREADY_ARCHIVED", async () => {
    const created = await createMinimalAssessment();
    expect(created.success).toBe(true);
    if (!created.success) return;

    // First archive — should succeed
    const firstArchive = await service.updateAssessment(
      created.data.definition.id,
      orgId,
      { status: "archived" }
    );
    expect(firstArchive.success).toBe(true);

    // Second archive — should return ALREADY_ARCHIVED error
    const secondArchive = await service.updateAssessment(
      created.data.definition.id,
      orgId,
      { status: "archived" }
    );

    expect(secondArchive.success).toBe(false);
    if (!secondArchive.success) {
      expect(secondArchive.error.code).toBe("ALREADY_ARCHIVED");
      expect(secondArchive.error.message).toBe("Assessment is already archived");
    }
  });

  it("GET archived assessment returns status=archived", async () => {
    const created = await createMinimalAssessment();
    expect(created.success).toBe(true);
    if (!created.success) return;

    await service.updateAssessment(created.data.definition.id, orgId, {
      status: "archived",
    });

    const fetched = await service.getAssessment(
      created.data.definition.id,
      orgId
    );
    expect(fetched.success).toBe(true);
    if (!fetched.success) return;
    expect(fetched.data.definition.status).toBe("archived");
  });

  it("content update on archived assessment still succeeds (no guard)", async () => {
    const created = await createMinimalAssessment();
    expect(created.success).toBe(true);
    if (!created.success) return;

    // Archive it first
    await service.updateAssessment(created.data.definition.id, orgId, {
      status: "archived",
    });

    // Try to update content on archived assessment
    // NOTE: This currently succeeds — there's no guard preventing
    // content updates on archived assessments. This may or may not be
    // intentional. Documenting current behavior.
    const updateResult = await service.updateAssessment(
      created.data.definition.id,
      orgId,
      { name: "Updated Name After Archive" }
    );
    expect(updateResult.success).toBe(true);
    if (!updateResult.success) return;
    expect(updateResult.data.definition.name).toBe(
      "Updated Name After Archive"
    );
    // Status is still archived after content update
    expect(updateResult.data.definition.status).toBe("archived");
  });

  it("archive non-existent assessment returns not found", async () => {
    const result = await service.updateAssessment(
      "non_existent_id_xyz",
      orgId,
      { status: "archived" }
    );
    // archiveDefinition is a raw UPDATE — no rows affected check
    // Then getDefinition returns null → ASSESSMENT_NOT_FOUND
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    }
  });

  it("cross-org archive attempt returns not found", async () => {
    const created = await createMinimalAssessment();
    expect(created.success).toBe(true);
    if (!created.success) return;

    const otherOrg = await seedOrg({ name: "Attacker Org For Archive" });

    const result = await service.updateAssessment(
      created.data.definition.id,
      otherOrg.id,
      { status: "archived" }
    );
    // archiveDefinition filters by orgId, so no rows updated
    // Then getDefinition returns null → ASSESSMENT_NOT_FOUND
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    }
  });

  it("archived assessment does not appear in active list", async () => {
    // Create a fresh org so we have clean data
    const freshOrg = await seedOrg({ name: "Clean Org For Archive List" });
    const freshUser = await seedUser(freshOrg.id);
    const freshService = new AssessmentService(env.DB);

    const created = await freshService.createAssessment(
      freshOrg.id,
      freshUser.id,
      {
        name: "Will Be Archived",
        parts: [
          {
            name: "P",
            instructions: "I",
            evidenceDescription: "E",
            required: true,
          },
        ],
      }
    );
    expect(created.success).toBe(true);
    if (!created.success) return;

    // Archive it
    await freshService.updateAssessment(
      created.data.definition.id,
      freshOrg.id,
      { status: "archived" }
    );

    // Active list should be empty
    const activeList = await freshService.listAssessmentsWithCounts(
      freshOrg.id,
      "active"
    );
    expect(activeList.success).toBe(true);
    if (!activeList.success) return;
    expect(activeList.data).toEqual([]);

    // Archived list should have one entry
    const archivedList = await freshService.listAssessmentsWithCounts(
      freshOrg.id,
      "archived"
    );
    expect(archivedList.success).toBe(true);
    if (!archivedList.success) return;
    expect(archivedList.data.length).toBe(1);
    expect(archivedList.data[0].id).toBe(created.data.definition.id);
  });
});
