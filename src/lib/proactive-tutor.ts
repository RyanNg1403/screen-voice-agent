import {
  type ScreenState,
  type TutorMove,
} from "./tutor-types";

const DEFAULT_PERSISTENCE_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 90_000;
const LOW_CONFIDENCE = 0.45;

export interface ProactiveTutorState {
  fingerprint: string | null;
  firstSeenAt: number | null;
  lastNudgeAt: number | null;
}

export interface ProactiveTutorOptions {
  now?: number;
  persistenceMs?: number;
  cooldownMs?: number;
}

export interface ProactiveTutorResult {
  move: TutorMove | null;
  state: ProactiveTutorState;
}

export function createProactiveTutorState(): ProactiveTutorState {
  return {
    fingerprint: null,
    firstSeenAt: null,
    lastNudgeAt: null,
  };
}

export function evaluateProactiveTutor(
  screenState: ScreenState,
  state: ProactiveTutorState,
  options: ProactiveTutorOptions = {},
): ProactiveTutorResult {
  const now = options.now ?? Date.now();
  const persistenceMs = options.persistenceMs ?? DEFAULT_PERSISTENCE_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const fingerprint = fingerprintScreen(screenState);
  const firstSeenAt = state.fingerprint === fingerprint
    ? state.firstSeenAt ?? now
    : now;
  const nextState: ProactiveTutorState = {
    ...state,
    fingerprint,
    firstSeenAt,
  };

  if (screenState.confidence < LOW_CONFIDENCE) {
    return { move: null, state: nextState };
  }

  const inCooldown =
    state.lastNudgeAt !== null &&
    now - state.lastNudgeAt < cooldownMs;
  if (inCooldown) {
    return { move: null, state: nextState };
  }

  // Primary signal is the AI vision read (screenState.risky); looksRisky is a
  // cheap deterministic backstop so a destructive command the model misses
  // (rm -rf, sudo, broad permissions, production/secrets) still warns.
  const riskyApproval =
    screenState.activity === "awaiting_approval" &&
    (screenState.risky || looksRisky(screenState.summary, screenState.signals));
  const persistent = now - firstSeenAt >= persistenceMs;

  let move: TutorMove | null = null;
  if (riskyApproval) {
    move = {
      kind: "warn",
      stage: "supervise_impl",
      hintLevel: 0,
      text: "Pause before approving this. It looks like it could change or delete files; read the command and confirm the target first.",
      competency: "spot_risk",
      source: "proactive",
    };
  } else if (screenState.activity === "error" && persistent) {
    move = {
      kind: "ask",
      stage: "diagnose",
      hintLevel: 1,
      text: "The error is still on screen. What is the smallest clue you can inspect before asking Codex to change code?",
      competency: "debug_when_stuck",
      source: "proactive",
    };
  } else if (screenState.activity === "awaiting_approval" && persistent) {
    move = {
      kind: "ask",
      stage: "supervise_impl",
      hintLevel: 0,
      text: "This approval has been waiting for a bit. What will this command change, and is that the action you intended?",
      competency: "spot_risk",
      source: "proactive",
    };
  }

  if (!move) return { move: null, state: nextState };

  return {
    move,
    state: {
      ...nextState,
      lastNudgeAt: now,
    },
  };
}

export function formatProactiveMovePrompt(move: TutorMove, screenState: ScreenState): string {
  return [
    "[PROACTIVE TUTOR MOVE]",
    `Kind: ${move.kind}`,
    `Stage: ${move.stage}`,
    `Message: ${move.text}`,
    `Screen: ${screenState.summary}`,
    "Deliver this as one brief tutor nudge. Do not add a second suggestion unless the action is risky.",
    "This nudge is ALREADY logged for progress tracking — do NOT call record_tutor_move for it.",
  ].join("\n");
}

function fingerprintScreen(screenState: ScreenState): string {
  return [
    screenState.activity,
    screenState.risky ? "risky" : "safe",
    screenState.summary.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160),
    ...screenState.signals.map((signal) => signal.toLowerCase()).sort(),
  ].join("|");
}

function looksRisky(summary: string, signals: readonly string[]): boolean {
  const haystack = `${summary} ${signals.join(" ")}`.toLowerCase();
  return /\b(rm\s+-rf|delete|deleting|remove files?|trash|sudo|chmod|chown|production|secret|credential|token|full disk|broad permission)\b/.test(haystack);
}
