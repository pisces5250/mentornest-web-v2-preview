// server/tutor/english-specialist.mjs
//
// Phase 6A — English Specialist (deterministic v1).
//
// This is the **server-side** English Specialist. The front-end
// `EnglishSpecialistClient` (src/tutor/EnglishSpecialistClient.ts)
// POSTs to /api/tutor/english-evaluate which routes here.
//
// What this module IS:
//   - A deterministic teacher-decision function. It reads the
//     ReadingComparison produced by Layer A and decides:
//       * overall_result (good / close / needs_work / unclear)
//       * summary (one zh-TW sentence for the child)
//       * omitted_words / extra_words / substituted_words
//       * teaching_points (≤ 3, child-friendly)
//       * retry_recommended (boolean)
//       * confidence (specialist self-reported 0..1)
//   - All decisions come from explicit, reviewable rules. No LLM,
//     no remote calls, no audio access. Privacy is preserved
//     (only the transcript text crosses the wire).
//
// What this module IS NOT:
//   - A pronunciation scorer, a phoneme analyser, or any kind of
//     "how well did they say it" engine. We explicitly do NOT score
//     pronunciation. SenseVoice gives a transcript; we judge whether
//     the words are there, not how clearly they were said.
//   - A bridge to OpenClaw agent `english_specialist_diagnose`.
//     A future v2 may upgrade this to route to that specialist.
//
// Hard rules:
//   1. reliability < 0.5 ⇒ overall_result = "unclear",
//                         retry_recommended = true,
//                         teaching_points = [] (no false teaching),
//                         summary asks child to try again.
//   2. teaching_points is capped at 3.
//   3. summary is one short, child-friendly Traditional Chinese
//      sentence.
//   4. confidence is min(layer-A reliability, specialist self-rating).

import { compareReading } from "../lib/reading-comparison.mjs";

/**
 * Heuristic word-level teaching labels. We pick the top one (or two)
 * most useful per evaluation. Codes are stable for analytics but the
 * child only sees the label + explanation.
 */
const WORD_TAGS = {
  omit:    { code: "EN-READ-OMIT",    label: "漏字" },
  extra:   { code: "EN-READ-EXTRA",   label: "多唸" },
  sub:     { code: "EN-READ-SUB",     label: "替換詞" },
  punct:   { code: "EN-READ-PUNCT",   label: "標點 / 大小寫" },
};

/**
 * Teacher-style summaries keyed by overall result + whether we have
 * any specific diffs. We keep this small and reviewable.
 */
const SUMMARY_BY_RESULT = {
  good:       "讀得很順，內容都對。",
  close:      "讀得還不錯，有一兩個小地方可以再注意。",
  needs_work: "讀出來了，但有幾個詞需要再聽一次老師怎麼唸。",
  unclear:    "老師沒有聽清楚你說的內容，可以再讀一次嗎？",
};

/**
 * Build a teaching-point list from the comparison result. We cap at 3
 * and prefer actionable points: omissions > substitutions > extras
 * (extras are usually the least actionable — kids add filler like
 * "and" or "uh"). When the transcript is essentially perfect but has
 * small punctuation differences, we surface one "punctuation / case"
 * point instead.
 */
function pickTeachingPoints(comparison) {
  const points = [];

  // 1. Omissions — most actionable for reading-aloud.
  if (comparison.omitted.length > 0) {
    const examples = comparison.omitted
      .slice(0, 2)
      .map((o) => `「${o.expected}」`)
      .join("、");
    points.push({
      code: WORD_TAGS.omit.code,
      label: WORD_TAGS.omit.label,
      explanation: `漏了 ${comparison.omitted.length} 個詞${comparison.omitted.length > 2 ? "等" : ""}：${examples}。`,
    });
  }

  // 2. Substitutions — second most actionable.
  if (comparison.substituted.length > 0) {
    const examples = comparison.substituted
      .slice(0, 2)
      .map((s) => `「${s.expected}」→「${s.actual}」`)
      .join("、");
    points.push({
      code: WORD_TAGS.sub.code,
      label: WORD_TAGS.sub.label,
      explanation: `有 ${comparison.substituted.length} 個詞唸成了別的詞：${examples}。`,
    });
  }

  // 3. Extras — only if there's room and we don't already have 2+ points.
  if (points.length < 2 && comparison.extra.length > 0) {
    const examples = comparison.extra
      .slice(0, 2)
      .map((e) => `「${e.actual}」`)
      .filter((s) => s !== "「」")
      .join("、");
    if (examples) {
      points.push({
        code: WORD_TAGS.extra.code,
        label: WORD_TAGS.extra.label,
        explanation: `多唸了 ${comparison.extra.length} 個詞：${examples}。`,
      });
    }
  }

  // 4. Cap to 3.
  return points.slice(0, 3);
}

/**
 * Decide overall_result from coverage + reliability + diff counts.
 * Bands are deliberately conservative for a 5th-grade reader: small
 * slips are "close", real misses are "needs_work".
 */
function decideOverall({ coverage, reliability, comparison }) {
  if (reliability < 0.5) return "unclear";

  // Coverage is in [0, 1]. Edit-distance based.
  const totalDiffs =
    comparison.omitted.length +
    comparison.extra.length +
    comparison.substituted.length;
  const expLen = Math.max(1, comparison.expected_tokens.length);

  if (totalDiffs === 0) return "good";
  if (coverage >= 0.85 && totalDiffs <= Math.max(1, Math.floor(expLen * 0.15))) {
    return "close";
  }
  if (coverage >= 0.5) return "close";
  return "needs_work";
}

/**
 * Decide retry_recommended. We never push the child back if they
 * nailed it. We push them back when coverage is low enough that
 * another attempt is likely to help, OR when reliability is poor
 * (regardless of coverage).
 */
function decideRetry({ overall_result, coverage, reliability }) {
  if (overall_result === "good") return false;
  if (overall_result === "unclear") return true;
  // close + needs_work: only retry if coverage is poor enough.
  return coverage < 0.8;
}

/**
 * Self-reported confidence. Min of reliability and a specialist-side
 * "do I trust this diff list?" heuristic.
 */
function decideConfidence({ reliability, comparison, overall_result }) {
  let c = reliability;
  // A perfect transcript and good result deserve higher confidence.
  if (overall_result === "good") c = Math.max(c, 0.9);
  // Lots of substitutions reduce our certainty about the meaning.
  if (comparison.substituted.length > Math.max(2, comparison.expected_tokens.length * 0.3)) {
    c = Math.min(c, 0.6);
  }
  return clamp01(c);
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Evaluate one child response. Pure function.
 *
 * @param {{
 *   student_id: string,
 *   knowledge_point: string,
 *   age_band: string,
 *   expected_text: string,
 *   transcript: string,
 *   transcript_confidence?: number|null,
 * }} input
 * @returns {object} TutorEvaluation (contract shape)
 */
export function evaluateReading(input) {
  if (!input || typeof input !== "object") {
    throw new Error("english-specialist: input required");
  }
  if (!input.expected_text || !String(input.expected_text).trim()) {
    throw new Error("english-specialist: expected_text required");
  }
  if (typeof input.transcript !== "string") {
    throw new Error("english-specialist: transcript required");
  }

  // Layer A: deterministic comparison.
  const comparison = compareReading({
    expected: input.expected_text,
    transcript: input.transcript,
    sttConfidence: input.transcript_confidence ?? null,
  });

  const reliability = comparison.reliability;
  const overall_result = decideOverall({
    coverage: comparison.coverage,
    reliability,
    comparison,
  });

  // Hard rule 1: if signal is unreliable, do NOT pretend to teach.
  let teaching_points;
  let summary;
  let retry_recommended;
  let confidence;

  if (overall_result === "unclear") {
    teaching_points = [];
    summary = SUMMARY_BY_RESULT.unclear;
    retry_recommended = true;
    // Confidence reflects that we're saying "we don't know".
    confidence = clamp01(reliability);
  } else {
    teaching_points = pickTeachingPoints(comparison);
    summary = SUMMARY_BY_RESULT[overall_result];
    retry_recommended = decideRetry({
      overall_result,
      coverage: comparison.coverage,
      reliability,
    });
    confidence = decideConfidence({ reliability, comparison, overall_result });
  }

  return {
    overall_result,
    summary,
    omitted_words: comparison.omitted.map((d) => ({
      expected: d.expected,
      actual: null,
      position: d.position,
    })),
    extra_words: comparison.extra.map((d) => ({
      expected: "",
      actual: d.actual,
      position: d.position,
    })),
    substituted_words: comparison.substituted.map((d) => ({
      expected: d.expected,
      actual: d.actual,
      position: d.position,
    })),
    teaching_points,
    retry_recommended,
    confidence,
    evaluated_at: new Date().toISOString(),
  };
}