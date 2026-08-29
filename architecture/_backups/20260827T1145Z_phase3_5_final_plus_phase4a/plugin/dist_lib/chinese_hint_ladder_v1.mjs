// Chinese Hint Ladder v1.
//
// 5-level deterministic hint ladder for Chinese (text-heavy domain). Pure
// function: given (knowledge_point, attempts, error_code, student_partial,
// hint_history) return the NEXT hint level + text.
//
// Levels:
//   0  none                  — no hint needed
//   1  concept_prompt        — ask student to look for a specific textual cue
//   2  scaffolded_question   — break the question down
//   3  worked_example_partial — give a partial worked answer for similar item
//   4  full_model_answer     — full worked answer with reasoning
//
// Decision rules (Chinese V1):
//   correct                              → 0
//   explicit-info error (ZH-RD-EXP-*)     → "找原文關鍵詞" style prompt
//   inference error (ZH-RD-INF-*)        → "問『為什麼』" style prompt
//   main-idea error (ZH-RD-MI-*)         → "找主題句" style prompt
//   writing / composition error (STR/WRITE/COMP/...) → paragraph scaffolding
//   字詞錯誤 (ZH-ZI-*, ZH-CI-*)           → 字形 / 部件分解 prompt
//   attempts >= 5 OR hints_already >= 4  → escalate to 4 (full_model_answer)
//   subskill-based escalation:
//     字 subskill: hint 2 = 部件分析, hint 3 = 練習同部件字
//     詞 subskill: hint 2 = 例句示範, hint 3 = 換語境練習
//     段/篇 subskill: hint 2 = 段落結構框架, hint 3 = 範文示範

import { classifyChineseSubskill } from "./chinese_subskill_map.mjs";

const LEVELS = ["none", "concept_prompt", "scaffolded_question", "worked_example_partial", "full_model_answer"];

const READING_EXPLICIT_CODES = new Set([
  "ZH-RD-EXP-MISSED",
  "ZH-RD-EXP-WRONG",
  "ZH-RD-EXP-PARTIAL",
]);
const READING_INFERENCE_CODES = new Set([
  "ZH-RD-INF-OVER",
  "ZH-RD-INF-UNDER",
  "ZH-RD-INF-DIRECTION",
  "ZH-RD-INF-EVIDENCE",
]);
const READING_MAIN_IDEA_CODES = new Set([
  "ZH-RD-MI-WIDE",
  "ZH-RD-MI-NARROW",
  "ZH-RD-MI-OFF",
  "ZH-RD-MI-PART",
]);
const WRITING_STRUCTURE_CODES = new Set([
  "ZH-STR-TIME",
  "ZH-STR-CAUSALITY",
  "ZH-STR-TRANSITION",
  "ZH-STR-BREAK",
  "ZH-WR-STROKE-ORDER",
  "ZH-WR-WRONG-CHAR",
  "ZH-WR-MISSING-CHAR",
  "ZH-WR-EXTRA-CHAR",
]);
const ZICI_CODES = new Set([
  "ZH-ZI-FORM", "ZH-ZI-SOUND-NEAR", "ZH-ZI-HOMO", "ZH-ZI-POLYPHONE",
  "ZH-ZI-RADICAL", "ZH-ZI-ROOT", "ZH-ZI-STROKE",
  "ZH-CI-MEANING", "ZH-CI-POS", "ZH-CI-NEAR", "ZH-CI-OPP",
  "ZH-CI-COLLOCATION", "ZH-CI-IDIOM-USE", "ZH-CI-ABBREV",
]);

/**
 * Build a subskill-aware hint text.
 * @param {string} level
 * @param {string} subskill
 * @param {string} [error_code]
 * @returns {string}
 */
function buildHintText({ level, subskill, error_code, knowledge_point }) {
  const kp = knowledge_point || "這一題";

  if (level === "concept_prompt") {
    if (READING_EXPLICIT_CODES.has(error_code)) {
      return `請回到原文，把含有「${kp}」相關線索的句子畫下來。`;
    }
    if (READING_INFERENCE_CODES.has(error_code)) {
      return `試著問自己：為什麼作者要這樣寫？支持這個想法的證據是什麼？`;
    }
    if (READING_MAIN_IDEA_CODES.has(error_code)) {
      return `請找找文章的主題句（最常出現在開頭或結尾）。`;
    }
    if (WRITING_STRUCTURE_CODES.has(error_code)) {
      return `寫作前，先想清楚這一段要表達什麼主題，並舉一個例子支持。`;
    }
    if (ZICI_CODES.has(error_code)) {
      return `請再看一次這個字／詞的部件，想想它和意思之間的關係。`;
    }
    return `請再仔細讀一次「${kp}」，想想題目在問什麼。`;
  }

  if (level === "scaffolded_question") {
    if (subskill === "字") {
      return `把這個字分成部件：「左半部」是什麼意思？「右半部」呢？`;
    }
    if (subskill === "詞") {
      return `請用這個詞造一個簡單的句子，驗證它是否符合你想表達的意思。`;
    }
    if (subskill === "段" || subskill === "篇") {
      return `先把內容分成三段：開頭（主題）、中段（例子）、結尾（總結）。`;
    }
    if (subskill === "句") {
      return `請檢查這句話的「主語—謂語—賓語」是否完整，搭配是否合理。`;
    }
    if (subskill === "文言") {
      return `先逐字解釋這一句，找出關鍵虛詞（之、乎、者、也、而）的功能。`;
    }
    if (subskill === "應用") {
      return `先把題目分成兩部分：「題目在問什麼」與「文中哪裡有線索」。`;
    }
    if (subskill === "修辭") {
      return `這個修辭的「本體」是什麼？「喻體」又是什麼？兩者有什麼相似點？`;
    }
    return `把題目拆成幾個小步驟，一步一步想。`;
  }

  if (level === "worked_example_partial") {
    if (subskill === "字") {
      return `範例：分析「清」—— 偏旁「氵」表示與水有關，右半「青」表讀音。試著用同樣方法分析這個字。`;
    }
    if (subskill === "詞") {
      return `範例：「做」用於動作（如「做菜」），「作」用於抽象事物（如「作文」）。請判斷這裡要用哪一個。`;
    }
    if (subskill === "段" || subskill === "篇") {
      return `範文片段：第一段點出主題；第二段舉例；第三段總結呼應。請仿寫一段。`;
    }
    if (subskill === "句") {
      return `範例：原句「通過學習，使我進步了」應改為「通過學習，我進步了」（缺主語 → 補主語）。`;
    }
    if (subskill === "文言") {
      return `範例：「學而時習之」——「而」表並列無義，「之」代所學之物。試著用同樣方法分析。`;
    }
    if (subskill === "應用") {
      return `範例：先找到含「時間」一詞的句子（第3段），再讀前後文判斷情境。`;
    }
    if (subskill === "修辭") {
      return `範例：「她的歌聲像清泉」—— 本體「歌聲」、喻體「清泉」、相似點「清澈」。`;
    }
    return `這是一個類似的題目，給你部分解答，請補完。`;
  }

  if (level === "full_model_answer") {
    return `完整參考答案：我們先分析題目要求 → 回到原文找線索 → 整合成答案。`;
  }

  return `沒問題囉，繼續下一題。`;
}

/**
 * Determine the next hint level + text for a Chinese interaction.
 * Pure function — no I/O.
 *
 * @param {object} input
 * @param {string} [input.knowledge_point]
 * @param {number} [input.attempts=1]
 * @param {string} [input.error_code]
 * @param {string} [input.student_partial]
 * @param {Array<{level:number,text:string}>} [input.hint_history]
 * @returns {{ level: 0..4, level_name: string, hint_text_zh: string, mini_lesson_suggested: boolean, mastery_check_suggested: boolean, reason: string, subskill: string }}
 */
export function nextChineseHint(input) {
  const i = input || {};
  const attempts = Math.max(1, Number(i.attempts) || 1);
  const error_code = typeof i.error_code === "string" ? i.error_code : "";
  const knowledge_point = typeof i.knowledge_point === "string" ? i.knowledge_point : "";
  const hint_history = Array.isArray(i.hint_history) ? i.hint_history : [];
  const hints_already = hint_history.length;

  // 1) Default level by attempt count.
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

  // 2) Escalation: if many hints already given, jump one level up.
  if (hints_already >= 4 && level < 4) {
    level = Math.min(4, level + 1);
    reason += "-and-already-given-many-hints";
  }

  // 3) Sub-skill-driven escalation: writing / paragraph-level errors start
  //    at level 2 (scaffolded_question) because text-light scaffolding is
  //    more useful than a concept prompt.
  let subskill = "應用";
  if (knowledge_point) {
    try {
      subskill = classifyChineseSubskill({ knowledge_point }).primary_subskill || "應用";
    } catch (_) {
      subskill = "應用";
    }
  }

  if ((subskill === "段" || subskill === "篇") && level === 1) {
    level = 2;
    reason += "-and-writing-subskill-promoted-to-scaffold";
  }

  // 4) Mini-lesson suggested at level 3 or higher.
  const mini_lesson_suggested = level >= 3;

  // 5) Mastery check suggested at level 4 (full model answer = student
  //    exhausted hints — verify they really know it).
  const mastery_check_suggested = level === 4;

  // 6) Build the hint text.
  const hint_text_zh = buildHintText({ level: LEVELS[level], subskill, error_code, knowledge_point });

  return {
    level,
    level_name: LEVELS[level],
    hint_text_zh,
    mini_lesson_suggested,
    mastery_check_suggested,
    reason,
    subskill,
  };
}

export const CHINESE_HINT_LEVELS = LEVELS;

/** Override for tests / future tuning. */
export const _internal = { buildHintText };