import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { AssessmentService } from "../../src/domain/assessments/service";
import { seedOrg, seedUser } from "../helpers/seed";

describe("Assessment Library", () => {
  let service: AssessmentService;
  let orgId: string;
  let userId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    service = new AssessmentService(env.DB);
    const org = await seedOrg();
    const user = await seedUser(org.id);
    const otherOrg = await seedOrg({ name: "Other Org" });
    orgId = org.id;
    userId = user.id;
    otherOrgId = otherOrg.id;
  });

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  describe("createAssessment", () => {
    it("creates definition with parts and default scheduling config", async () => {
      const result = await service.createAssessment(orgId, userId, {
        name: "Technical Assessment",
        parts: [
          {
            name: "Part 1",
            instructions: "Build a REST API",
            evidenceDescription: "Submit your code",
            required: true,
          },
          {
            name: "Part 2",
            instructions: "Write unit tests",
            evidenceDescription: "Submit test results",
            required: false,
          },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const { definition, parts } = result.data;
      expect(definition.name).toBe("Technical Assessment");
      expect(definition.orgId).toBe(orgId);
      expect(definition.status).toBe("active");
      expect(definition.createdBy).toBe(userId);
      expect(parts).toHaveLength(2);
      expect(parts[0]!.name).toBe("Part 1");
      expect(parts[0]!.required).toBe(true);
      expect(parts[1]!.name).toBe("Part 2");
      expect(parts[1]!.required).toBe(false);

      const config = JSON.parse(definition.schedulingConfig);
      expect(config.scheduleWithinDays).toBe(7);
      expect(config.completeWithinHours).toBe(48);
      expect(config.maxReschedules).toBe(2);
    });

    it("creates definition with custom scheduling config", async () => {
      const result = await service.createAssessment(orgId, userId, {
        name: "Custom Config Assessment",
        parts: [
          {
            name: "Part 1",
            instructions: "Do something",
            evidenceDescription: "Evidence",
            required: true,
          },
        ],
        scheduling: {
          scheduleWithinDays: 14,
          completeWithinHours: 72,
          maxReschedules: 5,
        },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const config = JSON.parse(result.data.definition.schedulingConfig);
      expect(config.scheduleWithinDays).toBe(14);
      expect(config.completeWithinHours).toBe(72);
      expect(config.maxReschedules).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // GET
  // ---------------------------------------------------------------------------

  describe("getAssessment", () => {
    let definitionId: string;

    beforeAll(async () => {
      const result = await service.createAssessment(orgId, userId, {
        name: "Get Test Assessment",
        parts: [
          {
            name: "Part A",
            instructions: "Instructions A",
            evidenceDescription: "Evidence A",
            required: true,
          },
        ],
      });
      if (!result.success) throw new Error("Setup failed");
      definitionId = result.data.definition.id;
    });

    it("returns definition with parts for valid ID and org", async () => {
      const result = await service.getAssessment(definitionId, orgId);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.definition.id).toBe(definitionId);
      expect(result.data.definition.name).toBe("Get Test Assessment");
      expect(result.data.parts).toHaveLength(1);
      expect(result.data.parts[0]!.name).toBe("Part A");
    });

    it("returns ASSESSMENT_NOT_FOUND for nonexistent ID", async () => {
      const result = await service.getAssessment("nonexistent_id", orgId);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    });

    it("returns ASSESSMENT_NOT_FOUND for wrong org", async () => {
      const result = await service.getAssessment(definitionId, otherOrgId);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    });
  });

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  describe("listAssessments", () => {
    let listOrgId: string;

    beforeAll(async () => {
      const org = await seedOrg({ name: "List Org" });
      const user = await seedUser(org.id);
      listOrgId = org.id;

      await service.createAssessment(listOrgId, user.id, {
        name: "Active 1",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      await service.createAssessment(listOrgId, user.id, {
        name: "Active 2",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      const archived = await service.createAssessment(listOrgId, user.id, {
        name: "Archived 1",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (archived.success) {
        await service.updateAssessment(archived.data.definition.id, listOrgId, {
          status: "archived",
        });
      }
    });

    it("returns all definitions without filter", async () => {
      const result = await service.listAssessments(listOrgId);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(3);
    });

    it("returns only active definitions with active filter", async () => {
      const result = await service.listAssessments(listOrgId, "active");
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(2);
      expect(result.data.every((d) => d.status === "active")).toBe(true);
    });

    it("returns only archived definitions with archived filter", async () => {
      const result = await service.listAssessments(listOrgId, "archived");
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe("archived");
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  describe("updateAssessment", () => {
    let updateDefId: string;
    let updateParts: { id: string; name: string; instructions: string; evidenceDescription: string; required: boolean | number }[];

    beforeAll(async () => {
      const result = await service.createAssessment(orgId, userId, {
        name: "Update Test",
        parts: [
          { name: "Original Part 1", instructions: "I1", evidenceDescription: "E1", required: true },
          { name: "Original Part 2", instructions: "I2", evidenceDescription: "E2", required: false },
        ],
      });
      if (!result.success) throw new Error("Setup failed");
      updateDefId = result.data.definition.id;
      updateParts = result.data.parts;
    });

    it("updates name", async () => {
      const result = await service.updateAssessment(updateDefId, orgId, {
        name: "Updated Name",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.definition.name).toBe("Updated Name");
    });

    it("adds a new part when syncing parts", async () => {
      const result = await service.updateAssessment(updateDefId, orgId, {
        parts: [
          { id: updateParts[0].id, name: "Original Part 1", instructions: "I1", evidenceDescription: "E1", required: true },
          { id: updateParts[1].id, name: "Original Part 2", instructions: "I2", evidenceDescription: "E2", required: false },
          { name: "New Part 3", instructions: "I3", evidenceDescription: "E3", required: true },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts).toHaveLength(3);
      expect(result.data.parts[2].name).toBe("New Part 3");
    });

    it("updates an existing part", async () => {
      const current = await service.getAssessment(updateDefId, orgId);
      if (!current.success) throw new Error("Fetch failed");
      const parts = current.data.parts;

      const result = await service.updateAssessment(updateDefId, orgId, {
        parts: parts.map((p, i) =>
          i === 0
            ? { id: p.id, name: "Updated Part 1", instructions: "Updated I1", evidenceDescription: "Updated E1", required: false }
            : { id: p.id, name: p.name, instructions: p.instructions, evidenceDescription: p.evidenceDescription, required: !!p.required }
        ),
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts[0].name).toBe("Updated Part 1");
      expect(result.data.parts[0].required).toBe(false);
    });

    it("deletes a part when omitted from sync", async () => {
      const current = await service.getAssessment(updateDefId, orgId);
      if (!current.success) throw new Error("Fetch failed");
      const parts = current.data.parts;
      const originalCount = parts.length;

      const result = await service.updateAssessment(updateDefId, orgId, {
        parts: [
          { id: parts[0].id, name: parts[0].name, instructions: parts[0].instructions, evidenceDescription: parts[0].evidenceDescription, required: !!parts[0].required },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.parts).toHaveLength(1);
      expect(result.data.parts.length).toBeLessThan(originalCount);
    });

    it("archives definition", async () => {
      const fresh = await service.createAssessment(orgId, userId, {
        name: "To Archive",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!fresh.success) throw new Error("Setup failed");

      const result = await service.updateAssessment(fresh.data.definition.id, orgId, {
        status: "archived",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.definition.status).toBe("archived");
    });
  });

  // ---------------------------------------------------------------------------
  // PART ORDERING
  // ---------------------------------------------------------------------------

  describe("part ordering", () => {
    it("preserves part order after creation", async () => {
      const result = await service.createAssessment(orgId, userId, {
        name: "Ordered Assessment",
        parts: [
          { name: "First", instructions: "I", evidenceDescription: "E", required: true },
          { name: "Second", instructions: "I", evidenceDescription: "E", required: true },
          { name: "Third", instructions: "I", evidenceDescription: "E", required: true },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.parts[0].name).toBe("First");
      expect(result.data.parts[0].orderIndex).toBe(0);
      expect(result.data.parts[1].name).toBe("Second");
      expect(result.data.parts[1].orderIndex).toBe(1);
      expect(result.data.parts[2].name).toBe("Third");
      expect(result.data.parts[2].orderIndex).toBe(2);
    });

    it("preserves part order after update with reorder", async () => {
      const created = await service.createAssessment(orgId, userId, {
        name: "Reorder Test",
        parts: [
          { name: "Alpha", instructions: "I", evidenceDescription: "E", required: true },
          { name: "Beta", instructions: "I", evidenceDescription: "E", required: true },
          { name: "Gamma", instructions: "I", evidenceDescription: "E", required: true },
        ],
      });
      if (!created.success) throw new Error("Setup failed");

      const parts = created.data.parts;
      const result = await service.updateAssessment(created.data.definition.id, orgId, {
        parts: [
          { id: parts[2].id, name: "Gamma", instructions: "I", evidenceDescription: "E", required: true },
          { id: parts[0].id, name: "Alpha", instructions: "I", evidenceDescription: "E", required: true },
          { id: parts[1].id, name: "Beta", instructions: "I", evidenceDescription: "E", required: true },
        ],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.parts[0].name).toBe("Gamma");
      expect(result.data.parts[0].orderIndex).toBe(0);
      expect(result.data.parts[1].name).toBe("Alpha");
      expect(result.data.parts[1].orderIndex).toBe(1);
      expect(result.data.parts[2].name).toBe("Beta");
      expect(result.data.parts[2].orderIndex).toBe(2);
    });
  });
});
