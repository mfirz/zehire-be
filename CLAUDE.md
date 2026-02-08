# Claude Code Project Context

This file is automatically read by Claude Code at the start of each session.

## Project Overview

Zehire is a hiring platform backend built on Cloudflare Workers with:
- **Hono** - Web framework
- **D1** - SQLite database
- **Drizzle ORM** - Type-safe database queries
- **R2** - Object storage (CVs, assessment files)
- **Queues** - Background job processing (questions, pipeline, signals, CV, assessments)
- **Cron Triggers** - Hourly interview/feedback reminders and assessment expiration
- **Workers AI** - Free LLM inference (also supports Anthropic and Groq)

## Directory Structure

```
src/
├── app.ts                  # Hono app with route mounting
├── index.ts                # Worker entry point (fetch, queue, scheduled)
├── config/cache.ts         # Cache configuration (version-based keys, TTLs)
├── db/
│   ├── client.ts           # createDb() helper
│   ├── index.ts            # Re-exports db utilities
│   ├── utils.ts            # Database utilities
│   └── schema/             # Drizzle schema (sqliteTable, text IDs via nanoid)
│       ├── applications.ts # Applications, answers, drafts, notes, events
│       ├── assessments.ts  # Definitions, parts, job links, candidate assessments, files
│       ├── billing.ts      # Billing events, pricing history, periods
│       ├── custom-questions.ts # Custom questions, answers, CV data tables
│       ├── interviews.ts   # Interviewers, availability, stages, scheduled interviews
│       ├── jobs.ts, orgs.ts, users.ts, rate-limits.ts
│       └── index.ts        # Re-exports all tables and types
├── domain/                 # Business logic (services + repositories)
│   ├── applications/       # Application management, CV download
│   ├── assessments/        # Assessment definitions, candidate lifecycle, file uploads
│   ├── availability/       # Interviewer availability windows, blocked dates, slot calculation
│   ├── billing/            # Billing calculator, pricing, usage service
│   ├── calendar/           # Calendar providers (Google, Outlook), free/busy
│   ├── custom-questions/   # Custom screening questions, signal suggestion
│   ├── cv/                 # CV extraction (PDF/DOCX), summarization, contradiction detection
│   ├── interview-stages/   # Interview stage config
│   ├── interviewers/       # Interviewer CRUD, magic tokens
│   ├── jobs/               # Job CRUD, archetypes, question generation, pipeline advisor
│   │   └── archetypes/     # Role templates for LLM inference (registry, inference, rendering)
│   ├── pipeline/           # Pipeline recommendation (LLM-powered)
│   ├── scheduling/         # Interview scheduling, tokens, feedback
│   ├── signals/            # Signal extraction, aggregation, posture computation
│   └── video/              # Video call providers (Zoom, calendar-native)
├── lib/
│   ├── crypto/             # Token encryption (AES-256-GCM), OAuth state signing (HMAC)
│   ├── llm/                # LLM abstraction (Workers AI, Anthropic, Groq)
│   └── tiptap/             # Rich text validation, extraction, HTML rendering
├── middleware/
│   ├── auth.ts             # jwtAuth + apiKeyAuth
│   ├── assess-auth.ts      # Assessment token auth
│   └── rate-limit.ts       # D1-based rate limiting
├── modules/
│   ├── auth/               # Auth service, session (JWT), token, SSO (Google)
│   │   └── sso/providers/  # SSO provider implementations
│   └── email/              # Email gateway (AWS SES)
│       └── providers/ses/  # SES client implementation
├── queue/consumer.ts       # Queue message handler (retry + exponential backoff)
├── routes/
│   ├── assess/             # Candidate assessment portal (/assess/:token)
│   ├── helpers/            # Response formatters (assessment-response.ts)
│   ├── internal/health/    # Health check (/internal/health)
│   ├── interviewer/        # Interviewer self-service (/i/:token)
│   ├── oauth/              # OAuth callbacks (/oauth/callback)
│   ├── public/jobs/        # Public job pages + apply (/public/jobs/:slug)
│   ├── schedule/           # Candidate self-scheduling (/schedule/:token)
│   └── v1/                 # Authenticated API
│       ├── root/           # GET /v1
│       ├── jobs/           # Full job lifecycle, pipeline, custom questions, assessments
│       ├── applications/   # Application details, CV, notes, timeline, scheduling
│       ├── assessments/    # Assessment library, file downloads
│       ├── billing/        # Usage, preview, invoices
│       ├── interviewers/   # Interviewer CRUD
│       ├── organizations/  # Org settings, video provider management
│       ├── candidates/     # Cross-application lookup
│       ├── custom-questions/ # LLM signal suggestion
│       └── capacity.ts     # Org capacity endpoint
├── scheduled/              # Cron handlers (reminders, assessment expiration)
└── types/
    ├── bindings.ts         # Env interface, queue types, status enums
    └── index.ts            # Shared type exports
migrations/                 # Sequential SQL migrations (0000-0010)
seeds/seed_dev.sql          # Development seed data
test/                       # Assessment integration tests (vitest + cloudflare pool)
│   ├── assessment/         # Ordered test suites (1-library through 5-resend-invite)
│   └── helpers/            # Test seed data, time utilities
tests/edge-cases/           # Edge-case tests
    ├── auth/               # Auth service, routes, middleware, session, token, rate-limit, OAuth state
    └── assessments-*.ts    # Assessment API and status validation edge cases
```

## API Routes

### Auth (`/auth`) -- Stable contract, not versioned
- `POST /login` -- Magic link login (rate-limited: 3/60s per email)
- `GET /callback?token=` -- Complete magic link auth, set session cookie
- `POST /logout` -- Clear session
- `GET /me` -- Get current user (supports Authorization header or cookie)
- `GET /sso/:provider` -- Initiate SSO (Google)
- `GET /sso/:provider/callback` -- SSO callback
- `GET /calendar/:provider/callback` -- Calendar OAuth callback
- `GET /video/:provider/callback` -- Video provider OAuth callback

### Authenticated API (`/v1`) -- JWT required via `jwtAuth` middleware
**Jobs** (`/v1/jobs`)
- CRUD: `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
- Lifecycle: `POST /:id/generate`, `POST /:id/generate-pipeline`, `POST /:id/publish`, `POST /:id/pause`, `POST /:id/resume`, `POST /:id/close`
- Pipeline: `GET /:id/pipeline`, `PATCH /:id/pipeline`, `POST /:id/pipeline/reset`
- Applications: `GET /:jobId/applications` (filterable by status, signals, posture)
- Custom Questions: CRUD at `/:jobId/custom-questions[/:qid]`, `POST /:jobId/custom-questions/reorder`
- Assessment: `GET/PUT/DELETE /:jobId/assessment`
- Candidate Assessment: `POST /:jobId/candidates/:appId/assessment/invite`, `GET .../assessment`, `POST .../resend-invite`, `POST .../evaluate`, `POST .../cancel`

**Applications** (`/v1/applications`)
- `GET /:id` -- Full detail with signals, custom answers, navigation
- `PATCH /:id` -- Update status/triage
- `GET /:id/posture` -- Decision posture with signals and conflicts
- `GET /:id/cv` -- Download CV file from R2
- `GET /:id/cv/summary` -- Structured CV data (work, education, skills)
- `POST /:id/cv/reprocess` -- Re-extract CV via LLM
- Notes: `GET/POST /:id/notes`, `DELETE /:id/notes/:noteId`
- `GET /:id/timeline` -- Activity events
- `POST /:id/schedule-invite` -- Send scheduling invite email

**Assessments** (`/v1/assessments`)
- Library: `GET /`, `POST /`, `GET /:id`, `PATCH /:id`
- Files: `GET /files/:fileId` -- Download assessment file from R2

**Other v1**
- `GET /v1` -- API root
- `GET /v1/candidates/lookup?email=` -- Cross-application lookup
- `GET /v1/capacity` -- Org capacity (active jobs)
- `POST /v1/custom-questions/suggest-signals` -- LLM signal suggestion
- `GET/PATCH /v1/organizations/settings`, video connect/status/disconnect
- Billing: `GET /`, `/preview`, `/:year/:month`, `/:year/:month/invoice`
- Interviewers: CRUD + `POST /:id/resend`

### Public (`/public`) -- No auth
- `GET /jobs/:slug` -- Public job page (cached)
- `POST /jobs/:slug/apply` -- Submit application (multipart with optional CV)
- `POST /jobs/:slug/apply/draft` -- Save draft
- `GET /jobs/:slug/apply/draft/:draftId` -- Resume draft

### Interviewer Self-Service (`/i/:token`) -- Magic token auth
- `GET /` -- Dashboard (upcoming interviews, pending feedback)
- `GET/PUT /availability`, `POST /block-date`, `DELETE /block-date/:id`, `POST /unavailable-today`
- `GET /interviews`, `POST /interviews/:id/feedback`
- `GET /calendar-status`, `GET /connect/:provider`, `POST /disconnect`

### Candidate Scheduling (`/schedule/:token`) -- Scheduling token auth
- `GET /` -- Page data, `GET /slots` -- Available time slots
- `POST /book` -- Book interview, `GET /confirmation`
- `POST /reschedule`, `POST /cancel`

### Candidate Assessment (`/assess/:token`) -- Assessment token auth
- `GET /` -- Portal view, `POST /schedule`, `POST /reschedule`, `POST /start`
- `POST /parts/:partId/files` -- Upload, `DELETE /parts/:partId/files/:fileId`
- `POST /submit`

### Other
- `GET /internal/health` -- Health check
- `GET /oauth/callback` -- Generic OAuth callback

## Queue Message Types

| Type | Description |
|------|-------------|
| `questions` (default) | Generate interview questions via LLM |
| `pipeline` | Generate hiring pipeline recommendation |
| `evaluate_application` | Extract signals from application answers |
| `process_cv` | Extract and summarize CV content |
| `cancel_assessments` | Cancel active assessments when job closes |

## Key Patterns

- Schema: `sqliteTable` with text IDs (nanoid), re-exported from `src/db/schema/index.ts`
- Auth errors: `{ error: { code, message } }` format
- Services: return `{ success: true; data } | { success: false; error: { code, message } }`
- Middleware: `jwtAuth` for `/v1/*`; inline magic token for `/i/:token` and `/schedule/:token`; `assessAuth` for `/assess/:token`
- Route files export Hono instances; `src/app.ts` mounts them
- Validation: Zod schemas with `@hono/zod-validator`
- Email: AWS SES via custom gateway in `src/modules/email/`
- Env bindings: `src/types/bindings.ts` -- `Env`, `AuthVariables`, queue message unions
- `c.executionCtx.waitUntil()` for fire-and-forget cleanup (wrap in try/catch for tests)
- LLM providers: Workers AI (free, default), Anthropic, Groq -- selected via `LLM_PROVIDER` env var
- OAuth state: HMAC-signed to prevent CSRF (`src/lib/crypto/oauth-state.ts`)
- OAuth tokens: AES-256-GCM encrypted at rest (`src/lib/crypto/tokens.ts`)
- Assessment snapshots: Definitions frozen at job publish time for immutability
- Queue consumer: Built-in retry with exponential backoff (max 3 retries)
- Cron (hourly): Interview reminders (24h before), feedback reminders (2h after), assessment expirations

## D1 Database Optimization Guidelines

When writing D1 queries, follow these best practices to minimize costs and latency:

### 1. Batch Requests
```typescript
// Bad: Sequential queries (200ms+ each)
await db.insert(table1).values(data1);
await db.insert(table2).values(data2);

// Good: Batch operations
await db.batch([
  db.insert(table1).values(data1),
  db.insert(table2).values(data2),
]);
```

### 2. Exclude IDs from Updates
```typescript
// Bad: ID in SET triggers FK checks
await db.update(users).set({ id, name, email }).where(eq(users.id, id));

// Good: Exclude ID from SET
await db.update(users).set({ name, email }).where(eq(users.id, id));
```

### 3. Avoid COUNT(*) for Pagination
```typescript
// Bad: Full table scan
const total = await db.select({ count: count() }).from(table);

// Good: Cursor-based pagination, skip total counts
const items = await db.select().from(table)
  .where(gt(table.id, cursor))
  .limit(limit + 1); // +1 to detect hasMore
```

### 4. Split Complex Joins
```typescript
// Bad: Multiple LEFT JOINs cause Cartesian explosion
const result = await db.select()
  .from(jobs)
  .leftJoin(applications, ...)
  .leftJoin(answers, ...);

// Good: Separate queries + app-level transformation
const jobs = await db.select().from(jobs).where(...);
const applications = await db.select().from(applications).where(...);
// Transform in application code
```

### 5. Bulk Inserts (Max 100 Parameters)
```typescript
// Bad: Individual inserts
for (const item of items) {
  await db.insert(table).values(item);
}

// Good: Chunked bulk insert
const CHUNK_SIZE = 100;
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
  const chunk = items.slice(i, i + CHUNK_SIZE);
  await db.insert(table).values(chunk);
}
```

### 6. Use Indexed Lookups
```typescript
// Good: Fast indexed query for cache validation
async isSlugPublished(slug: string): Promise<boolean> {
  const result = await this.db
    .select({ id: jobs.id })  // Minimal columns
    .from(jobs)
    .where(and(
      eq(jobs.publicSlug, slug),  // Indexed
      eq(jobs.status, "published") // Indexed
    ))
    .get();  // Single row
  return result !== undefined;
}
```

### Cost Reference
- D1 Reads: $0.001 per 1M rows read
- D1 Writes: $1.00 per 1M rows written
- 100M requests with 1 row each = $0.10

## Caching Strategy

### Public Job Cache (D1 Validation)
- Cache job data with Workers Cache API
- On cache hit, validate job status via fast D1 indexed query
- This ensures paused/closed jobs return 404 across all PoPs
- Cost: ~$0.10 per 100M requests (negligible)

### Jobs List Cache (Version-Based)
- Cache key includes `jobsListVersion` from database
- On data change, increment version -> automatic cache invalidation
- Works globally because version is stored in D1 (replicated)
