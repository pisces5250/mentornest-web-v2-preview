// test/social_studies_specialist.test.mjs — orchestrator unit tests

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseSocialStudiesResponse,
  analyzeTimeline,
  analyzeMap,
  analyzeCausality,
  compareSources,
  interpretDemographicChart,
  socialStudiesSpecialistDecide,
  emitSocialStudiesEvidence,
} from "../lib/social_studies_specialist.mjs";

test("diagnoseSocialStudiesResponse: correct answer returns ok + hint_level 0", () => {
  const out = diagnoseSocialStudiesResponse({
    student_id: "student_test_e",
    stem: "台灣在哪一個方向？",
    student_answer: "東亞",
    expected_answer: "東亞",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    mode: "written",
    grade: 4,
  });
  assert.equal(out.valid, true);
  assert.equal(out.correct, true);
  assert.equal(out.hint_level, 0);
  assert.equal(out.error_codes.length, 0);
  assert.equal(out.evidence_payload.subject, "social_studies");
  assert.equal(out.evidence_payload.student_id, "student_test_e");
});

test("diagnoseSocialStudiesResponse: incorrect returns error_codes + hint", () => {
  const out = diagnoseSocialStudiesResponse({
    student_id: "student_test_e",
    stem: "台灣的方位？",
    student_answer: "南亞",
    expected_answer: "東亞",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    mode: "written",
    grade: 4,
  });
  assert.equal(out.correct, false);
  assert.ok(out.error_codes.length > 0);
  assert.ok(out.hint_text_zh.length > 0);
  assert.equal(out.mini_lesson_suggested, true);
  assert.equal(out.diagnosis_payload.subskill, "geography");
});

test("diagnoseSocialStudiesResponse: empty student_answer falls back to a code", () => {
  const out = diagnoseSocialStudiesResponse({
    student_id: "student_test_e",
    stem: "Q?",
    student_answer: "",
    expected_answer: "A",
    knowledge_point: "social.G4.TIME.timeline",
    mode: "written",
    grade: 4,
  });
  assert.equal(out.correct, false);
  assert.ok(out.error_codes.length > 0);
});

test("analyzeTimeline: correct order returns matched + empty misplaced/missing", () => {
  const out = analyzeTimeline({
    events: [{ label: "A", year_or_era: 1 }, { label: "B", year_or_era: 2 }],
    student_order: ["A", "B"],
    expected_order: ["A", "B"],
  });
  assert.equal(out.correct, true);
  assert.equal(out.misplaced.length, 0);
  assert.equal(out.missing.length, 0);
  assert.equal(out.extras.length, 0);
  assert.equal(out.matched.length, 2);
});

test("analyzeTimeline: reversed order reports misplaced", () => {
  const out = analyzeTimeline({
    events: [{ label: "A", year_or_era: 1 }, { label: "B", year_or_era: 2 }],
    student_order: ["B", "A"],
    expected_order: ["A", "B"],
  });
  assert.equal(out.correct, false);
  assert.equal(out.misplaced.length, 2);
  assert.equal(out.missing.length, 0);
});

test("analyzeTimeline: missing entry reported", () => {
  const out = analyzeTimeline({
    events: [{ label: "A", year_or_era: 1 }, { label: "B", year_or_era: 2 }, { label: "C", year_or_era: 3 }],
    student_order: ["A", "B"],
    expected_order: ["A", "B", "C"],
  });
  assert.equal(out.correct, false);
  assert.ok(out.missing.some((m) => m.label === "C"));
});

test("analyzeMap: matches regions and reports missed", () => {
  const out = analyzeMap({
    map_descriptor: { regions: ["北部", "中部", "南部"] },
    question: "找出地圖上的北部與南部",
    student_answer: "北部 南部",
    expected_answer: ["北部", "南部"],
  });
  assert.equal(out.correct, true);
  assert.equal(out.matched_regions.length, 2);
});

test("analyzeMap: missing region flagged with compass error code", () => {
  const out = analyzeMap({
    map_descriptor: { regions: ["北部", "中部", "南部"] },
    question: "指出地圖上的方位",
    student_answer: "北部",
    expected_answer: ["北部", "南部"],
  });
  assert.equal(out.correct, false);
  assert.equal(out.matched_regions.length, 1);
  assert.equal(out.missed_regions.length, 1);
  assert.ok(out.error_codes.length > 0);
});

test("analyzeCausality: matched effects count; spurious reported", () => {
  const out = analyzeCausality({
    cause: "工業革命",
    student_explained_effects: ["工廠興起", "都市人口增加", "錯誤項"],
    expected_effects: ["工廠興起", "都市人口增加"],
    kind: "multi_cause",
  });
  assert.equal(out.correct, false);
  assert.equal(out.matched_effects.length, 2);
  assert.equal(out.spurious_effects.length, 1);
  assert.equal(out.missed_effects.length, 0);
});

test("analyzeCausality: kind=short_term routes to short-long code", () => {
  const out = analyzeCausality({
    cause: "X",
    student_explained_effects: ["a"],
    expected_effects: ["a", "b"],
    kind: "short_term",
  });
  assert.ok(out.error_codes.includes("SS-CAUSAL-SHORT-LONG"));
});

test("compareSources: agreements & missed perspectives", () => {
  const out = compareSources({
    sources: [
      { label: "日記A", content: "...", type: "primary" },
      { label: "報導B", content: "...", type: "secondary" },
    ],
    student_synthesis: "從日記A來看...",
    expected_synthesis: ["日記A", "報導B"],
  });
  assert.equal(out.agreements.includes("日記A"), true);
  assert.equal(out.correct, false);
  assert.ok(out.missed_perspectives.includes("報導B"));
});

test("interpretDemographicChart: matched_data_points", () => {
  const out = interpretDemographicChart({
    chart_descriptor: { labels: ["0-14", "15-64", "65+"] },
    question: "老化指數最高的是哪一族群？",
    student_answer: "65+",
    expected_answer: ["65+"],
  });
  assert.equal(out.correct, true);
});

test("interpretDemographicChart: missed demographic point flagged with population-chart", () => {
  const out = interpretDemographicChart({
    chart_descriptor: { labels: ["0-14", "15-64", "65+"] },
    question: "老化人口比例",
    student_answer: "0-14",
    expected_answer: ["65+"],
  });
  assert.equal(out.correct, false);
  assert.equal(out.missed_data_points.length, 1);
  assert.ok(out.error_codes.includes("SS-DATA-POPULATION-CHART"));
});

test("socialStudiesSpecialistDecide: text_prompt default", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G5.HISTORY.taiwan-early",
    attempts: 1,
  });
  assert.equal(out.action, "text_prompt");
  assert.ok(out.rationale);
});

test("socialStudiesSpecialistDecide: timeline KP routes to timeline_walk", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
    error_codes: ["SS-TIME-ORDERING"],
  });
  assert.equal(out.action, "timeline_walk");
});

test("socialStudiesSpecialistDecide: geography KP routes to map_explanation", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    attempts: 1,
    error_codes: ["SS-GEO-COMPASS"],
  });
  assert.equal(out.action, "map_explanation");
});

test("socialStudiesSpecialistDecide: source_comparison KP routes to source_comparison", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G6.SRC.primary-secondary",
    attempts: 1,
    error_codes: ["SS-SRC-PRIMARY-SECONDARY"],
  });
  assert.equal(out.action, "source_comparison");
});

test("socialStudiesSpecialistDecide: data_interpretation routes to chart_drilling", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G6.DATA.population-pyramid",
    attempts: 1,
    error_codes: ["SS-DATA-POPULATION-CHART"],
  });
  assert.equal(out.action, "chart_drilling");
});

test("socialStudiesSpecialistDecide: high mastery routes to mastery_check", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
    mastery: 0.85,
    error_codes: [],
  });
  assert.equal(out.action, "mastery_check");
});

test("socialStudiesSpecialistDecide: attempts >= 4 backtracks to prerequisite", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 5,
  });
  assert.equal(out.action, "backtrack_prerequisite");
});

test("socialStudiesSpecialistDecide: attempts=2 with civics routes to concept_clarification", () => {
  const out = socialStudiesSpecialistDecide({
    student_id: "student_test_e",
    knowledge_point: "social.G5.GOV.local-rules",
    attempts: 2,
  });
  // civics subskill + attempts>=2 should hit concept_clarification (no specific
  // civics code starts with SS-CIVIC-* that's mapped earlier)
  assert.equal(out.action, "concept_clarification");
});

test("emitSocialStudiesEvidence: requires student_id", () => {
  assert.throws(() => emitSocialStudiesEvidence({}));
});

test("emitSocialStudiesEvidence: returns schema_version", () => {
  const out = emitSocialStudiesEvidence({
    student_id: 'student_t_ss',
    knowledge_point: "social.G4.TIME.timeline",
    subskill: "timeline",
    error_codes: [],
    result: "correct",
  });
  assert.equal(out.schema_version, "social-studies-specialist-evidence-v1");
  assert.equal(out.subject, "social_studies");
});