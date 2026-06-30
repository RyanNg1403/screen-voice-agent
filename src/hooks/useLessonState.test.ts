import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionReport,
  createInitialLessonState,
  lessonStateReducer,
} from "./useLessonState";
import type { TranscriptEntry } from "./useRealtime";
import type { TutorMove } from "../lib/tutor-types";

test("lessonStateReducer records tutor moves as stage, competency, hints, and interventions", () => {
  const initial = createInitialLessonState(1_000);
  const proactiveMove: TutorMove = {
    kind: "ask",
    stage: "diagnose",
    hintLevel: 1,
    text: "The test error is still visible. What would you check first?",
    competency: "debug_when_stuck",
    reachedExpectedState: true,
    source: "proactive",
  };

  const next = lessonStateReducer(initial, {
    type: "tutor_move",
    move: proactiveMove,
    at: 2_000,
  });

  assert.equal(next.stage, "diagnose");
  assert.equal(next.competencies.debug_when_stuck, "demonstrated");
  assert.equal(next.hintsUsed, 1);
  assert.equal(next.interventions, 1);
  assert.deepEqual(next.events.at(-1), {
    at: 2_000,
    type: "tutor_move",
    detail: "ask: The test error is still visible. What would you check first?",
  });
});

test("buildSessionReport turns lesson state and transcript into a learner-facing summary", () => {
  const state = lessonStateReducer(createInitialLessonState(10_000), {
    type: "tutor_move",
    at: 20_000,
    move: {
      kind: "confirm",
      stage: "validate",
      hintLevel: 0,
      text: "The behavior is verified.",
      competency: "verify_behavior",
      reachedExpectedState: true,
      source: "ondemand",
    },
  });
  const transcript: TranscriptEntry[] = [
    { id: "u1", role: "user", text: "I need help testing the watcher loop.", timestamp: 12_000 },
    { id: "a1", role: "assistant", text: "Run the app and verify the trigger fires once.", timestamp: 13_000 },
  ];

  const report = buildSessionReport({
    lessonState: state,
    transcript,
    endedAt: 70_000,
  });

  assert.equal(report.stage, "validate");
  assert.deepEqual(report.skillsDemonstrated, ["Verify behavior"]);
  assert.equal(report.hintsNeeded, 0);
  assert.match(report.outcome, /validate/i);
  assert.match(report.nextFocus, /transfer/i);
});
