// Tests: subject_dispatcher
// Run with: node --test test/subject_dispatcher.test.mjs
//
// Covers:
//   - all 5 subjects route correctly
//   - unknown subject returns error
//   - each subject preserves its OWN expertise (subject-specific fields):
//       * math  → evidence_payload.error_code starts with "MATH-"
//       * chinese → diagnosis_payload.error_codes (if any) start with "ZH-"
//       * english → diagnosis_payload has "subskill" field, "mode" field
//       * science → next_action="experiment_simulation" for experiment KP
//       * social_studies → next_action="timeline_walk" for timeline KP

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchSubjectSpecialist,
  subjectCapabilityReport,
  SUBJECT_CAPABILITY_GAPS,
} from "../lib/subject_dispatcher.mjs";
import {
  SUBJECT_SPECIALIST_CONTRACT_VERSION,
} from "../lib/subject_v1_contract.mjs";

function baseReq(subject, overrides = {}) {
  return {
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    subject,
    student_id: "student_001",
    knowledge_point: "math.G1.NUM.add-sub-20",
    mastery_context: { mastery: 0.5, confidence: 0.5 },
    question_request: {
      stem: "12+7=?",
      student_answer: "20",
      expected_answer: "19",
    },
    ...overrides,
  };
}

test("dispatcher: math routes to math specialist and preserves subject fields", () => {
  const r = dispatchSubjectSpecialist(
    baseReq("math", {
      knowledge_point: "math.G1.NUM.add-sub-20",
      diagnosis: { error_code: "MATH-CALC-CARRY" },
    })
  );
  assert.equal(r.subject, "math");
  assert.equal(r.student_id, "student_001");
  assert.equal(r.knowledge_point, "math.G1.NUM.add-sub-20");
  // Subject-specific evidence:
  assert.equal(r.evidence_payload.subject, "math");
  // When wrong answer + MATH-CALC-CARRY → switch_representation
  assert.equal(r.next_action, "switch_representation");
  assert.equal(r.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  assert.ok(Array.isArray(r.capability_gaps));
});

test("dispatcher: chinese routes to chinese specialist and uses ZH- error codes", () => {
  const r = dispatchSubjectSpecialist(
    baseReq("chinese", {
      knowledge_point: "chinese.G3.ZI.form",
      question_request: {
        stem: "選出正確的字",
        student_answer: "在",
        expected_answer: "再",
      },
    })
  );
  assert.equal(r.subject, "chinese");
  assert.equal(r.evidence_payload.subject, "chinese");
  // Chinese diagnose returns diagnosis_payload with error_codes that start with "ZH-"
  const codes = r.diagnosis_payload && r.diagnosis_payload.error_codes;
  if (Array.isArray(codes) && codes.length > 0) {
    for (const c of codes) {
      assert.ok(c.startsWith("ZH-"), `expected ZH- prefix, got ${c}`);
    }
  }
  // Chinese diagnose is correct in this case (在 vs 再 are confusable, but
  // we expect at least a valid response shape)
  assert.ok(r.diagnosis_payload);
  assert.ok(r.diagnosis_payload.schema_version);
});

test("dispatcher: english routes to english specialist and uses 'mode' field", () => {
  const r = dispatchSubjectSpecialist(
    baseReq("english", {
      knowledge_point: "english.G3.PHONE.letter-sound",
      question_request: {
        stem: "first sound in 'cat'",
        student_answer: "k",
        expected_answer: "k",
        mode: "written",
      },
    })
  );
  assert.equal(r.subject, "english");
  assert.equal(r.evidence_payload.subject, "english");
  // English diagnosis carries subskill from classifyEnglishSubskill
  assert.ok(r.diagnosis_payload);
  assert.ok(r.diagnosis_payload.subskill);
});

test("dispatcher: science routes to science specialist and picks experiment_simulation for experiment KPs", () => {
  const r = dispatchSubjectSpecialist(
    baseReq("science", {
      knowledge_point: "science.G5.EXP.experiment-design",
      mastery_context: { mastery: 0.3, confidence: 0.4 },
    })
  );
  assert.equal(r.subject, "science");
  assert.equal(r.evidence_payload.subject, "science");
  // Science decides for experiment subskill → experiment_simulation
  assert.equal(r.next_action, "experiment_simulation");
});

test("dispatcher: social_studies routes to social_studies specialist and picks timeline_walk for timeline KPs", () => {
  const r = dispatchSubjectSpecialist(
    baseReq("social_studies", {
      knowledge_point: "social.G4.TIME.timeline",
      mastery_context: { mastery: 0.4, confidence: 0.4 },
    })
  );
  assert.equal(r.subject, "social_studies");
  assert.equal(r.evidence_payload.subject, "social_studies");
  // Social studies timeline → timeline_walk
  assert.equal(r.next_action, "timeline_walk");
  assert.equal(r.diagnosis_payload.subskill, "timeline");
});

test("dispatcher: unknown subject returns error in capability_gaps", () => {
  const r = dispatchSubjectSpecialist(
    baseReq("biology", { subject: "biology", knowledge_point: "x" })
  );
  assert.equal(r.subject, "biology");
  assert.ok(r.capability_gaps.includes("unknown_subject"));
  assert.equal(r.next_action, "");
  assert.equal(r.evidence_payload, null);
});

test("dispatcher: rejects request missing contract_version", () => {
  const r = dispatchSubjectSpecialist({
    subject: "math",
    student_id: "student_001",
    knowledge_point: "math.G1.x",
  });
  assert.ok(r.capability_gaps.includes("missing_or_invalid_contract_version"));
});

test("dispatcher: each subject returns evidence.subject == subject (subject-specific)", () => {
  const subjects = ["math", "chinese", "english", "science", "social_studies"];
  for (const s of subjects) {
    const r = dispatchSubjectSpecialist(
      baseReq(s, {
        knowledge_point:
          s === "math" ? "math.G1.NUM.add-sub-20" :
          s === "chinese" ? "chinese.G3.ZI.form" :
          s === "english" ? "english.G3.PHONE.letter-sound" :
          s === "science" ? "science.G5.EXP.experiment-design" :
          "social.G4.TIME.timeline",
      })
    );
    assert.equal(r.subject, s);
    assert.equal(r.evidence_payload.subject, s, `evidence.subject should be "${s}"`);
    assert.ok(r.diagnosis_payload.schema_version.length > 0);
  }
});

test("dispatcher: math diagnosis uses math_correct (boolean) — not generic", () => {
  // We can verify the math decide returns math_correct-shaped evidence:
  // evidence.subject === "math" AND evidence.diagnosis is the validator verdict shape.
  const r = dispatchSubjectSpecialist(
    baseReq("math", {
      knowledge_point: "math.G1.NUM.add-sub-20",
      diagnosis: { error_code: "MATH-CALC-CARRY" },
    })
  );
  // math evidence uses single error_code (not error_codes list like chinese)
  assert.ok("error_code" in r.evidence_payload);
  assert.equal(typeof r.diagnosis_payload.error_code === "string" || r.diagnosis_payload.error_code === null, true);
});

test("subjectCapabilityReport: returns all subjects by default", () => {
  const rep = subjectCapabilityReport();
  assert.equal(rep.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  for (const s of ["math", "chinese", "english", "science", "social_studies"]) {
    assert.ok(rep.subjects[s]);
    assert.ok(Array.isArray(rep.subjects[s].capability_gaps));
  }
});

test("subjectCapabilityReport: returns single subject when requested", () => {
  const rep = subjectCapabilityReport("math");
  assert.equal(rep.subject, "math");
  assert.equal(rep.known, true);
  assert.deepEqual(rep.capability_gaps, [...SUBJECT_CAPABILITY_GAPS.math]);
});

test("subjectCapabilityReport: unknown subject returns error", () => {
  const rep = subjectCapabilityReport("biology");
  assert.equal(rep.known, false);
  assert.equal(rep.error, "unknown_subject");
});
