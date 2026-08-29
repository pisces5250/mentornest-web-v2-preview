// English Specialist v1 — orchestrator surface.
//
// Pure functions (no I/O). Produces structured diagnosis + evidence payloads
// that the rest of the system consumes. NEVER directly modifies mastery.
//
// Surface area:
//   - diagnoseEnglishResponse
//   - analyzeReadingComprehensionEnglish
//   - transcribeAndGradeOralResponse (interface only)
//   - evaluateConversationTurn
//   - englishSpecialistDecide
//   - englishToPhonicsMap
//   - emitEvidence (factory — no I/O)
//
// CRITICAL INVARIANTS:
//   - No LLM calls.
//   - No mastery file writes (those go through mastery_engine_v2).
//   - Cross-student isolation: every function takes student_id but only for
//     context (logging, evidence); no function reads another student's data.
//   - English-specific error taxonomy; NEVER reuses math or Chinese taxonomy.
//   - Phonetics / pronunciation: this is an INTERFACE ONLY. We do NOT claim
//     to have production phoneme scoring. englishToPhonicsMap ships a small
//     built-in map for common G1–G6 sight words; unknown words are flagged as
//     gaps.

import { lookupErrorCode, ENGLISH_ERROR_TAXONOMY } from "./english_error_taxonomy.mjs";
import { classifyEnglishSubskill } from "./english_subskill_map.mjs";

// ───────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────

/**
 * Normalize English text for matching:
 * - Lowercase
 * - Strip whitespace
 * - Strip punctuation (English)
 * - Collapse articles (a/an/the) at the start
 */
function normalizeText(s) {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:'"`~()\[\]{}<>@#$%^&*_+=\\/|-]/g, "")
    .trim();
}

function tokens(s) {
  const n = normalizeText(s);
  if (!n) return [];
  return n.split(/\s+/).filter(Boolean);
}

function isCorrect(expected, student) {
  const a = normalizeText(expected);
  const b = normalizeText(student);
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a === b;
}

/**
 * Strip leading article (a/an/the) for tolerant matching.
 */
function stripArticle(s) {
  return normalizeText(s).replace(/^(a|an|the)\s+/, "");
}

/**
 * Choose an error code from the taxonomy. If the caller supplied
 * error_code and it's valid, use it; else, try to infer from the
 * student's wrong answer vs. expected answer.
 */
function inferErrorCode({ student_answer, expected_answer, knowledge_point, error_code }) {
  if (typeof error_code === "string" && error_code) {
    const e = lookupErrorCode(error_code);
    if (e) return { code: e.code, subtype: e.category };
    return { code: error_code, subtype: "unknown_taxonomy_code" };
  }
  const subs = classifyEnglishSubskill({ knowledge_point: knowledge_point || "" });
  const a = normalizeText(student_answer);
  const b = normalizeText(expected_answer);

  // Empty student answer → transcription or no-response.
  if (!a) return { code: "EN-STT-AMBIG", subtype: subs.primary_subskill };
  // Empty expected → we can't really judge; default to vocab.
  if (!b) return { code: "EN-VOC-FALSE", subtype: subs.primary_subskill };

  // Sub-skill-driven inference.
  if (subs.primary_subskill === "phonics") return { code: "EN-PHON-LS", subtype: subs.primary_subskill };
  if (subs.primary_subskill === "spelling") {
    // Length difference often indicates missing/extra char.
    if (a.length < b.length) return { code: "EN-SPELL-DOUBLE", subtype: subs.primary_subskill };
    return { code: "EN-SPELL-TION", subtype: subs.primary_subskill };
  }
  if (subs.primary_subskill === "vocab") return { code: "EN-VOC-COLLOC", subtype: subs.primary_subskill };
  if (subs.primary_subskill === "grammar") return { code: "EN-GRAM-TENSE", subtype: subs.primary_subskill };
  if (subs.primary_subskill === "reading") return { code: "EN-RD-EXP-MISSED", subtype: subs.primary_subskill };
  if (subs.primary_subskill === "speaking") return { code: "EN-SPK-PRON", subtype: subs.primary_subskill };
  if (subs.primary_subskill === "listening") return { code: "EN-LIS-SEG", subtype: subs.primary_subskill };

  // Heuristic fallback: if both are single tokens and share no letters → false friend.
  const a_tokens = tokens(student_answer);
  const b_tokens = tokens(expected_answer);
  if (a_tokens.length === 1 && b_tokens.length === 1) {
    if (a_tokens[0].length <= 3 && b_tokens[0].length <= 3) {
      return { code: "EN-VOC-HOMONYM", subtype: subs.primary_subskill };
    }
  }
  return { code: "EN-VOC-FALSE", subtype: subs.primary_subskill };
}

// ───────────────────────────────────────────────────────────────────
// Phonics map (V1 — small built-in set for G1–G6 sight words)
// ───────────────────────────────────────────────────────────────────

/**
 * Built-in phonics map for common G1–G6 sight words. Each entry has
 * phonemes (loose notation), stress_pattern, and common_confusions.
 * V1 limitation: documented gap for unknown words.
 */
const PHONICS_MAP = {
  "the": { phonemes: ["ð", "ə"], stress_pattern: "unstressed", common_confusions: ["a", "duh"] },
  "a": { phonemes: ["æ"], stress_pattern: "monosyllabic", common_confusions: ["e", "i"] },
  "an": { phonemes: ["æ", "n"], stress_pattern: "monosyllabic", common_confusions: ["and", "am"] },
  "and": { phonemes: ["æ", "n", "d"], stress_pattern: "monosyllabic", common_confusions: ["an", "end"] },
  "is": { phonemes: ["ɪ", "z"], stress_pattern: "monosyllabic", common_confusions: ["his", "as"] },
  "are": { phonemes: ["ɑ", "r"], stress_pattern: "monosyllabic", common_confusions: ["our", "or"] },
  "you": { phonemes: ["j", "u"], stress_pattern: "monosyllabic", common_confusions: ["yoo", "u"] },
  "he": { phonemes: ["h", "i"], stress_pattern: "monosyllabic", common_confusions: ["she", "we"] },
  "she": { phonemes: ["ʃ", "i"], stress_pattern: "monosyllabic", common_confusions: ["he", "see"] },
  "we": { phonemes: ["w", "i"], stress_pattern: "monosyllabic", common_confusions: ["he", "wee"] },
  "they": { phonemes: ["ð", "eɪ"], stress_pattern: "monosyllabic", common_confusions: ["day", "the"] },
  "cat": { phonemes: ["k", "æ", "t"], stress_pattern: "monosyllabic", common_confusions: ["cut", "cap"] },
  "dog": { phonemes: ["d", "ɔ", "g"], stress_pattern: "monosyllabic", common_confusions: ["dig", "duck"] },
  "book": { phonemes: ["b", "ʊ", "k"], stress_pattern: "monosyllabic", common_confusions: ["boot", "buck"] },
  "moon": { phonemes: ["m", "u", "n"], stress_pattern: "monosyllabic", common_confusions: ["man", "noon"] },
  "cake": { phonemes: ["k", "eɪ", "k"], stress_pattern: "monosyllabic", common_confusions: ["kite", "cap"] },
  "run": { phonemes: ["r", "ʌ", "n"], stress_pattern: "monosyllabic", common_confusions: ["ran", "rain"] },
  "happy": { phonemes: ["h", "æ", "p", "i"], stress_pattern: "HAP-py", common_confusions: ["happi", "hapy"] },
  "stop": { phonemes: ["s", "t", "ɔ", "p"], stress_pattern: "monosyllabic", common_confusions: ["step", "shop"] },
  "knife": { phonemes: ["n", "aɪ", "f"], stress_pattern: "monosyllabic", common_confusions: ["nife", "life"] },
  "listen": { phonemes: ["l", "ɪ", "s", "n"], stress_pattern: "LIS-ten", common_confusions: ["listn", "liston"] },
  "write": { phonemes: ["r", "aɪ", "t"], stress_pattern: "monosyllabic", common_confusions: ["right", "rate"] },
  "right": { phonemes: ["r", "aɪ", "t"], stress_pattern: "monosyllabic", common_confusions: ["write", "rate"] },
  "their": { phonemes: ["ð", "ɛ", "r"], stress_pattern: "monosyllabic", common_confusions: ["there", "they're"] },
  "there": { phonemes: ["ð", "ɛ", "r"], stress_pattern: "monosyllabic", common_confusions: ["their", "they're"] },
  "they're": { phonemes: ["ð", "ɛ", "r"], stress_pattern: "monosyllabic", common_confusions: ["their", "there"] },
  "present": { phonemes: ["p", "r", "ɛ", "z", "ə", "n", "t"], stress_pattern: "PRE-sent (noun) | pre-SENT (verb)", common_confusions: ["presnt", "presant"] },
  "decision": { phonemes: ["d", "ɪ", "s", "ɪ", "ʒ", "ə", "n"], stress_pattern: "de-CI-sion", common_confusions: ["decition", "decishon"] },
  "confusion": { phonemes: ["k", "ə", "n", "f", "j", "u", "ʒ", "ə", "n"], stress_pattern: "con-FU-sion", common_confusions: ["confution", "confushion"] },
};

/**
 * Build an English phonics map entry.
 * @param {object} input
 * @param {string} input.word
 * @returns {{
 *   word: string,
 *   found: boolean,
 *   phonemes: string[],
 *   stress_pattern: string,
 *   common_confusions: string[],
 *   gap_note?: string
 * }}
 */
export function englishToPhonicsMap({ word }) {
  const w = String(word ?? "").toLowerCase().trim();
  if (!w) {
    return {
      word: "",
      found: false,
      phonemes: [],
      stress_pattern: "",
      common_confusions: [],
      gap_note: "empty-word",
    };
  }
  const entry = PHONICS_MAP[w];
  if (entry) {
    return {
      word: w,
      found: true,
      phonemes: entry.phonemes.slice(),
      stress_pattern: entry.stress_pattern,
      common_confusions: entry.common_confusions.slice(),
    };
  }
  return {
    word: w,
    found: false,
    phonemes: [],
    stress_pattern: "",
    common_confusions: [],
    gap_note: "V1 ships a small built-in map for common G1–G6 sight words; unknown words return gap entry. Production deployment needs a full phoneme dictionary (e.g. CMUdict).",
  };
}

// ───────────────────────────────────────────────────────────────────
// Evidence / diagnosis payload factories
// ───────────────────────────────────────────────────────────────────

/**
 * Build an evidence payload (append-only factory). Caller persists it
 * via the appendEvidence pipeline in mastery_engine_v2.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.subject              — always "english"
 * @param {string} input.knowledge_point
 * @param {string} [input.subskill]
 * @param {string|string[]} [input.error_code] — may be a code or array
 * @param {string} [input.result]
 * @param {object} [input.diagnosis]
 * @param {string} input.emitted_by           — e.g. "english-specialist"
 * @returns {object}
 */
export function emitEvidence(input) {
  if (!input || typeof input !== "object") throw new Error("emitEvidence: input required");
  if (!input.student_id) throw new Error("emitEvidence: student_id required");
  if (!input.subject) throw new Error("emitEvidence: subject required");
  // Normalize error_code to an array for forward compat.
  let ec = input.error_code;
  if (typeof ec === "string") ec = ec ? [ec] : [];
  else if (Array.isArray(ec)) ec = ec.slice();
  else ec = [];
  return {
    schema_version: "english-specialist-evidence-v1",
    emitted_at: new Date().toISOString(),
    emitted_by: input.emitted_by || "english-specialist",
    student_id: input.student_id,
    subject: input.subject,
    knowledge_point: input.knowledge_point || "",
    subskill: input.subskill || "",
    error_codes: ec,
    result: input.result || null,
    diagnosis: input.diagnosis || null,
  };
}

/**
 * Build a diagnosis payload.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {string|string[]} [input.error_code]
 * @param {string} [input.error_subtype]
 * @param {string} [input.recommendation_zh]
 * @returns {object}
 */
export function buildDiagnosisPayload(input) {
  let ec = input.error_code;
  if (typeof ec === "string") ec = ec ? [ec] : [];
  else if (Array.isArray(ec)) ec = ec.slice();
  else ec = [];
  return {
    schema_version: "english-specialist-diagnosis-v1",
    emitted_at: new Date().toISOString(),
    student_id: input.student_id,
    knowledge_point: input.knowledge_point,
    error_codes: ec,
    error_subtype: input.error_subtype || null,
    recommendation_zh: input.recommendation_zh || null,
    subskill: classifyEnglishSubskill({ knowledge_point: input.knowledge_point || "" }).primary_subskill,
  };
}

// ───────────────────────────────────────────────────────────────────
// 1) diagnoseEnglishResponse
// ───────────────────────────────────────────────────────────────────

/**
 * Diagnose a student's English response.
 *
 * @param {object} input
 * @param {string} input.stem
 * @param {string} input.student_answer
 * @param {string} input.expected_answer
 * @param {string} input.knowledge_point
 * @param {"written"|"oral"|"reading_aloud"|"explain_thinking"} [input.mode="written"]
 * @param {object} [input.transcript_metadata]
 * @param {number} [input.grade]
 * @param {string} [input.error_code]
 * @returns {{
 *   valid: boolean,
 *   correct: boolean,
 *   error_codes: string[],
 *   hint_level: number,
 *   hint_text_zh: string,
 *   mini_lesson_suggested: boolean,
 *   mastery_check_suggested: boolean,
 *   evidence_payload: object,
 *   diagnosis_payload: object
 * }}
 */
export function diagnoseEnglishResponse(input) {
  if (!input || typeof input !== "object") {
    throw new Error("diagnoseEnglishResponse: input required");
  }
  const stem = String(input.stem ?? "");
  const student_answer = String(input.student_answer ?? "");
  const expected_answer = String(input.expected_answer ?? "");
  const knowledge_point = String(input.knowledge_point ?? "");
  const mode = typeof input.mode === "string" ? input.mode : "written";
  const transcript_metadata = typeof input.transcript_metadata === "object" && input.transcript_metadata !== null
    ? input.transcript_metadata
    : null;
  const grade = typeof input.grade === "number" ? input.grade : null;
  const error_code = typeof input.error_code === "string" ? input.error_code : "";

  const correct = isCorrect(expected_answer, student_answer);
  const valid = expected_answer.length > 0 || student_answer.length > 0;

  let error_codes = [];
  let error_subtype = null;
  let hint_level = 0;
  let hint_text_zh = "";
  let mini_lesson_suggested = false;
  let mastery_check_suggested = false;

  if (correct) {
    hint_level = 0;
    hint_text_zh = "答對了！繼續下一題。";
  } else {
    // Tolerant matching: maybe correct with article stripped.
    const tol_correct = stripArticle(student_answer) === stripArticle(expected_answer) && stripArticle(expected_answer).length > 0;
    if (tol_correct) {
      hint_level = 0;
      hint_text_zh = "答對了！（提示：注意冠詞 a / an / the 的使用）";
    } else {
      const inf = inferErrorCode({ student_answer, expected_answer, knowledge_point, error_code });
      error_codes = [inf.code];
      error_subtype = inf.subtype;
      hint_level = 1;
      const entry = lookupErrorCode(inf.code);
      hint_text_zh = entry ? entry.hint_template : "請再仔細讀一次題目。";
      // Transcription mode: warn the orchestrator.
      if (mode === "oral" || mode === "reading_aloud" || mode === "explain_thinking") {
        if (transcript_metadata && transcript_metadata.ambiguity_flag) {
          error_codes.unshift("EN-STT-AMBIG");
        }
      }
      // Mastery check suggested if the error repeats.
      const sub = classifyEnglishSubskill({ knowledge_point });
      if (sub.primary_subskill === "phonics" || sub.primary_subskill === "spelling") {
        mini_lesson_suggested = true;
      }
    }
  }

  const subs = classifyEnglishSubskill({ knowledge_point });

  const evidence_payload = emitEvidence({
    student_id: input.student_id || "student_unknown",
    subject: "english",
    knowledge_point,
    subskill: subs.primary_subskill,
    error_code: error_codes,
    result: correct || hint_text_zh.startsWith("答對了") ? "correct" : "incorrect",
    diagnosis: {
      stem_preview: stem.slice(0, 80),
      grade,
      mode,
      transcript_metadata_present: !!transcript_metadata,
    },
    emitted_by: "english-specialist-diagnose",
  });

  const diagnosis_payload = buildDiagnosisPayload({
    student_id: input.student_id || "student_unknown",
    knowledge_point,
    error_code: error_codes,
    error_subtype,
    recommendation_zh: correct
      ? "繼續練習同類題以鞏固。"
      : `建議從「${error_subtype || subs.primary_subskill}」角度切入練習。`,
  });

  return {
    valid,
    correct: correct || hint_text_zh.startsWith("答對了"),
    error_codes,
    hint_level,
    hint_text_zh,
    mini_lesson_suggested,
    mastery_check_suggested,
    evidence_payload,
    diagnosis_payload,
  };
}

// ───────────────────────────────────────────────────────────────────
// 2) analyzeReadingComprehensionEnglish
// ───────────────────────────────────────────────────────────────────

/**
 * Known phrase banks for reading-comprehension keyword/span matching.
 * V1: small hand-curated bank per kind.
 *
 * @type {Record<"explicit"|"inference"|"main_idea"|"vocab_in_context"|"author_purpose", { keywords: string[], structure_terms: string[] }>}
 */
const READING_PHRASE_BANK = {
  explicit: {
    keywords: ["when", "where", "who", "what", "how many", "how much", "time", "place", "name", "date", "number"],
    structure_terms: [],
  },
  inference: {
    keywords: ["feel", "feeling", "mood", "reason", "because", "why", "suggest", "imply", "infer", "likely"],
    structure_terms: ["because", "so", "therefore", "since", "as a result"],
  },
  main_idea: {
    keywords: ["main idea", "topic", "theme", "summary", "title", "central", "most important"],
    structure_terms: ["in conclusion", "overall", "in summary", "the main point is"],
  },
  vocab_in_context: {
    keywords: ["means", "refers to", "as used in", "context", "closest in meaning"],
    structure_terms: [],
  },
  author_purpose: {
    keywords: ["purpose", "reason for writing", "to inform", "to persuade", "to entertain", "author's goal"],
    structure_terms: ["in order to", "so that", "because"],
  },
};

/**
 * Find a span in the stem that supports the expected answer.
 * @param {string} stem
 * @param {string[]} keywords
 * @returns {string|null}
 */
function findSupportingSpan(stem, keywords) {
  const norm = normalizeText(stem);
  for (const kw of keywords) {
    const idx = norm.indexOf(kw.toLowerCase());
    if (idx >= 0) {
      return stem.slice(Math.max(0, idx - 10), Math.min(stem.length, idx + kw.length + 10));
    }
  }
  return null;
}

/**
 * Compare student's answer against the expected answer in a reading-comprehension
 * context. Deterministic keyword + token matching via known phrase banks. NO LLM.
 *
 * @param {object} input
 * @param {string} input.stem
 * @param {string[]} [input.choices]
 * @param {string} input.student_answer
 * @param {string} input.expected_answer
 * @param {"explicit"|"inference"|"main_idea"|"vocab_in_context"|"author_purpose"} input.kind
 * @returns {{
 *   kind: string,
 *   correct: boolean,
 *   evidence_span?: string|null,
 *   matched_keywords: string[],
 *   missed_keywords: string[],
 *   error_code?: string,
 *   hint_text_zh: string,
 *   mini_lesson_suggested: boolean
 * }}
 */
export function analyzeReadingComprehensionEnglish(input) {
  if (!input || typeof input !== "object") {
    throw new Error("analyzeReadingComprehensionEnglish: input required");
  }
  const VALID_KINDS = ["explicit", "inference", "main_idea", "vocab_in_context", "author_purpose"];
  const kind = input.kind;
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`analyzeReadingComprehensionEnglish: invalid kind ${kind}`);
  }
  const stem = String(input.stem ?? "");
  const student_answer = String(input.student_answer ?? "");
  const expected_answer = String(input.expected_answer ?? "");
  const bank = READING_PHRASE_BANK[kind];

  const student_tokens = tokens(student_answer);
  const expected_tokens = tokens(expected_answer);
  const stem_tokens = tokens(stem);

  // Match if expected token appears in student answer.
  const matched_keywords = expected_tokens.filter((t) => student_tokens.includes(t));
  // Also consider bank keywords.
  const bank_matches = bank.keywords.filter((kw) => {
    const kw_tokens = tokens(kw);
    return kw_tokens.some((t) => student_tokens.includes(t)) && kw_tokens.some((t) => stem_tokens.includes(t));
  });

  // Missed keywords.
  const matched_set = new Set(matched_keywords);
  const missed_keywords = expected_tokens.filter((t) => !matched_set.has(t));

  // Off-topic: student's content tokens don't appear in stem.
  const STOPWORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "and", "or", "but", "to", "of", "in", "on", "at", "by", "for", "with", "as", "i", "you", "he", "she", "it", "we", "they", "this", "that", "these", "those"]);
  const student_content = student_tokens.filter((t) => !STOPWORDS.has(t));
  const off_topic_flag = student_content.length > 0 && !student_content.some((t) => stem_tokens.includes(t));

  // Over-generalization: absolute words without anchor.
  const overgeneralization_flag = /\b(all|every|always|never|none|everyone|nobody|everything|nothing)\b/i.test(student_answer)
    && expected_tokens.length > 0
    && !student_tokens.includes(normalizeText(expected_answer).split(/\s+/)[0]);

  // Determine correctness.
  let correct = false;
  if (isCorrect(expected_answer, student_answer)) {
    correct = true;
  } else if (matched_keywords.length > 0 && matched_keywords.length >= expected_tokens.length * 0.5 && expected_tokens.length > 0) {
    correct = true;
  } else if (bank_matches.length > 0 && expected_tokens.length <= 2) {
    correct = true;
  }

  let error_code;
  let hint_text_zh;
  let mini_lesson_suggested = false;

  if (correct) {
    hint_text_zh = "答對了！";
  } else {
    if (kind === "explicit") {
      if (off_topic_flag) error_code = "EN-RD-EXP-MISSED";
      else error_code = "EN-RD-EXP-MISSED";
      hint_text_zh = "請回到原文找一找含關鍵詞的句子。";
    } else if (kind === "inference") {
      if (overgeneralization_flag) error_code = "EN-RD-INF-OVER";
      else error_code = "EN-RD-INF-OVER";
      hint_text_zh = "請問：為什麼作者這樣寫？支持這個想法的證據是什麼？";
    } else if (kind === "main_idea") {
      error_code = "EN-RD-EXP-MISSED";
      hint_text_zh = "請找找文章的主題句（最常出現在開頭或結尾）。";
    } else if (kind === "vocab_in_context") {
      error_code = "EN-VOC-FALSE";
      hint_text_zh = "請再看一次這個字在原文的上下文。";
    } else if (kind === "author_purpose") {
      error_code = "EN-RD-INF-OVER";
      hint_text_zh = "請問：作者寫這篇文章的目的是什麼？請用證據支持。";
    } else {
      error_code = "EN-RD-EXP-MISSED";
      hint_text_zh = "請再讀一次題目。";
    }
    if (bank_matches.length > 0) {
      mini_lesson_suggested = true;
    }
  }

  const evidence_span = correct ? findSupportingSpan(stem, [...bank.keywords, ...expected_tokens]) : null;

  return {
    kind,
    correct,
    evidence_span: evidence_span || undefined,
    matched_keywords,
    missed_keywords,
    error_code,
    hint_text_zh,
    mini_lesson_suggested,
  };
}

// ───────────────────────────────────────────────────────────────────
// 3) transcribeAndGradeOralResponse
// ───────────────────────────────────────────────────────────────────

/**
 * Build a structured STT request + a pure post-transcription grader.
 *
 * IMPORTANT: this function does NOT actually invoke the STT binary. It only:
 *   - validates the audio_path (caller should run english_stt_interface.validateAudioPath)
 *   - emits a structured request object for the STT pipeline
 *   - returns a pure function `post_transcription_grade(transcript)` that the
 *     orchestrator calls AFTER receiving the transcript back from the local
 *     STT pipeline.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} [input.audio_path]
 * @param {string} [input.transcript]         — pre-computed (skips STT)
 * @param {string} input.knowledge_point
 * @param {string} input.stem
 * @param {string} input.expected_answer
 * @param {"en-US"|"en-GB"|"en-AU"|"en-CA"} [input.locale="en-US"]
 * @returns {{
 *   stt_request: object,
 *   post_transcription_grade: (input: {transcript: string, expected_answer?: string, knowledge_point?: string}) => object
 * }}
 */
export function transcribeAndGradeOralResponse(input) {
  if (!input || typeof input !== "object") {
    throw new Error("transcribeAndGradeOralResponse: input required");
  }
  const student_id = String(input.student_id ?? "");
  const audio_path = typeof input.audio_path === "string" ? input.audio_path : null;
  const transcript = typeof input.transcript === "string" ? input.transcript : null;
  const knowledge_point = String(input.knowledge_point ?? "");
  const stem = String(input.stem ?? "");
  const expected_answer = String(input.expected_answer ?? "");
  const locale = typeof input.locale === "string" ? input.locale : "en-US";

  // Build a structured request for the (external) STT pipeline.
  const request_id = `estt_${Buffer.from(String(audio_path ?? student_id)).toString("base64url").slice(0, 16)}_${Buffer.from(locale).toString("base64url").slice(0, 8)}`;
  const stt_request = {
    request_id,
    provider: "sensevoice_local",
    audio_path,
    locale,
    expected_format: "zh-en-mixed",
    knowledge_point,
    stem_preview: stem.slice(0, 120),
    expected_answer_preview: expected_answer.slice(0, 80),
    transcript_passthrough: transcript || null,
    // DO NOT auto-invoke: orchestrator must hand this to the local pipeline.
    auto_invoke: false,
  };

  /**
   * Pure post-transcription grader. Takes the transcript returned by the
   * STT pipeline and grades it deterministically.
   *
   * @param {object} g
   * @param {string} g.transcript
   * @param {string} [g.expected_answer]
   * @param {string} [g.knowledge_point]
   * @returns {object}
   */
  function post_transcription_grade(g) {
    const t = typeof g?.transcript === "string" ? g.transcript : "";
    const expected = typeof g?.expected_answer === "string" ? g.expected_answer : expected_answer;
    const kp = typeof g?.knowledge_point === "string" ? g.knowledge_point : knowledge_point;

    const correct = isCorrect(expected, t);
    const tol_correct = !correct && stripArticle(t) === stripArticle(expected) && stripArticle(expected).length > 0;

    // Detect transcription issues (phoneme / ambiguity flags).
    const transcript_metadata = {
      raw_transcript: t,
      source: "sensevoice_local",
      ambiguity_flag: false,
      phonetic_confusion_flag: false,
    };

    // Flag ambiguity if transcript is empty OR contains only stopwords.
    const transcript_tokens = tokens(t);
    if (transcript_tokens.length === 0) {
      transcript_metadata.ambiguity_flag = true;
    } else {
      const STOPWORDS = new Set(["the", "a", "an", "and", "or", "but", "um", "uh"]);
      const content = transcript_tokens.filter((w) => !STOPWORDS.has(w));
      if (content.length === 0) {
        transcript_metadata.ambiguity_flag = true;
      }
    }

    // Flag phonetic confusion if transcript contains homonym patterns (their/there, etc.).
    if (/\b(their|there|they're)\b/i.test(t) || /\b(your|you're)\b/i.test(t) || /\b(to|too|two)\b/i.test(t)) {
      transcript_metadata.phonetic_confusion_flag = true;
    }

    const result = correct || tol_correct ? "correct" : transcript_metadata.ambiguity_flag ? "ambiguous" : "incorrect";

    const evidence_payload = emitEvidence({
      student_id,
      subject: "english",
      knowledge_point: kp,
      subskill: classifyEnglishSubskill({ knowledge_point: kp }).primary_subskill,
      error_code: result === "incorrect" ? "EN-LIS-SEG" : null,
      result,
      diagnosis: {
        kind: "oral_response",
        transcript_metadata,
      },
      emitted_by: "english-specialist-transcribe-and-grade",
    });

    return {
      valid: t.length > 0,
      correct: correct || tol_correct,
      result,
      transcript_metadata,
      error_codes: result === "incorrect" ? ["EN-LIS-SEG"] : [],
      hint_text_zh: correct || tol_correct
        ? "答對了！"
        : transcript_metadata.ambiguity_flag
          ? "音檔轉錄不清楚，請再說一次或改用文字輸入。"
          : "請再仔細聽一次，把每個字寫下來。",
      evidence_payload,
    };
  }

  return {
    stt_request,
    post_transcription_grade,
  };
}

// ───────────────────────────────────────────────────────────────────
// 4) evaluateConversationTurn
// ───────────────────────────────────────────────────────────────────

const CONVERSATION_PATTERNS = {
  greeting: /\b(hello|hi|hey|good (morning|afternoon|evening)|how are you|how's it going)\b/i,
  answer_question: null, // we test by checking student_turn references topic of last assistant turn
  ask_back: /\?$/,
  politeness: /\b(please|thank you|thanks|sorry|excuse me|you're welcome|no problem)\b/i,
  closing: /\b(bye|goodbye|see you|talk to you later|take care)\b/i,
};

/**
 * Evaluate a single student turn in a conversation.
 *
 * @param {object} input
 * @param {Array<{role:"assistant"|"user", text:string}>} input.conversation_history
 * @param {string} input.student_turn
 * @param {Array<"greeting"|"answer_question"|"ask_back"|"politeness">} input.target_features
 * @returns {{
 *   feature_pass: Record<string, boolean>,
 *   feedback_lines: Array<{feature: string, message_zh: string, severity: "info"|"warn"|"block"}>,
 *   evidence_payload: object,
 *   diagnosis_payload: object
 * }}
 */
export function evaluateConversationTurn(input) {
  if (!input || typeof input !== "object") {
    throw new Error("evaluateConversationTurn: input required");
  }
  const history = Array.isArray(input.conversation_history) ? input.conversation_history : [];
  const student_turn = String(input.student_turn ?? "");
  const targets = Array.isArray(input.target_features) ? input.target_features : [];

  // Find the last assistant turn (for "answer_question" feature).
  const last_assistant = [...history].reverse().find((h) => h && h.role === "assistant" && typeof h.text === "string");
  const last_assistant_text = last_assistant ? last_assistant.text : "";
  const last_assistant_tokens = new Set(tokens(last_assistant_text));

  const feature_pass = {};
  const feedback_lines = [];

  for (const feature of targets) {
    if (feature === "greeting") {
      // Pass if student_turn looks like a greeting OR is the very first turn.
      const pass = CONVERSATION_PATTERNS.greeting.test(student_turn) || history.length === 0;
      feature_pass[feature] = pass;
      if (!pass) {
        feedback_lines.push({
          feature,
          message_zh: "可以先用問候語打招呼，例如「Hello」或「How are you?」。",
          severity: "info",
        });
      }
    } else if (feature === "answer_question") {
      // Pass if student_turn shares at least one content token with last assistant turn.
      const student_tokens = tokens(student_turn);
      const STOPWORDS = new Set(["the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "i", "you", "we", "they"]);
      const student_content = student_tokens.filter((t) => !STOPWORDS.has(t));
      const last_content = Array.from(last_assistant_tokens).filter((t) => !STOPWORDS.has(t));
      const pass = last_assistant_text.length === 0
        ? student_tokens.length > 0
        : student_content.some((t) => last_assistant_tokens.has(t));
      feature_pass[feature] = pass;
      if (!pass) {
        feedback_lines.push({
          feature,
          message_zh: "回答要呼應上一個問題，試著用對方問到的關鍵字。",
          severity: "warn",
        });
      }
    } else if (feature === "ask_back") {
      // Pass if student_turn ends with "?" OR explicitly asks a question.
      const ASK_WORDS = /\b(what|where|when|who|why|how|do you|can you|would you|could you|are you|is there)\b/i;
      const pass = CONVERSATION_PATTERNS.ask_back.test(student_turn.trim()) || ASK_WORDS.test(student_turn);
      feature_pass[feature] = pass;
      if (!pass) {
        feedback_lines.push({
          feature,
          message_zh: "可以再加一個反問，讓對話更自然（例如：「What about you?」）。",
          severity: "info",
        });
      }
    } else if (feature === "politeness") {
      const pass = CONVERSATION_PATTERNS.politeness.test(student_turn);
      feature_pass[feature] = pass;
      if (!pass) {
        feedback_lines.push({
          feature,
          message_zh: "可以加入禮貌用語，例如「Please」或「Thank you」。",
          severity: "info",
        });
      }
    } else if (feature === "closing") {
      const pass = CONVERSATION_PATTERNS.closing.test(student_turn);
      feature_pass[feature] = pass;
      if (!pass) {
        feedback_lines.push({
          feature,
          message_zh: "可以禮貌地結束對話，例如「Bye」或「See you」。",
          severity: "info",
        });
      }
    } else {
      feature_pass[feature] = false;
      feedback_lines.push({
        feature,
        message_zh: `未知的功能：${feature}`,
        severity: "info",
      });
    }
  }

  const subs = classifyEnglishSubskill({ knowledge_point: "english.SPEAK.conversation" });

  const evidence_payload = emitEvidence({
    student_id: input.student_id || "student_unknown",
    subject: "english",
    knowledge_point: "english.SPEAK.conversation",
    subskill: subs.primary_subskill,
    error_code: null,
    result: feedback_lines.length === 0 ? "correct" : "improved",
    diagnosis: {
      kind: "conversation_turn",
      history_length: history.length,
      target_features: targets,
      pass_count: Object.values(feature_pass).filter(Boolean).length,
    },
    emitted_by: "english-specialist-evaluate-conversation",
  });

  const diagnosis_payload = buildDiagnosisPayload({
    student_id: input.student_id || "student_unknown",
    knowledge_point: "english.SPEAK.conversation",
    error_code: feedback_lines[0]?.feature || null,
    error_subtype: null,
    recommendation_zh:
      feedback_lines.length === 0
        ? "對話功能都達標！"
        : `可以再加強：${feedback_lines.slice(0, 2).map((f) => f.feature).join("、")}。`,
  });

  return {
    feature_pass,
    feedback_lines,
    evidence_payload,
    diagnosis_payload,
  };
}

// ───────────────────────────────────────────────────────────────────
// 5) englishSpecialistDecide
// ───────────────────────────────────────────────────────────────────

/**
 * Decide the next strategy based on student state + mastery + history.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {number} input.attempts
 * @param {number} [input.mastery]            — 0..1
 * @param {string|string[]} [input.error_codes]
 * @param {Array<string>} [input.representation_history]
 * @param {"written"|"oral"|"reading_aloud"|"explain_thinking"} [input.mode]
 * @returns {{
 *   action: "text_prompt"|"drill_phonics"|"vocab_drill"|"reading_scaffold"|"oral_practice"|"conversation_practice"|"mastery_check"|"backtrack_prerequisite",
 *   rationale: string,
 *   confidence: number,
 *   subskill: string,
 *   mode: string,
 *   context: object
 * }}
 */
export function englishSpecialistDecide(input) {
  if (!input || typeof input !== "object") {
    throw new Error("englishSpecialistDecide: input required");
  }
  const attempts = Math.max(1, Number(input.attempts) || 1);
  const mastery = typeof input.mastery === "number" ? input.mastery : null;
  let error_codes = [];
  if (typeof input.error_codes === "string") error_codes = [input.error_codes];
  else if (Array.isArray(input.error_codes)) error_codes = input.error_codes.slice();
  else if (typeof input.error_code === "string") error_codes = [input.error_code];
  const history = Array.isArray(input.representation_history) ? input.representation_history : [];
  const mode = typeof input.mode === "string" ? input.mode : "written";

  const subs = classifyEnglishSubskill({ knowledge_point: input.knowledge_point || "" });
  const subskill = subs.primary_subskill;

  let action;
  let rationale;
  let confidence = 0.6;

  // 1) Mastery high enough → mastery_check.
  if (mastery !== null && mastery >= 0.85 && attempts >= 3) {
    action = "mastery_check";
    rationale = `mastery=${mastery} ≥ 0.85 and attempts≥3 → 建議做一次 mastery 檢核。`;
    confidence = 0.85;
  } else if (subskill === "phonics" || subskill === "spelling") {
    if (attempts >= 3) {
      action = "drill_phonics";
      rationale = `subskill=${subskill} 且 attempts≥3 → 切換到 phonics drill。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `subskill=${subskill} 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else if (subskill === "vocab") {
    if (attempts >= 3) {
      action = "vocab_drill";
      rationale = `subskill=vocab 且 attempts≥3 → 切換到 vocab drill。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `subskill=vocab 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else if (subskill === "reading" || subskill === "listening") {
    if (attempts >= 3) {
      action = "reading_scaffold";
      rationale = `subskill=${subskill} 且 attempts≥3 → 切換到 reading scaffold。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `subskill=${subskill} 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else if (subskill === "speaking") {
    if (attempts >= 3) {
      action = "oral_practice";
      rationale = `subskill=speaking 且 attempts≥3 → 切換到 oral practice。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `subskill=speaking 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else if (subskill === "conversation") {
    action = "conversation_practice";
    rationale = `subskill=conversation → 進入 conversation practice。`;
    confidence = 0.75;
  } else if (subskill === "writing" || subskill === "grammar") {
    if (attempts >= 3) {
      action = "reading_scaffold";
      rationale = `subskill=${subskill} 且 attempts≥3 → 切換到 scaffold。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `subskill=${subskill} 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else {
    action = "text_prompt";
    rationale = `subskill=${subskill}，預設 text_prompt。`;
    confidence = 0.5;
  }

  // 2) Mode override: if oral, prefer oral_practice unless mastery_check.
  if ((mode === "oral_response" || mode === "reading_aloud" || mode === "oral") && action !== "mastery_check") {
    action = "oral_practice";
    rationale += " 且 mode=oral → 改為 oral_practice。";
  }

  // 3) Representation history: if all previous were the same and failing, suggest backtrack.
  if (history.length >= 3 && history.every((h) => h === history[0]) && attempts >= 4) {
    action = "backtrack_prerequisite";
    rationale += " 且 representation_history 連續 3+ 次同型且 attempts≥4 → 建議回頭鞏固先備知識。";
    confidence = 0.7;
  }

  return {
    action,
    rationale,
    confidence,
    subskill,
    mode,
    context: {
      attempts,
      mastery,
      error_codes: error_codes.length ? error_codes : null,
      representation_history: history,
      matched_segment: subs.matched_segment,
    },
  };
}
