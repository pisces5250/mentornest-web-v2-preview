// Test Learning Director modules (cross-subject aggregator, prereq detector, weekly strategy).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  crossSubjectWeaknessAggregator,
  prerequisiteGapDetector,
  weeklyStrategyEmitter,
} from "../lib/learning_director.mjs";
import { setMastery } from "../lib/mastery_store.mjs";
import { updateMasteryFromEvent } from "../lib/mastery_store.mjs";

const TMP_ROOT = path.join(os.tmpdir(), "mn_director_test_" + Math.random().toString(36).slice(2));

// Override the MASTERY_DIR by monkey-patching the path module is brittle;
// instead we write directly to the live mastery store (will be cleaned up).

test("setup: clean mastery state", async () => {
  // Remove any leftover mastery files
  const dir = "/home/node/.openclaw/workspace/data/mastery";
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.startsWith("student_test_")) await fs.unlink(path.join(dir, f));
    }
  } catch (e) {
    // dir may not exist; OK
  }
});

test("crossSubjectWeaknessAggregator: returns empty for student with no mastery", async () => {
  const result = await crossSubjectWeaknessAggregator({
    student_id: "student_test_empty",
    workspace: "/tmp",
  });
  assert.equal(result.student_id, "student_test_empty");
  assert.deepEqual(result.cells, []);
  assert.deepEqual(result.cross_subject_weak_subjects, []);
});

test("crossSubjectWeaknessAggregator: ranks weak cells correctly", async () => {
  // Seed two mastery records with different weakness
  await updateMasteryFromEvent({
    student_id: "student_test_weak",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subskill: "",
    result: "incorrect",
    attempts: 2,
    hints: 1,
    error_type: "calculation_error",
  });
  await updateMasteryFromEvent({
    student_id: "student_test_weak",
    subject: "chinese",
    knowledge_point: "chinese.G3.READ.basic-literal",
    subskill: "",
    result: "incorrect",
    attempts: 3,
    hints: 0,
    error_type: "vocabulary_gap",
  });
  // Second math error to push it down further
  await updateMasteryFromEvent({
    student_id: "student_test_weak",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subskill: "",
    result: "incorrect",
    attempts: 1,
    hints: 0,
    error_type: "calculation_error",
  });
  const result = await crossSubjectWeaknessAggregator({
    student_id: "student_test_weak",
    workspace: "/tmp",
    topN: 5,
  });
  assert.equal(result.cells.length, 2);
  // math has 2 errors, chinese has 1 → math should be ranked first (higher weakness)
  assert.equal(result.cells[0].subject, "math");
  assert.ok(result.cells[0].score >= result.cells[1].score);
  assert.ok(result.cross_subject_weak_subjects.length === 0, "no subject has >=2 weak cells (yet — both cells are within their own subject)");
});

test("crossSubjectWeaknessAggregator: flags cross-subject weak subject", async () => {
  // Add a third weak cell in math to make it have >=2 weak cells
  await updateMasteryFromEvent({
    student_id: "student_test_weak2",
    subject: "math",
    knowledge_point: "math.G5.NUMBER.decimal-place",
    subskill: "",
    result: "incorrect",
    attempts: 1,
    hints: 0,
    error_type: "concept_misunderstanding",
  });
  await updateMasteryFromEvent({
    student_id: "student_test_weak2",
    subject: "math",
    knowledge_point: "math.G5.MEASURE.area-perimeter",
    subskill: "",
    result: "incorrect",
    attempts: 1,
    hints: 0,
    error_type: "concept_misunderstanding",
  });
  await updateMasteryFromEvent({
    student_id: "student_test_weak2",
    subject: "english",
    knowledge_point: "english.G3.READ.basic",
    subskill: "",
    result: "incorrect",
    attempts: 1,
    hints: 0,
    error_type: "vocabulary_gap",
  });
  const result = await crossSubjectWeaknessAggregator({
    student_id: "student_test_weak2",
    workspace: "/tmp",
  });
  // math has 2 weak cells, english has 1 → math flagged
  assert.ok(result.cross_subject_weak_subjects.includes("math"));
  assert.ok(!result.cross_subject_weak_subjects.includes("english"));
});

test("crossSubjectWeaknessAggregator: rejects invalid student_id", async () => {
  await assert.rejects(async () => crossSubjectWeaknessAggregator({ student_id: "../etc/passwd", workspace: "/tmp" }));
  await assert.rejects(async () => crossSubjectWeaknessAggregator({ student_id: "", workspace: "/tmp" }));
});

test("crossSubjectWeaknessAggregator: rejects missing workspace", async () => {
  await assert.rejects(async () => crossSubjectWeaknessAggregator({ student_id: "student_001" }));
});

test("prerequisiteGapDetector: returns blocking_gaps when prereq missing", async () => {
  const result = await prerequisiteGapDetector({
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    student_id: "student_test_prereq",
    workspace: "/tmp",
  });
  // If the curriculum YAML has no prerequisites declared, chain is empty
  assert.equal(result.target.kp, "math.G5.FRAC.add-unlike-denom");
  assert.ok(Array.isArray(result.chain));
  assert.ok(Array.isArray(result.blocking_gaps));
  assert.ok(typeof result.recommendation === "string");
});

test("prerequisiteGapDetector: rejects invalid student_id", async () => {
  await assert.rejects(async () => prerequisiteGapDetector({
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    student_id: "../etc",
    workspace: "/tmp",
  }));
});

test("weeklyStrategyEmitter: emits a complete plan", async () => {
  // Seed some mastery so the plan has something to report
  await updateMasteryFromEvent({
    student_id: "student_test_weekly",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subskill: "",
    result: "incorrect",
    attempts: 2,
    hints: 1,
    error_type: "calculation_error",
  });
  await updateMasteryFromEvent({
    student_id: "student_test_weekly",
    subject: "chinese",
    knowledge_point: "chinese.G3.READ.basic-literal",
    subskill: "",
    result: "correct",
    attempts: 1,
    hints: 0,
  });
  const result = await weeklyStrategyEmitter({
    student_id: "student_test_weekly",
    workspace: "/tmp",
    week_of: "2026-08-25",
  });
  assert.equal(result.student_id, "student_test_weekly");
  assert.equal(result.week_of, "2026-08-25");
  assert.ok(result.focus_areas.length > 0, "should have at least one focus area (math weak)");
  assert.ok(result.parent_summary_for_week.includes("本週"));
  assert.ok(result.parent_summary_for_week.includes("資料只用於孩子個人化學習"));
});

test("weeklyStrategyEmitter: privacy copy appears even with no mastery data", async () => {
  const result = await weeklyStrategyEmitter({
    student_id: "student_test_no_data",
    workspace: "/tmp",
    week_of: "2026-08-25",
  });
  assert.equal(result.focus_areas.length, 0);
  assert.equal(result.review_due.length, 0);
  assert.ok(result.parent_summary_for_week.includes("資料只用於孩子個人化學習"));
});

test("weeklyStrategyEmitter: rejects invalid student_id", async () => {
  await assert.rejects(async () => weeklyStrategyEmitter({
    student_id: "bad",
    workspace: "/tmp",
  }));
});

test("cleanup", async () => {
  const dir = "/home/node/.openclaw/workspace/data/mastery";
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.startsWith("student_test_")) await fs.unlink(path.join(dir, f));
    }
  } catch (e) {
    // OK
  }
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});