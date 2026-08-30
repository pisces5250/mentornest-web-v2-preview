import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyAndWriteStagingQuestion } from "../src/staging-question-quality-writer.mjs";

const candidate = {
  id: "q.synthetic.math.g5.frac.add.001", subject: "math", grade: 5,
  knowledge_point: "math.G5.FRAC.add", type: "multiple_choice",
  choices: ["2/5", "5/6"], expected_answer: "5/6", answer_key_version: "synthetic-v1",
  verification_status: "candidate",
  provenance: { source_class: "AI_ORIGINAL", license: "AI_ORIGINAL" },
};

test("synthetic staging題目只經Question Quality authority寫入verified bank", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-quality-writer-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: root, verifiedBankRoot: path.join(root, "namespace", "verified-bank") };
  const first = await verifyAndWriteStagingQuestion(candidate, config);
  const second = await verifyAndWriteStagingQuestion(candidate, config);
  assert.equal(first.written, true);
  assert.equal(second.written, false);
  assert.equal(first.authority, "question_quality_agent_verify");
  const stored = JSON.parse(await fs.readFile(path.join(config.verifiedBankRoot, "math", "G5", `${candidate.id}.json`), "utf8"));
  assert.equal(stored.verification_status, "verified");
  assert.equal(stored.quality.authority, "question_quality_agent_verify");
});

test("Question Quality writer拒絕production、非synthetic與未通過answer gate題目", async () => {
  const config = { environment: "staging", productionDataAllowed: false, dataRoot: "/tmp", verifiedBankRoot: "/tmp/unused/verified-bank" };
  await assert.rejects(verifyAndWriteStagingQuestion(candidate, { ...config, environment: "production" }), /staging_only/);
  await assert.rejects(verifyAndWriteStagingQuestion({ ...candidate, id: "q.real.math.001" }, config), /synthetic/);
  await assert.rejects(verifyAndWriteStagingQuestion({ ...candidate, expected_answer: "9/9" }, config), /answer_not_in_choices/);
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
