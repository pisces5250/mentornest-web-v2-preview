// lib/question_segmenter.mjs
//
// Phase 4A — Question Segmenter.
//
// Pure (no disk writes) segmentation of RawCandidate[] into structured
// SegmentedQuestion[]. Recognizes 6 question types:
//   1. short_answer    — stem with "= ?" or "是多少" or "answer:" line
//   2. multiple_choice — stem + "A) ... B) ... C) ... D) ..." or "(A) (B) (C) (D)"
//   3. true_false      — stem ending with "對/錯?" or "是/否?" or "(T/F)"
//   4. fill_in_blank   — stem with "____" or "(___)" placeholder
//   5. essay           — stem asking for explanation with "請說明" or "為什麼"
//   6. unknown         — anything else; surfaces a warning
//
// The segmenter is PURE. It does NOT write to disk and does NOT promote
// anything to the verified bank. The curator / quality gate will handle
// promotion in a later phase.

import { randomUUID, randomBytes } from "node:crypto";

export const QUESTION_TYPE = Object.freeze({
  SHORT_ANSWER: "short_answer",
  MULTIPLE_CHOICE: "multiple_choice",
  TRUE_FALSE: "true_false",
  FILL_IN_BLANK: "fill_in_blank",
  ESSAY: "essay",
  UNKNOWN: "unknown",
});

export const VALID_QUESTION_TYPES = Object.freeze([
  QUESTION_TYPE.SHORT_ANSWER,
  QUESTION_TYPE.MULTIPLE_CHOICE,
  QUESTION_TYPE.TRUE_FALSE,
  QUESTION_TYPE.FILL_IN_BLANK,
  QUESTION_TYPE.ESSAY,
  QUESTION_TYPE.UNKNOWN,
]);

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generate a ULID-ish seg_id: 10-char base32 timestamp prefix + 16-char random suffix.
 */
export function makeSegId(now = Date.now()) {
  const ts = now.toString(36).padStart(10, "0").slice(-10).toUpperCase();
  let rand = "";
  const buf = randomBytes(10);
  for (let i = 0; i < buf.length; i++) {
    rand += ALPHABET[buf[i] % ALPHABET.length];
  }
  return `seg_${ts}${rand}`;
}

/**
 * Patterns used to detect each question type. Each entry has a name, a
 * regex (with the g flag where it helps), and the priority/confidence
 * weight.
 */
const PATTERNS = Object.freeze({
  MC_LETTER_PAREN: {
    name: "mc_letter_paren",
    //   A) foo   B) bar
    regex: /(?:^|\n)\s*\(?([A-D])\)?\s*[\.\)]\s*([^\n]+)/g,
    type: QUESTION_TYPE.MULTIPLE_CHOICE,
    weight: 0.95,
  },
  MC_PAREN_GROUP: {
    name: "mc_paren_group",
    //   (A) (B) (C) (D) all on stem line
    regex: /\([A-D]\)/g,
    type: QUESTION_TYPE.MULTIPLE_CHOICE,
    weight: 0.8,
  },
  TF_TRADITIONAL: {
    name: "tf_traditional",
    regex: /(對|錯|是|否|嗎)\s*[?？]\s*$/m,
    type: QUESTION_TYPE.TRUE_FALSE,
    weight: 0.9,
  },
  TF_PARENS: {
    name: "tf_parens",
    regex: /\(\s*T\s*\/\s*F\s*\)/i,
    type: QUESTION_TYPE.TRUE_FALSE,
    weight: 0.95,
  },
  SA_EQUAL_QUESTION: {
    name: "sa_equal_question",
    regex: /=\s*\?\s*$/m,
    type: QUESTION_TYPE.SHORT_ANSWER,
    weight: 0.9,
  },
  SA_DUOSHAO: {
    name: "sa_duoshao",
    regex: /是多少|是什麼|多大|多長|幾[個隻條]/u,
    type: QUESTION_TYPE.SHORT_ANSWER,
    weight: 0.7,
  },
  SA_ANSWER_LINE: {
    name: "sa_answer_line",
    regex: /(^|\n)\s*(answer|ans|答案|解答|參考答案)\s*[:：]/i,
    type: QUESTION_TYPE.SHORT_ANSWER,
    weight: 0.85,
  },
  FIB_UNDERSCORE: {
    name: "fib_underscore",
    regex: /_{2,}/,
    type: QUESTION_TYPE.FILL_IN_BLANK,
    weight: 0.9,
  },
  FIB_PARENS: {
    name: "fib_parens",
    regex: /\([_\s]{2,}\)/,
    type: QUESTION_TYPE.FILL_IN_BLANK,
    weight: 0.85,
  },
  ESSAY_EXPLAIN: {
    name: "essay_explain",
    regex: /請說明|請解釋|請描述|為什麼|why|explain/i,
    type: QUESTION_TYPE.ESSAY,
    weight: 0.7,
  },
});

/**
 * Count blank placeholders in stem. Counts (a) each `(___)`-style paren-blank,
 * and (b) each `___`-style underscore run NOT already wrapped in parens.
 */
export function countBlanks(stem) {
  if (typeof stem !== "string") return 0;
  const parenSlots = (stem.match(/\([_\s]{2,}\)/g) || []).length;
  // Remove paren-blanks first so their inner underscores aren't double-counted.
  const stripped = stem.replace(/\([_\s]{2,}\)/g, "");
  const underscoreSlots = (stripped.match(/_{2,}/g) || []).length;
  return parenSlots + underscoreSlots;
}

/**
 * Extract choices from a multiple-choice stem.
 * Returns [{label: "A", text: "..."}, ...] or null.
 */
export function extractChoices(stem) {
  if (typeof stem !== "string") return null;
  // Pattern A: each choice on its own line "A) ..." or "A. ..."
  const lineRegex = /(^|\n)\s*\(?([A-D])\)?\s*[\.\)]\s*([^\n]+)/g;
  const matches = [...stem.matchAll(lineRegex)];
  if (matches.length >= 2) {
    const choices = matches.map((m) => ({
      label: m[2].toUpperCase(),
      text: m[3].trim(),
    }));
    // Deduplicate by label.
    const seen = new Set();
    const deduped = [];
    for (const c of choices) {
      if (!seen.has(c.label)) {
        seen.add(c.label);
        deduped.push(c);
      }
    }
    if (deduped.length >= 2) return deduped;
  }
  // Pattern B: choices inline as "(A) foo (B) bar (C) baz (D) qux"
  const inlineRegex = /\(([A-D])\)\s*([^()\n]+?)(?=\s*\([A-D]\)|$)/g;
  const im = [...stem.matchAll(inlineRegex)];
  if (im.length >= 2) {
    return im.map((m) => ({ label: m[1].toUpperCase(), text: m[2].trim() }));
  }
  return null;
}

/**
 * Extract an "answer: ..." or "答案： ..." line if present.
 */
export function extractAnswerHint(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/(?:^|\n)\s*(?:answer|ans|答案|解答|參考答案)\s*[:：]\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}

/**
 * Split stem from a raw block (raw_text may include "answer:" trailer).
 */
export function splitStemAndTrailer(raw_text) {
  if (typeof raw_text !== "string") return { stem: "", trailer: "" };
  const idx = raw_text.search(/(?:^|\n)\s*(?:answer|ans|答案|解答|參考答案)\s*[:：]/i);
  if (idx === -1) return { stem: raw_text, trailer: "" };
  return { stem: raw_text.slice(0, idx).trim(), trailer: raw_text.slice(idx).trim() };
}

/**
 * Decide a question type from a stem string. Returns { type, matched_patterns }.
 */
export function classifyStem(stem) {
  const matched = [];
  if (typeof stem !== "string" || stem.length === 0) {
    return { type: QUESTION_TYPE.UNKNOWN, matched_patterns: matched };
  }
  // Order matters: MC first if it has choices, then TF, then FIB, then SA, then essay.
  // Multiple-choice: needs at least 2 letter+paren tokens.
  const mcMatch = extractChoices(stem);
  if (mcMatch && mcMatch.length >= 2) {
    matched.push(PATTERNS.MC_LETTER_PAREN.name);
    if (PATTERNS.MC_PAREN_GROUP.regex.test(stem)) matched.push(PATTERNS.MC_PAREN_GROUP.name);
    return { type: QUESTION_TYPE.MULTIPLE_CHOICE, matched_patterns: matched };
  }
  // True/false
  if (PATTERNS.TF_PARENS.regex.test(stem)) {
    matched.push(PATTERNS.TF_PARENS.name);
    return { type: QUESTION_TYPE.TRUE_FALSE, matched_patterns: matched };
  }
  if (PATTERNS.TF_TRADITIONAL.regex.test(stem)) {
    matched.push(PATTERNS.TF_TRADITIONAL.name);
    return { type: QUESTION_TYPE.TRUE_FALSE, matched_patterns: matched };
  }
  // Fill-in-blank
  if (PATTERNS.FIB_UNDERSCORE.regex.test(stem)) {
    matched.push(PATTERNS.FIB_UNDERSCORE.name);
    return { type: QUESTION_TYPE.FILL_IN_BLANK, matched_patterns: matched };
  }
  if (PATTERNS.FIB_PARENS.regex.test(stem)) {
    matched.push(PATTERNS.FIB_PARENS.name);
    return { type: QUESTION_TYPE.FILL_IN_BLANK, matched_patterns: matched };
  }
  // Short answer
  if (PATTERNS.SA_EQUAL_QUESTION.regex.test(stem)) {
    matched.push(PATTERNS.SA_EQUAL_QUESTION.name);
    return { type: QUESTION_TYPE.SHORT_ANSWER, matched_patterns: matched };
  }
  if (PATTERNS.SA_ANSWER_LINE.regex.test(stem)) {
    matched.push(PATTERNS.SA_ANSWER_LINE.name);
    return { type: QUESTION_TYPE.SHORT_ANSWER, matched_patterns: matched };
  }
  if (PATTERNS.SA_DUOSHAO.regex.test(stem)) {
    matched.push(PATTERNS.SA_DUOSHAO.name);
    return { type: QUESTION_TYPE.SHORT_ANSWER, matched_patterns: matched };
  }
  // Essay
  if (PATTERNS.ESSAY_EXPLAIN.regex.test(stem)) {
    matched.push(PATTERNS.ESSAY_EXPLAIN.name);
    return { type: QUESTION_TYPE.ESSAY, matched_patterns: matched };
  }
  return { type: QUESTION_TYPE.UNKNOWN, matched_patterns: matched };
}

/**
 * Confidence based on pattern weight + signals strength.
 */
export function computeConfidence(type, matched_patterns, signals) {
  if (type === QUESTION_TYPE.UNKNOWN) return 0.0;
  let conf = 0.5;
  for (const name of matched_patterns) {
    const pat = Object.values(PATTERNS).find((p) => p.name === name);
    if (pat) conf = Math.max(conf, pat.weight);
  }
  if (signals?.has_question_mark) conf = Math.min(1.0, conf + 0.02);
  if (signals?.has_answer_key && type === QUESTION_TYPE.SHORT_ANSWER) {
    conf = Math.min(1.0, conf + 0.05);
  }
  return Math.round(conf * 1000) / 1000;
}

/**
 * Segment a single RawCandidate into a SegmentedQuestion.
 */
export function segmentCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const { stem, trailer } = splitStemAndTrailer(candidate.raw_text || "");
  const classification = classifyStem(stem);
  const answer_hint = extractAnswerHint(trailer) || extractAnswerHint(candidate.raw_text || "");
  const choices = classification.type === QUESTION_TYPE.MULTIPLE_CHOICE ? extractChoices(stem) : null;
  const blank_count = classification.type === QUESTION_TYPE.FILL_IN_BLANK ? countBlanks(stem) : 0;
  const confidence = computeConfidence(classification.type, classification.matched_patterns, candidate.detection_signals);
  return {
    seg_id: makeSegId(),
    candidate_id: candidate.candidate_id || null,
    type: classification.type,
    stem,
    choices,
    answer_hint,
    blank_count,
    matched_patterns: classification.matched_patterns,
    confidence,
    source_offset: candidate.byte_offset ?? null,
  };
}

/**
 * Segment an array of RawCandidates.
 *
 * @param {RawCandidate[]} candidates
 * @returns {SegmentationReport}
 */
export function segmentCandidates(candidates) {
  const warnings = [];
  if (!Array.isArray(candidates)) {
    return {
      ok: false,
      segmented_count: 0,
      questions: [],
      warnings: ["segmentCandidates: candidates must be an array"],
    };
  }
  const questions = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c || typeof c !== "object") {
      warnings.push(`segmentCandidates: skipping non-object candidate at index ${i}`);
      continue;
    }
    const q = segmentCandidate(c);
    if (!q) {
      warnings.push(`segmentCandidates: failed to segment candidate ${c.candidate_id || i}`);
      continue;
    }
    if (q.type === QUESTION_TYPE.UNKNOWN) {
      warnings.push(
        `segmentCandidates: candidate ${q.candidate_id} (index ${i}) could not be classified`,
      );
    }
    questions.push(q);
  }
  return {
    ok: true,
    segmented_count: questions.length,
    questions,
    warnings,
  };
}

export const __TEST__ = Object.freeze({
  classifyStem,
  splitStemAndTrailer,
  extractChoices,
  extractAnswerHint,
  countBlanks,
  computeConfidence,
});