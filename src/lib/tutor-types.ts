// Only the states the proactive tutor actually acts on. Everything else is
// "other" (no proactive action). The on-demand tutor (FR-7) reads the raw
// screen itself and does not consume this.
export type CodexActivity = "error" | "awaiting_approval" | "other";

export interface ScreenState {
  activity: CodexActivity;
  summary: string;
  signals: string[];
  confidence: number;
  // True when the on-screen action looks destructive/irreversible (file
  // deletion, sudo, production data, credentials, broad permissions). Judged by
  // the FR-6 vision read; the proactive engine OR's it with a cheap keyword
  // backstop so a missed-by-the-model destructive approval still warns.
  risky: boolean;
}

export type LearningStage =
  | "understand_workflow"
  | "inspect_project"
  | "frame_task"
  | "review_plan"
  | "supervise_impl"
  | "test_workflow"
  | "diagnose"
  | "request_revision"
  | "validate"
  | "transfer";

export type KnownCompetencyId =
  | "explain_workflow"
  | "give_codex_context"
  | "review_plan"
  | "debug_when_stuck"
  | "verify_behavior"
  | "one_change_at_a_time"
  | "spot_risk";

export type CompetencyId = KnownCompetencyId | (string & {});

export type CompetencyStatus = "unseen" | "attempted" | "demonstrated";

export const COMPETENCIES: readonly { id: KnownCompetencyId; label: string }[] = [
  { id: "explain_workflow", label: "Explain workflow" },
  { id: "give_codex_context", label: "Give Codex context" },
  { id: "review_plan", label: "Review plan" },
  { id: "debug_when_stuck", label: "Debug when stuck" },
  { id: "verify_behavior", label: "Verify behavior" },
  { id: "one_change_at_a_time", label: "One change at a time" },
  { id: "spot_risk", label: "Spot risk" },
];

export type MoveKind = "ask" | "point" | "explain" | "warn" | "confirm";

export interface TutorMove {
  kind: MoveKind;
  stage: LearningStage;
  hintLevel: number;
  text: string;
  competency?: CompetencyId;
  reachedExpectedState?: boolean;
  source: "ondemand" | "proactive";
}

export interface LessonEvent {
  at: number;
  type: string;
  detail: string;
}

export interface LessonState {
  stage: LearningStage;
  competencies: Record<CompetencyId, CompetencyStatus>;
  hintsUsed: number;
  interventions: number;
  startedAt: number;
  events: LessonEvent[];
}

export function formatLearningStage(stage: LearningStage): string {
  return stage
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCompetencyLabel(id: CompetencyId): string {
  const known = COMPETENCIES.find((item) => item.id === id);
  if (known) return known.label;
  return id
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
