// Test the coverage-driven AI authoring orchestrator against a tmp data root.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  runAuthoringCycle,
  planAuthoringCycle,
  planTopGaps,
  defaultStubAuthor,
} from "../lib/ai_question_authoring_orchestrator.mjs";

const TMP_ROOT = path.join(os.tmpdir(), "mn_orch_test_" + Math.random().toString(36).slice(2));
const DATA_ROOT = path.join(TMP_ROOT, "workspace", "data");
const WORKSPACE = path.join(TMP_ROOT, "workspace");

test("setup tmp workspace with curriculum", async () => {
  await fs.mkdir(path.join(DATA_ROOT, "questions", "curated", "math", "G5"), { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, "questions", "verified", "math", "G5"), { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, "questions", "rejected"), { recursive: true });
});

test("planAuthoringCycle: empty bank produces a full gap list", async () => {
  const plan = await planAuthoringCycle({
    workspace: DATA_ROOT,
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
  });
  assert.equal(plan.subject, "math");
  assert.equal(plan.grade, 5);
  assert.equal(plan.cells_total, 9);
  assert.equal(plan.cells_covered, 0);
  assert.ok(plan.next_batch.length > 0);
  // Top batch should not exceed default batch_size
  assert.ok(plan.next_batch.length <= 5);
});

test("planTopGaps: respects topN", async () => {
  const gaps = await planTopGaps({ workspace: DATA_ROOT, subject: "math", grade: 5, topN: 3 });
  assert.equal(gaps.length, 3);
});

test("runAuthoringCycle: writes accepted math questions to verified", async () => {
  // Pre-create the curriculum YAML since the orchestrator loads it
  const curDir = path.join(TMP_ROOT, "workspace", "architecture", "curriculum");
  await fs.mkdir(curDir, { recursive: true });
  await fs.writeFile(path.join(curDir, "index.yaml"), `
meta:
  scope: "G1-G6"
  source_documents: ["教育部 十二年國民基本教育課程綱要"]
subjects:
  math:
    file: math.yaml
`);
  await fs.writeFile(path.join(curDir, "math.yaml"), `
subject: math
grades:
  "5":
    knowledge_points:
      - id: math.G5.FRAC.add-unlike-denom
        grade: 5
        topic: FRAC
        subtopic: add-unlike-denom
        display_name_zh: "異分母分數加法"
`);

  const result = await runAuthoringCycle({
    workspace: WORKSPACE,
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
    batch_size: 3,
  });
  assert.equal(result.ok, true);
  assert.ok(result.run.length > 0);
  // Stub author always produces a valid 5/6 fraction. First 3 should be
  // accepted; later attempts are rejected by dedupe (same stem).
  const accepted = result.run.filter((r) => r.written_to);
  assert.ok(accepted.length > 0, "at least one accepted");
  // Confirm a verified file actually exists on disk
  const verifiedDir = path.join(DATA_ROOT, "questions", "verified", "math", "G5");
  const files = await fs.readdir(verifiedDir);
  assert.ok(files.length > 0);
  // First accepted run should have all three receipts
  const first = result.run.find((r) => r.written_to);
  assert.ok(first.receipt.curator);
  assert.ok(first.receipt.curator.ok);
  assert.ok(first.receipt.quality);
  assert.ok(first.receipt.quality.ok);
  assert.ok(first.receipt.math_verifier);
  assert.equal(first.receipt.math_verifier.ok, true);
});

test("runAuthoringCycle: rejects when author_fn returns garbage", async () => {
  const result = await runAuthoringCycle({
    workspace: WORKSPACE,
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
    batch_size: 5,
    authorFn: () => ({ stem: "garbage", answer: "???" }),
  });
  // Garbage primary gets rejected by math_verifier (string not numeric)
  const all_rejected = result.run.every((r) => r.rejected);
  assert.ok(all_rejected, "all garbage Q should be rejected");
});

test("runAuthoringCycle: rejects when author_fn throws", async () => {
  const result = await runAuthoringCycle({
    workspace: WORKSPACE,
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
    batch_size: 1,
    authorFn: () => { throw new Error("simulated upstream error"); },
  });
  const rejected = result.run.filter((r) => r.rejected);
  assert.ok(rejected.length > 0);
  assert.equal(rejected[0].rejected.stage, "author_fn");
});

test("defaultStubAuthor: produces a valid math stub", () => {
  const r = defaultStubAuthor({ subject: "math", grade: 5, kp: "math.G5.FRAC.add-unlike-denom", type: "short_answer", difficulty: "easy" });
  assert.equal(typeof r.stem, "string");
  assert.ok(r.stem.length > 0);
  assert.equal(r.answer, "5/6");
});

test("defaultStubAuthor: non-math stub for chinese", () => {
  const r = defaultStubAuthor({ subject: "chinese", grade: 3, kp: "chinese.G3.READ.basic-literal", type: "short_answer", difficulty: "easy" });
  assert.ok(r.stem.includes("chinese.G3.READ.basic-literal"));
});

test("runAuthoringCycle: rejects invalid workspace", async () => {
  await assert.rejects(async () => runAuthoringCycle({ subject: "math", grade: 5 }));
});

test("runAuthoringCycle: rejects invalid grade", async () => {
  await assert.rejects(async () => runAuthoringCycle({ workspace: WORKSPACE, subject: "math", grade: 13 }));
});

test("cleanup", async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});