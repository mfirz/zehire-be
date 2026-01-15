# Drizzle ORM Adoption Plan

Full adoption of Drizzle ORM and Studio for the Zehire backend.

## Executive Summary

| Metric | Value |
|--------|-------|
| Tables | 12 |
| Repositories | 2 (jobs: 1378 LOC, applications: 822 LOC) |
| Query calls | ~123 total |
| Estimated time | 5-7 hours |
| Risk level | Low (isolated changes, existing tests) |

---

## Why Drizzle?

### Type Safety
```typescript
// Before (raw SQL) - errors caught at RUNTIME
const result = await db
  .prepare("SELECT * FROM jobs WHERE id = ?")
  .bind(id)
  .first<JobRow>(); // Manual type, can be wrong

// After (Drizzle) - errors caught at COMPILE TIME
const result = await db
  .select()
  .from(jobs)
  .where(eq(jobs.id, id))
  .get(); // Type inferred from schema
```

### Performance
- ~1-3% overhead vs raw SQL (negligible)
- No runtime query engine (unlike Prisma)
- Generates identical SQL to hand-written queries

### Developer Experience
- Auto-generated types from schema
- Drizzle Studio for local DB visualization
- Better refactoring support

---

## Current State

```
Database: Cloudflare D1 (SQLite)
Migrations: 12 SQL files (migrations/*.sql)
Query Pattern: Raw SQL via db.prepare().bind().first/all/run()
Types: Manual interfaces (JobRow, ApplicationRow, etc.)

Tables:
├── jobs (35 columns)
├── users (5 columns)
├── magic_link_tokens (6 columns)
├── orgs (8 columns)
├── billing_events (7 columns)
├── pricing_history (6 columns)
├── billing_periods (9 columns)
├── applications (12 columns)
├── answers (10 columns)
└── application_drafts (8 columns)
```

---

## Phase 1: Setup & Foundation
**Time: ~20 minutes**

### 1.1 Install Dependencies

```bash
bun add drizzle-orm
bun add -d drizzle-kit
```

### 1.2 Create Project Structure

```
src/
├── db/
│   ├── schema/
│   │   ├── jobs.ts           # Jobs table
│   │   ├── users.ts          # Users + magic_link_tokens
│   │   ├── orgs.ts           # Organizations
│   │   ├── billing.ts        # billing_events, pricing_history, billing_periods
│   │   ├── applications.ts   # applications, answers, application_drafts
│   │   └── index.ts          # Re-export all
│   ├── client.ts             # Drizzle client wrapper
│   └── index.ts              # Main export
├── domain/
│   ├── jobs/
│   │   └── repository.ts     # Migrate to Drizzle
│   └── applications/
│       └── repository.ts     # Migrate to Drizzle
```

### 1.3 Create Drizzle Config

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "sqlite",
});
```

### 1.4 Add Scripts to package.json

```json
{
  "scripts": {
    "db:studio": "drizzle-kit studio",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push"
  }
}
```

---

## Phase 2: Schema Definition
**Time: ~1.5 hours**

### 2.1 Jobs Schema

```typescript
// src/db/schema/jobs.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";

export const jobStatusEnum = ["draft", "published", "paused", "closed"] as const;
export const questionsStatusEnum = ["none", "pending", "processing", "completed", "failed"] as const;
export const pipelineStatusEnum = ["none", "pending", "processing", "completed", "failed"] as const;
export const workTypeEnum = ["remote", "hybrid", "onsite"] as const;
export const employmentTypeEnum = ["fulltime", "parttime", "contract", "internship"] as const;
export const salaryCurrencyEnum = ["USD", "EUR", "GBP", "SGD", "IDR"] as const;

export const jobs = sqliteTable("jobs", {
  // Primary key
  id: text("id").primaryKey(),
  orgId: text("org_id").references(() => orgs.id),

  // Status fields
  status: text("status", { enum: jobStatusEnum }).notNull().default("draft"),
  questionsStatus: text("questions_status", { enum: questionsStatusEnum }).notNull().default("none"),
  pipelineStatus: text("pipeline_status", { enum: pipelineStatusEnum }).default("none"),

  // Content fields
  title: text("title").notNull(),
  description: text("description").notNull(),
  descriptionText: text("description_text"),
  companyName: text("company_name"),
  department: text("department"),
  location: text("location"),

  // Job details
  workType: text("work_type", { enum: workTypeEnum }).notNull().default("remote"),
  employmentType: text("employment_type", { enum: employmentTypeEnum }).notNull().default("fulltime"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency", { enum: salaryCurrencyEnum }),

  // LLM results (JSON stored as text)
  jobContext: text("job_context"),
  archetypes: text("archetypes"),
  questions: text("questions"),

  // Pipeline fields
  pipelineRecommendation: text("pipeline_recommendation"),
  pipeline: text("pipeline"),
  pipelineGeneratedAt: text("pipeline_generated_at"),
  pipelineError: text("pipeline_error"),
  pipelineErrorCode: text("pipeline_error_code"),
  pipelineRegenerationCount: integer("pipeline_regeneration_count").default(0),
  pipelineLastRegenerationAt: text("pipeline_last_regeneration_at"),
  pipelineProcessingStartedAt: text("pipeline_processing_started_at"),
  pipelineProcessingDurationMs: integer("pipeline_processing_duration_ms"),

  // Public access
  publicSlug: text("public_slug"),

  // Error tracking
  errorMessage: text("error_message"),
  errorCode: text("error_code"),

  // Rate limiting
  regenerationCount: integer("regeneration_count").notNull().default(0),
  lastRegenerationAt: text("last_regeneration_at"),

  // Processing metadata
  processingStartedAt: text("processing_started_at"),
  processingDurationMs: integer("processing_duration_ms"),

  // Timestamps
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
  publishedAt: text("published_at"),
  closedAt: text("closed_at"),
}, (table) => ({
  // Indexes
  orgCreatedIdx: index("idx_jobs_org_created").on(table.orgId, table.createdAt),
  statusIdx: index("idx_jobs_status_v2").on(table.orgId, table.status, table.createdAt),
  publicSlugIdx: index("idx_jobs_public_slug").on(table.publicSlug),
}));

// Inferred types
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
```

### 2.2 Users Schema

```typescript
// src/db/schema/users.ts
import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";

export const userRoleEnum = ["admin", "recruiter"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: userRoleEnum }).notNull().default("recruiter"),
  orgId: text("org_id").references(() => orgs.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  emailIdx: index("idx_users_email").on(table.email),
  orgIdx: index("idx_users_org").on(table.orgId),
}));

export const magicLinkTokens = sqliteTable("magic_link_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  hashIdx: index("idx_magic_link_tokens_hash").on(table.tokenHash),
  userIdx: index("idx_magic_link_tokens_user").on(table.userId),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
```

### 2.3 Organizations Schema

```typescript
// src/db/schema/orgs.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  jobsListVersion: integer("jobs_list_version").notNull().default(1),
  activeRoleCapacity: integer("active_role_capacity").notNull().default(3),
  billingWaived: integer("billing_waived").notNull().default(0),
  billingWaivedReason: text("billing_waived_reason"),
  billingWaivedUntil: text("billing_waived_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
```

### 2.4 Billing Schema

```typescript
// src/db/schema/billing.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { orgs } from "./orgs";
import { jobs } from "./jobs";

export const billingEventTypeEnum = ["activated", "paused", "resumed", "deactivated"] as const;

export const billingEvents = sqliteTable("billing_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  jobId: text("job_id").notNull().references(() => jobs.id),
  eventType: text("event_type", { enum: billingEventTypeEnum }).notNull(),
  occurredAt: text("occurred_at").notNull(),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  orgOccurredIdx: index("idx_billing_events_org_occurred").on(table.orgId, table.occurredAt),
  jobIdx: index("idx_billing_events_job").on(table.jobId, table.occurredAt),
}));

export const pricingHistory = sqliteTable("pricing_history", {
  id: text("id").primaryKey(),
  rateCents: integer("rate_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  effectiveFrom: text("effective_from").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  createdBy: text("created_by"),
}, (table) => ({
  effectiveIdx: index("idx_pricing_history_effective").on(table.effectiveFrom),
}));

export const billingPeriodStatusEnum = ["pending", "invoiced", "paid", "failed", "waived"] as const;

export const billingPeriods = sqliteTable("billing_periods", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => orgs.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  totalActiveMinutes: integer("total_active_minutes").notNull().default(0),
  totalChargeCents: integer("total_charge_cents").notNull().default(0),
  status: text("status", { enum: billingPeriodStatusEnum }).notNull().default("pending"),
  stripeInvoiceId: text("stripe_invoice_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  orgIdx: index("idx_billing_periods_org").on(table.orgId, table.periodStart),
}));

export type BillingEvent = typeof billingEvents.$inferSelect;
export type PricingHistory = typeof pricingHistory.$inferSelect;
export type BillingPeriod = typeof billingPeriods.$inferSelect;
```

### 2.5 Applications Schema

```typescript
// src/db/schema/applications.ts
import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { jobs } from "./jobs";

export const applicationStatusEnum = ["pending", "screening", "assessment", "interview", "offer", "rejected", "withdrawn"] as const;
export const signalsStatusEnum = ["pending", "processing", "completed", "failed"] as const;
export const extractionStatusEnum = ["pending", "processing", "completed", "failed"] as const;

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  candidateEmail: text("candidate_email").notNull(),
  candidateName: text("candidate_name").notNull(),
  status: text("status", { enum: applicationStatusEnum }).notNull().default("pending"),
  signalsStatus: text("signals_status", { enum: signalsStatusEnum }).notNull().default("pending"),
  signalEvaluations: text("signal_evaluations"),
  decisionPosture: text("decision_posture"),
  signalsErrorMessage: text("signals_error_message"),
  signalsErrorCode: text("signals_error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  signalsComputedAt: text("signals_computed_at"),
}, (table) => ({
  jobIdIdx: index("idx_applications_job_id").on(table.jobId),
  statusIdx: index("idx_applications_status").on(table.status),
  signalsStatusIdx: index("idx_applications_signals_status").on(table.signalsStatus),
  uniqueCandidateIdx: uniqueIndex("idx_applications_unique_candidate").on(table.jobId, table.candidateEmail),
}));

export const answers = sqliteTable("answers", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  archetypeId: text("archetype_id").notNull(),
  questionText: text("question_text").notNull(),
  answerText: text("answer_text").notNull(),
  extractedSignals: text("extracted_signals"),
  extractionStatus: text("extraction_status", { enum: extractionStatusEnum }).notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  answeredAt: text("answered_at").notNull(),
  extractedAt: text("extracted_at"),
}, (table) => ({
  applicationIdIdx: index("idx_answers_application_id").on(table.applicationId),
  extractionStatusIdx: index("idx_answers_extraction_status").on(table.extractionStatus),
  uniqueAnswerIdx: uniqueIndex("idx_answers_unique").on(table.applicationId, table.archetypeId),
}));

export const applicationDrafts = sqliteTable("application_drafts", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  candidateEmail: text("candidate_email").notNull(),
  candidateName: text("candidate_name").notNull(),
  answers: text("answers").notNull().default("[]"),
  resumeTokenHash: text("resume_token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  jobIdIdx: index("idx_drafts_job_id").on(table.jobId),
  emailIdx: index("idx_drafts_email").on(table.candidateEmail),
  expiresIdx: index("idx_drafts_expires").on(table.expiresAt),
  uniqueCandidateIdx: uniqueIndex("idx_drafts_unique_candidate").on(table.jobId, table.candidateEmail),
}));

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
export type ApplicationDraft = typeof applicationDrafts.$inferSelect;
```

### 2.6 Schema Index

```typescript
// src/db/schema/index.ts
export * from "./jobs";
export * from "./users";
export * from "./orgs";
export * from "./billing";
export * from "./applications";
```

---

## Phase 3: Database Client
**Time: ~30 minutes**

### 3.1 Create Drizzle Client

```typescript
// src/db/client.ts
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

### 3.2 Retry Utility (preserve existing logic)

```typescript
// src/db/utils.ts
/**
 * Check if an error is a D1/SQLite lock error.
 */
function isDbLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("1031") ||
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("Database busy")
  );
}

/**
 * Retry a database operation with exponential backoff + jitter.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 150;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isDbLockError(error) || attempt >= maxRetries) {
        throw lastError;
      }

      const baseDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay * 0.5;
      const delay = Math.round(baseDelay + jitter);
      console.log(`[DB] Lock detected, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

### 3.3 Main Export

```typescript
// src/db/index.ts
export { createDb, type Database } from "./client";
export { withDbRetry } from "./utils";
export * from "./schema";
```

---

## Phase 4: Jobs Repository Migration
**Time: ~2.5 hours**

### 4.1 Repository Structure

```typescript
// src/domain/jobs/repository.ts
import { eq, and, desc, lt, or, sql } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { customAlphabet } from "nanoid";

import { createDb, withDbRetry, jobs, type Job, type NewJob } from "../../db";
import { extractPlainText, type TiptapDoc } from "../../lib/tiptap";
import type { CreateJobInput, UpdateJobInput } from "./schemas";

const alphanumericId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  21
);

export class JobRepository {
  private db: ReturnType<typeof createDb>;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ... methods below
}
```

### 4.2 Query Migration Examples

**CREATE:**
```typescript
async create(input: CreateJobInput, orgId: string): Promise<Job> {
  const id = alphanumericId();
  const now = new Date().toISOString();
  const descriptionJson = JSON.stringify(input.description);
  const descriptionText = extractPlainText(input.description as TiptapDoc);

  const [result] = await this.db
    .insert(jobs)
    .values({
      id,
      orgId,
      status: "draft",
      questionsStatus: "none",
      title: input.title,
      description: descriptionJson,
      descriptionText,
      companyName: input.companyName ?? null,
      department: input.department ?? null,
      location: input.location ?? null,
      workType: input.workType,
      employmentType: input.employmentType,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: input.salaryCurrency ?? null,
      regenerationCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!result) {
    throw new Error("Failed to create job: no row returned");
  }

  return result;
}
```

**READ:**
```typescript
async findById(id: string): Promise<Job | null> {
  const result = await withDbRetry(() =>
    this.db.select().from(jobs).where(eq(jobs.id, id)).get()
  );
  return result ?? null;
}

async findByIdAndOrg(id: string, orgId: string): Promise<Job | null> {
  const result = await this.db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.orgId, orgId)))
    .get();
  return result ?? null;
}

async findBySlug(slug: string): Promise<Job | null> {
  const result = await this.db
    .select()
    .from(jobs)
    .where(and(eq(jobs.publicSlug, slug), eq(jobs.status, "published")))
    .get();
  return result ?? null;
}
```

**UPDATE:**
```typescript
async updateStatus(id: string, status: string): Promise<Job | null> {
  const now = new Date().toISOString();

  const [result] = await this.db
    .update(jobs)
    .set({ status, updatedAt: now })
    .where(eq(jobs.id, id))
    .returning();

  return result ?? null;
}
```

**LIST with cursor pagination:**
```typescript
async list(
  orgId: string,
  options: { limit?: number; cursor?: string; status?: string }
): Promise<{ data: Job[]; nextCursor: string | null }> {
  const limit = Math.min(options.limit ?? 20, 50);

  let query = this.db
    .select()
    .from(jobs)
    .where(eq(jobs.orgId, orgId))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(limit + 1); // Fetch one extra to detect if there's more

  if (options.status) {
    query = query.where(and(eq(jobs.orgId, orgId), eq(jobs.status, options.status)));
  }

  if (options.cursor) {
    const decoded = JSON.parse(atob(options.cursor));
    query = query.where(
      and(
        eq(jobs.orgId, orgId),
        or(
          lt(jobs.createdAt, decoded.c),
          and(eq(jobs.createdAt, decoded.c), lt(jobs.id, decoded.i))
        )
      )
    );
  }

  const results = await query.all();

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore
    ? btoa(JSON.stringify({ c: data[data.length - 1].createdAt, i: data[data.length - 1].id }))
    : null;

  return { data, nextCursor };
}
```

### 4.3 Methods to Migrate

| Method | Status |
|--------|--------|
| `create` | |
| `findById` | |
| `findByIdAndOrg` | |
| `findBySlug` | |
| `slugExists` | |
| `update` | |
| `updateQuestionsStatus` | |
| `updateQuestionsCompleted` | |
| `updateQuestionsFailed` | |
| `updatePipelineStatus` | |
| `updatePipelineCompleted` | |
| `updatePipelineFailed` | |
| `updatePipeline` | |
| `resetPipeline` | |
| `publish` | |
| `pause` | |
| `resume` | |
| `close` | |
| `delete` | |
| `list` | |
| `countByStatus` | |
| `getCapacityStatus` | |
| ... | |

---

## Phase 5: Applications Repository Migration
**Time: ~1.5 hours**

### 5.1 Similar Approach

```typescript
// src/domain/applications/repository.ts
import { eq, and, desc } from "drizzle-orm";
import type { D1Database } from "@cloudflare/workers-types";
import { customAlphabet } from "nanoid";

import {
  createDb,
  withDbRetry,
  applications,
  answers,
  applicationDrafts,
  type Application,
  type Answer,
  type ApplicationDraft,
} from "../../db";

export class ApplicationRepository {
  private db: ReturnType<typeof createDb>;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // ... methods
}
```

### 5.2 Key Methods to Migrate

| Method | Notes |
|--------|-------|
| `createApplication` | INSERT + batch answers |
| `findById` | SELECT |
| `getDetailById` | JOIN with answers |
| `updateStatus` | UPDATE |
| `updateSignalsStatus` | UPDATE with JSON |
| `listByJob` | Filter + pagination |
| `saveDraft` | UPSERT |
| `resumeDraft` | SELECT |
| `deleteDraft` | DELETE |
| `findAnswersByApplicationId` | SELECT |
| `updateAnswerSignals` | UPDATE with JSON |

---

## Phase 6: Cleanup & Integration
**Time: ~1 hour**

### 6.1 Remove Old Type Definitions

Delete from `src/domain/jobs/schemas.ts`:
- `JobRow` interface → use `Job` from Drizzle
- `JobListItem` interface → derive from `Job`

Delete from `src/domain/applications/schemas.ts`:
- `ApplicationRow` interface → use `Application` from Drizzle
- `AnswerRow` interface → use `Answer` from Drizzle
- `ApplicationDraftRow` interface → use `ApplicationDraft` from Drizzle

### 6.2 Update Imports Throughout Codebase

```typescript
// Before
import type { JobRow } from "./schemas";

// After
import type { Job } from "../../db";
```

### 6.3 Files to Update

- `src/domain/jobs/service.ts`
- `src/domain/applications/service.ts` (if exists)
- `src/routes/v1/jobs/*.ts`
- `src/routes/v1/applications/*.ts`
- `src/routes/public/*.ts`
- `src/queue/consumer.ts`

---

## Phase 7: Testing & Verification
**Time: ~1 hour**

### 7.1 Run Existing Tests

```bash
bun test
```

### 7.2 Manual Verification Checklist

- [ ] Create job (POST /v1/jobs)
- [ ] Update job (PATCH /v1/jobs/:id)
- [ ] Generate questions (POST /v1/jobs/:id/generate)
- [ ] Generate pipeline (POST /v1/jobs/:id/generate-pipeline)
- [ ] Publish job (POST /v1/jobs/:id/publish)
- [ ] Get public job (GET /public/jobs/:slug)
- [ ] Submit application (POST /public/jobs/:slug/apply)
- [ ] Save draft (POST /public/jobs/:slug/apply/draft)
- [ ] Resume draft (GET /public/jobs/:slug/apply/draft/:id)
- [ ] List applications (GET /v1/jobs/:id/applications)
- [ ] Get posture (GET /v1/applications/:id/posture)
- [ ] Update application status (PATCH /v1/applications/:id)

### 7.3 Verify Drizzle Studio

```bash
bun run db:studio
```

- [ ] Can see all tables
- [ ] Can browse data
- [ ] Can run queries

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Query behavior changes | Verify SQL output with `.toSQL()` |
| JSON parsing issues | Keep existing parse logic in service layer |
| D1 compatibility | Drizzle has first-class D1 support |
| Breaking production | Test thoroughly locally first |
| Type mismatches | Drizzle infers types from schema |

---

## Rollback Plan

If issues arise:
1. `git revert` the Drizzle changes
2. Old repositories still work (raw SQL)
3. No database schema changes required (using existing migrations)
4. Zero downtime rollback possible

---

## Key Decisions

### Keep Existing Migrations
- Don't convert to Drizzle migrations
- Existing migrations are proven to work
- Schema file is for type generation only

### JSON Columns
- Store as `text` in schema (SQLite stores JSON as text)
- Parse/stringify in repository methods
- Type safety comes from TypeScript, not DB

### Enums
- Use `text` with enum option for type safety
- CHECK constraints remain in database
- TypeScript enforces valid values at compile time

---

## Deliverables

After completion:
- [x] Type-safe database queries
- [x] Drizzle Studio for local development
- [x] Auto-generated types from schema
- [x] Same API (no breaking changes)
- [x] Preserved retry logic for D1 locks
- [x] All existing functionality working
