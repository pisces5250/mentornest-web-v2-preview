// English Error Taxonomy v1 — hierarchical English-language error codes.
//
// CRITICAL INVARIANTS:
//   - This taxonomy MUST NOT reuse math or Chinese error codes. Different
//     domain.
//   - Codes are stable strings suitable for use in learning records and in
//     the mastery error_patterns aggregator.
//   - Each leaf has: code, category, label_zh, description, examples[],
//     hint_template, mini_lesson_hint
//
// V1 leaf count: 24 entries spanning all 10 groups listed in the spec.
//
// Coverage by group (24 leaves total, 10 categories):
//   - phonics (5)               : letter-sound / vowel-team / consonant-blend /
//                                 silent-letter / vowel-vs-consonant-confusion
//   - spelling (3)              : doubling-rule / y-to-i / -tion-sion
//   - vocabulary (3)            : false-friends / collocation / homonym
//   - grammar (4)               : subject-verb-agreement / tense / article /
//                                 preposition
//   - reading-comprehension (2) : explicit / inference
//   - listening (1)             : segmentation
//   - speaking (2)              : pronunciation / intonation
//   - punctuation (1)           : apostrophe
//   - capitalization / spacing (1)
//   - transcription (2)         : STT misrecognition (phonetic, ambiguity)
//
// This file is a pure data module (no I/O). All exports are deterministic
// strings/arrays — no random IDs.

/**
 * @typedef {Object} EnglishErrorEntry
 * @property {string} code             — stable identifier (e.g. "EN-PHON-LS")
 * @property {string} category         — top-level group label (English)
 * @property {string} label_zh         — short label shown to teachers (zh-TW)
 * @property {string} description       — fuller explanation
 * @property {string[]} examples       — concrete wrong-answer examples (English)
 * @property {string} hint_template    — parameterized hint template (zh-TW)
 * @property {string} mini_lesson_hint — what a mini-lesson should focus on
 */

/** @type {EnglishErrorEntry[]} */
export const ENGLISH_ERROR_TAXONOMY = [
  // ─── Phonics (5) ──────────────────────────────────────────
  {
    code: "EN-PHON-LS",
    category: "phonics",
    label_zh: "字母與基本發音",
    description: "字母與基本發音對應不熟。",
    examples: ["b / d / p / q 混淆", "th 讀成 /t/ 或 /d/"],
    hint_template: "「{letter}」的發音是「{sound}」，請再唸一次。",
    mini_lesson_hint: "字母基本發音口型圖 + 常見混淆字母對比。",
  },
  {
    code: "EN-PHON-VT",
    category: "phonics",
    label_zh: "母音組合 (vowel team)",
    description: "母音組合（ai, ee, oa, ie, oo 等）拼讀錯誤。",
    examples: ["ea 在 bread / beach 不同發音", "oo 在 book / moon 不同發音"],
    hint_template: "「{vowel_team}」在這個字裡的發音是「{sound}」，注意它和「{confusion}」的不同。",
    mini_lesson_hint: "常見母音組合分類表（含兩種發音規則）。",
  },
  {
    code: "EN-PHON-CB",
    category: "phonics",
    label_zh: "子音群 (consonant blend)",
    description: "子音群（bl, cr, st, spr, thr 等）拼讀或切分錯誤。",
    examples: ["將 spring 拆成 s-pr-ing", "將 thr-ee 讀成 t-ree"],
    hint_template: "「{blend}」是一個子音群，請把兩個音一起唸：「{sound}」。",
    mini_lesson_hint: "常用子音群圖示 + 練習切分。",
  },
  {
    code: "EN-PHON-SILENT",
    category: "phonics",
    label_zh: "無聲字母 (silent letter)",
    description: "無聲字母（silent e, silent b/k/t/w/gh）未正確辨識。",
    examples: ["knife 的 k 不發音", "listen 的 t 不發音", "honest 的 h 不發音"],
    hint_template: "這個字裡的「{silent_letter}」不發音，請只唸「{remaining_sound}」。",
    mini_lesson_hint: "常見無聲字母整理表。",
  },
  {
    code: "EN-PHON-VC-CONF",
    category: "phonics",
    label_zh: "母音 / 子音混淆",
    description: "將母音位置混淆為子音（或反之），影響拼字與發音。",
    examples: ["將 a 寫成 e", "將 n 寫成 m"],
    hint_template: "請再檢查「{letter}」是母音還是子音：{letter} 是「{class}」。",
    mini_lesson_hint: "母音 5 個 / 子音 21 個口訣表。",
  },

  // ─── Spelling (3) ──────────────────────────────────────────
  {
    code: "EN-SPELL-DOUBLE",
    category: "spelling",
    label_zh: "重複子音規則",
    description: "CVC + suffix 重複子音規則未掌握（stop → stopping, run → running）。",
    examples: ["run → running（不是 runing）", "big → bigger（不是 biger）"],
    hint_template: "「{base}」是短母音 CVC，加 -ing/-ed 時要先「{action}」。",
    mini_lesson_hint: "CVC 重複規則 + 例外字整理（open, visit 等）。",
  },
  {
    code: "EN-SPELL-YTOI",
    category: "spelling",
    label_zh: "y → i 變化規則",
    description: "字尾 -y 在子音後加後綴時變 -i（happy → happier, carry → carried）。",
    examples: ["happy → happily（不是 happyly）", "carry → carried（不是 carryed）"],
    hint_template: "「{word}」結尾是「y」，加上「{suffix}」時 y 要先變成「i」。",
    mini_lesson_hint: "y → i 規則 + 例外（ing 直接加）。",
  },
  {
    code: "EN-SPELL-TION",
    category: "spelling",
    label_zh: "-tion / -sion 字尾",
    description: "名詞變化 -tion / -sion 拼錯，常見混淆。",
    examples: ["decide → decision（不是 decition）", "confuse → confusion（不是 confution）"],
    hint_template: "「{word}」的名詞形式是「{correct}」，注意是 -tion 還是 -sion。",
    mini_lesson_hint: "-tion / -sion 字尾整理表。",
  },

  // ─── Vocabulary (3) ──────────────────────────────────────────
  {
    code: "EN-VOC-FALSE",
    category: "vocabulary",
    label_zh: "相似字 (false friends) 誤用",
    description: "中英相似字（false friends）誤用，語意其實不同。",
    examples: ["actually ≠ 真的（≠ real）", " sympathy ≠ 同情（≠ same-feeling）"],
    hint_template: "「{word}」的意思是「{meaning}」，不是「{chinese_meaning}」。",
    mini_lesson_hint: "常見中英 false friends 對照表。",
  },
  {
    code: "EN-VOC-COLLOC",
    category: "vocabulary",
    label_zh: "搭配錯誤",
    description: "詞語搭配不符合英語慣用法。",
    examples: ["make homework（應為 do homework）", "say a decision（應為 make a decision）"],
    hint_template: "英語習慣說「{correct}」，不說「{wrong}」。",
    mini_lesson_hint: "常見動詞搭配整理（make / do / say / tell / take）。",
  },
  {
    code: "EN-VOC-HOMONYM",
    category: "vocabulary",
    label_zh: "同音異義字",
    description: "同音但意義不同的字混淆。",
    examples: ["their / there / they're", "to / too / two", "your / you're"],
    hint_template: "在這個句子裡應該是「{correct}」，因為 {reason}。",
    mini_lesson_hint: "常見同音異義字對照 + 例句。",
  },

  // ─── Grammar (4) ──────────────────────────────────────────
  {
    code: "EN-GRAM-SVA",
    category: "grammar",
    label_zh: "主詞與動詞一致",
    description: "主詞與動詞在數 / 人稱上不一致。",
    examples: ["He go to school（應為 goes）", "They was happy（應為 were）"],
    hint_template: "主詞是「{subject}」（{number}），動詞要用「{verb}」。",
    mini_lesson_hint: "主詞單複數 + be 動詞對照。",
  },
  {
    code: "EN-GRAM-TENSE",
    category: "grammar",
    label_zh: "時態錯誤",
    description: "動詞時態（過去 / 現在 / 未來）使用錯誤。",
    examples: ["Yesterday I go to school（應為 went）", "I am go now（應為 going）"],
    hint_template: "這一句描述「{time}」發生的事，動詞要用「{tense}」：{correct_verb}。",
    mini_lesson_hint: "時態對照表 + 時間副詞整理。",
  },
  {
    code: "EN-GRAM-ART",
    category: "grammar",
    label_zh: "冠詞錯誤",
    description: "a / an / the 使用錯誤或漏用、多用。",
    examples: ["I saw elephant（應為 an elephant）", "I want a apple（應為 an apple）"],
    hint_template: "這裡應該用「{article}」，因為 {reason}。",
    mini_lesson_hint: "a/an/the 使用規則圖示。",
  },
  {
    code: "EN-GRAM-PREP",
    category: "grammar",
    label_zh: "介系詞錯誤",
    description: "介系詞（in / on / at / to / for 等）選擇錯誤。",
    examples: ["arrive to Taipei（應為 arrive in）", "good in math（應為 good at）"],
    hint_template: "「{verb}」搭配的介系詞是「{prep}」，不是「{wrong_prep}」。",
    mini_lesson_hint: "常用動詞 + 介系詞整理。",
  },

  // ─── Reading Comprehension (2) ──────────────────────────────────────────
  {
    code: "EN-RD-EXP-MISSED",
    category: "reading-comprehension",
    label_zh: "找不到關鍵詞",
    description: "未能在文本中定位明示訊息的關鍵詞。",
    examples: ["題目問人物但沒注意到人名", "題目問時間但沒看到年份"],
    hint_template: "請回到原文，找一找含有「{keyword}」的句子。",
    mini_lesson_hint: "劃線找關鍵詞練習。",
  },
  {
    code: "EN-RD-INF-OVER",
    category: "reading-comprehension",
    label_zh: "過度推論",
    description: "推論超出文本提供的證據。",
    examples: ["從單一線索推論出文本未支持的結論"],
    hint_template: "請問：原文有沒有提到「{claim}」？如果沒有，這是過度推論。",
    mini_lesson_hint: "證據 vs 推論對照練習。",
  },

  // ─── Listening (1) ──────────────────────────────────────────
  {
    code: "EN-LIS-SEG",
    category: "listening",
    label_zh: "語音切分錯誤",
    description: "聽音時將連續語流切分錯誤（將兩個字聽成一個）。",
    examples: ['將 "what are you" 聽成 "what-tar-you"', '將 "an apple" 聽成 "a napple"'],
    hint_template: "聽到的「{heard}」實際上是「{actual}」，注意字與字之間的切分。",
    mini_lesson_hint: "常見連音 / 縮讀整理 + 聽寫練習。",
  },

  // ─── Speaking (2) ──────────────────────────────────────────
  {
    code: "EN-SPK-PRON",
    category: "speaking",
    label_zh: "發音錯誤",
    description: "個別音的發音不準確。",
    examples: ["/θ/ 讀成 /t/", "/r/ /l/ 不分", "字尾 -s / -ed 沒唸出來"],
    hint_template: "「{word}」的「{phoneme}」要唸成「{correct}」，試著把舌頭放在「{position}」。",
    mini_lesson_hint: "常見發音錯誤口型圖 + 最小對比詞練習（thin / sin）。",
  },
  {
    code: "EN-SPK-INT",
    category: "speaking",
    label_zh: "語調 / 重音錯誤",
    description: "句子的語調或單字重音位置錯誤。",
    examples: ["將 present (名詞) 與 preSENT (動詞) 混淆", "問句沒用升調"],
    hint_template: "「{word}」的重音在第「{syllable}」個音節，唸做 pre-SENT。",
    mini_lesson_hint: "重音規則整理 + 升降調口訣。",
  },

  // ─── Punctuation (1) ──────────────────────────────────────────
  {
    code: "EN-PUNC-APOS",
    category: "punctuation",
    label_zh: "撇號 (apostrophe) 錯誤",
    description: "縮寫或所有格的撇號位置錯誤。",
    examples: ["its / it's 混淆", "your / you're 混淆", "dont / don't 漏寫撇號"],
    hint_template: "「{word}」是「{it_is_or_possessive}」的縮寫 / 所有格，撇號要放在「{position}」。",
    mini_lesson_hint: "撇號使用規則圖示（縮寫 vs 所有格）。",
  },

  // ─── Capitalization / spacing (1) ──────────────────────────────────────────
  {
    code: "EN-CAP-DAY",
    category: "capitalization",
    label_zh: "大小寫 / 空格錯誤",
    description: "專有名詞、句首字母大小寫錯誤，或英文單字之間漏空格。",
    examples: ["i → I（單獨的代詞要大寫）", "monday → Monday", "goodmorning → good morning"],
    hint_template: "「{word}」是專有名詞 / 句首，第一個字母要大寫 / 兩個字之間要有空格。",
    mini_lesson_hint: "大小寫規則 + 空格整理。",
  },

  // ─── Transcription (2) ──────────────────────────────────────────
  //
  // These codes flag possible STT misrecognition categories. The orchestrator
  // can use these to mark a transcription as ambiguous BEFORE grading — that
  // way an unclear audio result doesn't get penalized as a student error.
  {
    code: "EN-STT-PHON",
    category: "transcription",
    label_zh: "語音相似誤判",
    description: "STT 將語音相似的字誤判（minimal pair confusion）。",
    examples: ["she / see", "beach / bitch", "three / free"],
    hint_template: "語音轉文字可能將「{heard}」誤判為「{actual}」，請老師確認原音檔。",
    mini_lesson_hint: "標記此音檔需人工複核。",
  },
  {
    code: "EN-STT-AMBIG",
    category: "transcription",
    label_zh: "轉錄歧義",
    description: "STT 轉錄結果有多種合理解釋，無法確定哪一個正確。",
    examples: ["too / two / to", "their / there / they're", "整段音訊低音量"],
    hint_template: "轉錄結果「{transcript}」存在歧義，請學生再說一次或改用文字作答。",
    mini_lesson_hint: "建議改用文字輸入模式以避免評分誤判。",
  },
];

// ─── Helpers ──────────────────────────────────────────

const ALL_CODES = ENGLISH_ERROR_TAXONOMY.map((e) => e.code);
const CODE_SET = new Set(ALL_CODES);

/**
 * Look up a single entry by code. Returns null if not found.
 * @param {string} code
 * @returns {EnglishErrorEntry|null}
 */
export function lookupErrorCode(code) {
  if (typeof code !== "string") return null;
  return ENGLISH_ERROR_TAXONOMY.find((e) => e.code === code) || null;
}

/**
 * Filter entries by category (English group label). Returns [] if no entries.
 * @param {string} category
 * @returns {EnglishErrorEntry[]}
 */
export function listByCategory(category) {
  if (typeof category !== "string") return [];
  return ENGLISH_ERROR_TAXONOMY.filter((e) => e.category === category);
}

/**
 * List all top-level categories.
 * @returns {string[]}
 */
export function listCategories() {
  return Array.from(new Set(ENGLISH_ERROR_TAXONOMY.map((e) => e.category)));
}

/**
 * Validate that a code exists in the taxonomy. Throws on invalid.
 * @param {string} code
 * @returns {string}
 */
export function assertValidErrorCode(code) {
  if (!CODE_SET.has(code)) {
    throw new Error(`Unknown english error code: ${code}`);
  }
  return code;
}

/**
 * Total leaf count. Used by tests.
 * @returns {number}
 */
export function taxonomySize() {
  return ENGLISH_ERROR_TAXONOMY.length;
}

/**
 * Validate the taxonomy itself: every code unique, categories non-empty,
 * hint_template and mini_lesson_hint non-empty.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateTaxonomy() {
  const errors = [];
  const seen = new Set();
  for (const e of ENGLISH_ERROR_TAXONOMY) {
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
