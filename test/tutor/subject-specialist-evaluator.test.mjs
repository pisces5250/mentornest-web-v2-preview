import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSubjectChoice } from "../../server/tutor/subject-specialist-evaluator.mjs";
import { STAGING_QUESTIONS } from "../../provider/openclaw/fixtures/staging-question-set.mjs";

const fixtures = STAGING_QUESTIONS.filter((question) => question.type === "multiple_choice");

test("五科各有六題candidate，English包含一題受限read-aloud", () => {
  assert.equal(STAGING_QUESTIONS.length, 30);
  for (const subject of ["math", "english", "chinese", "science", "social_studies"]) {
    assert.equal(STAGING_QUESTIONS.filter((question) => question.subject === subject).length, 6);
  }
  const voice = STAGING_QUESTIONS.find((question) => question.type === "voice_response");
  assert.equal(voice.subject, "english");
  assert.equal(voice.specialist.mode, "read_aloud");
  assert.equal(voice.specialist.rubric.local_stt_only, true);
  assert.equal(voice.specialist.rubric.transcript_retention, "none");
});

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
