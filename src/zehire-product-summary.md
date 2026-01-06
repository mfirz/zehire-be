Zehire — Hiring Product Summary
Canonical v4 — Signal-First, Volume-Aware, Regret-Minimizing

1. Core Problem (2025 Reality)
   Modern hiring teams face:

- 10 → 1,000+ applicants per role
- AI-generated resumes and answers inflating perceived quality
- Low trust in surface-level signals
- ATS workflows that are:
  _ Resume-first
  _ Ranking-heavy
  _ Linear and rigid
  _ Optimized for filtering, not decision safety
  Most hiring decisions today are made under:
- Incomplete information
- Time pressure
- Volume overload
- Fear of missing good candidates and fear of wasting interviews
  Existing tools respond by adding:
- Scores
- Percentages
- Rankings
- “Top candidates”
  This creates false precision and shifts recruiter behavior toward optimization instead of judgment.

2. Zehire’s Core Principle
   Hiring is not about finding “the best” candidate.It is about reducing regret while acting under uncertainty.
   Zehire is built around decision safety, not prediction accuracy.

3. Signal-First Architecture (Not Resume-First)
   Zehire evaluates candidates using explicit, explainable signals, such as:

- CV / experience relevance
- Contextual questions (job-specific reasoning)
- Reinforcement signals (when ambiguity exists)
- Consistency across inputs
- Responsiveness (including non-response)
  Signals are:
- Evaluated independently
- Interpreted in context
- Never collapsed into a single numeric score
  Silence and non-answers are treated as real signals, not errors to “fix”.

4. No Scores, No Rankings, No Confidence Percentage
   Zehire deliberately avoids:

- Confidence percentages
- Candidate scores
- Sorting by “best”
- Hidden ranking heuristics
  Why:
- Numbers attract attention
- Recruiters will try to sort by them
- Sorting implies precision Zehire cannot honestly guarantee
- It shifts focus away from decision context

5. Decision Posture (Core UX Concept)
   Instead of scores, Zehire presents a Decision Posture for each candidate:
   How safe it is to act based on current evidence
   Decision Posture States
   🟢 Low Regret Risk

- Evidence is consistent across required signals
- Acting now is unlikely to create downstream regret
  🟡 Some Uncertainty
- Some signals are incomplete or ambiguous
- Acting now carries moderate risk
- Additional context may reduce regret
  🔴 High Uncertainty
- Key evidence is missing or conflicting
- Acting now carries a high risk of regret
- This is not rejection — it is insufficient evidence
  Each posture:
- Is categorical (not numeric)
- Is explainable
- May show variant descriptions depending on context (e.g. missing answers, volume, reinforcement), but:
  _ The posture itself is stable
  _ Variants do not imply progress bars or gamification
  Important:Decision posture reflects current evidence and context — not candidate quality or potential.

LOW_REGRET_RISK

Template A:
Evidence is consistent across required signals.
Acting now is unlikely to create downstream regret.

Template B:
Signals are strong and unambiguous.
Early action is safe given current candidate volume.

Template C:
Ambiguities have been resolved through reinforcement.
Remaining risk is low.

Pseudocode:
if (state === LOW_REGRET_RISK) {
if (resolvedReinforcement) use Template C
else if (lowVolume) use Template B
else use Template A
}

SOME_UNCERTAINTY

Template D — Missing Critical Signal
Intent: Explain uncertainty without blaming candidate.
Some required context is missing.Acting now may create avoidable regret.Consider whether additional context is worth requesting.
Used when:

- Mandatory question skipped
- Reinforcement not attempted

Template E — Conflicting Signals
Intent: Highlight ambiguity, not weakness.
Signals point in different directions.This candidate may be strong, but evidence is inconsistent.Additional clarification could reduce risk.
Used when:

- Strong CV + weak contextual answer
- Polished response without concrete detail

Template F — Low Volume, Acceptable Risk
Intent: Allow human judgment without system pressure.
There is some uncertainty, but current volume allows flexibility.Interviewing now may still be reasonable.
Used when:

- Few applicants
- Interview capacity is available

Template G — Default (High Volume)
Intent: Encourage restraint without blocking.
There is unresolved uncertainty.Acting now carries moderate regret risk.It may be safer to wait or request clarification.

Pseudocode:if (state === SOME_UNCERTAINTY) {
if (missingCriticalSignal) use Template D
else if (signalConflict) use Template E
else if (lowVolume) use Template F
else use Template G
}

HIGH_UNCERTAINTY

Template H — No Response
Intent: Normalize non-response as a signal.
Key questions were not answered.There is not enough evidence to act safely at this time.
No “nudge”, no re-ask by default.

Template I — Reinforcement Declined
Intent: Close the loop respectfully.
Additional clarification was offered but not provided.Uncertainty remains high.
This is final, not punitive.

Template J — Early Stage, Too Little Data
Intent: Prevent premature action.
This application does not yet contain enough information.Acting now would be highly speculative.

Template K — Default
Intent: Firm boundary.
Evidence is insufficient to support action.Acting now would carry a high risk of regret.

Pseudocode:
if (state === HIGH_UNCERTAINTY) {
if (noResponse) use Template H
else if (reinforcementDeclined) use Template I
else if (earlyStage) use Template J
else use Template K
}

Typescript enum implementation: https://chatgpt.com/s/t_695900538bf88191b11146b84a98c76c

6. Interview-Ready Is a Safety Threshold, Not a Ranking
   Candidates become Interview-Ready when:

- Required signals meet minimum clarity
- Regret risk is sufficiently low
- Interviewing them is defensible
  Interview-Ready means:
  “It is safe to interview this candidate.”
  It does not mean:
- They are better than others
- They must be interviewed
- They are prioritized automatically

7. Volume-Aware Hiring (Critical Differentiator)
   Zehire explicitly acknowledges hiring reality:

- Applicant volume fluctuates
- Interview capacity is limited
- Recruiters cannot interview everyone who is Interview-Ready
  When volume exceeds capacity, Zehire does not tighten thresholds automatically and does not re-rank candidates.
  Instead, it separates readiness from action.

8. Interview-Ready Management (High Volume UX)
   When many candidates are Interview-Ready:
   Zehire communicates clearly:
   You have more interview-ready candidates than interview capacity.Zehire will help you manage attention without ranking candidates.
   Supported recruiter actions:

- Schedule interviews
  - Select candidates to interview this cycle
  - Selection does not change candidate status
- Defer candidates
  - Candidates remain Interview-Ready
  - No penalty, no silent downgrade
- Commitment / availability check (optional)
  - Non-evaluative
  - Used to reduce coordination friction, not quality

9. Candidate Action States (Not Quality States)
   Interview-Ready candidates can be in one of these action states:

- Interview-Ready
  - Eligible and safe to interview
- Interview Scheduled
  - Interview planned for this cycle
- Interview-Ready (Deferred)
  _ Not scheduled due to capacity
  _ Remains eligible \* No negative signal applied
  This prevents:
- Forced shortlists
- Artificial scarcity
- Recruiter guilt
- Silent rejection

10. Reinforcement Is Optional, Not Mandatory
    If a candidate:

- Does not answer a contextual question
  Zehire:
- Treats non-response as a valid signal
- Increases uncertainty
- Does not automatically re-ask or “fix” it
  Reinforcement:
- Is only used when ambiguity exists and clarity is genuinely needed
- Is never used to coerce engagement
- Is never framed as “you forgot to answer”

11. What Zehire Explicitly Refuses to Do
    Zehire will not:

- Rank candidates
- Sort by confidence
- Create “Top X” lists
- Hide candidates due to volume
- Auto-downgrade silently
- Pretend hiring is objective
  Zehire chooses honesty over optimization theater.

12. The Mental Model Zehire Enforces

- Hiring is probabilistic
- Decisions are contextual
- Volume is a constraint, not a signal
- Safety > speed > optimization
- Fairness is temporal, not instantaneous

13. One Line That Anchors the Entire Product
    Interview-Ready means safe to interview, not guaranteed to be interviewed.
    This sentence defines Zehire’s philosophy, UX, and ethics.

14. Role States and System Boundaries
    Active Role

- Accepts new applicants
- Evaluates signals
- Allows reinforcement
- Supports interview scheduling
- Billing is active
  Paused Role
- No new applicants can apply
- Existing candidates remain visible
- No new evaluation or reinforcement is allowed
- Interviews may proceed using existing evidence
- Billing is paused
  Paused means:
  “We are not generating new evaluative work.”

15. Billing Philosophy (Aligned With Truth)
    Zehire charges per active role, per month.
    Billing is aligned with:

- Signal evaluation
- AI usage
- Decision posture computation
- Reinforcement costs
  Zehire does not charge for:
- Paused roles
- Deferred candidates
- Stored historical data
  Billing reflects work performed, not data stored.

16. Archetypes (Check app/lib/archetypes/\* files)
