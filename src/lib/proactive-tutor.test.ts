import assert from "node:assert/strict";
import test from "node:test";
import {
  createProactiveTutorState,
  evaluateProactiveTutor,
  inferScreenStateFromWatcherText,
} from "./proactive-tutor";
import type { ScreenState } from "./tutor-types";

const baseScreen: ScreenState = {
  activity: "error",
  appName: "Codex",
  summary: "Tests failed with a visible stack trace.",
  signals: ["stack trace", "failed test"],
  confidence: 0.86,
  capturedAt: 10_000,
};

test("evaluateProactiveTutor waits for persistent errors before nudging", () => {
  const first = evaluateProactiveTutor(baseScreen, createProactiveTutorState(), {
    now: 10_000,
    persistenceMs: 15_000,
    cooldownMs: 60_000,
  });

  assert.equal(first.move, null);

  const second = evaluateProactiveTutor(baseScreen, first.state, {
    now: 26_000,
    persistenceMs: 15_000,
    cooldownMs: 60_000,
  });

  assert.equal(second.move?.source, "proactive");
  assert.equal(second.move?.stage, "diagnose");
  assert.equal(second.move?.kind, "ask");
  assert.match(second.move?.text ?? "", /error/i);
});

test("evaluateProactiveTutor warns immediately for risky approvals and respects cooldown", () => {
  const approval: ScreenState = {
    activity: "awaiting_approval",
    appName: "Codex",
    summary: "Codex is asking approval to run rm -rf on project files.",
    signals: ["approval dialog", "rm -rf", "delete files"],
    confidence: 0.91,
    capturedAt: 40_000,
  };

  const first = evaluateProactiveTutor(approval, createProactiveTutorState(), {
    now: 40_000,
    persistenceMs: 15_000,
    cooldownMs: 60_000,
  });

  assert.equal(first.move?.kind, "warn");
  assert.equal(first.move?.source, "proactive");
  assert.equal(first.move?.stage, "supervise_impl");

  const duplicate = evaluateProactiveTutor(approval, first.state, {
    now: 45_000,
    persistenceMs: 15_000,
    cooldownMs: 60_000,
  });

  assert.equal(duplicate.move, null);
});

test("evaluateProactiveTutor applies cooldown across changed error details", () => {
  const first = evaluateProactiveTutor(baseScreen, createProactiveTutorState(), {
    now: 26_000,
    persistenceMs: 0,
    cooldownMs: 60_000,
  });
  const changedError: ScreenState = {
    ...baseScreen,
    summary: "Tests failed with a different assertion message.",
    signals: ["failed test", "assertion"],
    capturedAt: 30_000,
  };

  const second = evaluateProactiveTutor(changedError, first.state, {
    now: 30_000,
    persistenceMs: 0,
    cooldownMs: 60_000,
  });

  assert.equal(second.move, null);
});

test("inferScreenStateFromWatcherText maps common watcher text into ScreenState", () => {
  const screen = inferScreenStateFromWatcherText(
    "Codex shows a permission approval dialog for deleting files after tests failed.",
    99_000,
  );

  assert.equal(screen.activity, "awaiting_approval");
  assert.equal(screen.appName, "Codex");
  assert.ok(screen.signals.includes("approval dialog"));
  assert.ok(screen.signals.includes("error output"));
  assert.ok(screen.confidence > 0.5);
});
