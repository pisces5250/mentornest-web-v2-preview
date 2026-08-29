// Tests: cross_subject_merge
// Run with: node --test test/cross_subject_merge.test.mjs
//
// Covers:
//   - priority order: mastery_check > backtrack_prerequisite > drill > text_prompt
//   - multi-subject tie-break (lower mastery wins for mastery_check)
//   - empty decisions returns text_prompt with errors
//   - bucketizeAction classifies drills correctly
//   - mergeFromResponses stitches from dispatch output

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeCrossSubjectDecisions,
  mergeFromResponses,
  validateDecisions,
  bucketizeAction,
  ACTION_PRIORITY,
} from "../lib/cross_subject_merge.mjs";

test("merge: priority order — mastery_check beats text_prompt", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "text_prompt", mastery: 0.5 },
      { subject: "chinese", action: "mastery_check", mastery: 0.85 },
    ],
  });
  assert.equal(r.action, "mastery_check");
  assert.equal(r.chosen_subject, "chinese");
});

test("merge: priority order — backtrack_prerequisite beats drill", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "english", action: "drill_phonics", mastery: 0.5 },
      { subject: "science", action: "backtrack_prerequisite", mastery: 0.5 },
    ],
  });
  assert.equal(r.action, "backtrack_prerequisite");
  assert.equal(r.chosen_subject, "science");
});

test("merge: priority order — drill beats text_prompt", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "text_prompt", mastery: 0.7 },
      { subject: "english", action: "vocab_drill", mastery: 0.3 },
    ],
  });
  assert.equal(r.action, "vocab_drill");
  assert.equal(r.chosen_subject, "english");
});

test("merge: tie-break — for two mastery_check decisions, lower mastery wins", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "mastery_check", mastery: 0.6 },
      { subject: "english", action: "mastery_check", mastery: 0.3 },
    ],
  });
  assert.equal(r.action, "mastery_check");
  assert.equal(r.chosen_subject, "english");
});

test("merge: tie-break — for two drills, lower mastery wins", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "text_prompt", mastery: 0.5 },
      { subject: "english", action: "drill_phonics", mastery: 0.7 },
      { subject: "chinese", action: "vocabulary_drill", mastery: 0.3 },
    ],
  });
  assert.equal(r.action, "vocabulary_drill");
  assert.equal(r.chosen_subject, "chinese");
});

test("merge: tie-break — equal mastery, subject order (SUPPORTED_SUBJECTS)", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "english", action: "drill_phonics", mastery: 0.5 },
      { subject: "math", action: "drill_arithmetic", mastery: 0.5 },
    ],
  });
  // Both bucket=drill, mastery equal → math comes earlier in SUPPORTED_SUBJECTS
  assert.equal(r.chosen_subject, "math");
});

test("merge: single decision is chosen verbatim", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "science", action: "experiment_simulation", mastery: 0.4 },
    ],
  });
  assert.equal(r.action, "experiment_simulation");
  assert.equal(r.chosen_subject, "science");
});

test("merge: empty decisions returns text_prompt with errors", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [],
  });
  assert.equal(r.action, "text_prompt");
  assert.equal(r.chosen_subject, "");
  assert.ok(Array.isArray(r.errors));
  assert.ok(r.errors.includes("decisions_empty"));
});

test("merge: validateDecisions rejects non-array", () => {
  const v = validateDecisions("not an array");
  assert.equal(v.valid, false);
  assert.ok(v.errors.includes("decisions_not_array"));
});

test("merge: validateDecisions rejects entries missing subject/action", () => {
  const v = validateDecisions([{ subject: "math" }, { action: "x" }]);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.startsWith("decisions[") && e.endsWith(".action_missing")));
});

test("merge: ranked array is in priority order", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "text_prompt", mastery: 0.5 },
      { subject: "english", action: "mastery_check", mastery: 0.85 },
      { subject: "science", action: "concept_clarification", mastery: 0.5 },
    ],
  });
  assert.equal(r.ranked[0].subject, "english");
  assert.equal(r.ranked[0].rank, 0); // mastery_check
});

test("merge: rationale describes priority and tie-break", () => {
  const r = mergeCrossSubjectDecisions({
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "text_prompt", mastery: 0.5 },
      { subject: "english", action: "drill_phonics", mastery: 0.3 },
    ],
  });
  assert.ok(r.rationale.includes("priority=drill"));
  assert.ok(r.rationale.includes("english"));
});

test("bucketizeAction: detects drill variants", () => {
  assert.equal(bucketizeAction("drill_phonics"), "drill");
  assert.equal(bucketizeAction("vocabulary_drill"), "drill");
  assert.equal(bucketizeAction("vocab_drill"), "drill");
  assert.equal(bucketizeAction("drill_arithmetic"), "drill");
  assert.equal(bucketizeAction("mastery_check"), "mastery_check");
  assert.equal(bucketizeAction("backtrack_prerequisite"), "backtrack_prerequisite");
  assert.equal(bucketizeAction("text_prompt"), "text_prompt");
  assert.equal(bucketizeAction("unknown_thing"), "text_prompt");
});

test("ACTION_PRIORITY: has the 4 buckets in canonical order", () => {
  assert.deepEqual([...ACTION_PRIORITY], [
    "mastery_check",
    "backtrack_prerequisite",
    "drill",
    "text_prompt",
  ]);
});

test("mergeFromResponses: picks from a list of SubjectSpecialistResponses", () => {
  const r = mergeFromResponses({
    student_id: "student_001",
    responses: [
      {
        subject: "math",
        next_action: "text_prompt",
        knowledge_point: "math.G1.x",
        diagnosis_payload: null,
      },
      {
        subject: "english",
        next_action: "mastery_check",
        knowledge_point: "english.G3.x",
        diagnosis_payload: { mastery: 0.85 },
      },
    ],
  });
  assert.equal(r.action, "mastery_check");
  assert.equal(r.chosen_subject, "english");
});
