// ─────────────────────────────────────────────────────────────────────
// SOURCE-OF-TRUTH: ../../../../plugins/mentornest-learning/lib/
//   (MentorNest OpenClaw plugin — authoritative English Specialist).
// Contract: identical exports, identical pure-function semantics.
// If upstream changes, this directory MUST be re-synced (not edited).
// ─────────────────────────────────────────────────────────────────────
// English subskill map v1.
//
// Maps English knowledge-point ids (and free-text knowledge_point strings)
// to a primary subskill + a list of secondary subskills. Sub-skills (English):
//   phonics / spelling / vocab / grammar / reading / listening / speaking /
//   writing / conversation
//
// V1 rule: parse the KP id's third segment (e.g. "english.G5.READ.passage-inference"
// → "READ") and combine with a keyword heuristic over the trailing id + free
// text. This is a deterministic, pure function — no I/O.

/**
 * @typedef {Object} EnglishSubskillClassification
 * @property {string} primary_subskill
 * @property {string[]} secondary_subskills
 * @property {string} matched_segment      — which segment of the KP id matched
 * @property {string[]} matched_keywords   — keyword tokens that matched (English)
 */

const SUBSKILLS = [
  "phonics",
  "spelling",
  "vocab",
  "grammar",
  "reading",
  "listening",
  "speaking",
  "writing",
  "conversation",
];

// Mapping from KP-id segment → primary subskill.
const SEGMENT_TO_SUBSKILL = {
  // phonics
  PHONE: "phonics",
  PHONICS: "phonics",
  PHONEME: "phonics",
  LETTER: "phonics",
  SOUND: "phonics",
  // spelling
  SPELL: "spelling",
  SPELLING: "spelling",
  ORTHO: "spelling",
  // vocab
  VOC: "vocab",
  VOCAB: "vocab",
  WORD: "vocab",
  LEX: "vocab",
  IDIOM: "vocab",
  // grammar
  GRAM: "grammar",
  GRAMMAR: "grammar",
  GRAMMER: "grammar",
  SYNTAX: "grammar",
  // reading
  READ: "reading",
  READING: "reading",
  COMPREHENSION: "reading",
  // listening
  LIS: "listening",
  LISTEN: "listening",
  LISTENING: "listening",
  // speaking
  SPEAK: "speaking",
  SPEAKING: "speaking",
  ORAL: "speaking",
  PRON: "speaking",
  // writing
  WRITE: "writing",
  WRITING: "writing",
  COMP: "writing",
  COMPOSITION: "writing",
  ESSAY: "writing",
  // conversation
  CONV: "conversation",
  CONVERSATION: "conversation",
  DIALOG: "conversation",
  DIALOGUE: "conversation",
};

// Keyword heuristic — applied to (kp_id + free-text knowledge_point) lowercased.
const KEYWORD_RULES = [
  { keywords: ["phonics", "phoneme", "letter-sound", "vowel team", "consonant blend", "silent letter"], primary: "phonics" },
  { keywords: ["spelling", "doubling rule", "y-to-i", "tion", "sion"], primary: "spelling" },
  { keywords: ["vocab", "vocabulary", "word", "lexicon", "idiom", "phrase"], primary: "vocab" },
  { keywords: ["grammar", "tense", "article", "preposition", "subject-verb", "agreement"], primary: "grammar" },
  { keywords: ["reading", "comprehension", "inference", "main idea", "explicit"], primary: "reading" },
  { keywords: ["listening", "listening-comprehension"], primary: "listening" },
  { keywords: ["speaking", "pronunciation", "oral", "phoneme"], primary: "speaking" },
  { keywords: ["writing", "composition", "essay", "paragraph"], primary: "writing" },
  { keywords: ["conversation", "dialogue", "dialog", "turn-taking", "greeting"], primary: "conversation" },
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
  const id_segments = String(knowledge_point ?? "")
    .split(".")
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
  return { tokens, id_segments, full_lower: raw };
}

/**
 * Classify an English knowledge point into a subskill.
 *
 * @param {object} input
 * @param {string} input.knowledge_point
 * @returns {EnglishSubskillClassification}
 */
export function classifyEnglishSubskill({ knowledge_point }) {
  const norm = normalizeKp(knowledge_point);

  // 1) Try KP id segment match (most reliable).
  let segment_hit = null;
  if (norm.id_segments.length >= 3) {
    // Convention: english.<grade>.<SEGMENT>.<sub>
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
  let primary = "reading"; // safe default for English
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
    if (primary === "phonics") secondary.push("spelling");
    else if (primary === "spelling") secondary.push("vocab");
    else if (primary === "vocab") secondary.push("grammar");
    else if (primary === "grammar") secondary.push("writing");
    else if (primary === "reading") secondary.push("vocab");
    else if (primary === "listening") secondary.push("speaking");
    else if (primary === "speaking") secondary.push("conversation");
    else if (primary === "writing") secondary.push("grammar");
    else if (primary === "conversation") secondary.push("speaking");
  }

  return {
    primary_subskill: primary,
    secondary_subskills: secondary,
    matched_segment: segment_hit ?? "",
    matched_keywords,
  };
}

/** List all known English subskills (for tests). */
export function listSubskills() {
  return [...SUBSKILLS];
}
