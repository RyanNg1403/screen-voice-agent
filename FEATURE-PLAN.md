# Husky — Feature Implementation Plan

Shared implementation plan for the team. We build in parallel against the
**shared contracts** in §2; each feature owner can work independently as long as
they honor those types.

Status: **FR-3 (overlay + coach panel) is shipped** on `feat/husky-fr3-overlay`.
This doc covers the next cycle.

---

## 1. Locked decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Tutoring brain | **Prompt-driven realtime** (`gpt-realtime-2`) | Reuse the existing model; shape behavior via system prompt + tools + lesson-state. No second model call in v1. |
| Mission | **Mission-agnostic** | Coach on whatever Codex project is on screen. No fixed destination, acceptance criteria, or seeded starter app yet. |
| In scope | Tutoring brain (FR-6/7/8), Progress & report (FR-9/13), Proactive help (FR-10) | — |
| Deferred | FR-4 precise visual pointing; FR-11 mission/assessment + starter app; enterprise dashboard | Heavier; not on the critical path to a working tutor loop. |
| Mostly done | FR-5 text controls, FR-12 privacy, FR-2 app-pick | Delivered via FR-3 / existing Settings. Polish only. |

**Central behavior rule (PRD §12):** *Give the smallest intervention that lets
the learner make the next decision themselves.* Everything below serves this.

---

## 2. Shared contracts (the integration seams)

These three types flow between features. Define them once (suggested home:
`src/lib/tutor-types.ts`) and every owner codes against them. Shapes are a
starting proposal — refine together before locking.

### 2.1 `ScreenState` — produced by FR-6, consumed by FR-7 & FR-10

What Codex is doing right now, derived from screen capture + AX tree.

```ts
type CodexActivity =
  | "idle"            // waiting for the learner to type a prompt
  | "planning"        // showing a plan / list of intended changes
  | "editing"         // writing files, running commands, streaming output
  | "awaiting_approval" // a permission/approval dialog is up
  | "testing"         // running the app / tests / showing results
  | "error"           // visible error, failed test, broken output
  | "unknown";

interface ScreenState {
  activity: CodexActivity;
  appName: string;            // the observed app (usually "Codex")
  summary: string;            // 1–2 sentence plain-language read of the screen
  signals: string[];          // concrete cues: "permission dialog", "stack trace", …
  confidence: number;         // 0–1; drives FR-8 fallback
  capturedAt: number;         // epoch ms
}
```

### 2.2 `TutorMove` — produced by FR-7, consumed by Progress/Report + the overlay

The structured guidance. This is FR-14's "structured guidance that can render as
text, speech, or overlay" — the panel, the voice, and the report all read it.

```ts
type MoveKind =
  | "ask"        // a Socratic question (reasoning help)
  | "point"      // locate a UI element / next action (navigation help)
  | "explain"    // short why-this-matters
  | "warn"       // safety: risky action ahead, be direct
  | "confirm";   // expected state reached / step done

interface TutorMove {
  kind: MoveKind;
  stage: LearningStage;       // see §2.4
  hintLevel: number;          // 0 = nudge … 3 = near-answer (hint ladder)
  text: string;               // what Husky says/shows (one short message)
  competency?: CompetencyId;  // competency this move exercises (for FR-9)
  reachedExpectedState?: boolean; // sets a "confirm" / progress tick
  source: "ondemand" | "proactive"; // ondemand = FR-7, proactive = FR-10.
                                     // FR-9 uses this to count `interventions`.
}
```

### 2.3 `LessonState` — owned by FR-9, read by FR-13 & the progress view

```ts
interface LessonState {
  stage: LearningStage;             // current stage in the flow
  competencies: Record<CompetencyId, "unseen" | "attempted" | "demonstrated">;
  hintsUsed: number;
  interventions: number;            // proactive nudges fired (FR-10)
  startedAt: number;
  events: Array<{ at: number; type: string; detail: string }>;
}
```

### 2.4 Learning stages & competencies (PRD §11 / §6)

`LearningStage` is the PRD's 10-step flow (the engine infers the current stage;
there is no fixed mission to advance through):

```ts
type LearningStage =
  | "understand_workflow" | "inspect_project" | "frame_task" | "review_plan"
  | "supervise_impl" | "test_workflow" | "diagnose" | "request_revision"
  | "validate" | "transfer";
```

`CompetencyId` = the supervisable skills from PRD §6 secondary goals (e.g.
`explain_workflow`, `give_codex_context`, `review_plan`, `debug_when_stuck`,
`verify_behavior`, `one_change_at_a_time`, `spot_risk`). Keep the list small.

---

## 3. Group A — Tutoring brain (FR-6 + FR-7 + FR-8)

The core. Build **FR-6 first** (it produces `ScreenState`, which FR-7 and FR-10
both consume), then FR-7, then FR-8.

### FR-6 — Screen understanding → `ScreenState`

- **Goal:** turn raw screen capture + AX tree into a `ScreenState` the engine can
  reason over — specifically *what Codex is doing* (planning / editing /
  awaiting-approval / testing / error).
- **Approach:** reuse the existing capture path (`electron/handlers/capture.ts`,
  `read_app_content` in `electron/handlers/misc.ts`, AX tree via
  `helpers/read-ax-tree`). Add a classification step: a compact prompt (or a
  cheap model pass) that maps the AX text + screenshot to `CodexActivity` +
  `summary` + `signals`. In continuous mode the AX pump already runs
  (`screenObservationModeRef` in `src/hooks/useRealtime.ts`); attach the
  classifier to that tick so `ScreenState` refreshes as the learner works.
- **Contract:** **out** `ScreenState`. **in** existing capture APIs.
- **Files:** `electron/handlers/capture.ts`, `electron/handlers/misc.ts`,
  `src/hooks/useRealtime.ts` (context-injection pipeline), `src/lib/samuel.ts`
  (tool definitions), new `src/lib/tutor-types.ts`.
- **Done when:** for a live Codex session, `ScreenState.activity` is correct on
  the 5 cases above ≥ most of the time, with a `confidence` score.
- **Open decisions:** classify with the realtime model inline vs. a cheap
  side model (`gpt-4o-mini`-class)? How often to reclassify (every AX tick vs.
  debounced)? Codex desktop window vs. TUI/web — confirm the actual surface.

### FR-7 — Decision engine → `TutorMove`

- **Goal:** given `ScreenState` + conversation + `LessonState`, choose the
  **smallest useful next teaching move**.
- **Approach (prompt-driven):** a strong tutoring system prompt in
  `src/lib/samuel.ts` that encodes: the 10-stage flow (§2.4), the **hint ladder**
  (start Socratic/`ask`, escalate toward `point`/`explain` only when stuck), the
  **navigation-is-not-a-quiz** rule (for locating UI, `point` directly — never
  make the learner guess), the **safety exception** (risky actions → `warn`,
  direct not Socratic), and **fading support** (raise the bar as competencies are
  demonstrated). Reuse the existing SAY-DO guard (`looksLikeUnactedCommitment` in
  `useRealtime.ts`) so the model acts on commitments. The model emits a
  `TutorMove` (via a structured tool call) which drives the overlay + voice.
- **Contract:** **in** `ScreenState`, transcript, `LessonState`. **out** `TutorMove`.
- **Files:** `src/lib/samuel.ts` (prompt + a `propose_move`/structured tool),
  `src/hooks/useRealtime.ts` (wire `ScreenState` into context injection; route
  `TutorMove` to the panel), `src/components/CoachPanel.tsx` (render `TutorMove`).
- **Done when:** in a real Codex session the next step shown is relevant and
  minimal; hint ladder visibly escalates only when the learner is stuck; risky
  actions trigger a direct `warn`.
- **Open decisions:** hint-ladder depth (3 vs 4 levels); how aggressively to fade;
  exact stuck-detection signal (time, repeats, explicit "I'm stuck").

### FR-8 — Confidence handling

- **Goal:** when screen interpretation is uncertain (`ScreenState.confidence`
  low), ask to confirm or fall back rather than guessing.
- **Approach:** threshold on `ScreenState.confidence`; below it, the engine emits
  an `ask` ("Are you on the plan screen, or already editing?") instead of a
  confident `point`. Cheap once FR-6/7 exist.
- **Files:** `src/lib/samuel.ts` (prompt rule), the FR-7 routing.
- **Done when:** ambiguous screens produce a clarifying question, not a wrong
  instruction.

---

## 4. Group B · part 1 — Progress & report (FR-9 + FR-13)

Consumes the brain's output; can be built in parallel against `TutorMove` /
`LessonState` as soon as those types exist (even with a stubbed engine).

### FR-9 — Progress tracking → `LessonState`

- **Goal:** track the current stage + which competencies the learner has
  demonstrated, internally and in a lightweight progress view.
- **Approach:** a reducer that updates `LessonState` from `TutorMove`s and
  session events (each move carries a `competency` + optional
  `reachedExpectedState`). Keep it in-session (a hook, e.g. `useLessonState`);
  persistence optional. Surface a compact progress view in the panel (stage +
  competency ticks) — secondary to the coach card, per PRD §2.
- **Contract:** **in** `TutorMove` stream + session events. **out** `LessonState`.
- **Files:** new `src/hooks/useLessonState.ts`, `src/components/CoachPanel.tsx`
  (or a small `ProgressView` component), `src/lib/tutor-types.ts`.
- **Done when:** stage + competency state update live as the learner progresses.
- **Open decisions:** competency list (keep ≤ ~7); does the model explicitly mark
  competencies (a `mark_competency` tool) or do we infer from `TutorMove`?

### FR-13 — Session report

- **Goal:** end-of-session summary (PRD §13.12): outcome, skills demonstrated,
  where hints were needed, concepts encountered, one transferable principle,
  suggested next focus.
- **Approach:** at session end (sleep/disconnect — hook into the existing
  `extractFeedback` path in `src/App.tsx`), render `LessonState` + a short model
  summarization of the transcript into a learner-facing report panel.
- **Contract:** **in** `LessonState` + transcript. **out** a report view.
- **Files:** `src/App.tsx` (session-end trigger), new `SessionReport` component,
  `src/hooks/useLessonState.ts`.
- **Done when:** ending a session shows a readable summary card.
- **Deferred:** enterprise aggregate dashboard (PRD note) — out of scope.

---

## 5. Group B · part 2 — Proactive help (FR-10)

- **Goal:** intervene *after* likely-stuck behavior, repeated failure, or visible
  risk — not only when asked.
- **Approach:** reuse the existing watcher loop (`src/hooks/useWatcherLoop.ts`,
  `src/hooks/useLearningMode.ts`) which already evaluates triggers between turns
  and is gated by the screen-watch privacy toggle. Add trigger rules over
  `ScreenState`: e.g. `error` persisting > N seconds, same `error` signal twice,
  or `awaiting_approval` on a risky command → fire a single `TutorMove`
  (`warn`/`ask`). Debounce hard (one nudge, then wait) to honor "smallest
  intervention." Apply the **safety exception**: for broad permissions / deleting
  files / production data / unclear commands, be direct and recommend pausing.
- **Contract:** **in** `ScreenState` (+ history). **out** an occasional `TutorMove`.
- **Files:** `src/hooks/useWatcherLoop.ts`, `src/hooks/useLearningMode.ts`,
  `src/lib/samuel-privacy.ts` (gating already exists).
- **Done when:** a stuck/error/risky screen triggers exactly one timely nudge;
  no nagging; nothing fires when continuous watch is off.
- **Open decisions:** trigger thresholds (time/repeat counts); cooldown length.

---

## 6. Parallelization & ownership

All 6 features split into **two parallel groups**, one owner each:

| Group | Features | Owns |
|-------|----------|------|
| **A — Tutoring brain** | FR-6, FR-7, FR-8 | screen understanding, decision engine, confidence |
| **B — Progress, report & proactive** | FR-9, FR-13, FR-10 | lesson state, session report, proactive triggers |

> **Why B merges Progress (9/13) and Proactive (10):** they have *no hard
> dependency on each other* and share no files. Both depend only on Group A's
> outputs (B reads `TutorMove`; FR-10 reads `ScreenState`). FR-10 also *emits* a
> `TutorMove` with `source:"proactive"` that FR-9 counts — a one-way contract
> link, not a code link. Merging keeps the parallel split clean at two owners.

### Dependency map

```
            ┌──────────────── Group A ────────────────┐
            FR-6 (ScreenState) ──► FR-7 (TutorMove) ──► FR-8 (confidence)
                   │                      │
   ScreenState ────┤                      ├──── TutorMove
                   ▼                      ▼
            ┌──────────────── Group B ────────────────┐
            FR-10 (proactive) ──emits TutorMove──► FR-9 (LessonState) ──► FR-13 (report)
```

- **The only cross-group dependency is the contracts in §2**, not the code.
- **Critical path:** freeze `src/lib/tutor-types.ts` → FR-6 → FR-7.

### The one prerequisite — do this first, together

Before anyone starts, hold a short kickoff to **freeze
`src/lib/tutor-types.ts`** (`ScreenState`, `TutorMove` incl. `source`,
`LessonState`, `LearningStage`, `CompetencyId`) and the §8 open decisions. Once
the types are frozen, both groups develop in parallel — Group B against
**stub fixtures**, never blocked on Group A's implementation.

### File ownership — stay in your lane

| File | Owner | Notes |
|------|-------|-------|
| `src/lib/tutor-types.ts` | **SHARED — frozen** | change only by joint agreement |
| `src/lib/tutor-mocks.ts` *(new)* | **SHARED** | stub `ScreenState`/`TutorMove` fixtures; A & B both seed it at kickoff |
| `src/lib/samuel.ts` | A | prompt + engine tools |
| `src/hooks/useRealtime.ts` | A | context injection, `ScreenState` production, `TutorMove` routing |
| `electron/handlers/capture.ts`, `misc.ts` | A | capture + classify |
| `src/components/CoachPanel.tsx` | **A (primary)** | renders the `TutorMove`. **B must not touch the guidance render.** |
| `src/hooks/useLessonState.ts` *(new)* | B | `LessonState` reducer |
| `src/components/ProgressView.tsx` *(new)* | B | progress UI |
| `src/components/SessionReport.tsx` *(new)* | B | report UI |
| `src/hooks/useWatcherLoop.ts`, `useLearningMode.ts` | B | proactive triggers |
| `src/lib/samuel-privacy.ts` | B (read) | gating already exists — reuse it |
| `src/App.tsx` | **SHARED — coordinate** | both mount components here |

### Caveats & instructions for the Group B implementer — read before you start

These exist so Group A and Group B never collide and can build at the same time:

1. **Treat Group A's files as read-only.** Do not edit `samuel.ts`, the core of
   `useRealtime.ts`, `capture.ts`/`misc.ts`, or the guidance-rendering part of
   `CoachPanel.tsx`. If you need data from them, take it through the frozen
   contracts/exports — never refactor A's pipeline to get at internals.
2. **Build your UI as NEW components, not inside `CoachPanel`.** Put the progress
   view in `ProgressView.tsx` and the report in `SessionReport.tsx`, and mount
   them from `App.tsx`. Only Group A renders the `TutorMove`. This is the single
   biggest collision risk — avoid it by never editing `CoachPanel.tsx`.
3. **You consume the contracts; you only *produce* one thing:** FR-10's proactive
   `TutorMove` with `source:"proactive"`. `ScreenState` and on-demand `TutorMove`
   are read-only inputs to you.
4. **Get `ScreenState`/`TutorMove` through a single agreed seam, not by reaching
   into `useRealtime` internals.** Agree with A on one export (e.g. `useRealtime`
   returns `screenState` and a `tutorMoves` subscription). Until that export
   lands, develop entirely against `tutor-mocks.ts`.
5. **`App.tsx` is shared.** Add your mounts in a clearly separated block at the
   end; rebase often; ping Group A before touching existing wiring. Never
   reorder or edit A's lines there.
6. **Confirm the `source` tag is in the frozen `TutorMove`** before FR-9 counts
   `interventions` — that field is the only thing linking FR-10 → FR-9.
7. **Reuse the existing proactive gate** (`samuel-privacy.ts` + the screen-watch
   toggle). Do not add a second gate. Honor smallest-intervention + the safety
   exception (§5): risky actions get a direct `warn`, hard-debounced to one nudge.
8. **Internal Group-B order:** FR-9 (`LessonState`) before FR-13 (report, which
   reads it). FR-10 is independent of 9/13 — build it first or alongside.
   Proactive *fading* (FR-10 reading `LessonState`) is optional, **not v1**, so it
   introduces no ordering constraint now.

### Integration order

1. **Kickoff:** freeze `tutor-types.ts` + seed `tutor-mocks.ts` + settle §8.
2. **Parallel:** A builds the engine; B builds against mocks.
3. **Integrate:** A lands FR-6 → swap C's mock `ScreenState` for real; A lands
   FR-7 → swap B's mock `TutorMove` for real.
4. **Joint end-to-end test** in a live Codex session.

**First milestone:** frozen types + FR-6 + a minimal FR-7 = a working
screen-aware tutoring loop, mission-agnostic.

## 7. How to validate (no fixed mission)

These are voice/screen features — interactive testing is mandatory (unit tests
won't cover the loop). Per feature: open a real Codex session, drive the 5
`ScreenState` cases, and confirm the move is relevant + minimal. Keep a manual
test script per feature in `docs/`.

## 8. Consolidated open decisions (resolve with the team)

1. FR-6 classifier: inline realtime vs. cheap side model; reclassify cadence.
2. Confirm Codex's actual surface (desktop window vs. terminal/web) — affects all of FR-6/7/10.
3. Hint-ladder depth and stuck-detection signal (FR-7).
4. Competency list + explicit-mark vs. inferred (FR-9).
5. Proactive trigger thresholds + cooldown (FR-10).
6. Where `LessonState` persists (in-session only vs. saved per learner).
