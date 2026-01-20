# Phase 7: Recruiter Application Management

**Repository:** `zehire-fe`

---

## Important: Implementation Guidelines

### Follow Existing Coding Standards

Before making any changes, you MUST explore the `zehire-fe` repository to understand and follow the existing coding patterns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MANDATORY: FOLLOW EXISTING PATTERNS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. EXPLORE FIRST                                                          │
│     └── Read existing routes in app/routes/jobs.*                          │
│     └── Check app/services/jobs.server.ts for API patterns                 │
│     └── Look at existing list/detail page patterns                         │
│     └── Check app/components/ui/decision-posture/* components              │
│                                                                             │
│  2. MATCH EXISTING STYLE                                                   │
│     └── Follow the same naming conventions                                 │
│     └── Use the same loader/action patterns                                │
│     └── Match component structure                                          │
│     └── Use existing UI components (cards, badges, etc.)                   │
│                                                                             │
│  3. USE EXISTING COMPONENTS                                                │
│     └── DecisionPostureBadge - for application list                        │
│     └── DecisionPanel - for application detail                             │
│     └── SignalBreakdown, ConflictPanel, etc.                              │
│     └── Existing layout and navigation patterns                            │
│                                                                             │
│  4. CHECK FOR EXISTING PATTERNS                                            │
│     └── How does JobDetailsPage work?                                      │
│     └── How is CandidateSummary implemented?                               │
│     └── How are tabs/filters handled?                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ask Questions First

**If anything is unclear about the existing implementation, ASK before proceeding.**

---

## Context

The backend provides these endpoints for application management:

```
GET   /v1/jobs/:jobId/applications           → List applications for job
GET   /v1/applications/:applicationId        → Get full application
GET   /v1/applications/:applicationId/posture → Get decision posture
PATCH /v1/applications/:applicationId        → Update application status
```

The decision-posture components are already built (Phase 4 & 5):
- `DecisionPostureBadge` - Compact badge for lists
- `DecisionPanel` - Full expandable breakdown
- `SignalBreakdown`, `ConflictPanel`, `ReasonsList`, `SuggestedActions`

---

## Route Structure

```
/jobs/:jobId/applications              → Application list for job
/jobs/:jobId/applications/:appId       → Application detail with posture
```

---

## Your Task

### 1. Add Application API Functions

Add to `app/services/jobs.server.ts` (or create `app/services/applications.server.ts`):

```typescript
// =============================================================================
// APPLICATION TYPES
// =============================================================================

export interface Application {
  id: string
  jobId: string
  candidateName: string
  candidateEmail: string
  status: ApplicationStatus
  createdAt: string
  updatedAt: string
  answers: ApplicationAnswerDetail[]
  signalsStatus: "pending" | "processing" | "completed" | "failed"
  signalEvaluations?: ApplicationPosture | null
}

export type ApplicationStatus =
  | "new"
  | "reviewing"
  | "shortlisted"
  | "interviewing"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn"

export interface ApplicationAnswerDetail {
  id: string
  archetypeId: string
  questionText: string
  answerText: string
}

export interface ApplicationPosture {
  posture: "LOW_REGRET_RISK" | "SOME_UNCERTAINTY" | "HIGH_UNCERTAINTY"
  primaryReason: string
  reasons: Array<{
    code: string
    message: string
    severity: "info" | "warning" | "critical"
  }>
  signals: {
    present: string[]
    partial: string[]
    missing: string[]
    criticalGaps: string[]
  }
  conflicts: Array<{
    signals: [string, string]
    reason: string
  }>
  suggestedActions?: string[]
}

export interface ApplicationListItem {
  id: string
  candidateName: string
  candidateEmail: string
  status: ApplicationStatus
  createdAt: string
  signalsStatus: "pending" | "processing" | "completed" | "failed"
  posture?: "LOW_REGRET_RISK" | "SOME_UNCERTAINTY" | "HIGH_UNCERTAINTY" | null
}

export interface ApplicationsResponse {
  applications: ApplicationListItem[]
  total: number
  page: number
  pageSize: number
}

// =============================================================================
// APPLICATION API FUNCTIONS
// =============================================================================

/**
 * Get applications for a job.
 */
export async function getJobApplications(
  jobId: string,
  options?: {
    status?: ApplicationStatus
    page?: number
    pageSize?: number
  }
): Promise<ApplicationsResponse> {
  const params = new URLSearchParams()
  if (options?.status) params.set("status", options.status)
  if (options?.page) params.set("page", String(options.page))
  if (options?.pageSize) params.set("pageSize", String(options.pageSize))

  const query = params.toString()
  return apiWithAuth(`/v1/jobs/${jobId}/applications${query ? `?${query}` : ""}`)
}

/**
 * Get full application details.
 */
export async function getApplication(applicationId: string): Promise<Application> {
  return apiWithAuth(`/v1/applications/${applicationId}`)
}

/**
 * Get application posture (decision context).
 */
export async function getApplicationPosture(
  applicationId: string
): Promise<ApplicationPosture | { status: "pending" | "processing" | "failed"; message?: string }> {
  return apiWithAuth(`/v1/applications/${applicationId}/posture`)
}

/**
 * Update application status.
 */
export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus
): Promise<{ success: boolean }> {
  return apiWithAuth(`/v1/applications/${applicationId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}
```

---

### 2. Create Application List Page

Create `app/routes/jobs.$jobId.applications.tsx`:

```tsx
import { useLoaderData, Link, useSearchParams } from "react-router"
import type { Route } from "./+types/jobs.$jobId.applications"
import { getJob, getJobApplications, type ApplicationListItem, type ApplicationStatus } from "~/services/jobs.server"
import { DecisionPostureBadge, DecisionPosture, type DecisionContext } from "~/components/ui/decision-posture"
import { cn } from "~/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { ArrowLeft, User, Clock, Filter } from "lucide-react"

// =============================================================================
// LOADER
// =============================================================================

export async function loader({ params, request }: Route.LoaderArgs) {
  const jobId = params.jobId
  if (!jobId) {
    throw new Response("Job not found", { status: 404 })
  }

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get("status") as ApplicationStatus | null
  const page = parseInt(url.searchParams.get("page") ?? "1", 10)

  const [job, applicationsData] = await Promise.all([
    getJob(jobId),
    getJobApplications(jobId, {
      status: statusFilter ?? undefined,
      page,
      pageSize: 20,
    }),
  ])

  return { job, ...applicationsData, statusFilter }
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Applications - ${data?.job?.title ?? "Job"} | Zehire` }]
}

// =============================================================================
// HELPERS
// =============================================================================

const statusLabels: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  interviewing: "Interviewing",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

const statusColors: Record<ApplicationStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewing: "bg-amber-100 text-amber-800",
  shortlisted: "bg-emerald-100 text-emerald-800",
  interviewing: "bg-purple-100 text-purple-800",
  offer: "bg-green-100 text-green-800",
  hired: "bg-green-200 text-green-900",
  rejected: "bg-gray-100 text-gray-600",
  withdrawn: "bg-gray-100 text-gray-500",
}

function createMockContext(posture: string | null | undefined): DecisionContext | null {
  if (!posture) return null
  return {
    posture: posture as DecisionPosture,
    primaryReason: "",
    reasons: [],
    signals: { present: [], partial: [], missing: [], criticalGaps: [] },
    conflicts: [],
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ApplicationsList() {
  const { job, applications, total, statusFilter } = useLoaderData<typeof loader>()
  const [searchParams, setSearchParams] = useSearchParams()

  const handleStatusFilter = (status: ApplicationStatus | null) => {
    if (status) {
      searchParams.set("status", status)
    } else {
      searchParams.delete("status")
    }
    searchParams.delete("page")
    setSearchParams(searchParams)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={`/jobs/${job.id}`}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Applications</h1>
            <p className="text-sm text-gray-600">{job.title}</p>
          </div>
        </div>
        <div className="text-sm text-gray-500">{total} total</div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="size-4 text-gray-500" />
        <button
          onClick={() => handleStatusFilter(null)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            !statusFilter
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          All
        </button>
        {(["new", "reviewing", "shortlisted", "interviewing"] as ApplicationStatus[]).map(
          (status) => (
            <button
              key={status}
              onClick={() => handleStatusFilter(status)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                statusFilter === status
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              {statusLabels[status]}
            </button>
          )
        )}
      </div>

      {/* Application List */}
      {applications.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <User className="size-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No applications yet
          </h3>
          <p className="text-sm text-gray-600">
            {statusFilter
              ? `No ${statusLabels[statusFilter].toLowerCase()} applications`
              : "Applications will appear here when candidates apply"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {applications.map((app) => (
            <ApplicationRow key={app.id} application={app} jobId={job.id} />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// APPLICATION ROW
// =============================================================================

interface ApplicationRowProps {
  application: ApplicationListItem
  jobId: string
}

function ApplicationRow({ application, jobId }: ApplicationRowProps) {
  const context = createMockContext(application.posture)

  return (
    <Link
      to={`/jobs/${jobId}/applications/${application.id}`}
      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
    >
      {/* Avatar Placeholder */}
      <div className="size-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
        <span className="text-sm font-medium text-gray-600">
          {application.candidateName.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">
            {application.candidateName}
          </span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              statusColors[application.status]
            )}
          >
            {statusLabels[application.status]}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
          <span className="truncate">{application.candidateEmail}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDistanceToNow(new Date(application.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Posture Badge */}
      <div className="shrink-0">
        {application.signalsStatus === "completed" && context ? (
          <DecisionPostureBadge context={context} />
        ) : application.signalsStatus === "processing" ? (
          <span className="text-xs text-gray-500">Processing...</span>
        ) : application.signalsStatus === "failed" ? (
          <span className="text-xs text-red-500">Analysis failed</span>
        ) : (
          <span className="text-xs text-gray-400">Pending</span>
        )}
      </div>
    </Link>
  )
}
```

---

### 3. Create Application Detail Page

Create `app/routes/jobs.$jobId.applications.$appId.tsx`:

```tsx
import { useLoaderData, Link, useFetcher } from "react-router"
import type { Route } from "./+types/jobs.$jobId.applications.$appId"
import {
  getJob,
  getApplication,
  getApplicationPosture,
  updateApplicationStatus,
  type Application,
  type ApplicationStatus,
  type ApplicationPosture,
} from "~/services/jobs.server"
import {
  DecisionPanel,
  DecisionPosture,
  type DecisionContext,
} from "~/components/ui/decision-posture"
import { cn } from "~/lib/utils"
import { format } from "date-fns"
import { ArrowLeft, Mail, Calendar, Loader2 } from "lucide-react"

// =============================================================================
// LOADER & ACTION
// =============================================================================

export async function loader({ params }: Route.LoaderArgs) {
  const { jobId, appId } = params
  if (!jobId || !appId) {
    throw new Response("Not found", { status: 404 })
  }

  const [job, application, postureResult] = await Promise.all([
    getJob(jobId),
    getApplication(appId),
    getApplicationPosture(appId).catch(() => null),
  ])

  // Verify application belongs to this job
  if (application.jobId !== jobId) {
    throw new Response("Not found", { status: 404 })
  }

  return { job, application, postureResult }
}

export async function action({ params, request }: Route.ActionArgs) {
  const { appId } = params
  if (!appId) {
    throw new Response("Not found", { status: 404 })
  }

  const formData = await request.formData()
  const status = formData.get("status") as ApplicationStatus

  await updateApplicationStatus(appId, status)

  return { success: true }
}

export function meta({ data }: Route.MetaArgs) {
  return [
    {
      title: `${data?.application?.candidateName ?? "Application"} - ${data?.job?.title ?? "Job"} | Zehire`,
    },
  ]
}

// =============================================================================
// HELPERS
// =============================================================================

const statusOptions: { value: ApplicationStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
]

function postureToContext(posture: ApplicationPosture): DecisionContext {
  return {
    posture: posture.posture as DecisionPosture,
    primaryReason: posture.primaryReason,
    reasons: posture.reasons,
    signals: posture.signals,
    conflicts: posture.conflicts,
    suggestedActions: posture.suggestedActions,
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ApplicationDetail() {
  const { job, application, postureResult } = useLoaderData<typeof loader>()
  const fetcher = useFetcher()

  const isUpdating = fetcher.state !== "idle"

  // Check if posture is ready
  const hasPosture =
    postureResult &&
    "posture" in postureResult &&
    typeof postureResult.posture === "string"

  const context = hasPosture ? postureToContext(postureResult as ApplicationPosture) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to={`/jobs/${job.id}/applications`}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {application.candidateName}
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
              <span className="flex items-center gap-1">
                <Mail className="size-4" />
                {application.candidateEmail}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="size-4" />
                Applied {format(new Date(application.createdAt), "MMM d, yyyy")}
              </span>
            </div>
          </div>
        </div>

        {/* Status Dropdown */}
        <fetcher.Form method="post">
          <div className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={application.status}
              onChange={(e) => fetcher.submit(e.target.form)}
              disabled={isUpdating}
              className={cn(
                "px-3 py-2 border rounded-lg text-sm font-medium",
                "focus:outline-none focus:ring-2 focus:ring-primary/20",
                isUpdating && "opacity-50"
              )}
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {isUpdating && <Loader2 className="size-4 animate-spin text-gray-500" />}
          </div>
        </fetcher.Form>
      </div>

      {/* Decision Posture */}
      <section className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Decision Posture
        </h2>

        {context ? (
          <DecisionPanel context={context} defaultExpanded />
        ) : postureResult && "status" in postureResult ? (
          <div className="text-sm text-gray-600">
            {postureResult.status === "processing" && (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span>Analyzing responses...</span>
              </div>
            )}
            {postureResult.status === "pending" && (
              <span>Analysis pending</span>
            )}
            {postureResult.status === "failed" && (
              <span className="text-red-600">
                Analysis failed: {postureResult.message ?? "Unknown error"}
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Posture not available</div>
        )}
      </section>

      {/* Screening Answers */}
      <section className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Screening Answers
        </h2>

        <div className="space-y-6">
          {application.answers.map((answer, index) => (
            <div key={answer.id} className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">
                {index + 1}. {answer.questionText}
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {answer.answerText}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Activity / Timeline (placeholder for future) */}
      <section className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
        <div className="text-sm text-gray-500">
          Application submitted on{" "}
          {format(new Date(application.createdAt), "MMMM d, yyyy 'at' h:mm a")}
        </div>
      </section>
    </div>
  )
}
```

---

### 4. Wire Up CandidateSummary Component

Update the existing `CandidateSummary` component to make counts clickable.

Find `app/components/jobs/candidate-summary.tsx` (or similar) and update:

```tsx
// Add Link import
import { Link } from "react-router"

// Update the component to accept jobId prop
interface CandidateSummaryProps {
  jobId: string
  counts: {
    applicants: number
    reviewing: number
    interviewing: number
    offer: number
  }
}

// Make each count a clickable link
export function CandidateSummary({ jobId, counts }: CandidateSummaryProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Link
        to={`/jobs/${jobId}/applications?status=new`}
        className="text-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="text-2xl font-bold text-gray-900">{counts.applicants}</div>
        <div className="text-xs text-gray-500">Applicants</div>
      </Link>

      <Link
        to={`/jobs/${jobId}/applications?status=reviewing`}
        className="text-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="text-2xl font-bold text-gray-900">{counts.reviewing}</div>
        <div className="text-xs text-gray-500">Reviewing</div>
      </Link>

      <Link
        to={`/jobs/${jobId}/applications?status=interviewing`}
        className="text-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="text-2xl font-bold text-gray-900">{counts.interviewing}</div>
        <div className="text-xs text-gray-500">Interviewing</div>
      </Link>

      <Link
        to={`/jobs/${jobId}/applications?status=offer`}
        className="text-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="text-2xl font-bold text-gray-900">{counts.offer}</div>
        <div className="text-xs text-gray-500">Offer</div>
      </Link>
    </div>
  )
}
```

---

### 5. Add "View Applications" Button to Job Detail

In the job detail page (`app/routes/jobs.$jobId.tsx` or similar), add a prominent button:

```tsx
<Link
  to={`/jobs/${job.id}/applications`}
  className={cn(
    "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
    "bg-primary text-primary-foreground font-medium text-sm",
    "hover:bg-primary/90 transition-colors"
  )}
>
  <Users className="size-4" />
  View Applications ({applicationCount})
</Link>
```

---

## File Structure After Phase 7

```
app/
├── routes/
│   ├── jobs.$jobId.applications.tsx       # Application list
│   ├── jobs.$jobId.applications.$appId.tsx # Application detail
│   └── jobs.$jobId.tsx                    # Updated with link
├── services/
│   └── jobs.server.ts                     # Updated with application APIs
├── components/
│   ├── jobs/
│   │   └── candidate-summary.tsx          # Updated with links
│   └── ui/
│       └── decision-posture/              # Already exists from Phase 4-5
└── ...
```

---

## URL Examples

| URL | Description |
|-----|-------------|
| `/jobs/abc123/applications` | All applications for job |
| `/jobs/abc123/applications?status=new` | Filter by new |
| `/jobs/abc123/applications?status=shortlisted` | Filter by shortlisted |
| `/jobs/abc123/applications/xyz789` | Application detail |

---

## Important Notes

1. **Authentication Required**
   - All `/jobs/*` routes require authentication
   - Use existing auth middleware/layout

2. **Decision Posture Integration**
   - Use `DecisionPostureBadge` in list view
   - Use `DecisionPanel` with `defaultExpanded` in detail view
   - Handle "processing" and "failed" states gracefully

3. **Status Management**
   - Status updates via form submission (optimistic UI with fetcher)
   - Status change triggers page data refresh

4. **Performance**
   - Pagination for large application lists
   - Parallel API calls in loaders

5. **Empty States**
   - Handle jobs with no applications
   - Handle filtered views with no results

6. **Mobile Responsive**
   - Application list works on mobile
   - Status filter wraps appropriately
   - Detail page stacks sections vertically
