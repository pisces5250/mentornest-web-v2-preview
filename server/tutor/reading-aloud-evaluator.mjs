// ─────────────────────────────────────────────────────────────────────
// MentorNest Phase 6A — Reading-Aloud (voice_response) Evaluator
//
// Composes:
//   - Layer A: server/lib/reading-comparison.mjs      (deterministic evidence)
//   - Layer B: server/tutor/english/english_specialist.mjs
//              (REAL English Specialist, source-of-truth =
//               /home/node/.openclaw/plugins/mentornest-learning/lib/)
//
// Contract: returns a TutorEvaluation (see src/tutor/TutorEvaluationContract.ts).
//
// Hard invariants enforced here:
//   - NEVER calls an LLM.
//   - NEVER writes to mastery.
//   - NEVER writes the transcript anywhere except inside the immediate
//     function return value.
//   - NEVER logs transcript text alongside student_id.
//
// Assessment Agent rule (Phase 6A v2):
//   - This evaluator does NOT emit mastery evidence. Reading-aloud is a
//     performance task; one attempt's STT-confidence-noisy verdict is not
//     mastery evidence. Mastery consolidation (if any) is the Assessment
//     Agent's separate concern, not this path.
// ─────────────────────────────────────────────────────────────────────

import { compareReading } from "../lib/reading-comparison.mjs";
import {
  diagnoseEnglishResponse,
  englishSpecialistDecide,
} from "./english/english_specialist.mjs";
import { classifyEnglishSubskill } from "./english/english_subskill_map.mjs";
import { lookupErrorCode } from "./english/english_error_taxonomy.mjs";

// ─────────────────────────────────────────────────────────────────────
// Tone mapping — the specialist returns result ∈
//   {correct, incorrect, ambiguous, tol_correct}.  The TutorEvaluation
//   contract uses 4 tones.  Mapping is the Specialist's call, not the
//   orchestrator's; we keep the mapping conservative so we never
//   OVER-claim on a noisy transcript.
// ─────────────────────────────────────────────────────────────────────

/**
 * Map specialist verdict → TutorEvaluation overall_result.
 *
 * @param {object} args
 * @param {"correct"|"incorrect"|"ambiguous"|"tol_correct"} args.specialist_result
 * @param {number} args.transcript_confidence
 * @param {number} args.coverage         (Layer A: 0..1)
 * @param {number} args.reliability      (Layer A: 0..1)
 * @returns {"good"|"close"|"needs_work"|"unclear"}
 */
function mapTone({ specialist_result, transcript_confidence, coverage, reliability }) {
  // Hard rule 1: low transcript reliability → NEVER criticise.
  if (reliability < 0.5) return "unclear";

  // Hard rule 2: low coverage but acceptable reliability → needs_work.
  if (specialist_result === "incorrect" && coverage < 0.7) return "needs_work";
  if (specialist_result === "incorrect") return "close";

  if (specialist_result === "tol_correct") return "close";
  if (specialist_result === "ambiguous") return "close"; // borderline; we name it honestly
  return "good"; // correct
}

/**
 * Build a one-line zh-TW summary appropriate for the tone.
 *
 * Learning Designer rule: never display the specialist's raw taxonomy
 * label (e.g. "EN-RD-EXP-MISSED" → "找不到關鍵詞") in child-facing
 * copy.  Those labels are diagnostic vocabulary for adult teachers /
 * curriculum mapping; children need plain numbers ("湗了一個字").
 *
 * Composition order:
 *   1. describe what happened in the child's words (omitted/extra/sub counts)
 *   2. close with an invitation (always, never just a criticism)
 *
 * @param {"good"|"close"|"needs_work"|"unclear"} tone
 * @param {object} counts {omitted, extra, substituted}
 * @returns {string}
 */
function summaryFor(tone, counts) {
  const { omitted, extra, substituted } = counts;
  switch (tone) {
    case "good":
      return "讀得很順，內容都對！";
    case "close": {
      const parts = [];
      if (omitted > 0) parts.push(`漏了 ${omitted} 個字`);
      if (extra > 0) parts.push(`多念了 ${extra} 個字`);
      if (substituted > 0) parts.push(`換了 ${substituted} 個字`);
      const what = parts.length > 0 ? parts.join("、") : "需要再看一次";
      return `讀得不錯，老師看到 ${what}，我們再順一次。`;
    }
    case "needs_work": {
      const parts = [];
      if (omitted > 0) parts.push(`漏了 ${omitted} 個字`);
      if (extra > 0) parts.push(`多念了 ${extra} 個字`);
      if (substituted > 0) parts.push(`換了 ${substituted} 個字`);
      const what = parts.length > 0 ? parts.join("、") : "有些地方不一樣";
      return `老師跟你一起再順一次，看看這幾個地方：${what}。`;
    }
    case "unclear":
      return "老師沒辦法完全聽清楚，可以再讀一次嗎？";
  }
}

/**
 * Decide whether to recommend retry, given the Specialist's decision.
 *
 * @param {object} args
 * @param {"good"|"close"|"needs_work"|"unclear"} args.tone
 * @param {object} args.specialist_decide
 * @returns {boolean}
 */
function recommendRetry({ tone, specialist_decide }) {
  if (tone === "unclear") return true;
  if (tone === "good") return false;
  // For close / needs_work: rely on the specialist's own decision
  // (which knows whether to escalate to drill / scaffold).
  return specialist_decide?.action === "oral_practice" || specialist_decide?.action === "reading_scaffold";
}

/**
 * Build up to 3 teaching points from the specialist's error_codes.
 * Capped at 3, ranked by teaching priority:
 *   omission (EN-RD-EXP-MISSED) > substitution (EN-RD-INF-OVER / EN-PHON-*)
 *   > STT-noise (EN-STT-AMBIG) > punctuation / case (EN-PUNC-APOS / EN-CAP-DAY).
 *
 * @param {string[]} error_codes
 * @param {"good"|"close"|"needs_work"|"unclear"} tone
 * @returns {Array<{code:string, label:string, explanation:string}>}
 */
function buildTeachingPoints(error_codes, tone) {
  if (tone === "unclear") return []; // never teach on noisy input

  const rank = {
    "EN-RD-EXP-MISSED": 0,
    "EN-RD-INF-OVER": 1,
    "EN-PHON-LS": 2,
    "EN-PHON-VT": 2,
    "EN-PHON-CB": 2,
    "EN-PHON-SILENT": 2,
    "EN-PHON-VC-CONF": 2,
    "EN-SPK-PRON": 3,
    "EN-SPK-INT": 3,
    "EN-STT-AMBIG": 4,
    "EN-STT-PHON": 4,
    "EN-PUNC-APOS": 5,
    "EN-CAP-DAY": 5,
  };
  const sorted = error_codes.slice().sort((a, b) => (rank[a] ?? 99) - (rank[b] ?? 99));
  const points = [];
  for (const code of sorted.slice(0, 3)) {
    const meta = lookupErrorCode(code);
    if (!meta) continue;
    points.push({
      code,
      label: meta.label_zh,
      explanation: meta.description,
    });
  }
  return points;
}

/**
 * Evaluate one child-confirmed reading-aloud attempt.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {"G1-G2"|"G3-G4"|"G5-G6"|"G7+"} input.age_band
 * @param {string} input.expected_text                  (the passage to read aloud)
 * @param {string} input.transcript                    (child-confirmed STT transcript)
 * @param {number|null} [input.transcript_confidence]  (0..1; null if STT pipeline didn't report)
 * @param {number} [input.attempts]                    (how many times this question has been attempted in this session; default 1)
 * @returns {{
 *   ok: true,
 *   evaluation: import("../../src/tutor/TutorEvaluationContract.ts").TutorEvaluation,
 *   reading_comparison: object,
 *   specialist: { subskill: string, action: string, rationale: string, confidence: number }
 * }}
 */
export function evaluateReadingAloud(input) {
  const {
    student_id,
    knowledge_point,
    age_band,
    expected_text,
    transcript,
    transcript_confidence = null,
    attempts = 1,
  } = input || {};

  // ── Validate (orchestrator-side; mirrors the real Specialist's own checks) ──
  if (typeof expected_text !== "string" || expected_text.length === 0) {
    return {
      ok: false,
      code: "expected_required",
      message: "找不到題目的朗讀內容。請重整頁面再試一次。",
    };
  }
  if (typeof transcript !== "string" || transcript.trim().length === 0) {
    return {
      ok: false,
      code: "transcript_required",
      message: "找不到這次的錄音內容。請再試一次。",
    };
  }
  if (typeof student_id !== "string" || student_id.length === 0) {
    return { ok: false, code: "student_required", message: "找不到學生資料。" };
  }
  if (typeof knowledge_point !== "string" || knowledge_point.length === 0) {
    return { ok: false, code: "kp_required", message: "找不到這題的學習範圍。" };
  }
  if (!["G1-G2", "G3-G4", "G5-G6", "G7+"].includes(age_band)) {
    return { ok: false, code: "invalid_payload", message: "請確認你的年級設定，再試一次。" };
  }

  // ── Layer A: deterministic diff (evidence only, not the verdict) ──
  const reading_comparison = compareReading({
    expected: expected_text,
    transcript,
  });

  // ── Layer B: real English Specialist diagnosis ──
  // Pre-normalise: expand contractions so the upstream `isCorrect`
  // (which only knows lowercase + strip-punctuation) does not flag
  // "don't" vs "do not" as missing a word.  We keep the raw transcript
  // in the response so the UI can show what the child actually said.
  const transcript_for_specialist = expandContractionsForSpecialist(transcript);
  const expected_for_specialist = expandContractionsForSpecialist(expected_text);

  const specialist_diagnosis = diagnoseEnglishResponse({
    stem: `Read this passage aloud: ${expected_for_specialist}`,
    student_answer: transcript_for_specialist,
    expected_answer: expected_for_specialist,
    knowledge_point,
    mode: "oral_response",
    transcript_metadata: transcript_confidence !== null
      ? {
          raw_transcript: transcript,
          source: "sensevoice_local",
          confidence: transcript_confidence,
        }
      : {
          raw_transcript: transcript,
          source: "sensevoice_local",
        },
    grade: age_bandToGrade(age_band),
  });

  // ── Layer B: real English Specialist decision (drill / scaffold / oral) ──
  const specialist_decide = englishSpecialistDecide({
    student_id,
    knowledge_point,
    attempts,
    mastery: null, // this path does NOT read mastery (Assessment Agent's domain)
    error_codes: specialist_diagnosis.error_codes,
    mode: "oral_response",
  });

  // ── Compose TutorEvaluation ──
  const tone = mapTone({
    specialist_result: pickResult(specialist_diagnosis),
    transcript_confidence,
    coverage: reading_comparison.coverage,
    reliability: reading_comparison.reliability,
  });

  const dominant_error_code = tone === "unclear"
    ? null
    : (specialist_diagnosis.error_codes || [])[0] || null;
  const summary = summaryFor(tone, {
    omitted: (reading_comparison.omitted || []).length,
    extra: (reading_comparison.extra || []).length,
    substituted: (reading_comparison.substituted || []).length,
  });

  const teaching_points = buildTeachingPoints(
    specialist_diagnosis.error_codes || [],
    tone,
  );

  const retry_recommended = recommendRetry({ tone, specialist_decide });

  const confidence = Math.min(
    reading_comparison.reliability,
    Number(specialist_diagnosis.confidence ?? specialist_decide.confidence ?? 0.6),
  );

  const evaluation = {
    overall_result: tone,
    summary,
    omitted_words: reading_comparison.omitted || [],
    extra_words: reading_comparison.extra || [],
    substituted_words: reading_comparison.substituted || [],
    teaching_points,
    retry_recommended,
    confidence,
    evaluated_at: new Date().toISOString(),
    specialist_decision: {
      action: specialist_decide.action,
      rationale: specialist_decide.rationale,
      subskill: specialist_decide.subskill,
    },
    dominant_error_code,
  };

  return {
    ok: true,
    evaluation,
    reading_comparison,
    specialist: {
      subskill: specialist_decide.subskill,
      action: specialist_decide.action,
      rationale: specialist_decide.rationale,
      confidence: specialist_decide.confidence,
    },
  };
}

/**
 * Specialist diagnosis returns `correct / incorrect / ambiguous / tol_correct`
 * as a boolean + flags; reconstruct the closest enum from the payload.
 */
function pickResult(d) {
  if (!d) return "incorrect";
  if (d.correct) return "correct";
  if (d.tol_correct) return "tol_correct";
  if (Array.isArray(d.transcript_metadata_flags) && d.transcript_metadata_flags.includes("ambiguity")) {
    return "ambiguous";
  }
  return "incorrect";
}

function age_bandToGrade(band) {
  switch (band) {
    case "G1-G2":
      return 1;
    case "G3-G4":
      return 3;
    case "G5-G6":
      return 5;
    default:
      return 7;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Contraction expansion — bridges the upstream Specialist's
// plain-lowercase-strip-punctuation normaliser (which has no notion of
// "don't" == "do not") with reading-aloud reality.  Mirrors the same
// map as `server/lib/reading-comparison.mjs` so the two normalisers
// agree.  Kept tiny on purpose — if the Specialist ever learns about
// contractions, delete this whole helper.
// ─────────────────────────────────────────────────────────────────────

const CONTRACTIONS = {
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "won't": "will not",
  "can't": "cannot",
  "couldn't": "could not",
  "shouldn't": "should not",
  "wouldn't": "would not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "i'm": "i am",
  "you're": "you are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "we're": "we are",
  "they're": "they are",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would",
  "let's": "let us",
  "that's": "that is",
  "there's": "there is",
};

function expandContractionsForSpecialist(s) {
  if (typeof s !== "string" || s.length === 0) return s;
  // First normalise curly apostrophes to straight so both Layer A's
  // contract map (key uses U+0027) and the upstream Specialist's
  // strip-punctuation list see the same string.
  let out = s.replace(/\u2019/g, "'");
  for (const [contract, expanded] of Object.entries(CONTRACTIONS)) {
    // Match both straight ' (U+0027) and curly ’ (U+2019) apostrophes,
    // case-insensitive, with word boundaries.
    const escaped = contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped.replace(/'/g, "['\\u2019]")}\\b`, "gi");
    out = out.replace(re, (match) => {
      // Preserve original casing of the first character.
      const replacement = match[0] === match[0].toUpperCase()
        ? expanded[0].toUpperCase() + expanded.slice(1)
        : expanded;
      return replacement;
    });
  }
  return out;
}
