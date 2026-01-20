# Signal Extraction & Decision Posture Implementation

This folder contains prompts for implementing the signal extraction and decision posture system that bridges the archetype-based question generation with the hiring manager's decision UI.

## Design Philosophy: All Required + Smart Design

This implementation follows a carefully designed approach that balances **signal quality** with **candidate experience**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ALL REQUIRED + SMART DESIGN                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. LIMIT TO 3 QUESTIONS (Hard Cap)                                        │
│     └── 3 questions = ~10 min to complete                                  │
│     └── Respects candidate time                                            │
│     └── Critical signals always covered                                    │
│                                                                             │
│  2. ALL 3 REQUIRED                                                         │
│     └── Maintains signal integrity                                         │
│     └── Self-selects serious candidates                                    │
│     └── Clean data for posture computation                                 │
│                                                                             │
│  3. SAVE & CONTINUE LATER                                                  │
│     └── Candidate can return within 7 days                                 │
│     └── Handles interruptions                                              │
│     └── Reduces abandonment                                                │
│                                                                             │
│  4. CRITICAL SIGNALS GUARANTEED                                            │
│     └── Archetypes for critical signals always selected                    │
│     └── decision_under_uncertainty, accountability, learning_from_failure  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Expected Metrics:
├── 80% application completion rate (with save & continue)
├── 95% signal quality (all 3 questions answered)
└── ~10 min candidate time investment
```

### Why Not Partial Answers?

| Approach | Completion | Signal Quality | Posture Reliability |
|----------|------------|----------------|---------------------|
| All Required (3 Qs) + Save | 80% | 95% | High |
| Partial Answers | 85% | 40% | Low |

Partial answers undermine Zehire's core value proposition: **better hiring decisions through signal analysis**.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CURRENT STATE (Implemented)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Job Posting → JobContext → Archetypes → Rendered Questions                 │
│  (LLM infers)   (rules)     (LLM renders)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 0 (Question Generation Constraints)               │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Hard cap at 3 questions                                                  │
│  • Critical archetypes always included                                      │
│  • Ensures posture can reach LOW_REGRET_RISK                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 0A-0B (Backend - Application APIs)                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 0A: Public apply (all 3 answers required, save & continue)          │
│  Phase 0B: Application management APIs (recruiter views/manages)            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │  Candidate Answers    │
                        │  (all 3 in database)  │
                        └───────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASES 1-3 (Backend - Signal Pipeline)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Extract signals from each answer (LLM)                            │
│  Phase 2: Aggregate signals, detect conflicts (rules)                       │
│  Phase 3: Compute decision posture (LOW/SOME/HIGH)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASES 4-5 (Frontend - UI)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Update DecisionContext types                                      │
│  Phase 5: Build transparency UI (signal breakdown, conflicts, etc.)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phases

| Phase | Repository | Description | Status |
|-------|------------|-------------|--------|
| [Phase 0](./phase-0-question-generation.md) | zehire-be | Question generation constraints (3 max, critical signals) | ✅ Done |
| [Phase 0A](./phase-0a-public-apply.md) | zehire-be | Public apply endpoint with save & continue | ✅ Done |
| [Phase 0B](./phase-0b-application-management.md) | zehire-be | Application management APIs for recruiters | ✅ Done |
| [Phase 1](./phase-1-signal-extraction.md) | zehire-be | Signal extraction service (LLM analyzes answers) | ✅ Done |
| [Phase 2](./phase-2-aggregation-rules.md) | zehire-be | Aggregation & conflict detection rules | ✅ Done |
| [Phase 3](./phase-3-posture-computation.md) | zehire-be | Posture computation (LOW/SOME/HIGH) | ✅ Done |
| [Phase 4](./phase-4-frontend-context.md) | zehire-fe | Update frontend DecisionContext types | ✅ Done |
| [Phase 5](./phase-5-transparency-ui.md) | zehire-fe | Build transparency UI components | ✅ Done |
| [Phase 6](./phase-6-candidate-apply-flow.md) | zehire-fe | Candidate apply flow (`/j/:slug`) | ⏳ Pending |
| [Phase 7](./phase-7-recruiter-application-management.md) | zehire-fe | Recruiter application list & detail views | ⏳ Pending |
| [Phase 8](./phase-8-custom-questions-cv-summary.md) | zehire-be + fe | Custom questions + CV summarization | ⏳ Pending |

---

## Infrastructure Improvements

| Plan | Repository | Description | Status |
|------|------------|-------------|--------|
| [Drizzle Adoption](./drizzle-adoption.md) | zehire-be | Migrate to Drizzle ORM for type-safe queries | ⏳ Pending |

---

## How to Use

Each phase prompt is designed to be copy-pasted directly into Claude Code for the respective repository.

1. Open the repository in Claude Code
2. Copy the entire content of the phase markdown file
3. Paste as a new prompt
4. Claude will implement that phase

---

## Dependencies

```
Phase 0 ──► Phase 0A ──► Phase 0B ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
   │           │            │            │           │           │           │           │
   ▼           ▼            ▼            ▼           ▼           ▼           ▼           ▼
3Q Cap     Public       Application   Signal     Aggregate   Posture    Frontend   Transparency
Critical   Apply +      Management   Extraction   Signals   Computation  Types        UI
Signals    Save/Resume    APIs
                                                                            │
                                                                            ▼
                                                              ┌─────────────┴─────────────┐
                                                              │                           │
                                                              ▼                           ▼
                                                          Phase 6                     Phase 7
                                                       Candidate Apply          Recruiter Application
                                                         /j/:slug                List & Detail
```

| Phase | Depends On | Creates |
|-------|------------|---------|
| **Phase 0** | Existing archetype system | 3-question cap, critical signal coverage |
| **Phase 0A** | Phase 0 | `applications`, `answers`, `application_drafts` tables |
| **Phase 0B** | Phase 0A | Recruiter API endpoints |
| **Phase 1** | Phase 0A | Signal extraction logic |
| **Phase 2** | Phase 1 | Aggregation & conflict rules |
| **Phase 3** | Phase 2 | Posture computation, API endpoint |
| **Phase 4** | Phase 3 | Frontend TypeScript types |
| **Phase 5** | Phase 4 | Transparency UI components |
| **Phase 6** | Phase 0A, Phase 5 | Candidate apply pages (`/j/:slug`) |
| **Phase 7** | Phase 0B, Phase 5 | Recruiter application management pages |

---

## Key Design Decisions

### 1. All Required Answers

**Decision:** All 3 questions must be answered before submission.

**Rationale:**
- Ensures complete signal coverage
- Self-selects serious candidates
- "Save & continue" handles interruptions

### 2. 3 Questions Maximum

**Decision:** Hard cap of 3 questions per job.

**Rationale:**
- ~10 min completion time
- Respects candidate time
- Covers critical signals
- High completion rate (80%)

### 3. Critical Signals Always Probed

**Decision:** Archetypes for critical signals are always selected.

**Critical Signals:**
- `decision_under_uncertainty` → situational_uncertainty_story archetype
- `accountability` → ownership_of_outcome archetype
- `learning_from_failure` → failure_and_learning archetype

**Rationale:**
- These signals are required for LOW_REGRET_RISK posture
- Without them, posture would always be SOME_UNCERTAINTY or HIGH_UNCERTAINTY

### 4. "Missing" = Not Detected (Not "Not Asked")

**Decision:** With all required + critical signals covered, "missing" means the LLM didn't detect the signal in the answer.

**Example:**
```
Question: "Tell us about a time you took ownership of a difficult outcome"
Answer: "My team worked on the project. We followed the plan our manager gave us."

Result: accountability signal NOT DETECTED
Meaning: Candidate didn't demonstrate ownership (valuable information)
```

### 5. Signals Are Contextual, Not Scores

**Decision:** We extract signals, we don't judge candidates.

**Rationale:**
- "Clear" vs "absent" is information, not ranking
- Hiring managers interpret based on role needs
- Transparency enables better decisions

### 6. Backend Owns Logic

**Decision:** All computation happens in backend. Frontend is pure rendering.

**Rationale:**
- Consistent logic across clients
- Easier to audit and update rules
- Frontend stays simple

---

## Signal Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  END-TO-END SIGNAL FLOW                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Job Created                                                                │
│       │                                                                     │
│       ▼                                                                     │
│  3 Questions Generated (Phase 0)                                           │
│  [critical signals covered]                                                 │
│       │                                                                     │
│       ▼                                                                     │
│  Candidate Applies (Phase 0A)                                              │
│  [all 3 answers required]                                                   │
│       │                                                                     │
│       ▼                                                                     │
│  Signal Extraction (Phase 1)                                               │
│  Answer 1 → [signal_a: clear, signal_b: partial]                           │
│  Answer 2 → [signal_c: clear]                                              │
│  Answer 3 → [signal_a: absent, signal_d: clear]                            │
│       │                                                                     │
│       ▼                                                                     │
│  Aggregation (Phase 2)                                                     │
│  present: [signal_c, signal_d]                                             │
│  partial: [signal_b]                                                        │
│  missing: [signal_a] ← was asked, answered, but not demonstrated           │
│  conflicts: []                                                              │
│       │                                                                     │
│       ▼                                                                     │
│  Posture Computation (Phase 3)                                             │
│  → SOME_UNCERTAINTY (signal_a is critical but missing)                     │
│  → Reason: "Critical signal not demonstrated"                              │
│  → Suggested: "Probe accountability in interview"                          │
│       │                                                                     │
│       ▼                                                                     │
│  Recruiter UI (Phase 5)                                                    │
│  Shows posture badge, signal breakdown, suggested actions                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Testing the Full Flow

After implementing all phases, test:

1. **Create job** → Generates exactly 3 questions
2. **Verify archetypes** → At least 2 critical archetypes included
3. **Save draft** → Partial answers saved with resume token
4. **Resume draft** → Answers restored correctly
5. **Submit application** → All 3 answered, signal extraction queued
6. **Signal extraction** → Each answer processed by LLM
7. **Posture computed** → LOW_REGRET_RISK if all critical signals present
8. **Recruiter views** → Posture badge + signal breakdown visible
