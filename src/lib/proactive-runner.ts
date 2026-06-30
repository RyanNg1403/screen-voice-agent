import { invoke } from "./invoke-bridge";
import {
  createProactiveTutorState,
  evaluateProactiveTutor,
  formatProactiveMovePrompt,
  type ProactiveTutorState,
} from "./proactive-tutor";
import { sendTextAndRespond } from "./session-bridge";
import type { ScreenState, TutorMove } from "./tutor-types";

// Shared proactive-tutor tick used by BOTH the standalone watcher loop and the
// learning-mode loop, so proactive Codex tutoring always reads the same generic
// screen source (check_screen_text) — never a language-learning hint.
//
// check_screen_text does the screen understanding in ONE gpt-4o-mini vision call
// and returns a structured read { summary, activity, signals, confidence, risky }.
// It returns null ONLY for an unchanged screen (90s dedup) or a transient failure —
// there we reuse the cached read so a held error/approval reaches
// evaluateProactiveTutor's ~30s persistence threshold without re-paying for the
// vision call. A BLANK screen instead comes back as a real "other" read, which
// REPLACES the cache so a stale error stops firing once the screen has changed.

const STALE_MS = 120_000;

/** Structured screen read returned by the check_screen_text IPC handler. */
export interface ScreenRead {
  summary: string;
  activity: ScreenState["activity"];
  signals: string[];
  confidence: number;
  risky: boolean;
}

export interface ProactiveRunnerState {
  proactive: ProactiveTutorState;
  lastScreen: { state: ScreenState; at: number } | null;
}

export function createProactiveRunnerState(): ProactiveRunnerState {
  return { proactive: createProactiveTutorState(), lastScreen: null };
}

/**
 * Run one proactive tick. Pass `prefetchedRead` when the caller already read
 * check_screen_text this tick (the watcher does, for its own triggers) to avoid
 * a second capture; omit it to have the runner fetch the read itself (learning
 * mode). Returns the next runner state.
 */
export async function runProactiveTick(
  state: ProactiveRunnerState,
  onMove: (move: TutorMove) => void,
  prefetchedRead?: ScreenRead | null,
  now: number = Date.now(),
): Promise<ProactiveRunnerState> {
  let read = prefetchedRead;
  if (read === undefined) {
    try {
      read = await invoke<ScreenRead | null>("check_screen_text");
    } catch {
      read = null;
    }
  }

  let screenState: ScreenState | null = null;
  let lastScreen = state.lastScreen;
  // A non-null read is the CURRENT screen — always replace the cache with it,
  // even when it's a blank "other" read (empty summary). That's what clears a
  // stale error/approval once the user moves on. check_screen_text returns null
  // ONLY for an unchanged screen (dedup) or a transient failure — there we reuse
  // the cached read so error/approval persistence can keep accruing.
  if (read) {
    screenState = {
      activity: read.activity,
      summary: read.summary,
      signals: read.signals,
      confidence: read.confidence,
      risky: read.risky,
    };
    lastScreen = { state: screenState, at: now };
  } else if (state.lastScreen && now - state.lastScreen.at < STALE_MS) {
    screenState = state.lastScreen.state;
  }

  if (!screenState) return { ...state, lastScreen };

  const result = evaluateProactiveTutor(screenState, state.proactive, { now });
  if (result.move) {
    onMove(result.move);
    sendTextAndRespond(formatProactiveMovePrompt(result.move, screenState));
  }
  return { proactive: result.state, lastScreen };
}
