# Phase 6: Candidate Apply Flow

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
│  1. FORM IMPLEMENTATION                                                     │
│     └── Use @conform-to/react and @conform-to/zod                          │
│     └── Define Zod schemas in app/lib/schemas/                             │
│     └── Use useForm hook with getZodConstraint                             │
│     └── Server actions with parseWithZod                                   │
│                                                                             │
│  2. EXPLORE FIRST                                                          │
│     └── Read app/routes/jobs.add.tsx for action pattern                    │
│     └── Read app/components/jobs/job-form.tsx for form patterns            │
│     └── Check app/lib/schemas/job.ts for schema examples                   │
│     └── Check app/services/jobs.server.ts for API patterns                 │
│                                                                             │
│  3. USE EXISTING DEPENDENCIES                                              │
│     └── @conform-to/react, @conform-to/zod, zod                            │
│     └── motion/react for animations                                        │
│     └── lucide-react for icons                                             │
│     └── Existing UI components from app/components/ui/                     │
│                                                                             │
│  4. MATCH EXISTING STYLE                                                   │
│     └── Follow the same naming conventions                                 │
│     └── Use the same export patterns                                       │
│     └── Match indentation, quotes, semicolons preferences                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ask Questions First

**If anything is unclear about the existing implementation, ASK before proceeding.**

---

## Context

The backend provides these public endpoints for candidate applications:

```
GET  /public/jobs/:slug                    → Get public job details
POST /public/jobs/:slug/apply              → Submit application
POST /public/jobs/:slug/apply/draft        → Save progress
GET  /public/jobs/:slug/apply/draft/:id    → Resume saved progress
```

Candidates will access jobs via URLs like:
- `zehire.com/j/senior-software-engineer-abc12` - View job
- `zehire.com/j/senior-software-engineer-abc12/apply` - Apply form

The slug is globally unique across all organizations (includes random suffix).

---

## Route Structure

```
/j/:slug              → Public job detail page
/j/:slug/apply        → Application form (3 questions)
/j/:slug/apply/success → Submission confirmation
```

Query params for resume:
```
/j/:slug/apply?draft=DRAFT_ID&token=RESUME_TOKEN
```

---

## Your Task

### 1. Create Application Schema

Create `app/lib/schemas/application.ts`:

```typescript
import { z } from "zod"

/**
 * Minimum characters per answer.
 * Ensures candidates provide substantive responses.
 */
export const MIN_ANSWER_LENGTH = 50

/**
 * Schema for a single answer.
 */
export const answerSchema = z.object({
  archetypeId: z.string(),
  answerText: z
    .string({ required_error: "Answer is required" })
    .min(MIN_ANSWER_LENGTH, `Answer must be at least ${MIN_ANSWER_LENGTH} characters`),
})

/**
 * Schema for the full application form.
 */
export const applicationSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .min(2, "Name must be at least 2 characters"),
  email: z
    .string({ required_error: "Email is required" })
    .email("Please enter a valid email address"),
  // Answers are validated dynamically based on questions
  // We use a record to map archetypeId -> answerText
  answers: z.record(z.string(), z.string()),
})

/**
 * Schema for saving a draft (answers can be partial).
 */
export const saveDraftSchema = z.object({
  name: z.string().min(1, "Name is required to save progress"),
  email: z.string().email("Please enter a valid email"),
  answers: z.record(z.string(), z.string()), // Partial answers allowed
})

export type ApplicationFormData = z.infer<typeof applicationSchema>
export type SaveDraftFormData = z.infer<typeof saveDraftSchema>
```

---

### 2. Create Public API Service

Create `app/services/public-jobs.server.ts`:

```typescript
/**
 * Public Jobs API Service
 *
 * Handles public (unauthenticated) API calls for candidate-facing features.
 */

import { api } from "~/lib/api"

// =============================================================================
// TYPES
// =============================================================================

export interface PublicJob {
  id: string
  title: string
  company: string
  location: string
  workType: "remote" | "hybrid" | "onsite"
  employmentType: "full_time" | "part_time" | "contract" | "internship"
  description: string
  questions: PublicQuestion[]
  createdAt: string
}

export interface PublicQuestion {
  id: string
  archetypeId: string
  questionText: string
  order: number
}

export interface ApplicationAnswer {
  archetypeId: string
  answerText: string
}

export interface SubmitApplicationInput {
  email: string
  name: string
  answers: ApplicationAnswer[]
  draftId?: string
}

export interface SaveDraftInput {
  email: string
  name: string
  answers: ApplicationAnswer[]
}

export interface DraftResponse {
  draftId: string
  resumeToken: string
  expiresAt: string
  message: string
}

export interface ResumedDraft {
  draftId: string
  candidateEmail: string
  candidateName: string
  answers: ApplicationAnswer[]
  expiresAt: string
  answeredCount: number
  totalQuestions: number
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get public job details by slug.
 * No authentication required.
 */
export async function getPublicJob(slug: string): Promise<PublicJob> {
  return api<PublicJob>(`/public/jobs/${slug}`)
}

/**
 * Submit a job application.
 * All 3 questions must be answered.
 */
export async function submitApplication(
  slug: string,
  input: SubmitApplicationInput
): Promise<{ success: boolean; applicationId: string; message: string }> {
  return api(`/public/jobs/${slug}/apply`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/**
 * Save application progress (Save & Continue).
 * Returns a resumeToken for later retrieval.
 */
export async function saveDraft(
  slug: string,
  input: SaveDraftInput
): Promise<DraftResponse> {
  return api(`/public/jobs/${slug}/apply/draft`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/**
 * Resume a saved application draft.
 * Requires the draftId and resumeToken.
 */
export async function resumeDraft(
  slug: string,
  draftId: string,
  resumeToken: string
): Promise<ResumedDraft> {
  return api(`/public/jobs/${slug}/apply/draft/${draftId}?token=${resumeToken}`)
}
```

---

### 3. Create Public Layout

Create or update `app/routes/_public.tsx`:

```tsx
import { Outlet } from "react-router"

/**
 * Public layout for candidate-facing pages.
 * No authentication required.
 */
export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple header */}
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <a href="/" className="text-xl font-semibold text-gray-900">
            Zehire
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Simple footer */}
      <footer className="border-t bg-white mt-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          Powered by Zehire
        </div>
      </footer>
    </div>
  )
}
```

---

### 4. Update Routes Configuration

Update `app/routes.ts` to add the new public job routes:

```typescript
// app/routes.ts
// Route configuration for React Router v7
// This file defines the route hierarchy and their corresponding files
import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes"

export default [
  // Public routes (no auth required)
  layout("routes/_public.tsx", [
    route("login", "routes/login.tsx"),
    route("auth/callback", "routes/auth.callback.tsx"),
    route("auth/logout", "routes/auth.logout.tsx"),

    // Public job pages (candidate-facing)
    route("j/:slug", "routes/_public.j.$slug.tsx"),
    route("j/:slug/apply", "routes/_public.j.$slug.apply.tsx"),
    route("j/:slug/apply/success", "routes/_public.j.$slug.apply.success.tsx"),
  ]),

  // Protected routes (auth required)
  layout("routes/_protected.tsx", [
    index("routes/home.tsx"),
    route("attention", "routes/attention.tsx"),

    // Jobs routes with nested status tabs
    route("jobs", "routes/jobs.tsx", [
      index("routes/jobs._index.tsx"),
      route("published", "routes/jobs.published.tsx"),
      route("paused", "routes/jobs.paused.tsx"),
      route("closed", "routes/jobs.closed.tsx"),
      route("draft", "routes/jobs.draft.tsx"),
    ]),

    route("jobs/add", "routes/jobs.add.tsx"),
    route("jobs/:id", "routes/jobs.$id.tsx"),
    route("jobs/:id/edit", "routes/jobs.$id.edit.tsx"),
  ]),
] satisfies RouteConfig
```

**Key changes:**
- Added `j/:slug` route for public job detail page
- Added `j/:slug/apply` route for application form
- Added `j/:slug/apply/success` route for success confirmation
- All under `_public.tsx` layout (no auth required)

---

### 5. Create Job Detail Page

Create `app/routes/_public.j.$slug.tsx`:

```tsx
import { useLoaderData, Link } from "react-router"
import type { Route } from "./+types/_public.j.$slug"
import { getPublicJob, type PublicJob } from "~/services/public-jobs.server"
import { MapPin, Building2, Briefcase, Clock } from "lucide-react"
import { cn } from "~/lib/utils"

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug
  if (!slug) {
    throw new Response("Job not found", { status: 404 })
  }

  try {
    const job = await getPublicJob(slug)
    return { job, slug }
  } catch (error) {
    throw new Response("Job not found", { status: 404 })
  }
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.job) {
    return [{ title: "Job Not Found | Zehire" }]
  }
  return [
    { title: `${data.job.title} at ${data.job.company} | Zehire` },
    { name: "description", content: `Apply for ${data.job.title} at ${data.job.company}` },
  ]
}

const workTypeLabels: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
}

const employmentTypeLabels: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
}

export default function PublicJobDetail() {
  const { job, slug } = useLoaderData<typeof loader>()

  return (
    <div className="space-y-8">
      {/* Job Header */}
      <div className="bg-white rounded-lg border p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{job.title}</h1>

        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-6">
          <div className="flex items-center gap-1.5">
            <Building2 className="size-4" />
            <span>{job.company}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4" />
            <span>{job.location}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Briefcase className="size-4" />
            <span>{workTypeLabels[job.workType] ?? job.workType}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-4" />
            <span>{employmentTypeLabels[job.employmentType] ?? job.employmentType}</span>
          </div>
        </div>

        <Link
          to={`/j/${slug}/apply`}
          className={cn(
            "inline-flex items-center justify-center",
            "px-6 py-3 rounded-lg",
            "bg-primary text-primary-foreground",
            "font-medium text-sm",
            "hover:bg-primary/90 transition-colors"
          )}
        >
          Apply for this position
        </Link>
      </div>

      {/* Job Description */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">About this role</h2>
        <div
          className="prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: job.description }}
        />
      </div>

      {/* Application Preview */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">
          Application Process
        </h2>
        <p className="text-blue-800 text-sm mb-4">
          You'll be asked to answer {job.questions.length} screening questions.
          This typically takes about 10 minutes. You can save your progress and
          continue later if needed.
        </p>
        <Link
          to={`/j/${slug}/apply`}
          className="text-blue-700 font-medium text-sm hover:underline"
        >
          Start application →
        </Link>
      </div>
    </div>
  )
}
```

---

### 6. Create Application Form Page

Create `app/routes/_public.j.$slug.apply.tsx`:

```tsx
import { useRef, useEffect, useState } from "react"
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSearchParams,
  Form,
  redirect,
} from "react-router"
import type { Route } from "./+types/_public.j.$slug.apply"
import { useForm, getInputProps, getTextareaProps, getFormProps } from "@conform-to/react"
import { parseWithZod, getZodConstraint } from "@conform-to/zod"
import { z } from "zod"
import {
  getPublicJob,
  saveDraft,
  submitApplication,
  resumeDraft,
  type PublicJob,
  type ApplicationAnswer,
} from "~/services/public-jobs.server"
import { MIN_ANSWER_LENGTH } from "~/lib/schemas/application"
import { cn } from "~/lib/utils"
import { Loader2, Save, Send, AlertCircle, CheckCircle2 } from "lucide-react"

// =============================================================================
// SCHEMA (Dynamic based on questions)
// =============================================================================

function createApplicationSchema(questionCount: number) {
  const answersShape: Record<string, z.ZodString> = {}
  for (let i = 0; i < questionCount; i++) {
    answersShape[`answer_${i}`] = z
      .string({ required_error: "Answer is required" })
      .min(MIN_ANSWER_LENGTH, `Answer must be at least ${MIN_ANSWER_LENGTH} characters`)
  }

  return z.object({
    name: z
      .string({ required_error: "Name is required" })
      .min(2, "Name must be at least 2 characters"),
    email: z
      .string({ required_error: "Email is required" })
      .email("Please enter a valid email address"),
    ...answersShape,
  })
}

// =============================================================================
// LOADER
// =============================================================================

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug
  if (!slug) {
    throw new Response("Job not found", { status: 404 })
  }

  const url = new URL(request.url)
  const draftId = url.searchParams.get("draft")
  const token = url.searchParams.get("token")

  try {
    const job = await getPublicJob(slug)

    // If resuming a draft, fetch it
    let draft = null
    if (draftId && token) {
      try {
        draft = await resumeDraft(slug, draftId, token)
      } catch (e) {
        // Draft expired or invalid - continue with fresh form
        console.warn("Failed to resume draft:", e)
      }
    }

    return { job, slug, draft }
  } catch (error) {
    throw new Response("Job not found", { status: 404 })
  }
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.job) {
    return [{ title: "Apply | Zehire" }]
  }
  return [{ title: `Apply - ${data.job.title} | Zehire` }]
}

// =============================================================================
// ACTION
// =============================================================================

export async function action({ params, request }: Route.ActionArgs) {
  const slug = params.slug
  if (!slug) {
    throw new Response("Job not found", { status: 404 })
  }

  const formData = await request.formData()
  const intent = formData.get("_intent") as string

  // Get job to know question count
  const job = await getPublicJob(slug)
  const schema = createApplicationSchema(job.questions.length)

  // Handle save draft
  if (intent === "save-draft") {
    const name = formData.get("name") as string
    const email = formData.get("email") as string

    if (!name || !email) {
      return {
        status: "error",
        error: "Name and email are required to save progress",
      }
    }

    // Collect answers (can be partial)
    const answers: ApplicationAnswer[] = job.questions.map((q, i) => ({
      archetypeId: q.archetypeId,
      answerText: (formData.get(`answer_${i}`) as string) ?? "",
    }))

    try {
      const result = await saveDraft(slug, { name, email, answers })
      return {
        status: "draft-saved",
        draftId: result.draftId,
        resumeToken: result.resumeToken,
        expiresAt: result.expiresAt,
      }
    } catch (e: any) {
      return {
        status: "error",
        error: e.message ?? "Failed to save draft",
      }
    }
  }

  // Handle submit
  const submission = parseWithZod(formData, { schema })

  if (submission.status !== "success") {
    return submission.reply()
  }

  const { value } = submission

  // Build answers array
  const answers: ApplicationAnswer[] = job.questions.map((q, i) => ({
    archetypeId: q.archetypeId,
    answerText: value[`answer_${i}`] as string,
  }))

  const draftId = formData.get("draftId") as string | undefined

  try {
    await submitApplication(slug, {
      name: value.name,
      email: value.email,
      answers,
      draftId: draftId || undefined,
    })

    return redirect(`/j/${slug}/apply/success`)
  } catch (e: any) {
    return submission.reply({
      formErrors: [e.message ?? "Failed to submit application. Please try again."],
    })
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ApplicationForm() {
  const { job, slug, draft } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const [searchParams, setSearchParams] = useSearchParams()

  const isSubmitting = navigation.state === "submitting"
  const formRef = useRef<HTMLFormElement>(null)

  // Track draft state
  const [currentDraftId, setCurrentDraftId] = useState(draft?.draftId ?? null)
  const [draftSaved, setDraftSaved] = useState(false)

  // Create schema for this job's question count
  const schema = createApplicationSchema(job.questions.length)

  // Build default values from draft
  const defaultValues = (() => {
    const values: Record<string, string> = {
      name: draft?.candidateName ?? "",
      email: draft?.candidateEmail ?? "",
    }
    if (draft?.answers) {
      job.questions.forEach((q, i) => {
        const draftAnswer = draft.answers.find((a) => a.archetypeId === q.archetypeId)
        values[`answer_${i}`] = draftAnswer?.answerText ?? ""
      })
    }
    return values
  })()

  // Initialize form with Conform
  const [form, fields] = useForm({
    id: `apply-${slug}`,
    constraint: getZodConstraint(schema),
    defaultValue: defaultValues,
    lastResult: actionData && "status" in actionData ? undefined : actionData,
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  })

  // Handle draft saved response
  useEffect(() => {
    if (actionData && "status" in actionData && actionData.status === "draft-saved") {
      setCurrentDraftId(actionData.draftId)
      setDraftSaved(true)

      // Store in localStorage
      localStorage.setItem(
        `zehire-draft-${slug}`,
        JSON.stringify({
          draftId: actionData.draftId,
          resumeToken: actionData.resumeToken,
          expiresAt: actionData.expiresAt,
        })
      )

      // Update URL
      const newParams = new URLSearchParams(searchParams)
      newParams.set("draft", actionData.draftId)
      newParams.set("token", actionData.resumeToken)
      setSearchParams(newParams, { replace: true })

      // Reset saved state after a moment
      setTimeout(() => setDraftSaved(false), 3000)
    }
  }, [actionData, slug, searchParams, setSearchParams])

  // Check for form-level errors
  const formErrors =
    actionData && "status" in actionData && actionData.status === "error"
      ? [actionData.error]
      : form.errors

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Apply for {job.title}</h1>
        <p className="text-gray-600 mt-1">{job.company}</p>
      </div>

      {/* Error Banner */}
      {formErrors && formErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">{formErrors[0]}</div>
        </div>
      )}

      {/* Draft Restored Banner */}
      {draft && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          Your previous progress has been restored. Continue where you left off.
        </div>
      )}

      {/* Draft Saved Banner */}
      {draftSaved && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
          <div className="text-sm text-emerald-800">
            Progress saved! You can close this page and return later.
          </div>
        </div>
      )}

      <Form ref={formRef} method="post" {...getFormProps(form)} className="space-y-6">
        {/* Hidden draft ID */}
        {currentDraftId && (
          <input type="hidden" name="draftId" value={currentDraftId} />
        )}

        {/* Contact Info */}
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={fields.name.id}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Full Name *
              </label>
              <input
                {...getInputProps(fields.name, { type: "text" })}
                placeholder="Jane Doe"
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  fields.name.errors && "border-red-300"
                )}
              />
              {fields.name.errors && (
                <p className="mt-1 text-xs text-red-600">{fields.name.errors[0]}</p>
              )}
            </div>

            <div>
              <label
                htmlFor={fields.email.id}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email Address *
              </label>
              <input
                {...getInputProps(fields.email, { type: "email" })}
                placeholder="jane@example.com"
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  fields.email.errors && "border-red-300"
                )}
              />
              {fields.email.errors && (
                <p className="mt-1 text-xs text-red-600">{fields.email.errors[0]}</p>
              )}
            </div>
          </div>
        </div>

        {/* Screening Questions */}
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Screening Questions</h2>
            <p className="text-sm text-gray-600 mt-1">
              Please answer all {job.questions.length} questions. Each answer should be
              at least {MIN_ANSWER_LENGTH} characters.
            </p>
          </div>

          {job.questions.map((question, index) => {
            const fieldName = `answer_${index}` as keyof typeof fields
            const field = fields[fieldName]
            const charCount = (field?.value as string)?.length ?? 0
            const isValid = charCount >= MIN_ANSWER_LENGTH

            return (
              <div key={question.id} className="space-y-2">
                <label
                  htmlFor={field?.id}
                  className="block text-sm font-medium text-gray-900"
                >
                  {index + 1}. {question.questionText} *
                </label>
                <textarea
                  {...getTextareaProps(field)}
                  rows={6}
                  placeholder="Share a specific example from your experience..."
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg text-sm resize-y",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                    field?.errors && "border-red-300",
                    !isValid && charCount > 0 && !field?.errors && "border-amber-300"
                  )}
                />
                <div className="flex justify-between text-xs">
                  {field?.errors ? (
                    <span className="text-red-600">{field.errors[0]}</span>
                  ) : (
                    <span
                      className={cn(
                        "text-gray-500",
                        !isValid && charCount > 0 && "text-amber-600"
                      )}
                    >
                      {charCount < MIN_ANSWER_LENGTH
                        ? `${MIN_ANSWER_LENGTH - charCount} more characters needed`
                        : "Minimum met"}
                    </span>
                  )}
                  <span className="text-gray-400">{charCount} characters</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          {/* Save Draft */}
          <button
            type="submit"
            name="_intent"
            value="save-draft"
            disabled={isSubmitting}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              "border border-gray-300 text-gray-700",
              "hover:bg-gray-50 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isSubmitting && navigation.formData?.get("_intent") === "save-draft" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save & Continue Later
          </button>

          {/* Submit */}
          <button
            type="submit"
            name="_intent"
            value="submit"
            disabled={isSubmitting}
            className={cn(
              "inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isSubmitting && navigation.formData?.get("_intent") === "submit" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Submit Application
          </button>
        </div>
      </Form>
    </div>
  )
}
```

---

### 7. Create Success Page

Create `app/routes/_public.j.$slug.apply.success.tsx`:

```tsx
import { Link, useParams } from "react-router"
import { CheckCircle2 } from "lucide-react"

export function meta() {
  return [{ title: "Application Submitted | Zehire" }]
}

export default function ApplicationSuccess() {
  const { slug } = useParams()

  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center size-16 rounded-full bg-emerald-100 mb-6">
        <CheckCircle2 className="size-8 text-emerald-600" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-3">
        Application Submitted!
      </h1>

      <p className="text-gray-600 max-w-md mx-auto mb-8">
        Thank you for your application. The hiring team will review your
        responses and get back to you soon. You should receive a confirmation
        email shortly.
      </p>

      <div className="space-y-3">
        <Link
          to={`/j/${slug}`}
          className="block text-sm text-primary hover:underline"
        >
          ← Back to job posting
        </Link>
      </div>
    </div>
  )
}
```

---

## File Structure After Phase 6

```
app/
├── lib/
│   └── schemas/
│       └── application.ts              # Zod schemas for application
├── routes/
│   ├── _public.tsx                     # Public layout (no auth)
│   ├── _public.j.$slug.tsx             # Job detail page
│   ├── _public.j.$slug.apply.tsx       # Application form
│   └── _public.j.$slug.apply.success.tsx  # Success page
├── services/
│   └── public-jobs.server.ts           # Public API service
└── ...
```

---

## Key Patterns Used

### 1. Conform + Zod Integration

```typescript
// Create schema dynamically based on question count
const schema = createApplicationSchema(job.questions.length)

// Initialize form with Conform
const [form, fields] = useForm({
  constraint: getZodConstraint(schema),
  defaultValue: defaultValues,
  lastResult: actionData,
  shouldValidate: "onBlur",
  shouldRevalidate: "onInput",
})

// Use getInputProps for inputs
<input {...getInputProps(fields.name, { type: "text" })} />
<textarea {...getTextareaProps(fields[`answer_${i}`])} />
```

### 2. Multiple Submit Intents

```typescript
// In action
const intent = formData.get("_intent") as string

if (intent === "save-draft") {
  // Handle save draft
} else {
  // Handle submit
}

// In form
<button name="_intent" value="save-draft">Save</button>
<button name="_intent" value="submit">Submit</button>
```

### 3. Server-Side Validation

```typescript
const submission = parseWithZod(formData, { schema })

if (submission.status !== "success") {
  return submission.reply()
}

// On error
return submission.reply({
  formErrors: [error],
})

// On success
return redirect(`/j/${slug}/apply/success`)
```

### 4. Error Display

```typescript
// Form-level errors
{form.errors && <div>{form.errors[0]}</div>}

// Field-level errors
{fields.name.errors && <p>{fields.name.errors[0]}</p>}
```

---

## Important Notes

1. **No authentication required** - All `/j/*` routes are public

2. **Dynamic schema** - Schema is created based on question count

3. **Dual submit actions** - `_intent` field distinguishes save vs submit

4. **Draft persistence** - localStorage + URL params for bookmarking

5. **Progressive enhancement** - Form works without JS, enhanced with JS

6. **Validation timing** - `onBlur` initially, `onInput` after first validation

7. **Character count** - Real-time feedback on answer length
