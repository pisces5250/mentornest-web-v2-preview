// Tests: subject_v1_contract
// Run with: node --test test/subject_v1_contract.test.mjs
//
// Covers:
//   - SUBJECT_SPECIALIST_CONTRACT_VERSION
//   - SUPPORTED_SUBJECTS list
//   - validateRequest round-trip (accepts valid, rejects invalid)
//   - validateRequest rejects missing contract_version
//   - validateRequest rejects unknown subject
//   - validateResponse round-trip
//   - emptySubjectSpecialistRequest / emptySubjectSpecialistResponse
//   - describeContractShape
//   - dispatchExamples has 5 worked examples

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUBJECT_SPECIALIST_CONTRACT_VERSION,
  SUPPORTED_SUBJECTS,
  validateRequest,
  validateResponse,
  emptySubjectSpecialistRequest,
  emptySubjectSpecialistResponse,
  describeContractShape,
  dispatchExamples,
} from "../lib/subject_v1_contract.mjs";

test("contract: SUBJECT_SPECIALIST_CONTRACT_VERSION is subject-v1", () => {
  assert.equal(SUBJECT_SPECIALIST_CONTRACT_VERSION, "subject-v1");
});

test("contract: SUPPORTED_SUBJECTS lists exactly the 5 subjects", () => {
  assert.deepEqual([...SUPPORTED_SUBJECTS], [
    "math",
    "chinese",
    "english",
    "science",
    "social_studies",
  ]);
});

test("validateRequest: a fully-formed valid request passes", () => {
  const req = emptySubjectSpecialistRequest();
  req.subject = "math";
  req.student_id = "student_001";
  req.knowledge_point = "math.G1.NUM.add-sub-20";
  const r = validateRequest(req);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("validateRequest: rejects missing contract_version", () => {
  const r = validateRequest({
    subject: "math",
    student_id: "student_001",
    knowledge_point: "math.G1.NUM.add-sub-20",
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("missing_or_invalid_contract_version"));
});

test("validateRequest: rejects wrong contract_version", () => {
  const r = validateRequest({
    contract_version: "subject-v0",
    subject: "math",
    student_id: "student_001",
    knowledge_point: "math.G1.NUM.add-sub-20",
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("missing_or_invalid_contract_version"));
});

test("validateRequest: rejects unknown subject", () => {
  const r = validateRequest({
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    subject: "biology",
    student_id: "student_001",
    knowledge_point: "x",
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("unknown_subject"));
});

test("validateRequest: rejects missing student_id and missing knowledge_point", () => {
  const r = validateRequest({
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    subject: "math",
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("missing_student_id"));
  assert.ok(r.errors.includes("missing_knowledge_point"));
});

test("validateRequest: rejects invalid student_id format", () => {
  const r = validateRequest({
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    subject: "math",
    student_id: "kid_001",
    knowledge_point: "math.G1.x",
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("invalid_student_id_format"));
});

test("validateRequest: rejects non-object input", () => {
  assert.equal(validateRequest(null).valid, false);
  assert.equal(validateRequest(undefined).valid, false);
  assert.equal(validateRequest("string").valid, false);
  assert.equal(validateRequest(42).valid, false);
});

test("validateResponse: a fully-formed valid response passes", () => {
  const res = emptySubjectSpecialistResponse();
  res.subject = "chinese";
  res.student_id = "student_002";
  res.knowledge_point = "chinese.G3.ZI.form";
  res.evidence_payload = { schema_version: "x" };
  res.diagnosis_payload = { schema_version: "y" };
  res.next_action = "vocabulary_drill";
  const r = validateResponse(res);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("validateResponse: rejects missing next_action", () => {
  const res = emptySubjectSpecialistResponse();
  res.subject = "math";
  res.student_id = "student_001";
  res.knowledge_point = "math.G1.x";
  // next_action left empty
  const r = validateResponse(res);
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("missing_next_action"));
});

test("validateResponse: rejects missing or wrong contract_version", () => {
  const res = emptySubjectSpecialistResponse();
  res.subject = "math";
  res.student_id = "student_001";
  res.knowledge_point = "math.G1.x";
  res.next_action = "text_prompt";
  res.contract_version = "subject-v0";
  const r = validateResponse(res);
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("missing_or_invalid_contract_version"));
});

test("validateResponse: rejects capability_gaps that is not a string array", () => {
  const res = emptySubjectSpecialistResponse();
  res.subject = "math";
  res.student_id = "student_001";
  res.knowledge_point = "math.G1.x";
  res.next_action = "text_prompt";
  res.capability_gaps = [1, 2, 3];
  const r = validateResponse(res);
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes("invalid_capability_gaps"));
});

test("emptySubjectSpecialistRequest: has contract_version and empty fields", () => {
  const req = emptySubjectSpecialistRequest();
  assert.equal(req.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  assert.equal(req.subject, "");
  assert.equal(req.student_id, "");
  assert.equal(req.knowledge_point, "");
});

test("emptySubjectSpecialistResponse: has contract_version and empty fields", () => {
  const res = emptySubjectSpecialistResponse();
  assert.equal(res.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  assert.equal(res.subject, "");
  assert.equal(res.next_action, "");
  assert.deepEqual(res.capability_gaps, []);
});

test("describeContractShape: lists supported subjects and field names", () => {
  const s = describeContractShape();
  assert.equal(s.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  assert.equal(s.supported_subjects.length, 5);
  assert.ok(s.request_fields.includes("subject"));
  assert.ok(s.request_fields.includes("student_id"));
  assert.ok(s.request_fields.includes("knowledge_point"));
  assert.ok(s.response_fields.includes("next_action"));
  assert.ok(s.response_fields.includes("evidence_payload"));
});

test("dispatchExamples: returns 5 examples (one per subject)", () => {
  const examples = dispatchExamples();
  assert.equal(examples.length, 5);
  const subjects = examples.map((e) => e.subject).sort();
  assert.deepEqual(subjects, [
    "chinese",
    "english",
    "math",
    "science",
    "social_studies",
  ]);
  for (const ex of examples) {
    assert.equal(ex.request.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
    assert.equal(ex.request.subject, ex.subject);
    assert.ok(ex.request.knowledge_point.length > 0);
  }
});
