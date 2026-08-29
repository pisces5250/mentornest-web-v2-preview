// Chinese Error Taxonomy v1 — hierarchical Chinese-language error codes.
//
// CRITICAL INVARIANTS:
//   - This taxonomy MUST NOT reuse math error codes. Different domain.
//   - Codes are stable strings suitable for use in learning records and in the
//     mastery error_patterns aggregator.
//   - Each leaf has: code, category, label_zh, description, examples[], hint_template, mini_lesson_hint
//
// V1 leaf count: 25 entries spanning all 13 groups listed in the spec.
//
// Coverage by group (25 leaves total, 13 categories):
//   - 字詞辨識   (3) : 形近字 / 同音字 / 多音字
//   - 詞語       (3) : 詞義誤解 / 近義詞辨析 / 搭配不當
//   - 成語       (2) : 褒貶誤用 / 對象錯誤
//   - 標點符號   (2) : 句號誤用 / 引號誤用
//   - 病句       (2) : 搭配不當 / 成分殘缺
//   - 閱讀理解_明示 (2) : 找不到 / 找錯
//   - 閱讀理解_推論 (2) : 過度推論 / 推論不足
//   - 閱讀理解_主旨 (1) : 概括過寬
//   - 修辭       (1) : 比喻對象錯誤
//   - 文章結構   (2) : 時間順序混亂 / 缺過渡
//   - 書寫       (2) : 錯別字 / 漏字
//   - 拼音       (1) : 聲調錯誤
//   - 文言文     (2) : 虛詞 / 斷句
//
// This file is a pure data module (no I/O). All exports are deterministic
// strings/arrays — no random IDs.

/**
 * @typedef {Object} ChineseErrorEntry
 * @property {string} code             — stable identifier (e.g. "ZH-ZI-FORM")
 * @property {string} category         — top-level group label (繁體中文)
 * @property {string} label_zh         — short label shown to teachers
 * @property {string} description       — fuller explanation
 * @property {string[]} examples       — concrete wrong-answer examples (繁體中文)
 * @property {string} hint_template    — parameterized hint template (zh-TW)
 * @property {string} mini_lesson_hint — what a mini-lesson should focus on
 */

/** @type {ChineseErrorEntry[]} */
export const CHINESE_ERROR_TAXONOMY = [
  // ─── 字詞辨識 (3) ──────────────────────────────────────────
  {
    code: "ZH-ZI-FORM",
    category: "字詞辨識",
    label_zh: "形近字誤判",
    description: "將字形相近的字寫成另一個字（部件相似但不同）。",
    examples: ["己/已/巳 寫錯", "未/末 寫錯", "日/曰 寫錯"],
    hint_template: "請仔細看這個字的部件：「{char}」與「{similar}」哪裡不同？",
    mini_lesson_hint: "字形部件對比表（邊旁、輪廓、筆畫數）。",
  },
  {
    code: "ZH-ZI-HOMO",
    category: "字詞辨識",
    label_zh: "同音字混淆",
    description: "同音但意義不同的字混淆。",
    examples: ["做/作", "的/得/地", "在/再"],
    hint_template: "這一句要表達的是「{meaning}」，應該選「{correct}」而不是「{wrong}」。",
    mini_lesson_hint: "常用同音字對照＋語境填空。",
  },
  {
    code: "ZH-ZI-POLYPHONE",
    category: "字詞辨識",
    label_zh: "多音字誤判",
    description: "多音字在該語境下選錯讀音。",
    examples: ["「音樂」不讀「樂=ㄌㄜˋ」", "「長大」不讀「長=ㄓㄤˇ」"],
    hint_template: "「{word}」在這個詞裡讀「{correct_pinyin}」，不是「{wrong_pinyin}」。",
    mini_lesson_hint: "常見多音字語境整理表。",
  },

  // ─── 詞語 (3) ──────────────────────────────────────────
  {
    code: "ZH-CI-MEANING",
    category: "詞語",
    label_zh: "詞義誤解",
    description: "不理解詞語的正確含義而用錯。",
    examples: ["「不刊之論」誤解為「不可刊登」"],
    hint_template: "「{phrase}」的意思是「{meaning}」，請在句子中驗證一下。",
    mini_lesson_hint: "常用詞義釋義＋例句練習。",
  },
  {
    code: "ZH-CI-NEAR",
    category: "詞語",
    label_zh: "近義詞辨析錯誤",
    description: "近義詞語義細微差異未掌握。",
    examples: ["「安靜」vs「寂靜」", "「鼓勵」vs「煽動」"],
    hint_template: "「{a}」和「{b}」語義接近但有差異：{difference}。這裡應該用哪一個？",
    mini_lesson_hint: "近義詞微差對照練習。",
  },
  {
    code: "ZH-CI-COLLOCATION",
    category: "詞語",
    label_zh: "搭配不當",
    description: "詞語搭配不符合習慣用法。",
    examples: ["「交換意見」誤寫為「交流意見」"],
    hint_template: "中文裡習慣說「{correct}」，不說「{wrong}」。",
    mini_lesson_hint: "常見固定搭配整理表。",
  },

  // ─── 成語 (2) ──────────────────────────────────────────
  {
    code: "ZH-IDM-VALENCE",
    category: "成語",
    label_zh: "褒貶誤用",
    description: "把貶義成語用於褒揚情境，反之亦然。",
    examples: ["把貶義的「處心積慮」用來讚美別人"],
    hint_template: "「{idiom}」是「{valence}」義，這個語境需要「{correct_valence}」義。",
    mini_lesson_hint: "成語褒貶義對照。",
  },
  {
    code: "ZH-IDM-OBJECT",
    category: "成語",
    label_zh: "對象錯誤",
    description: "成語的使用對象與語境不符。",
    examples: ["「美輪美奐」只能用於建築"],
    hint_template: "「{idiom}」只能用於「{object}」，不能用於「{wrong_object}」。",
    mini_lesson_hint: "成語適用對象整理。",
  },

  // ─── 標點符號 (2) ──────────────────────────────────────────
  {
    code: "ZH-PUNC-PERIOD",
    category: "標點符號",
    label_zh: "句號誤用",
    description: "句末應用句號而未用，或在語氣未完處誤用。",
    examples: ["「請問今天天氣如何。」應為「？」"],
    hint_template: "這一句是「{sentence_type}」，結尾應該用「{correct_punct}」。",
    mini_lesson_hint: "句號使用情境整理。",
  },
  {
    code: "ZH-PUNC-QUOTE",
    category: "標點符號",
    label_zh: "引號誤用",
    description: "引號開合或嵌套錯誤。",
    examples: ["外雙內單的嵌套規則錯誤"],
    hint_template: "引號「{correct_pair}」要成對，嵌套時外雙內單。",
    mini_lesson_hint: "引號規則示意圖。",
  },

  // ─── 病句 (2) ──────────────────────────────────────────
  {
    code: "ZH-SENT-COLLOCATION",
    category: "病句",
    label_zh: "搭配不當",
    description: "主謂、動賓、定中等搭配不當。",
    examples: ["「這本書給我增加了知識」主謂不當"],
    hint_template: "請檢查「{a}」和「{b}」的搭配是否合語法。",
    mini_lesson_hint: "主謂搭配練習。",
  },
  {
    code: "ZH-SENT-MISSING",
    category: "病句",
    label_zh: "成分殘缺",
    description: "句子缺少主語、謂語、賓語等必要成分。",
    examples: ["「通過學習，使我進步」缺主語"],
    hint_template: "這個句子缺少「{missing_component}」，請補上。",
    mini_lesson_hint: "句子成分判斷練習。",
  },

  // ─── 閱讀理解 — 明示 (2) ──────────────────────────────────────────
  {
    code: "ZH-RD-EXP-MISSED",
    category: "閱讀理解_明示",
    label_zh: "找不到關鍵詞",
    description: "未能在文本中定位明示訊息的關鍵詞。",
    examples: ["題目問時間卻沒注意到文中的年份"],
    hint_template: "請回到原文，找一找含有「{keyword}」的句子。",
    mini_lesson_hint: "劃線找關鍵詞練習。",
  },
  {
    code: "ZH-RD-EXP-WRONG",
    category: "閱讀理解_明示",
    label_zh: "找錯句子",
    description: "找錯句子或理解錯句子意思。",
    examples: ["選錯包含答案的句子"],
    hint_template: "請再仔細讀「{sentence}」，它真正說的是「{true_meaning}」。",
    mini_lesson_hint: "句意對照練習。",
  },

  // ─── 閱讀理解 — 推論 (2) ──────────────────────────────────────────
  {
    code: "ZH-RD-INF-OVER",
    category: "閱讀理解_推論",
    label_zh: "過度推論",
    description: "推論超出文本提供的證據。",
    examples: ["從一個線索推論出文本未支持的結論"],
    hint_template: "請問：原文有沒有提到「{claim}」？如果沒有，這是過度推論。",
    mini_lesson_hint: "證據 vs 推論對照練習。",
  },
  {
    code: "ZH-RD-INF-UNDER",
    category: "閱讀理解_推論",
    label_zh: "推論不足",
    description: "有線索但未推論出隱含訊息。",
    examples: ["未推論出角色的心情"],
    hint_template: "從「{clue}」這一句，我們還能推論出什麼？",
    mini_lesson_hint: "由線索推論練習。",
  },

  // ─── 閱讀理解 — 主旨 (1) ──────────────────────────────────────────
  {
    code: "ZH-RD-MI-WIDE",
    category: "閱讀理解_主旨",
    label_zh: "概括過寬",
    description: "主旨概括範圍過大，超出文章核心。",
    examples: ["把單一主題擴大成普遍道理"],
    hint_template: "文章只談了「{topic}」，不要擴大到「{broader}」。",
    mini_lesson_hint: "主旨精準度練習。",
  },

  // ─── 修辭 (1) ──────────────────────────────────────────
  {
    code: "ZH-RHET-METAPHOR-OBJ",
    category: "修辭",
    label_zh: "比喻對象錯誤",
    description: "比喻的對象與本體不屬於同類事物。",
    examples: ["「她的歌聲像一朵花」本體喻體屬性不合"],
    hint_template: "「{tenor}」和「{vehicle}」應該有相似的「{shared_attr}」。",
    mini_lesson_hint: "本體喻體屬性對應練習。",
  },

  // ─── 文章結構 (2) ──────────────────────────────────────────
  {
    code: "ZH-STR-TIME",
    category: "文章結構",
    label_zh: "時間順序混亂",
    description: "敘事時間軸跳接錯亂。",
    examples: ["先說結果再說原因再說中間"],
    hint_template: "請按時間順序「{order}」整理事件。",
    mini_lesson_hint: "時間軸標示練習。",
  },
  {
    code: "ZH-STR-TRANSITION",
    category: "文章結構",
    label_zh: "缺過渡",
    description: "段與段或句與句之間缺少過渡詞。",
    examples: ["兩段直接跳接，讀者看不懂"],
    hint_template: "兩段之間可以加「{transition}」讓讀者更明白。",
    mini_lesson_hint: "過渡詞整理。",
  },

  // ─── 書寫 (2) ──────────────────────────────────────────
  {
    code: "ZH-WR-WRONG-CHAR",
    category: "書寫",
    label_zh: "錯別字",
    description: "寫成另一個字（不規範的別字）。",
    examples: ["「在」寫成「再」"],
    hint_template: "「{wrong}」應寫為「{correct}」。",
    mini_lesson_hint: "常見錯別字對照。",
  },
  {
    code: "ZH-WR-MISSING-CHAR",
    category: "書寫",
    label_zh: "漏字",
    description: "句子或詞語中漏寫字。",
    examples: ["「他很高興」漏寫「很」"],
    hint_template: "請檢查「{phrase}」是否漏了字？應為「{full}」。",
    mini_lesson_hint: "完整句子練習。",
  },

  // ─── 拼音 (1) ──────────────────────────────────────────
  {
    code: "ZH-PIN-TONE",
    category: "拼音",
    label_zh: "聲調錯誤",
    description: "標錯或讀錯聲調。",
    examples: ["「媽」標為四聲"],
    hint_template: "「{word}」的聲調是「{tone}」，不是「{wrong_tone}」。",
    mini_lesson_hint: "聲調辨識練習。",
  },

  // ─── 文言文 (2) ──────────────────────────────────────────
  {
    code: "ZH-CL-FUNCTION",
    category: "文言文",
    label_zh: "虛詞理解錯誤",
    description: "文言虛詞（之、乎、者、也、而、焉）理解錯。",
    examples: ["「之」字多種功能混淆"],
    hint_template: "「{word}」在這句是「{function}」，意思是「{meaning}」。",
    mini_lesson_hint: "文言虛詞整理。",
  },
  {
    code: "ZH-CL-SENT-BREAK",
    category: "文言文",
    label_zh: "斷句錯誤",
    description: "文言文斷句位置不當。",
    examples: ["誤斷導致句意改變"],
    hint_template: "在「{clue}」處應該斷開，這裡是「{sentence}」。",
    mini_lesson_hint: "文言斷句練習。",
  },
];

// ─── Helpers ──────────────────────────────────────────

const ALL_CODES = CHINESE_ERROR_TAXONOMY.map((e) => e.code);
const CODE_SET = new Set(ALL_CODES);

/**
 * Look up a single entry by code. Returns null if not found.
 * @param {string} code
 * @returns {ChineseErrorEntry|null}
 */
export function lookupErrorCode(code) {
  if (typeof code !== "string") return null;
  return CHINESE_ERROR_TAXONOMY.find((e) => e.code === code) || null;
}

/**
 * Filter entries by category (zh-TW group label). Returns [] if no entries.
 * @param {string} category
 * @returns {ChineseErrorEntry[]}
 */
export function listByCategory(category) {
  if (typeof category !== "string") return [];
  return CHINESE_ERROR_TAXONOMY.filter((e) => e.category === category);
}

/**
 * List all top-level categories.
 * @returns {string[]}
 */
export function listCategories() {
  return Array.from(new Set(CHINESE_ERROR_TAXONOMY.map((e) => e.category)));
}

/**
 * Validate that a code exists in the taxonomy. Throws on invalid.
 * @param {string} code
 * @returns {string}
 */
export function assertValidErrorCode(code) {
  if (!CODE_SET.has(code)) {
    throw new Error(`Unknown chinese error code: ${code}`);
  }
  return code;
}

/**
 * Total leaf count. Used by tests.
 * @returns {number}
 */
export function taxonomySize() {
  return CHINESE_ERROR_TAXONOMY.length;
}

/**
 * Validate the taxonomy itself: every code unique, categories non-empty,
 * hint_template and mini_lesson_hint non-empty.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateTaxonomy() {
  const errors = [];
  const seen = new Set();
  for (const e of CHINESE_ERROR_TAXONOMY) {
    if (seen.has(e.code)) errors.push(`duplicate code: ${e.code}`);
    seen.add(e.code);
    if (!e.code || typeof e.code !== "string") errors.push("entry missing code");
    if (!e.category) errors.push(`entry ${e.code} missing category`);
    if (!e.label_zh) errors.push(`entry ${e.code} missing label_zh`);
    if (!e.hint_template) errors.push(`entry ${e.code} missing hint_template`);
    if (!e.mini_lesson_hint) errors.push(`entry ${e.code} missing mini_lesson_hint`);
    if (!Array.isArray(e.examples) || e.examples.length === 0) {
      errors.push(`entry ${e.code} missing examples`);
    }
  }
  return { ok: errors.length === 0, errors };
}