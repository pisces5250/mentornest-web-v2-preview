// English curriculum map wrapper v1.
//
// Read-only wrapper over the English section of the Taiwan 12-year curriculum
// YAML skeleton (architecture/curriculum/english.yaml). On top of plain YAML
// reads, we add:
//   - lookupEnglishKP({ knowledge_point }) → KP details + a small vocabulary
//     list anchored to that KP for grade-band scaffolding.
//   - listEnglishKPForGrade({ grade }) → KP list.
//   - gradeAppropriateVocabulary({ grade, word }) → uses a small built-in
//     grade-by-grade Tier-1 sight-word ladder (V1 ships ~30 representative
//     words per grade G1–G6 for testing; document gap).
//
// The vocabulary ladder is INTENTIONAL V1 content. The full English grade-band
// ladder (Dolch / Fry / CEFR-aligned) is OUT OF SCOPE for this phase; the
// 30-word-per-grade list is documented as a known limitation (see gaps).

import fs from "node:fs/promises";
import path from "node:path";
import * as yaml from "js-yaml";

const CURRICULUM_DIR = "/home/node/.openclaw/workspace/architecture/curriculum";
const ENGLISH_FILE = path.join(CURRICULUM_DIR, "english.yaml");

// -------- Grade-by-grade Tier-1 sight-word ladder (V1) -----------
//
// IMPORTANT: This is V1 test data only. ~30 representative words per grade.
// Documented gap: production deployment needs the full Dolch/Fry/CEFR-aligned
// English grade-band corpus.
//
// Word selection criterion: tier-1 high-frequency words for each grade band,
// grouped by theme (greetings / family / school / nature / verbs / etc.).

/** @type {Record<number, string[]>} */
const VOCABULARY_LADDER = {
  1: [
    "a", "an", "the", "I", "you", "he", "she", "it", "we", "they",
    "is", "am", "are", "see", "look", "go", "come", "me", "my", "your",
    "yes", "no", "and", "or", "but", "cat", "dog", "book", "pen", "pencil",
  ],
  2: [
    "this", "that", "is", "are", "was", "were", "have", "has", "do", "does",
    "red", "blue", "green", "yellow", "big", "small", "good", "bad", "happy", "sad",
    "mom", "dad", "sister", "brother", "baby", "friend", "school", "home", "run", "jump",
  ],
  3: [
    "time", "day", "week", "month", "year", "today", "tomorrow", "yesterday", "morning", "night",
    "like", "want", "need", "have", "make", "play", "read", "write", "draw", "sing",
    "apple", "banana", "rice", "water", "milk", "bread", "fish", "meat", "hot", "cold",
  ],
  4: [
    "because", "but", "so", "if", "when", "where", "what", "who", "how", "why",
    "family", "mother", "father", "teacher", "student", "class", "lesson", "question", "answer", "help",
    "morning", "afternoon", "evening", "weekend", "holiday", "birthday", "party", "present", "story", "game",
  ],
  5: [
    "should", "could", "would", "might", "must", "have to", "ought to", "used to", "need to", "be able to",
    "because of", "in order to", "such as", "for example", "however", "although", "though", "even though", "instead of", "in addition to",
    "environment", "pollution", "recycle", "save", "protect", "nature", "forest", "ocean", "mountain", "river",
  ],
  6: [
    "however", "therefore", "moreover", "furthermore", "nevertheless", "consequently", "meanwhile", "otherwise", "instead", "likewise",
    "opportunity", "challenge", "responsibility", "achievement", "success", "failure", "effort", "progress", "improvement", "solution",
    "communicate", "persuade", "negotiate", "cooperate", "collaborate", "compromise", "appreciate", "interpret", "analyze", "evaluate",
  ],
};

/**
 * @typedef {Object} EnglishKPMatch
 * @property {boolean} found
 * @property {number} grade
 * @property {string} topic             — 3rd KP-id segment (e.g. "READ")
 * @property {string} subtopic          — last segment (e.g. "passage-inference")
 * @property {string[]} vocabulary      — ~3 words from the grade ladder
 * @property {string[]} [example_texts] — small example sentences (English)
 * @property {string} [description]     — KP description from the YAML
 */

/** @type {Map<string, EnglishKPMatch>} */
let _kpCache = null;
let _kpCacheMtime = 0;

/**
 * Load and parse the english.yaml once per mtime change.
 * @returns {Promise<{ grades: Record<string, { knowledge_points: any[] }> }>}
 */
async function loadEnglishYaml() {
  let raw;
  try {
    raw = await fs.readFile(ENGLISH_FILE, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { grades: {} };
    throw e;
  }
  const stat = await fs.stat(ENGLISH_FILE).catch(() => null);
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
  const seed = `${topic}.${subtopic}`.toUpperCase();
  if (/^READ\./i.test(seed)) {
    return [
      "Please read the passage carefully and answer the questions.",
      "From the text, we can infer the character's feelings.",
    ];
  }
  if (/^VOC\./i.test(seed) || /^IDIOM\./i.test(seed)) {
    return [
      "Make a sentence with the word 'apple'.",
      "Choose the meaning that best fits the word in this sentence.",
    ];
  }
  if (/^WRITE\./i.test(seed) || /^COMP\./i.test(seed)) {
    return [
      "Write at least three sentences and support your opinion with one example.",
    ];
  }
  if (/^GRAMMAR?\./i.test(seed)) {
    return [
      "Fill in the blank with the correct form of the verb.",
    ];
  }
  if (/^PHONE\./i.test(seed)) {
    return [
      "Listen to the word and write the letter that makes the sound.",
    ];
  }
  if (/^SPEAK\./i.test(seed) || /^CONV\./i.test(seed) || /^DIALOG/.test(seed)) {
    return [
      "Say the sentence out loud with the correct stress.",
      "Practice the short dialogue with your partner.",
    ];
  }
  if (/^LIS\./i.test(seed) || /^LISTEN\./i.test(seed)) {
    return [
      "Listen and choose the picture that matches.",
    ];
  }
  if (/^SPELL\./i.test(seed)) {
    return [
      "Spell the word out loud, letter by letter.",
    ];
  }
  return ["This is an English exercise."];
}

/**
 * Look up an English knowledge point by id (e.g. "english.G5.READ.passage-inference")
 * or by partial id (e.g. "G5.READ.passage-inference").
 * @param {object} input
 * @param {string} input.knowledge_point
 * @returns {Promise<EnglishKPMatch>}
 */
export async function lookupEnglishKP({ knowledge_point }) {
  if (typeof knowledge_point !== "string") {
    return { found: false, reason: "knowledge_point-must-be-string" };
  }
  const doc = await loadEnglishYaml();
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
        curriculum_doc: doc.curriculum_doc || "tw-12yrc-english-v1",
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
 * List all English knowledge points for a given grade (G1–G6 in V1).
 * @param {object} input
 * @param {number} input.grade
 * @returns {Promise<{found: boolean, grade: number, knowledge_points: any[]}>}
 */
export async function listEnglishKPForGrade({ grade }) {
  const g = Number(grade);
  if (!Number.isInteger(g) || g < 1 || g > 6) {
    return { found: false, grade: g, knowledge_points: [] };
  }
  const doc = await loadEnglishYaml();
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
    gap_note: "V1 ships ~30 representative words per grade G1–G6 for testing; full Dolch/Fry/CEFR-aligned corpus not included in V1.",
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

export const _internal = { VOCABULARY_LADDER, ENGLISH_FILE };
