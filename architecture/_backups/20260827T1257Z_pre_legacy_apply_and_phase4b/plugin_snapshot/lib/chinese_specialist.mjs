// Chinese Specialist v1 — orchestrator surface.
//
// Pure functions (no I/O). Produces structured diagnosis + evidence payloads
// that the rest of the system consumes. NEVER directly modifies mastery.
//
// Surface area:
//   - diagnoseChineseResponse
//   - analyzeReadingComprehension
//   - evaluateCompositionScaffolding
//   - buildWritingFeedback
//   - chineseSpecialistDecide
//   - emitEvidence (factory — no I/O)
//   - matchVocabularyToKnowledgePoint
//
// CRITICAL INVARIANTS:
//   - No LLM calls.
//   - No mastery file writes (those go through mastery_engine_v2).
//   - Cross-student isolation: every function takes student_id but only for
//     context (logging, evidence); no function reads another student's data.
//   - Chinese-specific error taxonomy; NEVER reuses math error taxonomy.

import { lookupErrorCode, CHINESE_ERROR_TAXONOMY } from "./chinese_error_taxonomy.mjs";
import { classifyChineseSubskill } from "./chinese_subskill_map.mjs";

// ───────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────

/**
 * Normalize Chinese text for matching:
 * - Lowercase (Chinese has no case, but English mixed in becomes lower)
 * - Strip whitespace
 * - Strip common punctuation
 * - Convert full-width digits / latin to half-width
 */
function normalizeText(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/\s+/g, "")
    .replace(/[。，、！？；：「」『』（）()…—\-,.!?;:""''~`@#$%^&*_+=<>\\/]/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/**
 * Tokenize Chinese text into overlapping 1–3 char windows for keyword matching.
 * Returns an array of tokens (chars, bigrams, trigrams).
 */
function tokenize(s) {
  const n = normalizeText(s);
  const tokens = new Set();
  if (n.length === 0) return [];
  for (let i = 0; i < n.length; i++) {
    tokens.add(n[i]);
    if (i + 1 < n.length) tokens.add(n.substring(i, i + 2));
    if (i + 2 < n.length) tokens.add(n.substring(i, i + 3));
  }
  return Array.from(tokens);
}

function isCorrect(expected, student) {
  const a = normalizeText(expected);
  const b = normalizeText(student);
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a === b;
}

/**
 * Choose an error code from the taxonomy. If the caller supplied
 * error_taxonomy_code and it's valid, use it; else, try to infer from the
 * student's wrong answer vs. expected answer.
 */
function inferErrorCode({ student_answer, expected_answer, knowledge_point, error_taxonomy_code }) {
  if (typeof error_taxonomy_code === "string" && error_taxonomy_code) {
    const e = lookupErrorCode(error_taxonomy_code);
    if (e) return { code: e.code, subtype: e.category };
    // unknown code → still allow, but flag
    return { code: error_taxonomy_code, subtype: "unknown_taxonomy_code" };
  }
  // Try to infer: detect which error class is most likely from KP + answer mismatch.
  const subs = classifyChineseSubskill({ knowledge_point: knowledge_point || "" });
  const a = normalizeText(student_answer);
  const b = normalizeText(expected_answer);
  if (!a && b) return { code: "ZH-WR-MISSING-CHAR", subtype: subs.primary_subskill };
  if (a && !b) return { code: "ZH-WR-EXTRA-CHAR", subtype: subs.primary_subskill };
  // Length mismatch is often a 字形 / 部件 issue.
  if (a.length === 1 && b.length === 1) {
    // Single-char confusion — likely 同音字 / 形近字.
    return { code: "ZH-ZI-HOMO", subtype: subs.primary_subskill };
  }
  // Different length suggests 漏字 / 多餘字.
  if (Math.abs(a.length - b.length) === 1) {
    return { code: a.length < b.length ? "ZH-WR-MISSING-CHAR" : "ZH-WR-EXTRA-CHAR", subtype: subs.primary_subskill };
  }
  // Reading / inference / main-idea are KP-driven.
  if (subs.primary_subskill === "應用") {
    return { code: "ZH-RD-EXP-MISSED", subtype: subs.primary_subskill };
  }
  return { code: "ZH-CI-MEANING", subtype: subs.primary_subskill };
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
 * @param {string} input.subject              — always "chinese"
 * @param {string} input.knowledge_point
 * @param {string} [input.subskill]
 * @param {string} [input.error_code]
 * @param {string} [input.result]
 * @param {object} [input.diagnosis]
 * @param {string} input.emitted_by           — e.g. "chinese-specialist"
 * @returns {object}
 */
export function emitEvidence(input) {
  if (!input || typeof input !== "object") throw new Error("emitEvidence: input required");
  if (!input.student_id) throw new Error("emitEvidence: student_id required");
  if (!input.subject) throw new Error("emitEvidence: subject required");
  return {
    schema_version: "chinese-specialist-evidence-v1",
    emitted_at: new Date().toISOString(),
    emitted_by: input.emitted_by || "chinese-specialist",
    student_id: input.student_id,
    subject: input.subject,
    knowledge_point: input.knowledge_point || "",
    subskill: input.subskill || "",
    error_code: input.error_code || null,
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
 * @param {string} [input.error_code]
 * @param {string} [input.error_subtype]
 * @param {string} [input.recommendation_zh]
 * @returns {object}
 */
export function buildDiagnosisPayload(input) {
  return {
    schema_version: "chinese-specialist-diagnosis-v1",
    emitted_at: new Date().toISOString(),
    student_id: input.student_id,
    knowledge_point: input.knowledge_point,
    error_code: input.error_code || null,
    error_subtype: input.error_subtype || null,
    recommendation_zh: input.recommendation_zh || null,
    subskill: classifyChineseSubskill({ knowledge_point: input.knowledge_point || "" }).primary_subskill,
  };
}

// ───────────────────────────────────────────────────────────────────
// 1) diagnoseChineseResponse
// ───────────────────────────────────────────────────────────────────

/**
 * Diagnose a student's Chinese response.
 *
 * @param {object} input
 * @param {string} input.stem
 * @param {string} input.student_answer
 * @param {string} input.expected_answer
 * @param {string} input.knowledge_point
 * @param {string} [input.error_taxonomy_code]
 * @param {number} [input.grade]
 * @returns {{
 *   valid: boolean,
 *   correct: boolean,
 *   error_code?: string,
 *   error_subtype?: string,
 *   hint_level: number,
 *   hint_text_zh: string,
 *   mini_lesson_suggested: boolean,
 *   mastery_check_suggested: boolean,
 *   evidence_payload: object,
 *   diagnosis_payload: object
 * }}
 */
export function diagnoseChineseResponse(input) {
  if (!input || typeof input !== "object") {
    throw new Error("diagnoseChineseResponse: input required");
  }
  const stem = String(input.stem ?? "");
  const student_answer = String(input.student_answer ?? "");
  const expected_answer = String(input.expected_answer ?? "");
  const knowledge_point = String(input.knowledge_point ?? "");
  const error_taxonomy_code = typeof input.error_taxonomy_code === "string" ? input.error_taxonomy_code : "";
  const grade = typeof input.grade === "number" ? input.grade : null;

  const correct = isCorrect(expected_answer, student_answer);
  const valid = expected_answer.length > 0 || student_answer.length > 0;

  let error_code;
  let error_subtype;
  let hint_level;
  let hint_text_zh;
  let mini_lesson_suggested = false;
  let mastery_check_suggested = false;

  if (correct) {
    error_code = null;
    error_subtype = null;
    hint_level = 0;
    hint_text_zh = "答對了！繼續下一題。";
  } else {
    const inf = inferErrorCode({ student_answer, expected_answer, knowledge_point, error_taxonomy_code });
    error_code = inf.code;
    error_subtype = inf.subtype;
    // Hint level: this is first attempt, so level 1 by default.
    hint_level = 1;
    mini_lesson_suggested = false;
    mastery_check_suggested = false;
    const entry = lookupErrorCode(error_code);
    const template = entry ? entry.hint_template : "請再仔細讀一次題目。";
    hint_text_zh = template;
  }

  const subs = classifyChineseSubskill({ knowledge_point });

  const evidence_payload = emitEvidence({
    student_id: input.student_id || "student_unknown",
    subject: "chinese",
    knowledge_point,
    subskill: subs.primary_subskill,
    error_code,
    result: correct ? "correct" : "incorrect",
    diagnosis: { stem_preview: stem.slice(0, 80), grade },
    emitted_by: "chinese-specialist-diagnose",
  });

  const diagnosis_payload = buildDiagnosisPayload({
    student_id: input.student_id || "student_unknown",
    knowledge_point,
    error_code,
    error_subtype,
    recommendation_zh: correct
      ? "繼續練習同類題以鞏固。"
      : `建議從「${error_subtype || subs.primary_subskill}」角度切入練習。`,
  });

  return {
    valid,
    correct,
    error_code,
    error_subtype,
    hint_level,
    hint_text_zh,
    mini_lesson_suggested,
    mastery_check_suggested,
    evidence_payload,
    diagnosis_payload,
  };
}

// ───────────────────────────────────────────────────────────────────
// 2) analyzeReadingComprehension
// ───────────────────────────────────────────────────────────────────

/**
 * Known phrase banks for reading-comprehension keyword/span matching.
 * V1: small hand-curated bank per kind. Real implementation: corpus lookup.
 *
 * @type {Record<"explicit"|"inference"|"main_idea"|"structure", { keywords: string[], structure_terms: string[] }>}
 */
const READING_PHRASE_BANK = {
  explicit: {
    keywords: ["時間", "地點", "人物", "原因", "結果", "數字", "名字", "事件", "日期", "顏色"],
    structure_terms: [],
  },
  inference: {
    keywords: ["心情", "態度", "想法", "感受", "原因", "目的", "暗示", "寓意", "原因", "結果"],
    structure_terms: ["因為", "所以", "因此", "由於"],
  },
  main_idea: {
    keywords: ["主旨", "主題", "中心", "重點", "結論", "啟示"],
    structure_terms: ["總之", "由此可知", "綜合上述", "結論是"],
  },
  structure: {
    keywords: ["開頭", "結尾", "段落", "順序", "因果", "時間", "過渡"],
    structure_terms: ["首先", "其次", "然後", "最後", "因此", "結果"],
  },
};

/**
 * Find a span in the stem that supports the expected answer.
 * Strategy: look for any keyword from the bank that appears in the stem.
 *
 * @param {string} stem
 * @param {string[]} keywords
 * @returns {string|null}
 */
function findSupportingSpan(stem, keywords) {
  const norm = normalizeText(stem);
  for (const kw of keywords) {
    if (norm.includes(kw)) {
      // Find the position of the keyword in the original stem.
      const idx = norm.indexOf(kw);
      if (idx >= 0) {
        // Reconstruct a window around the match in the original (preserving punctuation).
        return stem.slice(Math.max(0, idx - 5), Math.min(stem.length, idx + kw.length + 5));
      }
    }
  }
  return null;
}

/**
 * Compare student's answer against the expected answer in a reading-comprehension
 * context. Uses deterministic keyword matching + span matching via known phrase
 * banks. NO LLM.
 *
 * @param {object} input
 * @param {string} input.stem
 * @param {string[]} [input.choices]
 * @param {string} input.student_answer
 * @param {string} input.expected_answer
 * @param {"explicit"|"inference"|"main_idea"|"structure"} input.kind
 * @returns {{
 *   kind: string,
 *   correct: boolean,
 *   evidence_span?: string|null,
 *   rationales: {
 *     matched_keywords: string[],
 *     missed_keywords: string[],
 *     overgeneralization_flag: boolean,
 *     off_topic_flag: boolean
 *   },
 *   error_code?: string,
 *   hint_text_zh: string,
 *   mini_lesson_suggested: boolean
 * }}
 */
export function analyzeReadingComprehension(input) {
  if (!input || typeof input !== "object") {
    throw new Error("analyzeReadingComprehension: input required");
  }
  const kind = input.kind;
  if (!["explicit", "inference", "main_idea", "structure"].includes(kind)) {
    throw new Error(`analyzeReadingComprehension: invalid kind ${kind}`);
  }
  const stem = String(input.stem ?? "");
  const student_answer = String(input.student_answer ?? "");
  const expected_answer = String(input.expected_answer ?? "");
  const bank = READING_PHRASE_BANK[kind];

  // Keyword analysis.
  const expected_tokens = tokenize(expected_answer);
  const student_tokens = tokenize(student_answer);
  const stem_tokens = tokenize(stem);

  const expected_norms = expected_tokens.map(normalizeText).filter(Boolean);
  const student_norms = student_tokens.map(normalizeText).filter(Boolean);

  // Match if any expected keyword appears in student answer.
  const matched_keywords = expected_norms.filter((t) => student_norms.includes(t));
  // Also consider bank keywords.
  const bank_matches = bank.keywords.filter((kw) => student_norms.includes(kw) && stem_tokens.includes(kw));

  // Missed keywords: expected keywords NOT in student answer.
  const missed_keywords = expected_norms.filter((t) => !student_norms.includes(t));

  // Off-topic: student_tokens has tokens but NO content-token appears in stem.
  // We strip stopword-like 1-char particles (的, 是, 在, 有, 我, 你, 他, 們) to
  // avoid false negatives on shared grammar words.
  const STOPWORDS_1 = new Set(["的", "是", "在", "有", "我", "你", "他", "們", "了", "和", "也", "都", "就", "會", "能"]);
  const student_content_tokens = student_norms.filter((t) => !STOPWORDS_1.has(t));
  const off_topic_flag = student_content_tokens.length > 0 && !student_content_tokens.some((t) => stem_tokens.includes(t));

  // Over-generalization: student answer is too broad (contains "所有", "全部", "一定", "絕對" without anchor).
  const overgeneralization_flag = /(所有|全部|一定|絕對|永遠|從不)/.test(student_answer) && expected_norms.length > 0 && !student_norms.includes(normalizeText(expected_answer).slice(0, 4));

  // Determine correctness.
  let correct = false;
  if (isCorrect(expected_answer, student_answer)) {
    correct = true;
  } else if (matched_keywords.length > 0 && matched_keywords.length >= expected_norms.length * 0.5) {
    // Threshold: at least 50% of expected keywords matched.
    correct = true;
  }

  let error_code;
  let hint_text_zh;
  let mini_lesson_suggested = false;

  if (correct) {
    hint_text_zh = "答對了！";
  } else {
    // Map error to a reading-specific code by kind.
    if (kind === "explicit") {
      if (off_topic_flag) error_code = "ZH-RD-EXP-WRONG";
      else error_code = "ZH-RD-EXP-MISSED";
      hint_text_zh = "請回到原文找一找相關的關鍵詞。";
    } else if (kind === "inference") {
      if (overgeneralization_flag) error_code = "ZH-RD-INF-OVER";
      else if (off_topic_flag) error_code = "ZH-RD-INF-DIRECTION";
      else error_code = "ZH-RD-INF-UNDER";
      hint_text_zh = "請問：為什麼作者這樣寫？支持這個想法的證據是什麼？";
    } else if (kind === "main_idea") {
      if (off_topic_flag) error_code = "ZH-RD-MI-OFF";
      else if (matched_keywords.length === 0) error_code = "ZH-RD-MI-NARROW";
      else error_code = "ZH-RD-MI-PART";
      hint_text_zh = "請找找文章的主題句（最常出現在開頭或結尾）。";
    } else {
      error_code = "ZH-STR-TRANSITION";
      hint_text_zh = "請檢查段落之間的過渡是否清晰。";
    }
    if (bank_matches.length > 0) {
      mini_lesson_suggested = true;
    }
  }

  const evidence_span = correct ? findSupportingSpan(stem, [...bank.keywords, ...expected_norms]) : null;

  return {
    kind,
    correct,
    evidence_span: evidence_span || undefined,
    rationales: {
      matched_keywords: Array.from(new Set([...matched_keywords, ...bank_matches])),
      missed_keywords,
      overgeneralization_flag,
      off_topic_flag,
    },
    error_code,
    hint_text_zh,
    mini_lesson_suggested,
  };
}

// ───────────────────────────────────────────────────────────────────
// 3) evaluateCompositionScaffolding
// ───────────────────────────────────────────────────────────────────

const CONNECTING_WORDS = [
  "首先", "其次", "然後", "最後", "因為", "所以", "因此", "雖然", "但是", "不過",
  "總之", "綜合上述", "此外", "再者", "舉例來說", "例如", "換句話說",
];

const TOPIC_SENTENCE_PATTERNS = [
  /^本文/, /^這篇文章/, /^今天/, /^我想/, /讓我們/, /主題是/, /目的是/, /說明/, /討論/, /介紹/,
];

/**
 * Tokenize a Chinese text into word-like units for TTR.
 * V1: char-based TTR (since word segmentation is non-trivial).
 * Real implementation: jieba.
 */
function tokenizeForTtr(text) {
  return Array.from(normalizeText(text));
}

/**
 * Type-Token Ratio (TTR): unique tokens / total tokens.
 * @param {string} text
 * @returns {number}
 */
function ttrScore(text) {
  const toks = tokenizeForTtr(text);
  if (toks.length === 0) return 0;
  return new Set(toks).size / toks.length;
}

function countParagraphs(text) {
  // Paragraph = separated by 1+ blank lines OR full-width newlines.
  return String(text ?? "").split(/\n\s*\n|\r\n\s*\r\n|\u3000/).filter((p) => p.trim().length > 0).length;
}

function countSentences(text) {
  // Sentence end: 。！？； + newline OR end of text.
  const t = String(text ?? "").trim();
  if (!t) return 0;
  const parts = t.split(/[。！？；\n]+/).filter((s) => s.trim().length > 0);
  return parts.length;
}

function hasTopicSentence(text) {
  const firstPara = String(text ?? "").split(/\n\s*\n|\r\n/)[0] || "";
  return TOPIC_SENTENCE_PATTERNS.some((re) => re.test(firstPara));
}

function hasConclusion(text) {
  const lastPara = String(text ?? "").split(/\n\s*\n|\r\n/).filter((p) => p.trim()).slice(-1)[0] || "";
  return /總之|結論|綜合|歸納|總結|由此可知|可見/.test(lastPara);
}

function connectingWordUsage(text) {
  const toks = CONNECTING_WORDS.filter((w) => normalizeText(text).includes(normalizeText(w)));
  return toks;
}

/**
 * Heuristic composition scaffolding.
 * Deterministic. NO LLM.
 *
 * @param {object} input
 * @param {string} input.prompt
 * @param {string} input.student_text
 * @param {number} input.grade
 * @param {number} [input.target_word_count]
 * @returns {{
 *   structure_score: number,    // 0..1
 *   vocabulary_score: number,    // 0..1
 *   content_score: number,       // 0..1
 *   organization_score: number,  // 0..1
 *   feedback_lines: Array<{category: string, line_zh: string, severity: "info"|"warn"|"block"}>,
 *   evidence_payload: object,
 *   diagnosis_payload: object
 * }}
 */
export function evaluateCompositionScaffolding(input) {
  if (!input || typeof input !== "object") {
    throw new Error("evaluateCompositionScaffolding: input required");
  }
  const text = String(input.student_text ?? "");
  const prompt = String(input.prompt ?? "");
  const grade = typeof input.grade === "number" ? input.grade : null;
  const target = typeof input.target_word_count === "number" ? input.target_word_count : null;

  const paragraphs = countParagraphs(text);
  const sentences = countSentences(text);
  const words = tokenizeForTtr(text).length;
  const ttr = ttrScore(text);
  const connecting = connectingWordUsage(text);
  const topic_present = hasTopicSentence(text);
  const conclusion_present = hasConclusion(text);

  // structure_score: paragraph count vs target (heuristic: target = max(3, floor(grade/2)+2)).
  const target_paragraphs = Math.max(3, Math.floor((grade || 5) / 2) + 2);
  const structure_score = Math.min(1, paragraphs / target_paragraphs);

  // vocabulary_score: TTR + connecting-word usage.
  // TTR target: ~0.5 for G5+. Use 0.4 as floor; 0.7 as excellent.
  const ttr_norm = Math.min(1, Math.max(0, (ttr - 0.3) / 0.4));
  const vocab_conn_norm = Math.min(1, connecting.length / 4);
  const vocabulary_score = Math.round(((ttr_norm * 0.7) + (vocab_conn_norm * 0.3)) * 100) / 100;

  // content_score: presence of topic sentence + conclusion + meeting target word count.
  let content_score = 0;
  if (topic_present) content_score += 0.3;
  if (conclusion_present) content_score += 0.3;
  if (target !== null) {
    content_score += Math.min(0.4, words / target);
  } else {
    content_score += 0.2;
  }
  content_score = Math.min(1, content_score);

  // organization_score: presence of paragraphs + connecting words + sentence count.
  const sent_norm = Math.min(1, sentences / Math.max(8, target || 100));
  const conn_norm = Math.min(1, connecting.length / 3);
  const para_norm = Math.min(1, paragraphs / target_paragraphs);
  const organization_score = Math.round((sent_norm * 0.3 + conn_norm * 0.3 + para_norm * 0.4) * 100) / 100;

  const feedback_lines = [];
  if (!topic_present) {
    feedback_lines.push({
      category: "structure",
      line_zh: "建議第一段就點出文章主題，例如：「今天我想介紹……」或「本文將說明……」。",
      severity: "warn",
    });
  }
  if (paragraphs < target_paragraphs) {
    feedback_lines.push({
      category: "structure",
      line_zh: `目前有 ${paragraphs} 段，目標至少 ${target_paragraphs} 段；可以再增加一段舉例或總結。`,
      severity: "warn",
    });
  }
  if (!conclusion_present) {
    feedback_lines.push({
      category: "structure",
      line_zh: "結尾段可以加上總結句，例如：「總之……」或「綜合上述……」。",
      severity: "info",
    });
  }
  if (connecting.length === 0) {
    feedback_lines.push({
      category: "organization",
      line_zh: "可以加入連接詞（例如：「首先」、「然後」、「因此」）讓段落更順暢。",
      severity: "warn",
    });
  }
  if (ttr < 0.4) {
    feedback_lines.push({
      category: "vocabulary",
      line_zh: "用詞重複較多，試著換用同義詞（例如「漂亮」可換「美麗」、「秀麗」）。",
      severity: "info",
    });
  }
  if (target !== null && words < target) {
    feedback_lines.push({
      category: "content",
      line_zh: `字數 ${words} 個字，未達目標 ${target}；可以再寫一個例子。`,
      severity: "warn",
    });
  }
  if (sentences < 4) {
    feedback_lines.push({
      category: "content",
      line_zh: "句子數量偏少，可以把一個長句拆成兩個短句讓節奏更清楚。",
      severity: "info",
    });
  }

  const subs = classifyChineseSubskill({ knowledge_point: "chinese.WRITE.composition" });

  const evidence_payload = emitEvidence({
    student_id: input.student_id || "student_unknown",
    subject: "chinese",
    knowledge_point: "chinese.WRITE.composition",
    subskill: subs.primary_subskill,
    error_code: null,
    result: "partially_correct",
    diagnosis: {
      kind: "composition_scaffolding",
      prompt_preview: prompt.slice(0, 80),
      grade,
      words,
      paragraphs,
      sentences,
      ttr: Math.round(ttr * 100) / 100,
      connecting_words_used: connecting,
      target_word_count: target,
    },
    emitted_by: "chinese-specialist-evaluate-composition",
  });

  const diagnosis_payload = buildDiagnosisPayload({
    student_id: input.student_id || "student_unknown",
    knowledge_point: "chinese.WRITE.composition",
    error_code: null,
    error_subtype: null,
    recommendation_zh:
      feedback_lines.length === 0
        ? "文章結構、用詞、內容都達標，可以再加入個人想法讓文章更出色。"
        : "建議按提示調整後再交一次。",
  });

  return {
    structure_score: Math.round(structure_score * 100) / 100,
    vocabulary_score,
    content_score: Math.round(content_score * 100) / 100,
    organization_score,
    feedback_lines,
    evidence_payload,
    diagnosis_payload,
  };
}

// ───────────────────────────────────────────────────────────────────
// 4) buildWritingFeedback
// ───────────────────────────────────────────────────────────────────

/**
 * Build per-feature writing feedback.
 *
 * @param {object} input
 * @param {string} input.student_text
 * @param {number} input.grade
 * @param {Array<"paragraph"|"thesis"|"evidence"|"transition"|"conclusion">} input.target_features
 * @returns {{
 *   feature_pass: Record<string, boolean>,
 *   prioritized_feedback: Array<{feature: string, message_zh: string, severity: "info"|"warn"|"block"}>,
 *   evidence_payload: object,
 *   diagnosis_payload: object
 * }}
 */
export function buildWritingFeedback(input) {
  if (!input || typeof input !== "object") {
    throw new Error("buildWritingFeedback: input required");
  }
  const text = String(input.student_text ?? "");
  const grade = typeof input.grade === "number" ? input.grade : null;
  const targets = Array.isArray(input.target_features) ? input.target_features : [];

  const feature_pass = {};
  const prioritized = [];

  for (const feature of targets) {
    if (feature === "paragraph") {
      const paragraphs = countParagraphs(text);
      const target_paragraphs = Math.max(3, Math.floor((grade || 5) / 2) + 2);
      const ok = paragraphs >= target_paragraphs;
      feature_pass[feature] = ok;
      if (!ok) prioritized.push({
        feature,
        message_zh: `段落只有 ${paragraphs} 段，目標至少 ${target_paragraphs} 段；可以再增加一段。`,
        severity: "warn",
      });
    } else if (feature === "thesis") {
      const ok = hasTopicSentence(text);
      feature_pass[feature] = ok;
      if (!ok) prioritized.push({
        feature,
        message_zh: "缺少明確的主題句；第一段應該點出文章主題。",
        severity: "block",
      });
    } else if (feature === "evidence") {
      // V1 heuristic: any sentence mentions 舉例 / 例如 / 因為 / 數字 / 引用.
      const ok = /(舉例|例如|因為|所以|[一二三四五六七八九十]|%|\d|引用)/.test(text);
      feature_pass[feature] = ok;
      if (!ok) prioritized.push({
        feature,
        message_zh: "缺少具體的例子或數據支持；建議加入一個親身經驗或具體數字。",
        severity: "warn",
      });
    } else if (feature === "transition") {
      const conn = connectingWordUsage(text);
      const ok = conn.length >= 2;
      feature_pass[feature] = ok;
      if (!ok) prioritized.push({
        feature,
        message_zh: `過渡詞只有 ${conn.length} 個；至少要 2 個（例如「首先」「然後」「因此」）。`,
        severity: "warn",
      });
    } else if (feature === "conclusion") {
      const ok = hasConclusion(text);
      feature_pass[feature] = ok;
      if (!ok) prioritized.push({
        feature,
        message_zh: "結尾段缺少總結句；可以加上「總之……」「綜合上述……」等用語。",
        severity: "warn",
      });
    } else {
      // Unknown feature.
      feature_pass[feature] = false;
      prioritized.push({
        feature,
        message_zh: `未知的功能：${feature}`,
        severity: "info",
      });
    }
  }

  // Sort by severity (block > warn > info) then by feature order in targets.
  const severity_rank = { block: 0, warn: 1, info: 2 };
  prioritized.sort((a, b) => {
    const r = (severity_rank[a.severity] ?? 9) - (severity_rank[b.severity] ?? 9);
    if (r !== 0) return r;
    return targets.indexOf(a.feature) - targets.indexOf(b.feature);
  });

  const subs = classifyChineseSubskill({ knowledge_point: "chinese.WRITE.composition" });

  const evidence_payload = emitEvidence({
    student_id: input.student_id || "student_unknown",
    subject: "chinese",
    knowledge_point: "chinese.WRITE.composition",
    subskill: subs.primary_subskill,
    error_code: null,
    result: prioritized.length === 0 ? "correct" : "improved",
    diagnosis: {
      kind: "writing_feedback",
      grade,
      feature_count: targets.length,
      pass_count: Object.values(feature_pass).filter(Boolean).length,
      target_features: targets,
    },
    emitted_by: "chinese-specialist-writing-feedback",
  });

  const diagnosis_payload = buildDiagnosisPayload({
    student_id: input.student_id || "student_unknown",
    knowledge_point: "chinese.WRITE.composition",
    error_code: prioritized[0]?.feature || null,
    error_subtype: null,
    recommendation_zh:
      prioritized.length === 0
        ? "所有目標功能都已達成！"
        : `優先處理：${prioritized.slice(0, 2).map((p) => p.feature).join("、")}。`,
  });

  return {
    feature_pass,
    prioritized_feedback: prioritized,
    evidence_payload,
    diagnosis_payload,
  };
}

// ───────────────────────────────────────────────────────────────────
// 5) chineseSpecialistDecide
// ───────────────────────────────────────────────────────────────────

/**
 * Decide the next strategy based on student state + mastery + history.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {number} input.attempts
 * @param {number} [input.mastery]         — 0..1
 * @param {string} [input.error_code]
 * @param {Array<string>} [input.representation_history]
 * @returns {{
 *   action: "text_prompt"|"vocabulary_drill"|"reading_scaffold"|"writing_scaffold"|"mastery_check"|"backtrack_prerequisite",
 *   rationale: string,
 *   confidence: number,
 *   subskill: string,
 *   context: object
 * }}
 */
export function chineseSpecialistDecide(input) {
  if (!input || typeof input !== "object") {
    throw new Error("chineseSpecialistDecide: input required");
  }
  const attempts = Math.max(1, Number(input.attempts) || 1);
  const mastery = typeof input.mastery === "number" ? input.mastery : null;
  const error_code = typeof input.error_code === "string" ? input.error_code : "";
  const history = Array.isArray(input.representation_history) ? input.representation_history : [];

  const subs = classifyChineseSubskill({ knowledge_point: input.knowledge_point || "" });
  const subskill = subs.primary_subskill;

  let action;
  let rationale;
  let confidence = 0.6;

  // 1) Mastery high enough → mastery_check.
  if (mastery !== null && mastery >= 0.85 && attempts >= 3) {
    action = "mastery_check";
    rationale = `mastery=${mastery} ≥ 0.85 and attempts≥3 → 建議做一次 mastery 檢核。`;
    confidence = 0.85;
  } else if (subskill === "字" || subskill === "詞") {
    if (attempts >= 3 && (error_code === "ZH-ZI-FORM" || error_code === "ZH-CI-MEANING")) {
      action = "vocabulary_drill";
      rationale = `subskill=${subskill} 且字詞錯誤反覆出現 → 進入字詞練習 (drill)。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `字詞 subskill 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else if (subskill === "應用") {
    if (attempts >= 3 && (error_code?.startsWith("ZH-RD-EXP-") || error_code?.startsWith("ZH-RD-INF-"))) {
      action = "reading_scaffold";
      rationale = `閱讀錯誤反覆 → 切換到閱讀鷹架 (scaffold) 策略。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `閱讀 subskill 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else if (subskill === "段" || subskill === "篇") {
    if (attempts >= 3) {
      action = "writing_scaffold";
      rationale = `段/篇 subskill 且 attempts≥3 → 切換到寫作鷹架。`;
      confidence = 0.8;
    } else {
      action = "text_prompt";
      rationale = `段/篇 subskill 進入下一輪提問。`;
      confidence = 0.6;
    }
  } else {
    action = "text_prompt";
    rationale = `subskill=${subskill}，預設 text_prompt。`;
    confidence = 0.5;
  }

  // 2) Representation history: if all previous were the same and failing, suggest backtrack.
  if (
    history.length >= 3 &&
    history.every((h) => h === history[0]) &&
    attempts >= 4
  ) {
    action = "backtrack_prerequisite";
    rationale = `representation_history 連續 3+ 次同型且 attempts≥4 → 建議回頭鞏固先備知識。`;
    confidence = 0.7;
  }

  return {
    action,
    rationale,
    confidence,
    subskill,
    context: {
      attempts,
      mastery,
      error_code: error_code || null,
      representation_history: history,
      matched_segment: subs.matched_segment,
    },
  };
}

// ───────────────────────────────────────────────────────────────────
// 7) matchVocabularyToKnowledgePoint
// ───────────────────────────────────────────────────────────────────

/**
 * Map a word to candidate knowledge points. Deterministic: tokenize the
 * word, score against each KP id's tokens + the free-text knowledge_point
 * parameter.
 *
 * @param {object} input
 * @param {string} input.word
 * @param {string} input.knowledge_point
 * @returns {{ matches: Array<{kp_segment: string, score: number}>, canonical_word?: string }}
 */
export function matchVocabularyToKnowledgePoint({ word, knowledge_point }) {
  const w = normalizeText(String(word ?? ""));
  const kp = String(knowledge_point ?? "");
  if (!w) return { matches: [] };

  // Decompose the KP id into segments for matching.
  const kp_segments = kp.split(".").map((s) => s.toLowerCase());
  const kp_tokens = kp_segments.flatMap((s) => s.split(/[-_]/)).filter(Boolean);
  // Build a candidate token list that ALSO includes the KP id literal and the
  // knowledge_point parameter as a single bigram token (this helps when the
  // word is a Chinese phrase like 詞語 that doesn't overlap with English
  // segments).
  const candidates = new Set([...kp_tokens, kp.toLowerCase(), "main", "sub", "topic"]);
  // Substring match each char of the word against each candidate.
  const matches = [];
  const seen = new Set();
  for (const tok of candidates) {
    let score = 0;
    for (const ch of w) {
      if (tok.includes(ch)) score += 1;
    }
    if (score > 0 && !seen.has(tok)) {
      matches.push({ kp_segment: tok, score });
      seen.add(tok);
    }
  }
  // Also try bigram-level match: if any bigram of w appears in any segment.
  for (let i = 0; i < w.length - 1; i++) {
    const bi = w.substring(i, i + 2);
    for (const tok of candidates) {
      if (tok.includes(bi)) {
        const existing = matches.find((m) => m.kp_segment === tok);
        if (existing) existing.score += 1;
      }
    }
  }
  // Sort by score desc.
  matches.sort((a, b) => b.score - a.score);
  return {
    matches,
    canonical_word: w,
  };
}