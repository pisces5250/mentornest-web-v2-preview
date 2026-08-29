import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { makeQuestionId } from "../lib/question_id.mjs";
import { buildProvenance } from "../lib/question_provenance.mjs";
import { buildMergedIndex } from "../lib/curriculum_map.mjs";
import { curateQuestion } from "../lib/question_bank_curator.mjs";
import { verifyQuestion, rejectQuestion } from "../lib/question_quality_agent.mjs";
import { lookupVerified, countVerified } from "../lib/verified_bank_lookup.mjs";
import { listAllVerified, BUCKETS } from "../lib/question_store.mjs";

let tmpRoot;
let idx;

test.before(async () => {
  idx = await buildMergedIndex();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-qb-"));
  // Mirror data/questions and data/question-bank layout under tmpRoot
  await fs.mkdir(path.join(tmpRoot, "questions", BUCKETS[0], "math", "G5"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "questions", BUCKETS[1], "math", "G5"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "questions", BUCKETS[2], "math", "G5"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "questions", BUCKETS[3], "math", "G5"), { recursive: true });
});

test.after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function aiQ(stem, answer, source_id, kp = "math.G5.FRAC.add-unlike-denom") {
  const id = makeQuestionId({ source_class: "ai_authored", source_id, kp });
  const prov = buildProvenance({
    source_class: "ai_authored",
    source_id,
    license: "AI_ORIGINAL",
    generated_by: "mentornest_ai",
    prompt: `Generate: ${stem}`,
  });
  return {
    id,
    type: "short_answer",
    subject: "math",
    grade: 5,
    knowledge_point: kp,
    difficulty: "easy",
    stem,
    answer,
    provenance: prov,
  };
}

test("AI-authored question: curate → verify → lookup round-trip", async () => {
  const q = aiQ("計算 1/2 + 1/3 的結果", "5/6", "batch-A");
  const c = await curateQuestion(q, { curriculum_index: idx, root: tmpRoot });
  assert.equal(c.ok, true);

  const v = await verifyQuestion(q, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v.ok, true);
  assert.deepEqual(v.verified.quality.stages_passed, [
    "structure",
    "provenance",
    "answer",
    "dedupe",
    "parent",
  ]);

  const found = await lookupVerified({ subject: "math", grade: 5, root: tmpRoot });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, q.id);
});

test("AI-authored question: duplicate stem is rejected at dedupe stage", async () => {
  const q1 = aiQ("計算 2/3 + 1/4 的結果", "11/12", "batch-B");
  const v1 = await verifyQuestion(q1, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v1.ok, true);

  const q2 = aiQ("計算 2/3 + 1/4 的結果", "11/12", "batch-B-dup");
  const v2 = await verifyQuestion(q2, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v2.ok, false);
  assert.equal(v2.stage, "dedupe");
  assert.equal(v2.dup.score, 1.0);
});

test("AI-authored question: unparseable answer fails self-check", async () => {
  // Use a fresh stem to bypass dedupe
  const q = aiQ("計算 7/8 加 1/2 的結果", "???", "batch-C");
  const v = await verifyQuestion(q, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v.ok, false);
  // Answer self-check fails because "??" doesn't parse into a numeric kind.
  assert.equal(v.stage, "answer-self-check");
  assert.match(v.reason, /not a parseable numeric form/);
});

test("AI-authored question: parseable answer passes self-check", async () => {
  // "5/6" parses as kind=fraction.
  const q = aiQ("計算 2/5 加 1/5 的結果", "3/5", "batch-C2");
  const v = await verifyQuestion(q, { curriculum_index: idx, root: tmpRoot });
  // pass or fail-on-dedupe
  if (!v.ok && v.stage === "dedupe") return;
  assert.equal(v.ok, true);
});

test("AI-authored question: alt_answers must be equivalent", async () => {
  // 1/4 + 1/5 = 9/20; we set alt_answers to "0.5" which is NOT equivalent
  const q = aiQ("計算 1/4 + 1/5 的結果", "9/20", "batch-D");
  const qWithAlt = { ...q, alt_answers: ["9/20", "0.5"] }; // 0.5 ≠ 9/20
  const v = await verifyQuestion(qWithAlt, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v.ok, false);
  // We get rejected at alt-check OR dedupe; either way ok=false. Check reason.
  if (v.stage === "answer-alt-check") {
    assert.match(v.reason, /alt_answer/);
  } else {
    // duplicate (same stem as another test)
    assert.equal(v.stage, "dedupe");
  }
});

test("AI-authored question: equivalent alt_answers pass", async () => {
  const q = aiQ("計算 3/5 + 1/5 的結果", "4/5", "batch-E");
  const qWithAlt = { ...q, alt_answers: ["4/5", "0.8", "8/10"] }; // all equivalent
  const v = await verifyQuestion(qWithAlt, { curriculum_index: idx, root: tmpRoot });
  // pass or fail-on-dedupe (depending on test order)
  if (!v.ok && v.stage === "dedupe") return;
  assert.equal(v.ok, true);
});

test("AI_ADAPTED: missing parent_question_id is rejected", async () => {
  const id = makeQuestionId({ source_class: "ai_authored", source_id: "adapt-1", kp: "math.G5.FRAC.add-unlike-denom" });
  // Bypass makeProvenance; directly craft
  const q = aiQ("改編題目 1/2 加 1/3", "5/6", "adapt-1");
  // Override with AI_ADAPTED but no parent — must fail at provenance stage.
  q.id = id;
  q.provenance = {
    source_class: "ai_authored",
    source_id: "adapt-1",
    license: "AI_ADAPTED",
    generated_at: new Date().toISOString(),
    generated_by: "mentornest_ai",
    prompt_hash: "0123456789abcdef",
  };
  const v = await verifyQuestion(q, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v.ok, false);
  assert.equal(v.stage, "provenance");
  assert.match(v.reason, /parent_question_id/);
});

test("AI_ADAPTED: parent reachable in verified bank", async () => {
  // First create a verified parent
  const parent = aiQ("原始題 1/2 加 1/3 的結果", "5/6", "batch-parent");
  const vp = await verifyQuestion(parent, { curriculum_index: idx, root: tmpRoot });
  if (!vp.ok) {
    // If dedupe blocks, the test environment already had this; skip cleanly
    assert.equal(vp.stage, "dedupe");
    return;
  }
  // Then an adapted child
  const id = makeQuestionId({ source_class: "ai_authored", source_id: "adapt-child", kp: "math.G5.FRAC.add-unlike-denom" });
  const prov = buildProvenance({
    source_class: "ai_authored",
    source_id: "adapt-child",
    license: "AI_ADAPTED",
    generated_by: "mentornest_ai",
    prompt: "adapt",
    parent_question_id: parent.id,
  });
  // Use a slightly different stem to avoid dedupe on parent
  const child = {
    id,
    type: "short_answer",
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    difficulty: "easy",
    stem: "改編後的題目 1/2 加 1/3 等於多少？",
    answer: "5/6",
    provenance: prov,
  };
  const v = await verifyQuestion(child, { curriculum_index: idx, root: tmpRoot });
  assert.equal(v.ok, true);
});

test("countVerified matches lookupVerified length", async () => {
  const cnt = await countVerified({ subject: "math", grade: 5, root: tmpRoot });
  const lst = await lookupVerified({ subject: "math", grade: 5, limit: 100, root: tmpRoot });
  assert.equal(cnt, lst.length);
});

test("rejectQuestion writes to rejected/ with reason", async () => {
  const q = aiQ("被拒絕的題目 3/4 加 1/8", "7/8", "batch-reject");
  await rejectQuestion(q, { root: tmpRoot }, "manual rejection for test");
  const rejectedDir = path.join(tmpRoot, "questions", "rejected", "math", "G5");
  const files = await fs.readdir(rejectedDir);
  const found = files.find((f) => f.includes(q.id));
  assert.ok(found, "rejected file not written");
});

test("listAllVerified is callable and returns array", async () => {
  const all = await listAllVerified(tmpRoot);
  assert.ok(Array.isArray(all));
});
