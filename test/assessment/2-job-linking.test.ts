import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { AssessmentService } from "../../src/domain/assessments/service";
import { seedOrg, seedUser, seedJob } from "../helpers/seed";

describe("Job Assessment Linking", () => {
  let service: AssessmentService;
  let orgId: string;
  let userId: string;
  let otherOrgId: string;
  let otherUserId: string;

  beforeAll(async () => {
    service = new AssessmentService(env.DB);
    const org = await seedOrg();
    const user = await seedUser(org.id);
    const otherOrg = await seedOrg({ name: "Other Org" });
    const otherUser = await seedUser(otherOrg.id);
    orgId = org.id;
    userId = user.id;
    otherOrgId = otherOrg.id;
    otherUserId = otherUser.id;
  });

  // ---------------------------------------------------------------------------
  // SET JOB ASSESSMENT
  // ---------------------------------------------------------------------------

  describe("setJobAssessment", () => {
    it("links an active definition to a job", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(orgId, userId, {
        name: "Active Assessment",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");

      const result = await service.setJobAssessment(job.id, assessment.data.definition.id, orgId);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.jobId).toBe(job.id);
      expect(result.data.assessmentDefinitionId).toBe(assessment.data.definition.id);
    });

    it("rejects archived definition", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(orgId, userId, {
        name: "To Archive",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");
      await service.updateAssessment(assessment.data.definition.id, orgId, { status: "archived" });

      const result = await service.setJobAssessment(job.id, assessment.data.definition.id, orgId);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ASSESSMENT_ARCHIVED");
    });

    it("rejects nonexistent definition", async () => {
      const job = await seedJob(orgId);
      const result = await service.setJobAssessment(job.id, "nonexistent_def", orgId);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    });

    it("rejects definition from different org", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(otherOrgId, otherUserId, {
        name: "Other Org Assessment",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");

      const result = await service.setJobAssessment(job.id, assessment.data.definition.id, orgId);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe("ASSESSMENT_NOT_FOUND");
    });

    it("replaces existing link", async () => {
      const job = await seedJob(orgId);
      const a1 = await service.createAssessment(orgId, userId, {
        name: "Assessment 1",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      const a2 = await service.createAssessment(orgId, userId, {
        name: "Assessment 2",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!a1.success || !a2.success) throw new Error("Setup failed");

      await service.setJobAssessment(job.id, a1.data.definition.id, orgId);
      const result = await service.setJobAssessment(job.id, a2.data.definition.id, orgId);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.assessmentDefinitionId).toBe(a2.data.definition.id);
    });
  });

  // ---------------------------------------------------------------------------
  // GET JOB ASSESSMENT
  // ---------------------------------------------------------------------------

  describe("getJobAssessment", () => {
    it("returns null when no assessment is linked", async () => {
      const job = await seedJob(orgId);
      const result = await service.getJobAssessment(job.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBeNull();
    });

    it("returns live definition data when no snapshot", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(orgId, userId, {
        name: "Live Assessment",
        parts: [{ name: "Part A", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");
      await service.setJobAssessment(job.id, assessment.data.definition.id, orgId);

      const result = await service.getJobAssessment(job.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).not.toBeNull();
      expect(result.data!.definition.name).toBe("Live Assessment");
      expect(result.data!.parts).toHaveLength(1);
      expect(result.data!.scheduling.scheduleWithinDays).toBe(7);
    });

    it("returns snapshot data after snapshot creation", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(orgId, userId, {
        name: "Snapshot Assessment",
        parts: [{ name: "Part B", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");
      await service.setJobAssessment(job.id, assessment.data.definition.id, orgId);
      await service.createSnapshotForJob(job.id);

      const result = await service.getJobAssessment(job.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).not.toBeNull();
      expect(result.data!.definition.name).toBe("Snapshot Assessment");
      expect(result.data!.parts).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // REMOVE JOB ASSESSMENT
  // ---------------------------------------------------------------------------

  describe("removeJobAssessment", () => {
    it("removes the link", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(orgId, userId, {
        name: "To Remove",
        parts: [{ name: "P", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");
      await service.setJobAssessment(job.id, assessment.data.definition.id, orgId);

      await service.removeJobAssessment(job.id);
      const result = await service.getJobAssessment(job.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // SNAPSHOT IMMUTABILITY
  // ---------------------------------------------------------------------------

  describe("snapshot immutability", () => {
    it("preserves original data after definition is edited", async () => {
      const job = await seedJob(orgId);
      const assessment = await service.createAssessment(orgId, userId, {
        name: "Original Name",
        parts: [{ name: "Original Part", instructions: "I", evidenceDescription: "E", required: true }],
      });
      if (!assessment.success) throw new Error("Setup failed");
      const defId = assessment.data.definition.id;

      await service.setJobAssessment(job.id, defId, orgId);
      await service.createSnapshotForJob(job.id);

      // Edit the live definition after snapshot
      await service.updateAssessment(defId, orgId, { name: "Changed Name" });

      const result = await service.getJobAssessment(job.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).not.toBeNull();
      expect(result.data!.definition.name).toBe("Original Name");
    });

    it("clears snapshot when link is replaced", async () => {
      const job = await seedJob(orgId);
      const a1 = await service.createAssessment(orgId, userId, {
        name: "Snapshot Def",
        parts: [{ name: "P1", instructions: "I", evidenceDescription: "E", required: true }],
      });
      const a2 = await service.createAssessment(orgId, userId, {
        name: "New Def",
        parts: [{ name: "P2", instructions: "I2", evidenceDescription: "E2", required: true }],
      });
      if (!a1.success || !a2.success) throw new Error("Setup failed");

      await service.setJobAssessment(job.id, a1.data.definition.id, orgId);
      await service.createSnapshotForJob(job.id);

      // Replace with different definition
      await service.setJobAssessment(job.id, a2.data.definition.id, orgId);

      const result = await service.getJobAssessment(job.id);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).not.toBeNull();
      expect(result.data!.definition.name).toBe("New Def");
    });
  });
});
