import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { evaluateSubjectChoice } from "../../server/tutor/subject-specialist-evaluator.mjs";

const fixtures = JSON.parse(await fs.readFile(new URL("../../provider/openclaw/fixtures/staging-questions.json", import.meta.url), "utf8"));

test("五科 verified choice evaluator 保留各科 schema、taxonomy 與 representation", () => {
  for (const question of fixtures) {
    const wrong = question.choices.find((choice) => choice !== question.expected_answer);
    const result = evaluateSubjectChoice({ question, response: wrong, attemptIndex: 1 });
    assert.equal(result.available, true, question.subject);
    assert.equal(result.judgement.result, "incorrect");
    assert.equal(result.diagnosis.evidence_status, "inferred");
    assert.ok(result.diagnosis.error_codes.length > 0);
    assert.ok(result.teaching.hint.length > 0);
    assert.ok(result.teaching.representation.kind.length > 0);
    assert.equal(result.evidence_payload.subject, question.subject);
    assert.equal(result.evidence_payload.result, "incorrect");
  }
});

test("五科答對只形成 observed evidence，不形成 mastery verdict", () => {
  for (const question of fixtures) {
    const result = evaluateSubjectChoice({ question, response: question.expected_answer, attemptIndex: 1 });
    assert.equal(result.judgement.result, "correct");
    assert.equal(result.diagnosis.evidence_status, "observed");
    assert.deepEqual(result.diagnosis.error_codes, []);
    assert.equal(JSON.stringify(result).includes("mastery"), false);
  }
});

test("沒有正式 specialist metadata 或不是單選題時 fail-closed", () => {
  const question = fixtures[2];
  assert.equal(evaluateSubjectChoice({ question: { ...question, specialist: undefined }, response: question.expected_answer, attemptIndex: 1 }).available, false);
  assert.equal(evaluateSubjectChoice({ question: { ...question, type: "open_response" }, response: question.expected_answer, attemptIndex: 1 }).available, false);
});
