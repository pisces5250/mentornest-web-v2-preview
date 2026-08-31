import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyAndWriteStagingQuestion } from "../src/staging-question-quality-writer.mjs";
import { STAGING_QUESTIONS } from "../fixtures/staging-question-set.mjs";

const candidate = {
  id: "q.synthetic.math.g5.frac.add.001", subject: "math", grade: 5,
  knowledge_point: "math.G5.FRAC.add", type: "multiple_choice",
  choices: ["2/5", "5/6"], expected_answer: "5/6", answer_key_version: "synthetic-v1",
  verification_status: "candidate",
  provenance: { source_class: "AI_ORIGINAL", license: "AI_ORIGINAL" },
  specialist: {
    schema_version: "math-choice-specialist-v1",
    evidence_schema: "math-specialist-evidence-v1",
    subskill: "fraction_addition",
    correct_feedback: "答對了。",
    distractors: {
      "2/5": {
        error_codes: ["MATH-CON-DENOM"], feedback: "分母不能直接相加。", hint: "先找共同分母。",
        representation: { kind: "fraction_bar", payload: {} },
      },
    },
  },
};

test("synthetic staging題目只經Question Quality authority寫入verified bank", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-writer-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: root, verifiedBankRoot: path.join(root, "namespace", "verified-bank") };
  const first = await verifyAndWriteStagingQuestion(candidate, config);
  const second = await verifyAndWriteStagingQuestion(candidate, config);
  assert.equal(first.written, true);
  assert.equal(second.written, false);
  assert.equal(second.idempotent, true);
  assert.equal(first.receipt_id, second.receipt_id);
  assert.match(first.content_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.authority, "question_quality_agent_verify");
  const stored = JSON.parse(await fs.readFile(path.join(config.verifiedBankRoot, "math", "G5", `${candidate.id}.json`), "utf8"));
  assert.equal(stored.verification_status, "verified");
  assert.equal(stored.quality.authority, "question_quality_agent_verify");
  assert.equal(stored.quality.receipt_id, first.receipt_id);
  assert.ok(stored.quality.stages_passed.includes("subject-specialist"));
});

test("Question Quality writer遇到相同ID不同內容時回409 conflict語意", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-conflict-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: root, verifiedBankRoot: path.join(root, "namespace", "verified-bank") };
  await verifyAndWriteStagingQuestion(candidate, config);
  await assert.rejects(
    verifyAndWriteStagingQuestion({ ...candidate, stem: "不同內容" }, config),
    (error) => error.code === "verified_question_conflict" && error.status === 409,
  );
});

test("Question Quality writer拒絕production、非synthetic與未通過answer gate題目", async () => {
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: "/tmp", verifiedBankRoot: "/tmp/unused/verified-bank" };
  await assert.rejects(verifyAndWriteStagingQuestion(candidate, { ...config, environment: "production" }), /staging_only/);
  await assert.rejects(verifyAndWriteStagingQuestion({ ...candidate, id: "q.real.math.001" }, config), /synthetic/);
  await assert.rejects(verifyAndWriteStagingQuestion({ ...candidate, expected_answer: "9/9" }, config), /answer_not_in_choices/);
  await assert.rejects(verifyAndWriteStagingQuestion({ ...candidate, specialist: undefined }, config), /subject_specialist/);
});

test("Question Quality writer拒絕staging namespace symlink逃逸", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-outside-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, "namespace"));
  await assert.rejects(verifyAndWriteStagingQuestion(candidate, {
    environment: "staging", productionDataAllowed: false, dataRoot: root,
    verifiedBankRoot: path.join(root, "namespace", "verified-bank"),
  }), /path_escape/);
});

test("Question Quality writer只接受local-only且不保留transcript的English read-aloud instrument", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-voice-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: root, verifiedBankRoot: path.join(root, "namespace", "verified-bank") };
  const voice = STAGING_QUESTIONS.find((question) => question.type === "voice_response");
  const receipt = await verifyAndWriteStagingQuestion(voice, config);
  assert.equal(receipt.written, true);
  const unsafe = { ...voice, specialist: { ...voice.specialist, rubric: { ...voice.specialist.rubric, local_stt_only: false } } };
  await assert.rejects(verifyAndWriteStagingQuestion({ ...unsafe, id: "q.synthetic.english.read-aloud.unsafe" }, config), /read_aloud/);
});

test("五科各六題皆逐題取得唯一durable receipt與content digest", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-thirty-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: root, verifiedBankRoot: path.join(root, "namespace", "verified-bank") };
  const receipts = [];
  for (const question of STAGING_QUESTIONS) receipts.push(await verifyAndWriteStagingQuestion(question, config));
  assert.equal(receipts.length, 30);
  assert.equal(new Set(receipts.map((receipt) => receipt.receipt_id)).size, 30);
  assert.ok(receipts.every((receipt) => receipt.written && /^sha256:[a-f0-9]{64}$/.test(receipt.content_digest)));
  for (const subject of ["math", "english", "chinese", "science", "social_studies"]) {
    assert.equal(receipts.filter((_, index) => STAGING_QUESTIONS[index].subject === subject).length, 6);
  }
});
