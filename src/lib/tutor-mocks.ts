import type { ScreenState, TutorMove } from "./tutor-types";

export const MOCK_SCREEN_STATES: readonly ScreenState[] = [
  {
    activity: "planning",
    appName: "Codex",
    summary: "Codex is showing a short implementation plan.",
    signals: ["plan list", "pending user review"],
    confidence: 0.82,
    capturedAt: 0,
  },
  {
    activity: "error",
    appName: "Codex",
    summary: "A test failure and stack trace are visible in the terminal.",
    signals: ["failed test", "stack trace"],
    confidence: 0.88,
    capturedAt: 0,
  },
];

export const MOCK_TUTOR_MOVES: readonly TutorMove[] = [
  {
    kind: "ask",
    stage: "review_plan",
    hintLevel: 0,
    text: "What is the smallest part of this plan you can verify first?",
    competency: "review_plan",
    source: "ondemand",
  },
  {
    kind: "warn",
    stage: "supervise_impl",
    hintLevel: 0,
    text: "Pause before approving this command. It can delete files.",
    competency: "spot_risk",
    source: "proactive",
  },
];
