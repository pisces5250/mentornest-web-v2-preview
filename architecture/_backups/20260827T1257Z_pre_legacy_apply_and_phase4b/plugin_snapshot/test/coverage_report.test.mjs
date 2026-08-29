// Test coverage report module (uses tmp data root)
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { buildCoverageReport, topGaps } from "../lib/coverage_report.mjs";

const TMP_ROOT = path.join(os.tmpdir(), "mn_coverage_test_" + Math.random().toString(36).slice(2));
const DATA_ROOT = path.join(TMP_ROOT, "workspace", "data");

test("setup tmp workspace", async () => {
  await fs.mkdir(path.join(DATA_ROOT, "questions", "verified", "math", "G5"), { recursive: true });
});

test("buildCoverageReport: counts existing verified questions by cell", async () => {
  const ws = DATA_ROOT;
  // Seed 2 verified questions at math.G5.FRAC.add-unlike-denom short_answer/easy
  for (let i = 0; i < 2; i++) {
    const id = `q.ai_authored.math.G5.FRAC.add-unlike-denom.${i}-${i}-${i}-${i}-${i}`;
    await fs.writeFile(
      path.join(ws, "questions", "verified", "math", "G5", `${id}.json`),
      JSON.stringify({
        id, type: "short_answer", subject: "math", grade: 5,
        knowledge_point: "math.G5.FRAC.add-unlike-denom", difficulty: "easy",
        stem: `seed ${i}`,
      })
    );
  }
  const report = await buildCoverageReport({
    workspace: ws,
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
  });
  assert.equal(report.kps_scanned, 1);
  // Math = 9 cells (3 short + 3 mc + 3 tf)
  assert.equal(report.cells_total, 9);
  // 2 of 3 short_answer/easy target=3 → covered, but other 8 cells missing.
  // actual short_answer/easy = 2; target = 3 → not covered.
  // The covered count is computed by `actual >= target`. So none covered yet.
  assert.equal(report.cells_covered, 0);
  // gaps should include short_answer/easy with missing=1
  const saEasy = report.gaps.find((g) => g.type === "short_answer" && g.difficulty === "easy");
  assert.equal(saEasy.actual, 2);
  assert.equal(saEasy.target, 3);
  assert.equal(saEasy.missing, 1);
  // Top gap should be the largest missing, which is the rest of the bank.
  // All other cells have missing = target - 0 = target.
  // highest target = 3 (short_answer/easy and short_answer/medium).
  // Both have missing 1 and 3 respectively.
  // So short_answer/medium (missing=3) should be top.
  const topGap = report.authoring_priority[0];
  assert.equal(topGap.type, "short_answer");
  assert.equal(topGap.difficulty, "medium");
  assert.equal(topGap.missing, 3);
});

test("topGaps: respects topN", async () => {
  const gaps = await topGaps({
    workspace: DATA_ROOT,
    subject: "math",
    grade: 5,
    topN: 2,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
  });
  assert.equal(gaps.length, 2);
});

test("buildCoverageReport: marks cell covered when target met", async () => {
  const ws = DATA_ROOT;
  // Add more seeds to bring short_answer/easy to target
  for (let i = 0; i < 3; i++) {
    const id = `q.ai_authored.math.G5.FRAC.add-unlike-denom.${i}-extra`;
    await fs.writeFile(
      path.join(ws, "questions", "verified", "math", "G5", `${id}.json`),
      JSON.stringify({
        id, type: "short_answer", subject: "math", grade: 5,
        knowledge_point: "math.G5.FRAC.add-unlike-denom", difficulty: "easy",
        stem: `seed ${i}`,
      })
    );
  }
  // Also seed a true_false/easy
  await fs.writeFile(
    path.join(ws, "questions", "verified", "math", "G5", `q.ai_authored.math.G5.FRAC.add-unlike-denom.tf1.json`),
    JSON.stringify({
      id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.tf1",
      type: "true_false", subject: "math", grade: 5,
      knowledge_point: "math.G5.FRAC.add-unlike-denom", difficulty: "easy",
      stem: "T/F: 1/2 = 2/4",
    })
  );
  const report = await buildCoverageReport({
    workspace: ws,
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
  });
  // short_answer/easy now has 5 actual (>=3). covered.
  // true_false/easy has 1 actual (>=1). covered.
  // So 2 cells covered out of 9.
  assert.equal(report.cells_covered, 2);
  assert.equal(report.coverage_ratio, 2 / 9);
});

test("buildCoverageReport: rejects invalid grade", async () => {
  await assert.rejects(async () => buildCoverageReport({ workspace: DATA_ROOT, subject: "math", grade: 0 }));
  await assert.rejects(async () => buildCoverageReport({ workspace: DATA_ROOT, subject: "math", grade: 13 }));
});

test("buildCoverageReport: rejects missing workspace", async () => {
  await assert.rejects(async () => buildCoverageReport({ subject: "math", grade: 5 }));
});

test("buildCoverageReport: rejects missing subject", async () => {
  await assert.rejects(async () => buildCoverageReport({ workspace: DATA_ROOT, grade: 5 }));
});

test("cleanup", async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});