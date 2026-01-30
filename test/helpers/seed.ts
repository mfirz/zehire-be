import { env } from "cloudflare:test";
import { createDb, orgs, users, jobs, applications } from "../../src/db";
import type {
  AssessmentDefinition,
  AssessmentPart,
  JobAssessment,
} from "../../src/db/schema/assessments";
import { AssessmentService } from "../../src/domain/assessments/service";

let seq = 0;
function uid(prefix: string): string {
  return `${prefix}_t${++seq}`;
}

export async function seedOrg(overrides: Record<string, unknown> = {}) {
  const db = createDb(env.DB);
  const now = new Date().toISOString();
  const id = uid("org");
  const data = {
    id,
    name: `Test Org ${id}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.insert(orgs).values(data);
  return data;
}

export async function seedUser(
  orgId: string,
  overrides: Record<string, unknown> = {}
) {
  const db = createDb(env.DB);
  const now = new Date().toISOString();
  const id = uid("user");
  const data = {
    id,
    email: `${id}@test.com`,
    role: "admin" as const,
    orgId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.insert(users).values(data);
  return data;
}

export async function seedJob(
  orgId: string,
  overrides: Record<string, unknown> = {}
) {
  const db = createDb(env.DB);
  const now = new Date().toISOString();
  const id = uid("job");
  const data = {
    id,
    orgId,
    title: `Test Job ${id}`,
    description: "A test job description",
    status: "draft" as const,
    workType: "remote" as const,
    employmentType: "fulltime" as const,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.insert(jobs).values(data);
  return data;
}

export async function seedApplication(
  jobId: string,
  overrides: Record<string, unknown> = {}
) {
  const db = createDb(env.DB);
  const now = new Date().toISOString();
  const id = uid("app");
  const data = {
    id,
    jobId,
    candidateEmail: `candidate-${id}@test.com`,
    candidateName: `Candidate ${id}`,
    status: "pending" as const,
    signalsStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.insert(applications).values(data);
  return data;
}

interface SeedPartInput {
  name: string;
  instructions: string;
  evidenceDescription: string;
  required: boolean;
}

interface FullPipelineResult {
  org: Awaited<ReturnType<typeof seedOrg>>;
  user: Awaited<ReturnType<typeof seedUser>>;
  job: Awaited<ReturnType<typeof seedJob>>;
  application: Awaited<ReturnType<typeof seedApplication>>;
  definition: AssessmentDefinition;
  parts: AssessmentPart[];
  jobAssessment: JobAssessment;
}

export async function seedFullPipeline(options?: {
  parts?: SeedPartInput[];
  scheduling?: {
    scheduleWithinDays?: number;
    completeWithinHours?: number;
    maxReschedules?: number;
  };
}): Promise<FullPipelineResult> {
  const org = await seedOrg();
  const user = await seedUser(org.id);
  const job = await seedJob(org.id);
  const application = await seedApplication(job.id);

  const service = new AssessmentService(env.DB);

  const defaultParts: SeedPartInput[] = [
    {
      name: "Default Part",
      instructions: "Complete the task",
      evidenceDescription: "Upload your solution",
      required: true,
    },
  ];

  const scheduling = options?.scheduling
    ? {
        scheduleWithinDays: options.scheduling.scheduleWithinDays ?? 7,
        completeWithinHours: options.scheduling.completeWithinHours ?? 48,
        maxReschedules: options.scheduling.maxReschedules ?? 2,
      }
    : undefined;

  const createResult = await service.createAssessment(org.id, user.id, {
    name: `Assessment ${org.id}`,
    parts: options?.parts ?? defaultParts,
    scheduling,
  });

  if (!createResult.success) {
    throw new Error("seedFullPipeline: failed to create assessment definition");
  }

  const linkResult = await service.setJobAssessment(
    job.id,
    createResult.data.definition.id,
    org.id
  );

  if (!linkResult.success) {
    throw new Error("seedFullPipeline: failed to link assessment to job");
  }

  return {
    org,
    user,
    job,
    application,
    definition: createResult.data.definition,
    parts: createResult.data.parts,
    jobAssessment: linkResult.data,
  };
}
