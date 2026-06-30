import { useCallback, useReducer } from "react";
import type { TranscriptEntry } from "./useRealtime";
import {
  COMPETENCIES,
  formatCompetencyLabel,
  formatLearningStage,
  type CompetencyId,
  type CompetencyStatus,
  type LessonEvent,
  type LessonState,
  type TutorMove,
} from "../lib/tutor-types";

const MAX_EVENTS = 120;

export interface SessionReportData {
  outcome: string;
  stage: string;
  durationLabel: string;
  skillsDemonstrated: string[];
  hintsNeeded: number;
  interventions: number;
  conceptsEncountered: string[];
  transferablePrinciple: string;
  nextFocus: string;
}

export type LessonAction =
  | { type: "tutor_move"; move: TutorMove; at?: number }
  | { type: "session_event"; eventType: string; detail: string; at?: number }
  | { type: "reset"; at?: number };

export function createInitialLessonState(startedAt = Date.now()): LessonState {
  const competencies = Object.fromEntries(
    COMPETENCIES.map(({ id }) => [id, "unseen" satisfies CompetencyStatus]),
  ) as Record<CompetencyId, CompetencyStatus>;

  return {
    stage: "understand_workflow",
    competencies,
    hintsUsed: 0,
    interventions: 0,
    startedAt,
    events: [],
  };
}

export function lessonStateReducer(
  state: LessonState,
  action: LessonAction,
): LessonState {
  if (action.type === "reset") {
    return createInitialLessonState(action.at ?? Date.now());
  }

  if (action.type === "session_event") {
    return appendEvent(state, {
      at: action.at ?? Date.now(),
      type: action.eventType,
      detail: action.detail,
    });
  }

  const { move } = action;
  const nextCompetencies = { ...state.competencies };
  if (move.competency) {
    const current = nextCompetencies[move.competency] ?? "unseen";
    nextCompetencies[move.competency] =
      move.reachedExpectedState || move.kind === "confirm"
        ? "demonstrated"
        : current === "demonstrated"
          ? "demonstrated"
          : "attempted";
  }

  return appendEvent(
    {
      ...state,
      stage: move.stage,
      competencies: nextCompetencies,
      hintsUsed: state.hintsUsed + (move.hintLevel > 0 ? 1 : 0),
      interventions: state.interventions + (move.source === "proactive" ? 1 : 0),
    },
    {
      at: action.at ?? Date.now(),
      type: "tutor_move",
      detail: `${move.kind}: ${move.text}`,
    },
  );
}

export function buildSessionReport({
  lessonState,
  transcript,
  endedAt = Date.now(),
}: {
  lessonState: LessonState;
  transcript: TranscriptEntry[];
  endedAt?: number;
}): SessionReportData {
  const demonstratedIds = Object.entries(lessonState.competencies)
    .filter(([, status]) => status === "demonstrated")
    .map(([id]) => id);
  const attemptedIds = Object.entries(lessonState.competencies)
    .filter(([, status]) => status === "attempted")
    .map(([id]) => id);
  const demonstrated = demonstratedIds.map((id) => formatCompetencyLabel(id));
  const concepts = extractConcepts(transcript, lessonState.events);
  const stageLabel = formatLearningStage(lessonState.stage);
  const primarySkill = demonstrated[0] ?? "the current workflow";

  return {
    outcome: `Reached ${stageLabel.toLowerCase()} with ${primarySkill} in focus.`,
    stage: lessonState.stage,
    durationLabel: formatDuration(Math.max(0, endedAt - lessonState.startedAt)),
    skillsDemonstrated: demonstrated,
    hintsNeeded: lessonState.hintsUsed,
    interventions: lessonState.interventions,
    conceptsEncountered: concepts,
    transferablePrinciple: principleFor(demonstratedIds[0] ?? attemptedIds[0]),
    nextFocus:
      lessonState.stage === "validate" || lessonState.stage === "transfer"
        ? "Transfer the verified workflow to the next similar task."
        : `Move from ${stageLabel.toLowerCase()} toward validation with one checked change.`,
  };
}

export function useLessonState() {
  const [lessonState, dispatch] = useReducer(
    lessonStateReducer,
    undefined,
    () => createInitialLessonState(),
  );

  const recordTutorMove = useCallback((move: TutorMove, at = Date.now()) => {
    dispatch({ type: "tutor_move", move, at });
  }, []);

  const recordSessionEvent = useCallback((
    eventType: string,
    detail: string,
    at = Date.now(),
  ) => {
    dispatch({ type: "session_event", eventType, detail, at });
  }, []);

  const resetLesson = useCallback((at = Date.now()) => {
    dispatch({ type: "reset", at });
  }, []);

  return {
    lessonState,
    recordTutorMove,
    recordSessionEvent,
    resetLesson,
  };
}

function appendEvent(state: LessonState, event: LessonEvent): LessonState {
  return {
    ...state,
    events: [...state.events, event].slice(-MAX_EVENTS),
  };
}

function extractConcepts(
  transcript: TranscriptEntry[],
  events: LessonEvent[],
): string[] {
  const text = [
    ...transcript
      .filter((entry) => entry.role === "user" || entry.role === "assistant")
      .map((entry) => entry.text),
    ...events.map((event) => event.detail),
  ].join(" ").toLowerCase();

  const concepts = [
    ["Planning", /\b(plan|approach|steps?)\b/],
    ["Testing", /\b(test|verify|validated?|passing)\b/],
    ["Debugging", /\b(error|failed|stack trace|bug|debug)\b/],
    ["Approval safety", /\b(approval|permission|delete|risk|danger)\b/],
    ["Screen context", /\b(screen|codex|watch|watcher)\b/],
  ] as const;

  const found = concepts
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);

  return found.length > 0 ? found : ["Workflow supervision"];
}

// The session's one transferable principle is tied to the skill the learner
// actually exercised, so it reads as earned rather than a fixed motto.
const PRINCIPLES: Record<string, string> = {
  explain_workflow: "If you can describe the workflow in plain words, you can supervise it.",
  give_codex_context: "The clearer and more specific your request, the closer the agent's first try lands.",
  review_plan: "Read the agent's plan before it runs — approving blind is how surprises happen.",
  debug_when_stuck: "When something breaks, narrow the cause down before asking for a fix.",
  verify_behavior: "Check the result against what you expected before you move on.",
  one_change_at_a_time: "Ask for one change at a time so you can tell what actually fixed it.",
  spot_risk: "Pause on anything that deletes, deploys, or touches real data — read it before you approve.",
};

function principleFor(competency?: string): string {
  return (
    (competency && PRINCIPLES[competency]) ||
    "Keep each step small enough that you can verify it before moving on."
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
