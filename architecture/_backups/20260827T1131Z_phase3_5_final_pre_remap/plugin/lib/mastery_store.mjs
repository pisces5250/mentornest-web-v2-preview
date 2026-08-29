// Mastery store.
//
// Per-student persistent record keyed by (subject, knowledge_point, subskill).
// Fields per data-model.yaml:
//   mastery, confidence, last_seen, review_due, school_alignment, error_patterns
//
// Storage path:
//   /home/node/.openclaw/workspace/data/mastery/<student_id>.json
//
// NEVER merges across students.

import fs from "node:fs/promises";
import path from "node:path";
import { assertStudentId } from "./learning_event_reader.mjs";

const MASTERY_DIR = "/home/node/.openclaw/workspace/data/mastery";

const EMPTY_DOC = () => ({
  student_id: null,
  version: 1,
  records: {}, // key: "subject::knowledge_point::subskill"
  updated_at: null,
});

function key(subject, knowledge_point, subskill = "") {
  return `${subject}::${knowledge_point}::${subskill}`;
}

async function ensureDirs() {
  await fs.mkdir(MASTERY_DIR, { recursive: true });
}

async function readDoc(student_id) {
  await ensureDirs();
  const file = path.join(MASTERY_DIR, `${student_id}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const doc = JSON.parse(raw);
    if (!doc.records) doc.records = {};
    return doc;
  } catch (e) {
    if (e.code === "ENOENT") {
      const d = EMPTY_DOC();
      d.student_id = student_id;
      return d;
    }
    throw e;
  }
}

async function writeDoc(doc) {
  doc.updated_at = new Date().toISOString();
  await ensureDirs();
  const file = path.join(MASTERY_DIR, `${doc.student_id}.json`);
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/**
 * Read a single mastery record.
 */
export async function getMastery(student_id, subject, knowledge_point, subskill = "") {
  assertStudentId(student_id);
  const doc = await readDoc(student_id);
  const k = key(subject, knowledge_point, subskill);
  return doc.records[k] || null;
}

/**
 * List all mastery records for a student.
 */
export async function listMastery(student_id, opts = {}) {
  assertStudentId(student_id);
  const doc = await readDoc(student_id);
  let records = Object.entries(doc.records).map(([k, v]) => ({ key: k, ...v }));
  if (opts.subject) records = records.filter((r) => r.subject === opts.subject);
  return records;
}

/**
 * Update mastery using a single learning_event-derived input.
 * This is the canonical way `learning_record_append` should feed the store.
 *
 * Inputs:
 *   student_id, subject, knowledge_point, subskill, result, attempts, hints, error_type, timestamp
 *
 * Mastery model (simple Bayesian-ish update):
 *   - correct → mastery += 0.15 (capped at 1.0); confidence += 0.05
 *   - incorrect → mastery -= 0.10 (floor at 0); confidence -= 0.02
 *   - partial → mastery += 0.05; confidence += 0.02
 *   - error_type tracked into error_patterns[error_type] += 1
 *   - review_due: next ISO date based on simple FSRS-like schedule:
 *       mastery < 0.4 → +1 day; < 0.7 → +3 days; < 0.9 → +7 days; else +21 days
 *     This is a SIMPLIFIED placeholder. The real FSRS scheduler will replace it
 *     once the adaptive-learning skill is refactored.
 */
export async function updateMasteryFromEvent(input) {
  const {
    student_id,
    subject,
    knowledge_point,
    subskill = "",
    result,
    error_type,
    timestamp = new Date().toISOString(),
  } = input || {};

  assertStudentId(student_id);
  if (!subject || !knowledge_point) {
    throw new Error("updateMasteryFromEvent: subject and knowledge_point required");
  }

  const doc = await readDoc(student_id);
  doc.student_id = student_id;
  const k = key(subject, knowledge_point, subskill);
  const cur = doc.records[k] || {
    student_id,
    subject,
    knowledge_point,
    subskill,
    mastery: 0.5,
    confidence: 0.0,
    last_seen: timestamp,
    review_due: null,
    school_alignment: null,
    error_patterns: {},
  };

  let delta = 0;
  let confDelta = 0;
  if (result === "correct" || result === "mastered" || result === "improved") {
    delta = 0.15;
    confDelta = 0.05;
  } else if (result === "partially_correct") {
    delta = 0.05;
    confDelta = 0.02;
  } else if (result === "incorrect") {
    delta = -0.10;
    confDelta = -0.02;
  }

  const next = {
    ...cur,
    mastery: clamp(cur.mastery + delta, 0, 1),
    confidence: clamp(cur.confidence + confDelta, 0, 1),
    last_seen: timestamp,
    error_patterns: { ...(cur.error_patterns || {}) },
  };

  if (error_type && result === "incorrect") {
    next.error_patterns[error_type] = (next.error_patterns[error_type] || 0) + 1;
  }

  // Schedule next review (placeholder; replaced by full FSRS later)
  const days =
    next.mastery < 0.4 ? 1 :
    next.mastery < 0.7 ? 3 :
    next.mastery < 0.9 ? 7 :
    21;
  const d = new Date(timestamp);
  d.setUTCDate(d.getUTCDate() + days);
  next.review_due = d.toISOString();

  doc.records[k] = next;
  await writeDoc(doc);
  return next;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Replace or insert a record directly. Intended for curriculum-agent or
 * parent-driven overrides (e.g. confirmed school progress). Does NOT
 * touch review_due unless the caller sets it.
 */
export async function setMastery(student_id, record) {
  assertStudentId(student_id);
  if (!record || !record.subject || !record.knowledge_point) {
    throw new Error("setMastery: subject and knowledge_point required");
  }
  const doc = await readDoc(student_id);
  doc.student_id = student_id;
  const k = key(record.subject, record.knowledge_point, record.subskill || "");
  doc.records[k] = {
    student_id,
    mastery: record.mastery ?? 0.5,
    confidence: record.confidence ?? 0,
    last_seen: record.last_seen || new Date().toISOString(),
    review_due: record.review_due || null,
    school_alignment: record.school_alignment || null,
    error_patterns: record.error_patterns || {},
    subject: record.subject,
    knowledge_point: record.knowledge_point,
    subskill: record.subskill || "",
  };
  await writeDoc(doc);
  return doc.records[k];
}
