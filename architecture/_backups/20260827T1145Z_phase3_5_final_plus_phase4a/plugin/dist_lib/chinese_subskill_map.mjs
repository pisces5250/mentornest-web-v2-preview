// Chinese subskill map v1.
//
// Maps Chinese knowledge-point ids (and free-text knowledge_point strings) to
// a primary subskill + a list of secondary subskills. Sub-skills (繁體中文):
//   字 / 詞 / 句 / 段 / 篇 / 修辭 / 文言 / 應用
//
// V1 rule: parse the KP id's third segment (e.g. "chinese.G3.VOC.common-vocab"
// → "VOC") and combine with a keyword heuristic over the trailing id + free
// text. This is a deterministic, pure function — no I/O.

/**
 * @typedef {Object} ChineseSubskillClassification
 * @property {string} primary_subskill
 * @property {string[]} secondary_subskills
 * @property {string} matched_segment      — which segment of the KP id matched
 * @property {string[]} matched_keywords   — keyword tokens that matched (zh-TW)
 */

const SUBSKILLS = ["字", "詞", "句", "段", "篇", "修辭", "文言", "應用"];

// Mapping from KP-id segment → primary subskill.
// Derived from the tw-12yrc-chinese-v1 curriculum skeleton + common Taiwan
// grade-school Chinese KP naming conventions.
const SEGMENT_TO_SUBSKILL = {
  // 字
  PHONE: "字",
  CHAR: "字",
  STROKE: "字",
  RADICAL: "字",
  ZI: "字",
  // 詞
  VOC: "詞",
  WORD: "詞",
  IDIOM: "詞",
  CI: "詞",
  // 句
  SENT: "句",
  SENTENCE: "句",
  PUNC: "句",
  PUNCT: "句",
  // 段
  PARA: "段",
  PARAGRAPH: "段",
  // 篇
  COMP: "篇",
  WRITE: "篇",
  COMPOSITION: "篇",
  ESSAY: "篇",
  // 修辭
  RHET: "修辭",
  RHETORIC: "修辭",
  // 文言
  CLASSICAL: "文言",
  CL: "文言",
  // 應用
  READ: "應用",
  READING: "應用",
  COMPREHENSION: "應用",
  APPLY: "應用",
  APPLICATION: "應用",
};

// Keyword heuristic — applied to (kp_id + free-text knowledge_point) lowercased.
const KEYWORD_RULES = [
  { keywords: ["注音", "拼音", "聲調", "bopomofo", "pinyin", "輕聲", "兒化"], primary: "字" },
  { keywords: ["筆畫", "筆順", "部首", "偏旁", "形近", "多音字"], primary: "字" },
  { keywords: ["詞語", "詞義", "詞性", "近義", "反義", "搭配", "vocab"], primary: "詞" },
  { keywords: ["成語", "idiom", "慣用語"], primary: "詞" },
  { keywords: ["句", "病句", "標點", "punc"], primary: "句" },
  { keywords: ["段落", "段", "para"], primary: "段" },
  { keywords: ["修辭", "比喻", "擬人", "排比", "誇張", "rhetor"], primary: "修辭" },
  { keywords: ["文言", "古文", "classical"], primary: "文言" },
  { keywords: ["作文", "寫作", "composition", "essay", "五段"], primary: "篇" },
  { keywords: ["閱讀", "推論", "主旨", "reading", "inference", "main-idea", "main_idea"], primary: "應用" },
];

/**
 * Normalize a knowledge_point identifier or free text.
 * Lowercase + strip whitespace + split on `.` and `-` and `_`.
 *
 * @param {string} knowledge_point
 * @returns {{ tokens: string[], id_segments: string[], full_lower: string }}
 */
function normalizeKp(knowledge_point) {
  const raw = String(knowledge_point ?? "").toLowerCase();
  const tokens = raw.split(/[._\-\s\/]+/).filter(Boolean);
  // id_segments = parts separated by '.' for KP ids
  const id_segments = String(knowledge_point ?? "").split(".").map((s) => s.toLowerCase().trim()).filter(Boolean);
  return { tokens, id_segments, full_lower: raw };
}

/**
 * Classify a Chinese knowledge point into a subskill.
 *
 * @param {object} input
 * @param {string} input.knowledge_point
 * @returns {ChineseSubskillClassification}
 */
export function classifyChineseSubskill({ knowledge_point }) {
  const norm = normalizeKp(knowledge_point);

  // 1) Try KP id segment match (most reliable).
  let segment_hit = null;
  if (norm.id_segments.length >= 3) {
    // Convention: chinese.<grade>.<SEGMENT>.<sub>
    const seg = norm.id_segments[2].toUpperCase();
    if (SEGMENT_TO_SUBSKILL[seg]) {
      segment_hit = seg;
    }
  }
  // Fallback: search all id segments for a known mapping.
  if (!segment_hit) {
    for (const seg of norm.id_segments) {
      const upper = seg.toUpperCase();
      if (SEGMENT_TO_SUBSKILL[upper]) {
        segment_hit = upper;
        break;
      }
    }
  }
  // Fallback: search tokens.
  if (!segment_hit) {
    for (const tok of norm.tokens) {
      const upper = tok.toUpperCase();
      if (SEGMENT_TO_SUBSKILL[upper]) {
        segment_hit = upper;
        break;
      }
    }
  }

  // 2) Apply keyword rules to the full free-text.
  const matched_keywords = [];
  let kw_primary = null;
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (norm.full_lower.includes(kw.toLowerCase())) {
        matched_keywords.push(kw);
        if (!kw_primary) kw_primary = rule.primary;
        break; // one hit per rule is enough
      }
    }
  }

  // 3) Decide primary.
  let primary = "應用"; // safe default
  if (segment_hit) primary = SEGMENT_TO_SUBSKILL[segment_hit];
  else if (kw_primary) primary = kw_primary;

  // 4) Build secondary list: every other subskill that appeared in the
  //    keywords (excluding primary). We avoid duplicates and limit to ≤ 3.
  const seen = new Set([primary]);
  const secondary = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.primary === primary) continue;
    for (const kw of rule.keywords) {
      if (matched_keywords.includes(kw) && !seen.has(rule.primary)) {
        secondary.push(rule.primary);
        seen.add(rule.primary);
        break;
      }
    }
    if (secondary.length >= 3) break;
  }
  // If we have segment_hit but no secondary kw hits, add a logical neighbor.
  if (secondary.length === 0) {
    if (primary === "字") secondary.push("詞");
    else if (primary === "詞") secondary.push("句");
    else if (primary === "句") secondary.push("段");
    else if (primary === "段") secondary.push("篇");
    else if (primary === "篇") secondary.push("段");
    else if (primary === "修辭") secondary.push("句");
    else if (primary === "文言") secondary.push("句");
    else if (primary === "應用") secondary.push("段");
  }

  return {
    primary_subskill: primary,
    secondary_subskills: secondary,
    matched_segment: segment_hit ?? "",
    matched_keywords,
  };
}

/** List all known Chinese subskills (for tests). */
export function listSubskills() {
  return [...SUBSKILLS];
}