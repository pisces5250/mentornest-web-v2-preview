// Tests: learning_director_v2
// Run with: node --test test/learning_director_v2.test.mjs
//
// Covers:
//   - KP-prefix subject heuristic for all 5 subjects
//   - dispatchNextStep chooses correct subject from KP prefix
//   - dispatchNextStep respects explicit current_subject
//   - dispatchNextStep returns unified response shape
//   - dispatchNextStep merges when multi_subjects are provided
//   - learningDirectorV2CapabilityReport returns capability summary
//   - PER_SUBJECT_TOOL_NAMES has 5: 11+11+16+11+13=62 tools
//   - preserves subject expertise: each response.evidence.subject matches
//     its routed subject

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchNextStep,
  chooseSubject,
  chooseSubjectFromKnowledgePoint,
  extractKnowledgePointFromInput,
  learningDirectorV2CapabilityReport,
  PER_SUBJECT_TOOL_NAMES,
  KP_PREFIX_TO_SUBJECT,
} from "../lib/learning_director_v2.mjs";
import { SUBJECT_SPECIALIST_CONTRACT_VERSION } from "../lib/subject_v1_contract.mjs";

test("chooseSubjectFromKnowledgePoint: math.G1.x → math", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("math.G1.NUM.add-sub-20"), "math");
});

test("chooseSubjectFromKnowledgePoint: chinese.G3.x → chinese", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("chinese.G3.ZI.form"), "chinese");
});

test("chooseSubjectFromKnowledgePoint: english.G3.x → english", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("english.G3.PHONE.letter-sound"), "english");
});

test("chooseSubjectFromKnowledgePoint: science.G5.x → science", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("science.G5.EXP.experiment-design"), "science");
});

test("chooseSubjectFromKnowledgePoint: social.G4.x → social_studies", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("social.G4.TIME.timeline"), "social_studies");
});

test("chooseSubjectFromKnowledgePoint: ss. alias → social_studies", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("ss.G4.TIME.timeline"), "social_studies");
});

test("chooseSubjectFromKnowledgePoint: unknown KP → null", () => {
  assert.equal(chooseSubjectFromKnowledgePoint("random.string"), null);
});

test("chooseSubject: explicit current_subject wins over KP prefix", () => {
  const r = chooseSubject({ current_subject: "english", knowledge_point: "math.G1.x" });
  assert.equal(r, "english");
});

test("chooseSubject: KP prefix wins when no current_subject", () => {
  const r = chooseSubject({ knowledge_point: "math.G1.NUM.add-sub-20" });
  assert.equal(r, "math");
});

test("chooseSubject: defaults to math when neither current nor KP", () => {
  assert.equal(chooseSubject({}), "math");
});

test("dispatchNextStep: routes to math from KP prefix", () => {
  const r = dispatchNextStep({
    student_id: "student_001",
    student_input: {
      stem: "12+7=?",
      student_answer: "20",
      expected_answer: "19",
      knowledge_point: "math.G1.NUM.add-sub-20",
    },
  });
  assert.equal(r.chosen_subject, "math");
  assert.equal(r.knowledge_point, "math.G1.NUM.add-sub-20");
  assert.equal(r.response.subject, "math");
  assert.equal(r.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
});

test("dispatchNextStep: routes to chinese from KP prefix", () => {
  const r = dispatchNextStep({
    student_id: "student_002",
    student_input: {
      stem: "選出正確的字",
      student_answer: "在",
      expected_answer: "再",
      knowledge_point: "chinese.G3.ZI.form",
    },
  });
  assert.equal(r.chosen_subject, "chinese");
  assert.equal(r.response.subject, "chinese");
});

test("dispatchNextStep: routes to social_studies and returns timeline_walk for timeline KP", () => {
  const r = dispatchNextStep({
    student_id: "student_001",
    student_input: {
      stem: "排序下列事件",
      knowledge_point: "social.G4.TIME.timeline",
      mastery_context: { mastery: 0.4, confidence: 0.4 },
    },
  });
  assert.equal(r.chosen_subject, "social_studies");
  assert.equal(r.response.next_action, "timeline_walk");
});

test("dispatchNextStep: explicit current_subject overrides KP prefix", () => {
  const r = dispatchNextStep({
    student_id: "student_001",
    current_subject: "english",
    student_input: {
      stem: "first sound in cat",
      student_answer: "k",
      expected_answer: "k",
      knowledge_point: "math.G1.NUM.add-sub-20", // intentionally misleading
    },
  });
  assert.equal(r.chosen_subject, "english");
});

test("dispatchNextStep: returns contract_version on response", () => {
  const r = dispatchNextStep({
    student_id: "student_001",
    student_input: { knowledge_point: "math.G1.NUM.add-sub-20" },
  });
  assert.equal(r.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  assert.equal(r.response.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
});

test("dispatchNextStep: rejects invalid student_id", () => {
  assert.throws(() =>
    dispatchNextStep({
      student_id: "kid_001",
      student_input: { knowledge_point: "math.G1.NUM.add-sub-20" },
    })
  );
});

test("dispatchNextStep: multi_subjects dispatch + merge", () => {
  const r = dispatchNextStep({
    student_id: "student_001",
    student_input: {
      stem: "12+7=?",
      student_answer: "19",
      expected_answer: "19",
      knowledge_point: "math.G1.NUM.add-sub-20",
      multi_subjects: [
        {
          subject: "english",
          knowledge_point: "english.G3.PHONE.letter-sound",
        },
      ],
    },
  });
  assert.equal(r.chosen_subject, "math");
  assert.ok(r.merge);
  // merge has ranked array of 2 subjects (math + english)
  assert.equal(r.merge.ranked.length, 2);
});

test("extractKnowledgePointFromInput: explicit KP wins", () => {
  const r = extractKnowledgePointFromInput({
    knowledge_point: "chinese.G3.ZI.form",
    text: "ignore me",
  });
  assert.equal(r, "chinese.G3.ZI.form");
});

test("extractKnowledgePointFromInput: finds KP-shaped substring in text", () => {
  const r = extractKnowledgePointFromInput({
    text: "Question about math.G4.FRAC.compare-fractions now",
  });
  assert.equal(r, "math.G4.FRAC.compare-fractions");
});

test("learningDirectorV2CapabilityReport: returns contract version + 5 subjects", () => {
  const cap = learningDirectorV2CapabilityReport();
  assert.equal(cap.contract_version, SUBJECT_SPECIALIST_CONTRACT_VERSION);
  assert.equal(cap.supported_subjects.length, 5);
});

test("learningDirectorV2CapabilityReport: per-subject tool counts (11+11+16+11+13=62)", () => {
  const cap = learningDirectorV2CapabilityReport();
  assert.equal(cap.tools.math.length, 11);
  assert.equal(cap.tools.chinese.length, 11);
  assert.equal(cap.tools.english.length, 16);
  assert.equal(cap.tools.science.length, 11);
  assert.equal(cap.tools.social_studies.length, 13);
  const total = Object.values(cap.tools).reduce((a, t) => a + t.length, 0);
  assert.equal(total, 62);
});

test("learningDirectorV2CapabilityReport: action_priority is canonical", () => {
  const cap = learningDirectorV2CapabilityReport();
  assert.deepEqual(cap.action_priority, [
    "mastery_check",
    "backtrack_prerequisite",
    "drill",
    "text_prompt",
  ]);
});

test("KP_PREFIX_TO_SUBJECT: has all 6 prefix entries", () => {
  assert.equal(Object.keys(KP_PREFIX_TO_SUBJECT).length, 6);
  assert.equal(KP_PREFIX_TO_SUBJECT["math."], "math");
  assert.equal(KP_PREFIX_TO_SUBJECT["social."], "social_studies");
  assert.equal(KP_PREFIX_TO_SUBJECT["ss."], "social_studies");
});

test("PER_SUBJECT_TOOL_NAMES: every tool name is unique and non-empty", () => {
  const seen = new Set();
  for (const [subject, tools] of Object.entries(PER_SUBJECT_TOOL_NAMES)) {
    for (const t of tools) {
      assert.ok(typeof t === "string" && t.length > 0, `empty tool name in ${subject}`);
      assert.ok(!seen.has(t), `duplicate tool name ${t} in ${subject}`);
      seen.add(t);
    }
  }
  // Verify each subject has at least the expected number of tools.
  assert.ok(PER_SUBJECT_TOOL_NAMES.math.length >= 10);
  assert.ok(PER_SUBJECT_TOOL_NAMES.chinese.length >= 10);
  assert.ok(PER_SUBJECT_TOOL_NAMES.english.length >= 15);
  assert.ok(PER_SUBJECT_TOOL_NAMES.science.length >= 10);
  assert.ok(PER_SUBJECT_TOOL_NAMES.social_studies.length >= 12);
});
