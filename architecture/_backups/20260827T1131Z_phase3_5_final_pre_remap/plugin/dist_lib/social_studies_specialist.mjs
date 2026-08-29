// Social Studies Specialist v1 — orchestrator surface.
//
// Pure functions, NO I/O. The only mutation surface in this plugin is the
// mastery engine's append-only evidence ledger, reached via the existing
// `appendEvidenceStudent` helper (re-exported from mastery_engine_v2).
// `socialStudiesSpecialistEmitEvidence` is the only caller of that helper.

import { lookupSocialStudiesErrorCode } from "./social_studies_error_taxonomy.mjs";
import { classifySocialStudiesSubskill } from "./social_studies_subskill_map.mjs";
import { nextSocialStudiesHint, SOCIAL_STUDIES_HINT_LEVELS } from "./social_studies_hint_ladder_v1.mjs";

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[。．，、,.!?！？；;：:（）()「」『』""'']/g, "");

function inferErrorCodes({ student_answer, expected_answer, knowledge_point, mode }) {
  const codes = [];
  const sa = String(student_answer || "");
  const ea = String(expected_answer || "");
  const kp = String(knowledge_point || "").toUpperCase();
  if (!sa.trim()) {
    codes.push("SS-HIST-ERA-ORDER");
    return codes;
  }
  if (kp.includes("TIMELINE") || kp.includes("TIME")) {
    codes.push("SS-TIME-ORDERING");
  } else if (kp.includes("MAP") || kp.includes("GEO-COMPASS")) {
    codes.push("SS-MAP-COMPASS");
  } else if (kp.includes("CHART") || kp.includes("POPULATION")) {
    codes.push("SS-DATA-POPULATION-CHART");
  } else if (kp.includes("SOURCE") || kp.includes("PRIMARY") || kp.includes("SECONDARY")) {
    codes.push("SS-SRC-PRIMARY-SECONDARY");
  } else if (kp.includes("CIVIC") || kp.includes("GOV") || kp.includes("LAW")) {
    codes.push("SS-CIVIC-LEGAL-HIERARCHY");
  } else if (kp.includes("CULT") || kp.includes("RELIGION")) {
    codes.push("SS-CULT-RELIGION");
  } else if (kp.includes("CAUSAL") || kp.includes("CAUSE") || kp.includes("EFFECT")) {
    codes.push("SS-CAUSAL-MULTI");
  } else {
    codes.push("SS-HIST-ERA-ORDER");
  }
  if (mode === "explained") {
    // When the student was asked to explain, watch for causal reasoning
    if (!/(因為|由於|導致|造成|所以)/.test(sa) && ea && /(因為|由於|導致|造成|所以)/.test(ea)) {
      codes.push("SS-CAUSAL-MULTI");
    }
  }
  return codes;
}

export function emitSocialStudiesEvidence(input = {}) {
  if (!input.student_id) {
    throw new Error("emitSocialStudiesEvidence: student_id required");
  }
  return {
    schema_version: "social-studies-specialist-evidence-v1",
    emitted_at: new Date().toISOString(),
    emitted_by: input.emitted_by || "social-studies-specialist",
    student_id: input.student_id,
    subject: "social_studies",
    knowledge_point: input.knowledge_point || "",
    subskill: input.subskill || "",
    error_codes: Array.isArray(input.error_codes) ? input.error_codes : [],
    result: input.result || null,
    diagnosis: input.diagnosis || null,
  };
}

export function diagnoseSocialStudiesResponse(input) {
  input = input || {};
  const expected = norm(input.expected_answer);
  const student = norm(input.student_answer);
  const correct =
    expected.length > 0 &&
    expected === student &&
    String(input.expected_answer || "").length > 0 &&
    String(input.student_answer || "").length > 0;
  const valid = !!input.expected_answer || !!input.student_answer;
  const codes = correct
    ? []
    : inferErrorCodes({
        student_answer: input.student_answer,
        expected_answer: input.expected_answer,
        knowledge_point: input.knowledge_point,
        mode: input.mode,
      });
  const entry = codes[0] ? lookupSocialStudiesErrorCode(codes[0]) : null;
  const hintLevel = correct ? 0 : Math.min(4, Math.max(1, Number(input.attempts) || 1));
  const hint =
    correct
      ? "答對了！繼續保持。"
      : entry?.hint_template || "請重新檢查題目條件，並用時間軸或地圖輔助判斷。";
  const sub = classifySocialStudiesSubskill({ knowledge_point: input.knowledge_point || "" });
  return {
    valid,
    correct,
    error_codes: codes,
    hint_level: hintLevel,
    hint_text_zh: hint,
    mini_lesson_suggested: !correct,
    mastery_check_suggested: !!correct,
    evidence_payload: emitSocialStudiesEvidence({
      student_id: input.student_id || "student_unknown",
      knowledge_point: input.knowledge_point,
      subskill: sub.primary_subskill,
      error_codes: codes,
      result: correct ? "correct" : "incorrect",
      diagnosis: {
        mode: input.mode || "written",
        grade: input.grade ?? null,
        expected_answer: input.expected_answer || "",
      },
    }),
    diagnosis_payload: {
      schema_version: "social-studies-specialist-diagnosis-v1",
      student_id: input.student_id || "student_unknown",
      knowledge_point: input.knowledge_point || "",
      error_codes: codes,
      recommendation_zh: entry?.mini_lesson_hint || null,
      subskill: sub.primary_subskill,
      grade: input.grade ?? null,
    },
  };
}

export function analyzeTimeline({ events = [], student_order = [], expected_order = [] } = {}) {
  const expected = Array.isArray(expected_order) ? expected_order : [];
  const student = Array.isArray(student_order) ? student_order : [];
  const evLabels = (events || []).map((e) => e?.label);
  const matched = [];
  const misplaced = [];
  const missing = [];
  const extras = [];
  const usedStudent = new Set();

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const got = student[i];
    if (got === exp) {
      matched.push({ index: i, label: exp });
      usedStudent.add(i);
    } else {
      if (got != null) {
        misplaced.push({ expected_index: i, expected_label: exp, got_label: got });
        usedStudent.add(i);
      } else {
        missing.push({ expected_index: i, label: exp });
      }
    }
  }
  for (let i = 0; i < student.length; i++) {
    if (!usedStudent.has(i) && !expected.includes(student[i])) {
      extras.push({ index: i, label: student[i] });
    }
  }

  const correct = misplaced.length === 0 && missing.length === 0 && extras.length === 0;
  const hint = correct
    ? "時間軸排序正確。"
    : `請依時間由先到後重排，缺漏：${missing.map((m) => m.label).join("、") || "無"}；放錯位置：${misplaced.map((m) => `${m.expected_label}(你寫${m.got_label})`).join("、") || "無"}`;

  return {
    correct,
    matched,
    misplaced,
    missing,
    extras,
    events: evLabels,
    hint_text_zh: hint,
    evidence_payload: emitSocialStudiesEvidence({
      student_id: "student_unknown",
      knowledge_point: "social.G4.TIME.timeline",
      subskill: "timeline",
      error_codes: correct ? [] : ["SS-TIME-ORDERING"],
      result: correct ? "correct" : "incorrect",
      diagnosis: { matched_count: matched.length, misplaced_count: misplaced.length },
    }),
  };
}

export function analyzeMap({
  map_descriptor = {},
  question = "",
  student_answer = "",
  expected_answer = [],
} = {}) {
  const expected = Array.isArray(expected_answer) ? expected_answer : [expected_answer].filter(Boolean);
  const matched = [];
  const missed = [];
  const errorCodes = [];
  const studentText = String(student_answer || "");
  for (const region of expected) {
    if (studentText.includes(String(region))) {
      matched.push(region);
    } else {
      missed.push(region);
    }
  }
  if (missed.length > 0) {
    if (/(方位|東|西|南|北|東南|东北)/.test(question + studentText)) {
      errorCodes.push("SS-GEO-COMPASS");
    } else if (/(距離|幾公里|多遠|比例)/.test(question)) {
      errorCodes.push("SS-GEO-SCALE");
    } else if (/(圖例|符號|標示|顏色)/.test(question)) {
      errorCodes.push("SS-GEO-LEGEND");
    } else if (/(氣候|雨量|溫度)/.test(question)) {
      errorCodes.push("SS-GEO-CLIMATE");
    } else {
      errorCodes.push("SS-MAP-COMPASS");
    }
  }
  const correct = missed.length === 0 && expected.length > 0;
  const hint = correct
    ? "地圖判讀正確。"
    : `還缺漏：${missed.join("、") || "無"}。請回到地圖上對應位置核對。`;
  return {
    correct,
    matched_regions: matched,
    missed_regions: missed,
    error_codes: errorCodes,
    hint_text_zh: hint,
    map_descriptor_keys: Object.keys(map_descriptor || {}),
  };
}

export function analyzeCausality({
  cause = "",
  student_explained_effects = [],
  expected_effects = [],
  kind = "short_term",
} = {}) {
  const expected = Array.isArray(expected_effects) ? expected_effects : [];
  const student = Array.isArray(student_explained_effects) ? student_explained_effects : [];
  const expNorm = expected.map((e) => String(e).trim().toLowerCase());
  const matched = [];
  const missed = [];
  const spurious = [];
  for (const s of student) {
    const sLow = String(s).trim().toLowerCase();
    if (expNorm.includes(sLow)) {
      matched.push(s);
    } else {
      spurious.push(s);
    }
  }
  for (const e of expected) {
    if (!student.map((s) => String(s).trim().toLowerCase()).includes(String(e).trim().toLowerCase())) {
      missed.push(e);
    }
  }
  const correct = missed.length === 0 && spurious.length === 0 && expected.length > 0;
  let errorCode = "SS-CAUSAL-MULTI";
  if (kind === "short_term") errorCode = "SS-CAUSAL-SHORT-LONG";
  if (kind === "long_term") errorCode = "SS-CAUSAL-SHORT-LONG";
  if (kind === "multi_cause") errorCode = "SS-CAUSAL-MULTI";
  const hint = correct
    ? "因果分析完整。"
    : `請再想想這件事的${kind === "long_term" ? "長期" : "立即"}結果；缺漏：${missed.join("、") || "無"}；額外加入但不在預期：${spurious.join("、") || "無"}`;
  return {
    correct,
    matched_effects: matched,
    missed_effects: missed,
    spurious_effects: spurious,
    kind,
    error_codes: correct ? [] : [errorCode],
    hint_text_zh: hint,
    evidence_payload: emitSocialStudiesEvidence({
      student_id: "student_unknown",
      knowledge_point: cause,
      subskill: "causality",
      error_codes: correct ? [] : [errorCode],
      result: correct ? "correct" : "incorrect",
      diagnosis: { kind, matched_count: matched.length, missed_count: missed.length },
    }),
  };
}

export function compareSources({
  sources = [],
  student_synthesis = "",
  expected_synthesis = [],
} = {}) {
  const expected = Array.isArray(expected_synthesis) ? expected_synthesis : [];
  const student = String(student_synthesis || "");
  const agreements = [];
  const disagreements = [];
  const missed = [];
  for (const src of sources) {
    const label = String(src?.label || src?.id || "");
    if (student.includes(label)) {
      agreements.push(label);
    } else {
      missed.push(label);
    }
  }
  for (const e of expected) {
    if (!student.includes(String(e))) {
      missed.push(String(e));
    }
  }
  const studentNorm = student.toLowerCase();
  for (const e of expected) {
    const eLow = String(e).toLowerCase();
    if (!studentNorm.includes(eLow)) {
      disagreements.push(e);
    }
  }
  const correct = missed.length === 0 && expected.length > 0;
  const errorCodes = correct ? [] : ["SS-SRC-PRIMARY-SECONDARY"];
  const hint = correct
    ? "史料整合正確。"
    : `請確認你比對了所有史料標籤；缺漏：${missed.join("、") || "無"}。`;
  return {
    correct,
    agreements,
    disagreements,
    missed_perspectives: missed,
    sources_count: sources.length,
    error_codes: errorCodes,
    hint_text_zh: hint,
  };
}

export function interpretDemographicChart({
  chart_descriptor = {},
  question = "",
  student_answer = "",
  expected_answer = [],
} = {}) {
  const expected = Array.isArray(expected_answer) ? expected_answer : [expected_answer].filter(Boolean);
  const studentText = String(student_answer || "");
  const matched = [];
  const missed = [];
  for (const dp of expected) {
    if (studentText.includes(String(dp))) {
      matched.push(dp);
    } else {
      missed.push(dp);
    }
  }
  const correct = missed.length === 0 && expected.length > 0;
  let errorCodes = [];
  if (!correct) {
    if (/(年齡|性別|人口|出生|老化)/.test(question)) {
      errorCodes.push("SS-DATA-POPULATION-CHART");
    } else if (/(趨勢|上升|下降|增加|減少)/.test(question)) {
      errorCodes.push("SS-DATA-STAT-CURVE");
    } else {
      errorCodes.push("SS-DATA-POPULATION-CHART");
    }
  }
  const hint = correct
    ? "圖表判讀正確。"
    : `請重新核對資料點：缺漏：${missed.join("、") || "無"}。`;
  return {
    correct,
    matched_data_points: matched,
    missed_data_points: missed,
    error_codes: errorCodes,
    hint_text_zh: hint,
    chart_descriptor_keys: Object.keys(chart_descriptor || {}),
  };
}

const DECISION_ACTIONS = new Set([
  "text_prompt",
  "timeline_walk",
  "map_explanation",
  "source_comparison",
  "concept_clarification",
  "chart_drilling",
  "mastery_check",
  "backtrack_prerequisite",
]);

export function socialStudiesSpecialistDecide(input = {}) {
  const sub = classifySocialStudiesSubskill({ knowledge_point: input.knowledge_point || "" }).primary_subskill;
  const attempts = Number(input.attempts) || 1;
  const mastery = typeof input.mastery === "number" ? input.mastery : null;
  const codes = Array.isArray(input.error_codes) ? input.error_codes : [];

  let action = "text_prompt";
  let rationale = "";

  if (mastery != null && mastery >= 0.8 && codes.length === 0) {
    action = "mastery_check";
    rationale = `mastery=${mastery}≥0.8 with no errors → readiness check`;
  } else if (attempts >= 4) {
    action = "backtrack_prerequisite";
    rationale = `attempts=${attempts}≥4 → prerequisite may be missing`;
  } else if (sub === "timeline" || codes.some((c) => c.startsWith("SS-TIME"))) {
    action = "timeline_walk";
    rationale = `subskill=${sub} and timeline errors → timeline_walk`;
  } else if (sub === "map" || sub === "geography" || codes.some((c) => c.startsWith("SS-MAP") || c.startsWith("SS-GEO"))) {
    action = "map_explanation";
    rationale = `subskill=${sub} and map/geo errors → map_explanation`;
  } else if (sub === "source_comparison" || codes.some((c) => c.startsWith("SS-SRC"))) {
    action = "source_comparison";
    rationale = `subskill=${sub} and source errors → source_comparison`;
  } else if (sub === "data_interpretation" || codes.some((c) => c.startsWith("SS-DATA"))) {
    action = "chart_drilling";
    rationale = `subskill=${sub} and data errors → chart_drilling`;
  } else if (attempts >= 2) {
    action = "concept_clarification";
    rationale = `attempts=${attempts}≥2 → concept_clarification`;
  } else {
    action = "text_prompt";
    rationale = `default text_prompt (subskill=${sub}, attempts=${attempts})`;
  }

  if (!DECISION_ACTIONS.has(action)) {
    action = "text_prompt";
  }

  return {
    action,
    rationale,
    primary_subskill: sub,
    attempts,
    mastery: mastery,
  };
}

export { SOCIAL_STUDIES_HINT_LEVELS, nextSocialStudiesHint };