import assert from "node:assert/strict";
import test from "node:test";
import {
  createProactiveTutorState,
  evaluateProactiveTutor,
} from "./proactive-tutor";
import type { ScreenState } from "./tutor-types";

const baseScreen: ScreenState = {
  activity: "error",
  summary: "Tests failed with a visible stack trace.",
  signals: ["stack trace", "failed test"],
  confidence: 0.86,
  risky: false,
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
  // risky:false here on purpose — the keyword backstop (looksRisky) must catch
  // "rm -rf" even when the vision model didn't flag it.
  const approval: ScreenState = {
    activity: "awaiting_approval",
    summary: "Codex is asking approval to run rm -rf on project files.",
    signals: ["approval dialog", "rm -rf", "delete files"],
    confidence: 0.91,
    risky: false,
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

test("evaluateProactiveTutor warns when the vision read flags risky, even with no risky keywords", () => {
  // Summary/signals contain none of looksRisky's keywords — only the AI
  // risky=true flag should drive the immediate warning.
  const aiFlagged: ScreenState = {
    activity: "awaiting_approval",
    summary: "Codex wants approval to apply the proposed changes.",
    signals: ["approval dialog"],
    confidence: 0.9,
    risky: true,
  };

  const result = evaluateProactiveTutor(aiFlagged, createProactiveTutorState(), {
    now: 50_000,
    persistenceMs: 15_000,
    cooldownMs: 60_000,
  });

  assert.equal(result.move?.kind, "warn");
  assert.equal(result.move?.source, "proactive");
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
  };

  const second = evaluateProactiveTutor(changedError, first.state, {
    now: 30_000,
    persistenceMs: 0,
    cooldownMs: 60_000,
  });

  assert.equal(second.move, null);
});
