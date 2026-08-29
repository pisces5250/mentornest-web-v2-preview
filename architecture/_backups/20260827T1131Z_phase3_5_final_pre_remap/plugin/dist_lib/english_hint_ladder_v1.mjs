// English Hint Ladder v1.
//
// 5-level deterministic hint ladder for English. Pure function: given
// (knowledge_point, attempts, error_codes, student_partial, mode) return the
// NEXT hint level + text + representation suggestion.
//
// Levels:
//   0  none                       — no hint needed
//   1  concept_prompt             — ask student to recall a specific concept
//   2  scaffolded_question        — break the question down
//   3  worked_example_partial     — give a partial worked answer for similar item
//   4  full_model_answer          — full worked answer with reasoning
//
// Representation suggestion (one of):
//   "text"    — keep using text-based prompts
//   "phonics" — switch to phonics drill (sounding out, letter-sound mapping)
//   "oral"    — switch to oral/spoken practice (with STT interface gate)
//   "visual"  — switch to visual representation (picture, diagram)
//
// Decision rules (English V1):
//   correct                                     → 0, "text"
//   attempts >= 5 OR hint_history.length >= 4    → escalate to 4
//   phonics error codes (EN-PHON-*)             → "phonics" representation
//   speaking/pronunciation codes (EN-SPK-*)     → "oral" representation
//   reading/listening codes (EN-RD-*, EN-LIS-*) → "visual" representation
//   grammar/spelling codes (EN-GRAM-*, EN-SPELL-*) → "text" representation
//   vocabulary (EN-VOC-*)                       → "text" with examples
//   transcription (EN-STT-*)                    → "text" (defer to text input)

import { classifyEnglishSubskill } from "./english_subskill_map.mjs";

const LEVELS = ["none", "concept_prompt", "scaffolded_question", "worked_example_partial", "full_model_answer"];

const PHONICS_CODES = new Set([
  "EN-PHON-LS",
  "EN-PHON-VT",
  "EN-PHON-CB",
  "EN-PHON-SILENT",
  "EN-PHON-VC-CONF",
]);
const SPELLING_CODES = new Set([
  "EN-SPELL-DOUBLE",
  "EN-SPELL-YTOI",
  "EN-SPELL-TION",
]);
const VOCAB_CODES = new Set([
  "EN-VOC-FALSE",
  "EN-VOC-COLLOC",
  "EN-VOC-HOMONYM",
]);
const GRAMMAR_CODES = new Set([
  "EN-GRAM-SVA",
  "EN-GRAM-TENSE",
  "EN-GRAM-ART",
  "EN-GRAM-PREP",
]);
const READING_CODES = new Set([
  "EN-RD-EXP-MISSED",
  "EN-RD-INF-OVER",
]);
const LISTENING_CODES = new Set([
  "EN-LIS-SEG",
]);
const SPEAKING_CODES = new Set([
  "EN-SPK-PRON",
  "EN-SPK-INT",
]);
const PUNCT_CODES = new Set([
  "EN-PUNC-APOS",
  "EN-CAP-DAY",
]);
const TRANSCRIPTION_CODES = new Set([
  "EN-STT-PHON",
  "EN-STT-AMBIG",
]);

/**
 * Decide the representation based on the error code and subskill.
 * @param {string} code
 * @param {string} subskill
 * @returns {"text"|"phonics"|"oral"|"visual"}
 */
function pickRepresentation(code, subskill) {
  if (PHONICS_CODES.has(code)) return "phonics";
  if (SPEAKING_CODES.has(code)) return "oral";
  if (READING_CODES.has(code) || LISTENING_CODES.has(code)) return "visual";
  if (TRANSCRIPTION_CODES.has(code)) return "text";
  // Sub-skill-based fallback.
  if (subskill === "phonics") return "phonics";
  if (subskill === "speaking" || subskill === "conversation") return "oral";
  if (subskill === "reading" || subskill === "listening") return "visual";
  return "text";
}

/**
 * Build a subskill-aware hint text.
 * @param {string} level
 * @param {string} subskill
 * @param {string} [error_code]
 * @param {string} [knowledge_point]
 * @returns {string}
 */
function buildHintText({ level, subskill, error_code, knowledge_point }) {
  const kp = knowledge_point || "this item";

  if (level === "concept_prompt") {
    if (PHONICS_CODES.has(error_code)) {
      return `Try sounding out the word "${kp}" letter by letter. What sound does each letter make?`;
    }
    if (SPEAKING_CODES.has(error_code)) {
      return `Try saying the sentence out loud. Pay attention to the stress / intonation pattern.`;
    }
    if (READING_CODES.has(error_code)) {
      return `Re-read the passage and underline the words that support your answer.`;
    }
    if (GRAMMAR_CODES.has(error_code)) {
      return `Identify the subject and the verb in your sentence. Do they agree? Is the tense correct?`;
    }
    if (SPELLING_CODES.has(error_code)) {
      return `Check the spelling rule for "${kp}". Apply it step by step.`;
    }
    if (VOCAB_CODES.has(error_code)) {
      return `Look up "${kp}" in your vocabulary list. What does it really mean?`;
    }
    if (LISTENING_CODES.has(error_code)) {
      return `Listen again and write down each word you hear separately.`;
    }
    if (PUNCT_CODES.has(error_code)) {
      return `Check the punctuation rule for "${kp}". Where does the apostrophe / capital letter go?`;
    }
    if (TRANSCRIPTION_CODES.has(error_code)) {
      return `The audio transcript was unclear. Please retype your answer in text mode.`;
    }
    return `Re-read the question and think about what it is asking.`;
  }

  if (level === "scaffolded_question") {
    if (subskill === "phonics") {
      return `Break the word "${kp}" into parts. What sound does each part make? Blend them together.`;
    }
    if (subskill === "spelling") {
      return `Apply the spelling rule step by step: (1) find the base word, (2) apply the rule, (3) check.`;
    }
    if (subskill === "vocab") {
      return `Use the word in a simple sentence. Does it fit the context?`;
    }
    if (subskill === "grammar") {
      return `Step 1: find the subject. Step 2: identify the tense. Step 3: pick the correct verb form.`;
    }
    if (subskill === "reading") {
      return `Step 1: read the question. Step 2: scan for keywords in the passage. Step 3: pick the best-supported answer.`;
    }
    if (subskill === "listening") {
      return `Step 1: listen for the first word. Step 2: write it down. Step 3: repeat for the next word.`;
    }
    if (subskill === "speaking") {
      return `Step 1: read the sentence. Step 2: identify the stressed syllable. Step 3: practice out loud.`;
    }
    if (subskill === "writing") {
      return `Step 1: brainstorm 3 ideas. Step 2: pick the best. Step 3: write a topic sentence. Step 4: support with one example.`;
    }
    if (subskill === "conversation") {
      return `Step 1: greet. Step 2: answer the question. Step 3: ask a follow-up. Step 4: close politely.`;
    }
    return `Break the question into smaller steps and tackle one at a time.`;
  }

  if (level === "worked_example_partial") {
    if (subskill === "phonics") {
      return `Example: "cake" → /k/ + /ā/ + /k/ → c-a-ke. Try sounding out your word the same way.`;
    }
    if (subskill === "spelling") {
      return `Example: "run" + "-ing" → "running" (double the n because it's CVC). Try the same with your word.`;
    }
    if (subskill === "vocab") {
      return `Example: "make a decision" (NOT "do a decision"). Look up the correct collocation for your word.`;
    }
    if (subskill === "grammar") {
      return `Example: "She goes to school." (NOT "She go") because "she" is third-person singular. Apply to your sentence.`;
    }
    if (subskill === "reading") {
      return `Example: Read question → scan passage → underline key phrase → match to answer. Try this on your passage.`;
    }
    if (subskill === "speaking") {
      return `Example: "preSENT" (verb) vs "PRE-sent" (noun) — stress changes meaning. Try with your word.`;
    }
    return `Here's a similar worked example — adapt it to your question.`;
  }

  if (level === "full_model_answer") {
    return `Full model answer: read carefully → identify the rule → apply it step by step → check. Try one more time on your own.`;
  }

  return `Great, let's move on to the next question.`;
}

/**
 * Determine the next hint level + text for an English interaction.
 * Pure function — no I/O.
 *
 * @param {object} input
 * @param {string} [input.knowledge_point]
 * @param {number} [input.attempts=1]
 * @param {string[]} [input.error_codes]
 * @param {string} [input.error_code]
 * @param {string} [input.student_partial]
 * @param {string} [input.mode]
 * @param {Array<{level:number,text:string}>} [input.hint_history]
 * @returns {{
 *   level: 0..4,
 *   level_name: string,
 *   hint_text_zh: string,
 *   hint_text_en: string,
 *   representation_suggestion: "text"|"phonics"|"oral"|"visual",
 *   mini_lesson_suggested: boolean,
 *   mastery_check_suggested: boolean,
 *   reason: string,
 *   subskill: string,
 *   primary_error_code: string|null
 * }}
 */
export function nextEnglishHint(input) {
  const i = input || {};
  const attempts = Math.max(1, Number(i.attempts) || 1);
  const error_codes = Array.isArray(i.error_codes) ? i.error_codes.slice() : [];
  if (typeof i.error_code === "string" && i.error_code.length > 0 && !error_codes.includes(i.error_code)) {
    error_codes.unshift(i.error_code);
  }
  const knowledge_point = typeof i.knowledge_point === "string" ? i.knowledge_point : "";
  const hint_history = Array.isArray(i.hint_history) ? i.hint_history : [];
  const hints_already = hint_history.length;
  const mode = typeof i.mode === "string" ? i.mode : "";

  // 1) Correct → level 0.
  if (error_codes.length === 0 && attempts <= 1) {
    // Default: first attempt → level 1.
  }

  // 2) Determine subskill.
  let subskill = "reading";
  if (knowledge_point) {
    try {
      subskill = classifyEnglishSubskill({ knowledge_point }).primary_subskill || "reading";
    } catch (_) {
      subskill = "reading";
    }
  }

  // 3) Default level by attempt count.
  let level;
  let reason;
  if (attempts <= 1) {
    level = 1;
    reason = "first-attempt-concept-prompt";
  } else if (attempts === 2) {
    level = 2;
    reason = "second-attempt-scaffolded-question";
  } else if (attempts <= 4) {
    level = 3;
    reason = "third-or-fourth-attempt-worked-example-partial";
  } else {
    level = 4;
    reason = "exhausted-attempts-full-model-answer";
  }

  // 4) Escalation: if many hints already given, jump one level up.
  if (hints_already >= 4 && level < 4) {
    level = Math.min(4, level + 1);
    reason += "-and-already-given-many-hints";
  }

  // 5) Oral mode: prefer "oral" representation, but only if not too late.
  if (mode === "oral_response" || mode === "reading_aloud" || mode === "explain_thinking") {
    if (level >= 2) {
      // Don't override text scaffolding for the first hint; only from level 2+.
    }
  }

  const primary_error_code = error_codes[0] || "";
  const representation_suggestion = pickRepresentation(primary_error_code, subskill);

  // Build texts.
  const hint_text_en = buildHintText({
    level: LEVELS[level],
    subskill,
    error_code: primary_error_code,
    knowledge_point,
  });
  const hint_text_zh = chineseMirrorHintText({ level: LEVELS[level], subskill, error_code: primary_error_code, knowledge_point });

  // Mini-lesson suggested at level 3 or higher.
  const mini_lesson_suggested = level >= 3;
  // Mastery check suggested at level 4.
  const mastery_check_suggested = level === 4;

  return {
    level,
    level_name: LEVELS[level],
    hint_text_zh,
    hint_text_en,
    representation_suggestion,
    mini_lesson_suggested,
    mastery_check_suggested,
    reason,
    subskill,
    primary_error_code: primary_error_code || null,
  };
}

/**
 * Mirror English hint text into zh-TW (for parent-facing surfaces).
 * @param {object} input
 * @returns {string}
 */
function chineseMirrorHintText({ level, subskill, error_code, knowledge_point }) {
  const kp = knowledge_point || "這一題";
  if (level === "concept_prompt") {
    if (PHONICS_CODES.has(error_code)) return `請把「${kp}」這個字一個字母一個字母唸出來，想想每個字母的發音。`;
    if (SPEAKING_CODES.has(error_code)) return `請把句子大聲唸一次，注意重音和語調的位置。`;
    if (READING_CODES.has(error_code)) return `請再讀一次文章，把支持你答案的關鍵詞畫下來。`;
    if (GRAMMAR_CODES.has(error_code)) return `請找一找句子的「主詞」和「動詞」，它們一致嗎？時態對嗎？`;
    if (SPELLING_CODES.has(error_code)) return `請檢查「${kp}」的拼字規則，一步一步套用。`;
    if (VOCAB_CODES.has(error_code)) return `請查一下「${kp}」這個字的意思，確認它符合語境嗎？`;
    if (LISTENING_CODES.has(error_code)) return `再聽一次，把每個字分別寫下來。`;
    if (PUNCT_CODES.has(error_code)) return `請檢查「${kp}」的標點 / 大小寫規則。`;
    if (TRANSCRIPTION_CODES.has(error_code)) return `音檔轉錄不清楚，請改用文字輸入作答。`;
    return `請再讀一次題目，想想題目在問什麼。`;
  }
  if (level === "scaffolded_question") {
    if (subskill === "phonics") return `把「${kp}」分成幾個部分，每個部分分別發什麼音？把它們合起來唸。`;
    if (subskill === "spelling") return `套用拼字規則：(1) 找基礎字、(2) 套規則、(3) 檢查。`;
    if (subskill === "vocab") return `用這個字造一個簡單的句子，看它是否符合語境。`;
    if (subskill === "grammar") return `步驟 1：找主詞。步驟 2：確認時態。步驟 3：選對動詞。`;
    if (subskill === "reading") return `步驟 1：讀題。步驟 2：找關鍵詞。步驟 3：選最支持的答案。`;
    if (subskill === "listening") return `步驟 1：聽第一個字。步驟 2：寫下來。步驟 3：重複下一個字。`;
    if (subskill === "speaking") return `步驟 1：讀句子。步驟 2：找重音。步驟 3：大聲練習。`;
    if (subskill === "writing") return `步驟 1：想 3 個點子。步驟 2：選最好的。步驟 3：寫主題句。步驟 4：舉一個例子。`;
    if (subskill === "conversation") return `步驟 1：打招呼。步驟 2：回答問題。步驟 3：反問。步驟 4：禮貌結束。`;
    return `把題目拆成幾個小步驟，一步一步想。`;
  }
  if (level === "worked_example_partial") {
    if (subskill === "phonics") return `範例："cake" → /k/ + /ā/ + /k/ → c-a-ke。試著用同樣方法分析你的字。`;
    if (subskill === "spelling") return `範例："run" + "-ing" → "running"（CVC 要重複子音）。試試你的字。`;
    if (subskill === "vocab") return `範例：「make a decision」（不是 "do a decision"）。查一下正確搭配。`;
    if (subskill === "grammar") return `範例：「She goes to school.」（不是 "She go"），因為 she 是第三人稱單數。試套用到你的句子。`;
    if (subskill === "reading") return `範例：讀題 → 掃描文章 → 畫關鍵詞 → 配對答案。試試你的文章。`;
    if (subskill === "speaking") return `範例：「preSENT」（動詞）vs「PRE-sent」（名詞）— 重音不同意思不同。試試你的字。`;
    return `這是一個類似的題目，給你部分解答，請補完。`;
  }
  if (level === "full_model_answer") {
    return `完整參考答案：仔細讀題 → 找出規則 → 一步一歩套用 → 檢查。請自己再試一次。`;
  }
  return `沒問題囉，繼續下一題。`;
}

export const ENGLISH_HINT_LEVELS = LEVELS;
export const ENGLISH_REPRESENTATIONS = ["text", "phonics", "oral", "visual"];

/** Override for tests / future tuning. */
export const _internal = { buildHintText, chineseMirrorHintText, pickRepresentation };
