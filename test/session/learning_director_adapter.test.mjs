// test/session/learning_director_adapter.test.mjs
//
// Phase 5C-1 — Adapter safety + shape tests.
// All assertions are local; we do NOT need network or plugin filesystem
// for the safety guard tests.  The plugin call tests are skipped when the
// verified bank is empty (which it is on first install).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toStep,
  ageBandToGrade,
  __TEST__,
} from "../../src/session/learning-director-adapter.mjs";

const { assertSafeStudentId, PRODUCTION_STUDENT_IDS } = __TEST__;

test("adapter: production student IDs are REFUSED at boundary", () => {
  assert.throws(
    () => assertSafeStudentId("student_001"),
    /REFUSING to use production student_id/
  );
  assert.throws(
    () => assertSafeStudentId("student_002"),
    /REFUSING to use production student_id/
  );
});

test("adapter: fake IDs pass through", () => {
  assert.doesNotThrow(() => assertSafeStudentId("student_t_phase5c_001"));
  assert.doesNotThrow(() => assertSafeStudentId("student_t_phase5c_abc-99"));
});

test("adapter: empty / non-string student_id rejected", () => {
  assert.throws(() => assertSafeStudentId(""));
  assert.throws(() => assertSafeStudentId(null));
  assert.throws(() => assertSafeStudentId(undefined));
  assert.throws(() => assertSafeStudentId(123));
  assert.throws(() => assertSafeStudentId("with spaces"));
});

test("adapter: PRODUCTION_STUDENT_IDS set contains exactly student_001 and student_002", () => {
  assert.equal(PRODUCTION_STUDENT_IDS.size, 2);
  assert.ok(PRODUCTION_STUDENT_IDS.has("student_001"));
  assert.ok(PRODUCTION_STUDENT_IDS.has("student_002"));
});

test("adapter: toStep shapes a verified question into a session step", () => {
  const q = {
    id: "q_001",
    subject: "math",
    grade: 6,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    type: "fraction_input",
    difficulty: "medium",
    stem: "1/3 + 1/2 = ?",
    expected_answer: "5/6",
    license: "CC0-1.0",
    source: "verified",
  };
  const step = toStep(q, 0);
  assert.equal(step.step_id, "q_001");
  assert.equal(step.knowledge_point, "math.G5.FRAC.add-unlike-denom");
  assert.equal(step.subject, "math");
  assert.equal(step.question_type, "fraction_input");
  assert.equal(step.representation_type, "text"); // presentation orchestrator upgrades
  assert.equal(stem(step), "1/3 + 1/2 = ?");
});

test("adapter: toStep handles missing optional fields", () => {
  const step = toStep({ subject: "math" }, 5);
  assert.equal(step.step_id, "step_6");
  assert.equal(step.knowledge_point, "unknown");
  assert.equal(step.representation_type, "text");
});

test("adapter: toStep throws on non-object input", () => {
  assert.throws(() => toStep(null, 0));
  assert.throws(() => toStep("string", 0));
  assert.throws(() => toStep(undefined, 0));
});

test("adapter: ageBandToGrade maps known bands", () => {
  assert.equal(ageBandToGrade("G1-G2"), 2);
  assert.equal(ageBandToGrade("G3-G4"), 4);
  assert.equal(ageBandToGrade("G5-G6"), 6);
  assert.equal(ageBandToGrade("G7+"), 8);
});

test("adapter: ageBandToGrade returns undefined for unknown bands", () => {
  assert.equal(ageBandToGrade("kindergarten"), undefined);
  assert.equal(ageBandToGrade(""), undefined);
});

function stem(step) { return step.stem; }
