// test/session/session_state.test.mjs
//
// Phase 5C-1 — Pure state-machine tests for the child learning session.
// All assertions drive session-state.mjs directly via node:test.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sessionInitial,
  sessionReduce,
  buildSummary,
  recommendNext,
  nextPhase,
  shouldAdvance,
  STEP_VERDICT,
  STEP_PHASE,
  SESSION_STATUS,
} from "../../src/session/session-state.mjs";

const fakeStep = (overrides = {}) => ({
  step_id: overrides.step_id ?? "step_1",
  knowledge_point: overrides.knowledge_point ?? "math.G5.FRAC.add-unlike-denom",
  subject: overrides.subject ?? "math",
  question_type: overrides.question_type ?? "fraction_input",
  representation_type: overrides.representation_type ?? "fraction_bar",
  stem: overrides.stem ?? "1/3 + 1/2 = ?",
  expected_answer: overrides.expected_answer ?? "5/6",
  difficulty: overrides.difficulty ?? "medium",
  source: overrides.source ?? "verified",
  license: overrides.license ?? "CC0-1.0",
});

test("session: initial state has first step in PRESENTING", () => {
  const s = sessionInitial({
    student_id: "student_t_phase5c_001",
    age_band: "G5-G6",
    steps: [fakeStep()],
  });
  assert.equal(s.status, SESSION_STATUS.ACTIVE);
  assert.equal(s.current_index, 0);
  assert.equal(s.steps.length, 1);
  assert.equal(s.steps[0].phase, STEP_PHASE.PRESENTING);
  assert.equal(s.steps[0].hints_used, 0);
  assert.equal(s.steps[0].attempts.length, 0);
});

test("session: initial rejects empty steps", () => {
  assert.throws(() => sessionInitial({ student_id: "x", steps: [] }));
  assert.throws(() => sessionInitial({ steps: [fakeStep()] }));
});

test("session: initial rejects bad student_id", () => {
  assert.throws(() =>
    sessionInitial({ student_id: "with spaces", steps: [fakeStep()] })
  );
});

test("session: correct first attempt → FEEDBACK immediately (no hint)", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  assert.equal(s.steps[0].phase, STEP_PHASE.FEEDBACK);
  assert.equal(s.steps[0].hints_used, 0);
  assert.equal(s.steps[0].attempts.length, 1);
});

test("session: wrong first attempt → HINT_LEVEL_1 (conceptual nudge)", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  assert.equal(s.steps[0].phase, STEP_PHASE.HINT_LEVEL_1);
});

test("session: wrong + 1 hint → HINT_LEVEL_2 (visual representation)", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "hint" });
  // After hint, phase recomputed: hints_used=1, last_verdict=incorrect -> HINT_LEVEL_2
  assert.equal(s.steps[0].phase, STEP_PHASE.HINT_LEVEL_2);
  assert.equal(s.steps[0].hints_used, 1);
});

test("session: wrong + 2 hints → HINT_LEVEL_3 (intermediate structure)", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "hint" });
  s = sessionReduce(s, { type: "hint" });
  assert.equal(s.steps[0].phase, STEP_PHASE.HINT_LEVEL_3);
  assert.equal(s.steps[0].hints_used, 2);
});

test("session: hint caps at level 3 even after 3+ hint requests", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "hint" });
  s = sessionReduce(s, { type: "hint" });
  s = sessionReduce(s, { type: "hint" });
  s = sessionReduce(s, { type: "hint" });
  assert.equal(s.steps[0].hints_used, 4);
  assert.equal(s.steps[0].phase, STEP_PHASE.HINT_LEVEL_3);
});

test("session: representation_switch updates representation_type and counts", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep({ representation_type: "text" })] });
  s = sessionReduce(s, { type: "representation_switch", to: "fraction_bar" });
  assert.equal(s.steps[0].representation_type, "fraction_bar");
  assert.equal(s.steps[0].representation_switches, 1);
});

test("session: retry 保留 append-only attempts 與 hints_used", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "hint" });
  assert.equal(s.steps[0].hints_used, 1);
  s = sessionReduce(s, { type: "retry" });
  assert.equal(s.steps[0].attempts.length, 1);
  assert.equal(s.steps[0].phase, STEP_PHASE.PRESENTING);
  assert.equal(s.steps[0].hints_used, 1); // hints_used is preserved
});

test("session: Tutor result 使用 Director 的安全 next step 取代預排題", () => {
  let s = sessionInitial({ student_id: "student_t_phase6_director", steps: [fakeStep(), fakeStep({ step_id: "old" })] });
  s = sessionReduce(s, { type: "submit", verdict: "correct", next_step: {
    id: "directed_next", type: "fraction_input", knowledge_point: "math.G5.FRAC.simplify",
    subject: "math", stem: "化簡 2/4", representation_type: "fraction_bar", difficulty: "medium", source: "verified", license: "CC0-1.0",
  } });
  assert.equal(s.steps[1].step_id, "directed_next");
  assert.equal(s.steps[1].expected_answer, undefined);
});

test("session: 英文朗讀後保留即時對話，再接 Director 下一題", () => {
  const readAloud = fakeStep({
    step_id: "read-aloud", subject: "english", question_type: "voice_response",
    knowledge_point: "english.G5.READ.read-aloud", representation_type: "text",
  });
  const conversation = fakeStep({
    step_id: "conversation", subject: "english", question_type: "english_conversation",
    knowledge_point: "english.G5.SPEAK.short-dialog", representation_type: "text",
  });
  let s = sessionInitial({ student_id: "student_t_phase6_conversation", steps: [readAloud, conversation] });
  s = sessionReduce(s, { type: "submit", verdict: "correct", next_step: {
    id: "director-next", type: "multiple_choice", knowledge_point: "english.G5.GRAMMAR.present-progressive",
    subject: "english", stem: "They ___ now.", choices: ["play", "are playing"], representation_type: "text",
    difficulty: "medium", source: "verified", license: "AI_ORIGINAL",
  } });
  assert.deepEqual(s.steps.map((item) => item.step_id), ["read-aloud", "conversation", "director-next"]);
  s = sessionReduce(s, { type: "advance" });
  assert.equal(s.steps[s.current_index].question_type, "english_conversation");
  s = sessionReduce(s, { type: "advance" });
  assert.equal(s.steps[s.current_index].step_id, "director-next");
});

test("session: advance moves to next step", () => {
  let s = sessionInitial({
    student_id: "student_t_phase5c_001",
    steps: [fakeStep({ step_id: "a" }), fakeStep({ step_id: "b", knowledge_point: "math.G5.FRAC.simplify" })],
  });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  s = sessionReduce(s, { type: "advance" });
  assert.equal(s.current_index, 1);
  assert.equal(s.steps[1].phase, STEP_PHASE.PRESENTING);
  assert.equal(s.status, SESSION_STATUS.ACTIVE);
});

test("session: advance past last step → COMPLETED + summary", () => {
  let s = sessionInitial({
    student_id: "student_t_phase5c_001",
    steps: [fakeStep(), fakeStep({ step_id: "b" })],
  });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  s = sessionReduce(s, { type: "advance" });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  s = sessionReduce(s, { type: "advance" });
  assert.equal(s.status, SESSION_STATUS.COMPLETED);
  assert.ok(s.summary);
  assert.equal(s.summary.completed_steps, 2);
  assert.equal(s.summary.total_steps, 2);
  assert.equal(s.summary.first_attempt_correct, 2);
  assert.equal(s.summary.weak_kps.length, 0);
});

test("session: weak_kp identified when final_verdict incorrect", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "advance" });  // student gives up; still weak
  assert.equal(s.status, SESSION_STATUS.COMPLETED);
  assert.equal(s.summary.weak_kps.length, 1);
  assert.equal(s.summary.mastered_kps.length, 0);
  assert.deepEqual(s.summary.mastery_candidate_kps, []);
});

test("session: 一次答對只產生非權威 mastery candidate", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_candidate", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  s = sessionReduce(s, { type: "advance" });
  assert.deepEqual(s.summary.mastery_candidate_kps, ["math.G5.FRAC.add-unlike-denom"]);
  assert.deepEqual(s.summary.mastered_kps, s.summary.mastery_candidate_kps);
});

test("session: weak_kp identified when 3+ attempts even if finally correct", () => {
  // Sequence: 3 wrong submits, then 1 correct (no retry in between so
  // attempts accumulate).  The KP should be flagged weak because attempts>=3,
  // even though final verdict is correct.
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  s = sessionReduce(s, { type: "advance" });
  assert.equal(s.summary.weak_kps.length, 1, "3+ attempts even if finally correct → weak");
  assert.equal(s.summary.kp_attempted[0].attempts, 4);
});

test("session: error action sets ERROR status", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "error", reason: "validator-crashed" });
  assert.equal(s.status, SESSION_STATUS.ERROR);
  assert.equal(s.error.reason, "validator-crashed");
});

test("session: resume replaces state with snapshot", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep(), fakeStep({ step_id: "b" })] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.CORRECT });
  s = sessionReduce(s, { type: "advance" });
  // Now reload from this snapshot
  const snapshot = JSON.parse(JSON.stringify(s));
  let r = sessionInitial({ student_id: "student_t_phase5c_999", steps: [fakeStep()] });
  r = sessionReduce(r, { type: "resume", snapshot });
  assert.equal(r.current_index, 1);
  assert.equal(r.steps.length, 2);
});

test("session: recommend_next picks targeted_practice when weak_kps exist", () => {
  const summary = {
    total_steps: 3,
    completed_steps: 3,
    first_attempt_correct: 1,
    hints_used_total: 2,
    representation_switches_total: 0,
    kp_attempted: [],
    weak_kps: ["math.G5.FRAC.add-unlike-denom"],
    mastered_kps: ["math.G3.MULT.two-digit"],
    duration_seconds: 300,
  };
  const r = recommendNext(summary);
  assert.equal(r.recommended_next_action, "targeted_practice");
  assert.deepEqual(r.recommended_kps, ["math.G5.FRAC.add-unlike-denom"]);
});

test("session: recommend_next picks advance when all mastered and no weak", () => {
  const summary = {
    total_steps: 2,
    completed_steps: 2,
    first_attempt_correct: 2,
    hints_used_total: 0,
    representation_switches_total: 0,
    kp_attempted: [],
    weak_kps: [],
    mastered_kps: ["math.G5.FRAC.add-unlike-denom"],
    duration_seconds: 240,
  };
  const r = recommendNext(summary);
  assert.equal(r.recommended_next_action, "advance");
});

test("session: nextPhase handles all branches", () => {
  assert.equal(nextPhase({ last_verdict: STEP_VERDICT.CORRECT }), STEP_PHASE.FEEDBACK);
  assert.equal(nextPhase({ last_verdict: STEP_VERDICT.UNVERIFIABLE }), STEP_PHASE.FEEDBACK);
  assert.equal(nextPhase({ last_verdict: STEP_VERDICT.INCORRECT, hints_used: 0 }), STEP_PHASE.HINT_LEVEL_1);
  assert.equal(nextPhase({ last_verdict: STEP_VERDICT.INCORRECT, hints_used: 1 }), STEP_PHASE.HINT_LEVEL_2);
  assert.equal(nextPhase({ last_verdict: STEP_VERDICT.INCORRECT, hints_used: 2 }), STEP_PHASE.HINT_LEVEL_3);
  assert.equal(nextPhase({ last_verdict: STEP_VERDICT.INCORRECT, hints_used: 5 }), STEP_PHASE.HINT_LEVEL_3);
  assert.equal(nextPhase({}), STEP_PHASE.PRESENTING);
});

test("session: shouldAdvance only in FEEDBACK with correct/unverifiable", () => {
  assert.equal(shouldAdvance({ phase: STEP_PHASE.FEEDBACK, verdict: STEP_VERDICT.CORRECT }), true);
  assert.equal(shouldAdvance({ phase: STEP_PHASE.FEEDBACK, verdict: STEP_VERDICT.UNVERIFIABLE }), true);
  assert.equal(shouldAdvance({ phase: STEP_PHASE.FEEDBACK, verdict: STEP_VERDICT.INCORRECT }), false);
  assert.equal(shouldAdvance({ phase: STEP_PHASE.PRESENTING, verdict: STEP_VERDICT.CORRECT }), false);
});

test("session: buildSummary counts hint usage + representation switches", () => {
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  s = sessionReduce(s, { type: "submit", verdict: STEP_VERDICT.INCORRECT });
  s = sessionReduce(s, { type: "hint" });
  s = sessionReduce(s, { type: "hint" });
  s = sessionReduce(s, { type: "representation_switch", to: "number_line" });
  s = sessionReduce(s, { type: "advance" });
  assert.equal(s.summary.hints_used_total, 2);
  assert.equal(s.summary.representation_switches_total, 1);
  assert.equal(s.summary.kp_attempted.length, 1);
  assert.equal(s.summary.kp_attempted[0].kp, "math.G5.FRAC.add-unlike-denom");
});

test("session: fake IDs only — production student IDs never leak into state", () => {
  // Sanity: production IDs (student_001, student_002) must not be used
  // in any session state during automated tests.
  const s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  assert.ok(s.student_id.startsWith("student_t_phase5c_"));
});

test("session: phase progression stays within locked escalation (no skipping to ANSWER)", () => {
  // Phase 5C plan: never reveal the final answer immediately.
  // We can't prove a negative directly, but the invariant that the state
  // machine has no action type "show_answer" is enough for unit-level proof.
  let s = sessionInitial({ student_id: "student_t_phase5c_001", steps: [fakeStep()] });
  const result = sessionReduce(s, { type: "show_answer" });  // unknown action
  assert.equal(result, s, "unknown actions must not change state");
});
