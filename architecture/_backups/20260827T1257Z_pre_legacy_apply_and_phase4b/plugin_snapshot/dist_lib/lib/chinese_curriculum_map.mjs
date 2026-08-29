// Chinese curriculum map wrapper v1.
//
// Read-only wrapper over the Chinese section of the Taiwan 12-year curriculum
// YAML skeleton (architecture/curriculum/chinese.yaml). On top of plain YAML
// reads, we add:
//   - lookupChineseKP({ knowledge_point }) → KP details + a small vocabulary
//     list anchored to that KP for grade-band scaffolding.
//   - listChineseKPForGrade({ grade }) → KP list.
//   - gradeAppropriateVocabulary({ grade, word }) → uses a small built-in
//     grade-by-grade HSK-zh-TW-aligned vocabulary ladder (V1 ships ~30
//     representative words per grade G1–G6 for testing; document gap).
//
// The vocabulary ladder is INTENTIONAL V1 content. The full HSK-zh-TW ladder
// is OUT OF SCOPE for this phase; the 30-word-per-grade list is documented as
// a known limitation (see gaps).

import fs from "node:fs/promises";
import path from "node:path";
import * as yaml from "js-yaml";

const CURRICULUM_DIR = "/home/node/.openclaw/workspace/architecture/curriculum";
const CHINESE_FILE = path.join(CURRICULUM_DIR, "chinese.yaml");

// -------- Grade-by-grade HSK-zh-TW-aligned vocabulary ladder (V1) -----------
//
// IMPORTANT: This is V1 test data only. ~30 representative words per grade.
// Documented gap: production deployment needs the full Taiwan grade-band
// vocabulary corpus (教育部 / 國語辭典).
//
// Word selection criterion: tier-1 high-frequency words for each grade band,
// grouped by theme (school / family / time / nature / actions / etc.).

/** @type {Record<number, string[]>} */
const VOCABULARY_LADDER = {
  1: [
    "我", "你", "他", "她", "我們", "老師", "同學", "學校", "家", "爸爸", "媽媽",
    "哥哥", "姊姊", "弟弟", "妹妹", "書", "筆", "桌子", "椅子", "門", "窗",
    "今天", "明天", "昨天", "上學", "放學", "謝謝", "你好", "再見",
  ],
  2: [
    "喜歡", "不喜歡", "高興", "難過", "漂亮", "可愛", "聰明", "勇敢",
    "朋友", "一起", "玩", "吃", "喝", "看", "聽", "說", "走", "跑", "坐",
    "站", "睡覺", "起床", "洗臉", "刷牙", "穿衣服", "下雨", "太陽", "月亮",
    "星星",
  ],
  3: [
    "詞語", "句子", "故事", "圖書館", "運動", "比賽", "練習", "準備",
    "努力", "成功", "失敗", "困難", "容易", "快樂", "悲傷", "生氣",
    "害怕", "勇敢", "想念", "感謝", "對不起", "沒關係", "顏色",
    "紅色", "藍色", "綠色", "黃色", "水果", "蘋果", "香蕉",
  ],
  4: [
    "經驗", "感覺", "想法", "意見", "討論", "分享", "合作", "幫助",
    "保護", "環境", "自然", "動物", "植物", "氣候", "季節", "旅行",
    "風景", "文化", "傳統", "節日", "閱讀", "寫作", "表達", "理解",
    "比較", "分析", "整理", "資料", "字典", "詞典",
  ],
  5: [
    "主題", "段落", "結構", "組織", "推論", "主旨", "證據", "線索",
    "象徵", "對比", "強調", "結論", "觀點", "立場", "批判", "欣賞",
    "回憶", "想像", "感受", "體會", "成長", "挑戰", "突破", "反思",
    "成語", "典故", "修辭", "比喻", "擬人",
  ],
  6: [
    "文言文", "古詩", "詩詞", "格律", "韻腳", "情韻", "意象", "意境",
    "主題意識", "人文素養", "文化傳承", "社會議題", "公民責任", "思辨",
    "論述", "辯證", "歸納", "演繹", "結構嚴謹", "文采", "風格",
    "流派", "時代背景", "作者意圖", "讀者反應", "多元觀點",
    "價值判斷", "生命意義",
  ],
};

/**
 * @typedef {Object} ChineseKPMatch
 * @property {boolean} found
 * @property {number} grade
 * @property {string} topic             — 3rd KP-id segment (e.g. "READ")
 * @property {string} subtopic          — last segment (e.g. "main-idea-multi")
 * @property {string[]} vocabulary      — ~3 words from the grade ladder
 * @property {string[]} [example_texts] — small example sentences (zh-TW)
 * @property {string} [description]     — KP description from the YAML
 */

/** @type {Map<string, ChineseKPMatch>} */
let _kpCache = null;
let _kpCacheMtime = 0;

/**
 * Load and parse the chinese.yaml once per mtime change.
 * @returns {Promise<{ grades: Record<string, { knowledge_points: any[] }> }>}
 */
async function loadChineseYaml() {
  let raw;
  try {
    raw = await fs.readFile(CHINESE_FILE, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { grades: {} };
    throw e;
  }
  const stat = await fs.stat(CHINESE_FILE).catch(() => null);
  const mtime = stat ? stat.mtimeMs : 0;
  if (_kpCache && mtime === _kpCacheMtime) return _kpCache;
  const doc = yaml.load(raw) || {};
  _kpCache = doc;
  _kpCacheMtime = mtime;
  return doc;
}

function pickWordsForGrade(grade, count = 3) {
  const arr = VOCABULARY_LADDER[grade] || VOCABULARY_LADDER[5];
  // Deterministic pick: take a window starting at (grade - 1) * 3.
  const start = ((grade - 1) * 3) % arr.length;
  const out = [];
  for (let i = 0; i < count && i < arr.length; i++) {
    out.push(arr[(start + i) % arr.length]);
  }
  return out;
}

function exampleTextsFor(topic, subtopic) {
  // Deterministic seed examples. Real implementation: corpus lookup.
  const seed = `${topic}.${subtopic}`;
  if (/^READ\./i.test(seed)) {
    return [
      "請仔細閱讀文章，找出作者的觀點。",
      "從文中的一句話，我們可以推論出角色的心情。",
    ];
  }
  if (/^VOC\./i.test(seed) || /^IDIOM\./i.test(seed)) {
    return [
      "請用「畫蛇添足」造一個句子。",
      "想一想這個成語的意思，再選一個最貼切的解釋。",
    ];
  }
  if (/^WRITE\./i.test(seed) || /^COMP\./i.test(seed)) {
    return [
      "作文至少要寫到三個段落，並用一個例子支持你的觀點。",
    ];
  }
  if (/^RHET\./i.test(seed)) {
    return [
      "這句話用了什麼修辭？為什麼作者要這樣寫？",
    ];
  }
  if (/^CLASSICAL\./i.test(seed) || /^CL\./i.test(seed)) {
    return [
      "請把這段文言文翻譯成白話文。",
    ];
  }
  if (/^PONE\./i.test(seed)) {
    return ["今天天氣真好。", "你喜歡讀什麼書？"];
  }
  return ["這是國語課的練習題。"];
}

/**
 * Look up a Chinese knowledge point by id (e.g. "chinese.G5.READ.main-idea-multi")
 * or by partial id (e.g. "G5.READ.main-idea-multi").
 * @param {object} input
 * @param {string} input.knowledge_point
 * @returns {Promise<ChineseKPMatch>}
 */
export async function lookupChineseKP({ knowledge_point }) {
  if (typeof knowledge_point !== "string") {
    return { found: false, reason: "knowledge_point-must-be-string" };
  }
  const doc = await loadChineseYaml();
  const wanted = knowledge_point.trim();
  for (const [gradeKey, gradeDoc] of Object.entries(doc.grades || {})) {
    const kps = (gradeDoc && gradeDoc.knowledge_points) || [];
    const match = kps.find((k) => k.id === wanted || k.alias === wanted);
    if (match) {
      const parts = String(match.id).split(".");
      const grade = Number(gradeKey);
      const topic = parts[2] || "";
      const subtopic = parts.slice(3).join(".") || "";
      return {
        found: true,
        grade,
        topic,
        subtopic,
        vocabulary: pickWordsForGrade(grade, 3),
        example_texts: exampleTextsFor(topic, subtopic),
        description: match.description || null,
        id: match.id,
        stage: match.stage || null,
        curriculum_doc: doc.curriculum_doc || "tw-12yrc-chinese-v1",
        scope: doc.scope || "G1-G6",
      };
    }
  }
  // Fallback: try parsing the KP id even if not present in YAML.
  const parts = wanted.split(".");
  if (parts.length >= 3 && /^G\d+$/i.test(parts[1])) {
    const grade = parseInt(parts[1].replace(/^G/i, ""), 10);
    return {
      found: false,
      reason: "kp-not-in-current-curriculum-yaml-but-id-is-valid",
      grade,
      topic: parts[2] || "",
      subtopic: parts.slice(3).join("."),
      vocabulary: pickWordsForGrade(grade, 3),
      example_texts: exampleTextsFor(parts[2] || "", parts.slice(3).join(".")),
    };
  }
  return { found: false, reason: "kp-id-malformed" };
}

/**
 * List all Chinese knowledge points for a given grade (G1–G6 in V1).
 * @param {object} input
 * @param {number} input.grade
 * @returns {Promise<{found: boolean, grade: number, knowledge_points: any[]}>}
 */
export async function listChineseKPForGrade({ grade }) {
  const g = Number(grade);
  if (!Number.isInteger(g) || g < 1 || g > 6) {
    return { found: false, grade: g, knowledge_points: [] };
  }
  const doc = await loadChineseYaml();
  const gradeDoc = (doc.grades || {})[String(g)] || {};
  const kps = gradeDoc.knowledge_points || [];
  return {
    found: kps.length > 0,
    grade: g,
    knowledge_points: kps.map((k) => ({ id: k.id, description: k.description, stage: k.stage || null })),
    vocabulary_size: (VOCABULARY_LADDER[g] || []).length,
  };
}

/**
 * Test whether a word belongs to the V1 vocabulary ladder for a given grade.
 * V1 ships ~30 words per grade G1–G6. Documented gap.
 *
 * @param {object} input
 * @param {number} input.grade
 * @param {string} input.word
 * @returns {{appropriate: boolean, grade: number, found_in_ladder: boolean, vocabulary_size: number, gap_note: string}}
 */
export function gradeAppropriateVocabulary({ grade, word }) {
  const g = Number(grade);
  const ladder = VOCABULARY_LADDER[g] || [];
  const found_in_ladder = ladder.includes(String(word ?? "").trim());
  return {
    appropriate: found_in_ladder,
    grade: g,
    found_in_ladder,
    vocabulary_size: ladder.length,
    gap_note: "V1 ships ~30 representative words per grade G1–G6 for testing; full HSK-zh-TW corpus not included in V1.",
  };
}

/** For tests: total word count across all grades. */
export function totalLadderSize() {
  let n = 0;
  for (const arr of Object.values(VOCABULARY_LADDER)) n += arr.length;
  return n;
}

/** For tests: list all known grades. */
export function listLadderGrades() {
  return Object.keys(VOCABULARY_LADDER).map((g) => Number(g)).sort((a, b) => a - b);
}

export const _internal = { VOCABULARY_LADDER, CHINESE_FILE };