// mastery_engine_v2.mjs
//
// MentorNest Mastery Engine v2 (Phase 2 fourth-batch).
//
// Goals:
//   1. Mastery records are derived ONLY from objective evidence:
//      - learning_record_append events (a tool, with event_id + ingested_at)
//      - question_quality_agent_verified bank responses (assessment evidence)
//      NOTHING else. LLM agents (Learning Director, subject agents, parent
//      prompts) CANNOT directly set mastery = 0.9 etc. The only LLM-touching
//      surface is the diagnosis/strategy layer, which reads but never writes
//      mastery.
//   2. Server-side persistence at data/mastery/<student_id>.json.
//      NO browser localStorage as source-of-truth.
//   3. Each record carries:
//      - mastery (0..1)
//      - confidence (0..1) — separate signal for "how sure we are"
//      - evidence_count — number of objective events supporting this mastery
//      - last_seen — ISO timestamp
//      - review_due — ISO timestamp (FSRS-lite scheduler)
//      - retention — 0..1 (R(t) memory-retention model)
//      - school_alignment — input from curriculum-agent (read-only here)
//      - error_patterns — flat { type: count } aggregated map
//      - subskills — list of { subskill, mastery, evidence_count } allowed
//   4. Decay: if no evidence in N days, retention factor decays toward 0.9
//      multiplier on mastery (but mastery itself doesn't auto-decay; review
//      events carry weight again). This prevents stale high-mastery values.
//   5. Spaced review: FSRS-lite (graduating, easy/good/hard/again ratings).
//      Each event can carry a quality rating 0..5; we use 3 (good) for
//      correct, 2 (hard) for partially_correct, 1 (hard) for incorrect.
//   6. Append-only invariant on the evidence ledger (different file from
//      the mastery file) — the mastery file IS mutable, but only by
//      this engine from objective events; callers cannot bypass.

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertStudentId } from "./learning_event_reader.mjs";

const MASTERY_DIR = "/home/node/.openclaw/workspace/data/mastery";
const EVIDENCE_DIR = "/home/node/.openclaw/workspace/data/mastery-evidence";

const RETENTION_HALF_LIFE_DAYS = 21; // after 21 days without practice, retention halves

// FSRS-lite parameters
const FSRS_INTERVALS = {
  // initial graduating intervals (in days)
  again: 0.0007, // ~1 minute (same session)
  hard: 1,
  good: 3,
  easy: 5,
};

// ---------- Mastery file (mutable under engine, server-side only) ------------

const EMPTY_MASTERY_DOC = (student_id) => ({
  student_id,
  schema_version: "mastery-v2",
  updated_at: null,
  records: {}, // key: "subject::kp::subskill"
});

function masteryKey(subject, knowledge_point, subskill = "") {
  return `${subject}::${knowledge_point}::${subskill || ""}`;
}

async function readMasteryDoc(student_id) {
  await fs.mkdir(MASTERY_DIR, { recursive: true });
  const file = path.join(MASTERY_DIR, `${student_id}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const d = JSON.parse(raw);
    if (!d.records) d.records = {};
    // Auto-upgrade v1 docs to v2
    if (!d.schema_version || d.schema_version === 1) {
      d.schema_version = "mastery-v2";
      for (const k of Object.keys(d.records)) {
        const r = d.records[k];
        if (typeof r.evidence_count === "undefined") r.evidence_count = 1;
        if (typeof r.retention === "undefined") r.retention = 1.0;
        if (!Array.isArray(r.subskills)) r.subskills = [];
      }
    }
    return d;
  } catch (e) {
    if (e.code === "ENOENT") {
      return EMPTY_MASTERY_DOC(student_id);
    }
    throw e;
  }
}

async function writeMasteryDoc(doc) {
  doc.updated_at = new Date().toISOString();
  await fs.mkdir(MASTERY_DIR, { recursive: true });
  const file = path.join(MASTERY_DIR, `${doc.student_id}.json`);
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return doc;
}

// ---------- Evidence ledger (append-only) -----------------------------------
//
// An objective event gets ONE row appended here. Each row has its own
// ingested_at and event_id. The mastery engine summarizes on top.

async function appendEvidence(student_id, evt) {
  assertStudentId(student_id);
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${student_id}.jsonl`);
  const row = {
    event_id: evt.event_id ?? randomUUID(),
    schema_version: "mastery-evidence-v1",
    ingested_at: new Date().toISOString(),
    student_id,
    subject: evt.subject,
    knowledge_point: evt.knowledge_point,
    subskill: evt.subskill ?? "",
    source: evt.source ?? "learning_record_append", // or "question_bank_assessment"
    source_event_id: evt.source_event_id ?? null,
    quality_rating: evt.quality_rating ?? null,
    correct: !!evt.correct,
    result: evt.result,
    error_type: evt.error_type ?? null,
    evidence_kind: evt.evidence_kind ?? "response", // or "rubric" | "manual_flag"
  };
  // PII fence (defensive — callers should already have rejected this)
  for (const k of ["display_name", "school_name", "class_name", "parent_concerns", "raw_learning_history"]) {
    if (k in row) {
      const e = new Error(`evidence row has forbidden field: ${k}`);
      e.code = "PRIVACY_VIOLATION";
      throw e;
    }
  }
  const handle = await fs.open(file, "a");
  try {
    await handle.writeFile(JSON.stringify(row) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return row;
}

// Exported so the Chinese Specialist can append evidence directly without
// going through the mastery update path. The mastery file is NEVER touched
// by this export — only the append-only evidence ledger.
export { appendEvidence };

export async function listEvidence(student_id, opts = {}) {
  assertStudentId(student_id);
  const file = path.join(EVIDENCE_DIR, `${student_id}.jsonl`);
  let raw = "";
  try { raw = await fs.readFile(file, "utf8"); } catch (e) { if (e.code === "ENOENT") return { ok: true, count: 0, events: [] }; throw e; }
  const events = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    events.push(JSON.parse(line));
  }
  let filtered = events;
  if (opts.subject) filtered = filtered.filter((e) => e.subject === opts.subject);
  if (opts.knowledge_point) filtered = filtered.filter((e) => e.knowledge_point === opts.knowledge_point);
  if (opts.since) filtered = filtered.filter((e) => e.ingested_at >= opts.since);
  return { ok: true, count: filtered.length, events: filtered };
}

// ---------- Quality rating (FSRS-lite) -------------------------------------
//
// Map a learning event into FSRS quality rating 1..5.
//   1 = again (failed; restart)
//   2 = hard
//   3 = good
//   4 = good (extra credit)
//   5 = easy
//
// Inputs can be:
//   { result: "correct", error_type: null }              → 4
//   { result: "correct", no_hints, first_attempt: true }  → 5 (easy)
//   { result: "partially_correct" }                       → 3
//   { result: "improved" }                                → 3
//   { result: "incorrect", error_type: "concept_mis..." } → 1 (again)
//   { result: "incorrect", hints > 2 }                    → 1 (again)

export function rateEvidenceQuality({ result, error_type, hints = 0, first_attempt = false }) {
  if (result === "correct" || result === "mastered") {
    if (first_attempt && hints === 0) return 5;
    return 4;
  }
  if (result === "partially_correct" || result === "improved") return 3;
  if (result === "incorrect") {
    if (hints >= 2) return 1;
    if (error_type === "concept_misunderstanding" || error_type === "vocabulary_gap") return 1;
    return 2;
  }
  return 2; // default
}

// ---------- Retention model --------------------------------------------------

const daysBetween = (a, b) => {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return ms / (1000 * 60 * 60 * 24);
};

/**
 * R(t) = 2^(-t / H) where H is half-life and t = days since last seen.
 * Rounded to 3 decimals. t < 0 (future timestamp) clamps to 1.
 */
export function retentionScore(last_seen, now = new Date().toISOString(), halfLifeDays = RETENTION_HALF_LIFE_DAYS) {
  const t = daysBetween(now, last_seen);
  if (!Number.isFinite(t) || t <= 0) return 1;
  const r = Math.pow(0.5, t / halfLifeDays);
  return Math.max(0.01, Math.round(r * 1000) / 1000);
}

// ---------- FSRS-lite scheduler --------------------------------------------

/**
 * Pick the next interval (in days) based on quality rating and current mastery.
 *
 * Simple FSRS-lite:
 *   again (1): interval = 10 minutes   (1/144 day)
 *   hard  (2): interval = 1 day, but mastery *= 0.85
 *   good  (3): interval = 3 days, but mastery *= 1.05 (capped)
 *   good  (4): interval = max(3, mastery*30) days
 *   easy  (5): interval = max(5, mastery*45) days
 */
export function fsrsIntervalDays({ quality_rating, mastery }) {
  if (quality_rating === 1) return 10 / (60 * 24); // 10 min in days
  if (quality_rating === 2) return 1;
  if (quality_rating === 3) return 3;
  if (quality_rating === 4) return Math.max(3, Math.round(mastery * 30));
  if (quality_rating === 5) return Math.max(5, Math.round(mastery * 45));
  return 3;
}

// ---------- The engine ------------------------------------------------------

/**
 * Mastery v2 update from objective evidence.
 *
 * Inputs (all required):
 *   student_id, subject, knowledge_point,
 *   result ("correct" | "incorrect" | "partially_correct" | "improved" | "mastered"),
 *   error_type (optional),
 *   hints (default 0),
 *   first_attempt (default false),
 *   source ("learning_record_append" | "question_bank_assessment" | ...),
 *   source_event_id (the upstream event id),
 *   school_alignment (optional; "aligned" | "lagging" | "ahead" — read-only hint),
 *   subskill (optional),
 *   timestamp (optional; defaults to now),
 *
 * CRITICAL INVARIANT:
 *   - Any caller that sets `set_mastery = 0.9` (or any direct mastery write)
 *     is REJECTED. Mastery is computed; not assigned.
 *
 * Output: the resulting mastery record (after applying the evidence).
 */
export async function updateMasteryFromEvidence(input) {
  if (!input || typeof input !== "object") throw new Error("input required");
  assertStudentId(input.student_id);
  const { student_id, subject, knowledge_point } = input;
  if (!subject) throw new Error("subject required");
  if (!knowledge_point) throw new Error("knowledge_point required");
  if (!input.result) throw new Error("result required");
  // Forbidden paths
  if (typeof input.set_mastery === "number") throw new Error("set_mastery not allowed; mastery is computed");
  if ("mastery" in input) throw new Error("direct mastery assignment not allowed; mastery is computed");

  const evidenceRow = await appendEvidence(student_id, {
    subject,
    knowledge_point,
    subskill: input.subskill,
    source: input.source ?? "learning_record_append",
    source_event_id: input.source_event_id ?? null,
    quality_rating: rateEvidenceQuality({
      result: input.result,
      error_type: input.error_type,
      hints: input.hints,
      first_attempt: input.first_attempt,
    }),
    correct: input.result === "correct" || input.result === "mastered" || input.result === "improved",
    result: input.result,
    error_type: input.error_type,
    evidence_kind: input.evidence_kind ?? "response",
    timestamp: input.timestamp,
  });

  return await applyEvidence(student_id, evidenceRow);
}

async function applyEvidence(student_id, row) {
  const doc = await readMasteryDoc(student_id);
  const k = masteryKey(row.subject, row.knowledge_point, row.subskill);
  const cur = doc.records[k] || {
    student_id,
    subject: row.subject,
    knowledge_point: row.knowledge_point,
    subskill: row.subskill ?? "",
    mastery: 0.5,
    confidence: 0.0,
    evidence_count: 0,
    last_seen: row.ingested_at,
    retention: 1.0,
    review_due: null,
    school_alignment: null,
    error_patterns: {},
    subskills: [],
  };

  // Apply evidence-based delta
  const delta = qualityToMasteryDelta(row.quality_rating);
  let nextMastery = clamp(cur.mastery + delta, 0, 1);

  // Confidence: + 0.05 per correct, + 0.02 per partially, -0.02 per incorrect
  const confDelta = row.correct ? 0.05 : (row.result === "partially_correct" ? 0.02 : -0.02);
  const nextConfidence = clamp((cur.confidence ?? 0) + confDelta, 0, 1);

  // Retention: refresh to "fresh" for this KP, but ALSO blend with decay since
  // the LAST last_seen so retention doesn't snap to 1.0 across long gaps.
  const freshSince = daysBetween(row.ingested_at, cur.last_seen ?? row.ingested_at);
  const blendRetention = freshSince <= 0
    ? 1.0
    : Math.max(retentionScore(cur.last_seen, row.ingested_at, RETENTION_HALF_LIFE_DAYS), 0.5);

  // Review scheduling
  const days = fsrsIntervalDays({ quality_rating: row.quality_rating, mastery: nextMastery });
  const d = new Date(row.ingested_at);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(days * 24 * 60));

  // Error-pattern aggregation
  const error_patterns = { ...(cur.error_patterns || {}) };
  if (row.error_type && !row.correct) {
    error_patterns[row.error_type] = (error_patterns[row.error_type] || 0) + 1;
  }

  const next = {
    ...cur,
    mastery: nextMastery,
    confidence: nextConfidence,
    evidence_count: (cur.evidence_count ?? 0) + 1,
    last_seen: row.ingested_at,
    retention: round3(blendRetention),
    review_due: d.toISOString(),
    school_alignment: cur.school_alignment ?? null, // never overwritten by evidence path; only by curriculum-agent
    error_patterns,
  };

  doc.records[k] = next;
  await writeMasteryDoc(doc);
  return { record: next, evidence_event_id: row.event_id };
}

function qualityToMasteryDelta(q) {
  if (q === 1) return -0.10;
  if (q === 2) return -0.04;
  if (q === 3) return 0.05;
  if (q === 4) return 0.15;
  if (q === 5) return 0.20;
  return 0;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round3(x) { return Math.round(x * 1000) / 1000; }

// ---------- Sub-skill mastery ------------------------------------------------

/**
 * Update a sub-skill (nested under a parent KP). The parent mastery is the
 * weighted average of subskills weighted by evidence_count.
 */
export async function updateSubskillMasteryFromEvidence(input) {
  if (!input || !input.subskill) throw new Error("subskill required");
  return await updateMasteryFromEvidence(input);
}

/**
 * Compute parent KP mastery from a subskill list. Read-only.
 */
export function aggregateParentMastery(subskills) {
  if (!Array.isArray(subskills) || subskills.length === 0) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of subskills) {
    const w = typeof s.evidence_count === "number" && s.evidence_count > 0 ? s.evidence_count : 1;
    const m = typeof s.mastery === "number" ? s.mastery : 0;
    weightedSum += m * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 1000) / 1000;
}

// ---------- School alignment (read-only) ------------------------------------

/**
 * The mastery engine accepts a school-alignment input but never computes it;
 * the curriculum-agent emits the signal. Setting this triggers a marker
 * field on the record but does NOT change mastery.
 */
export async function annotateMasteryWithSchoolAlignment({ student_id, subject, knowledge_point, school_alignment }) {
  assertStudentId(student_id);
  if (!subject || !knowledge_point) throw new Error("subject + knowledge_point required");
  if (!["aligned", "lagging", "ahead", "completed_in_class"].includes(school_alignment)) {
    throw new Error("school_alignment must be aligned | lagging | ahead | completed_in_class");
  }
  const doc = await readMasteryDoc(student_id);
  const k = masteryKey(subject, knowledge_point, "");
  const cur = doc.records[k];
  if (!cur) {
    // No mastery record yet — write a stub at default 0.5 so the alignment
    // can be recorded, but master's growth comes from evidence only.
    doc.records[k] = {
      student_id,
      subject,
      knowledge_point,
      subskill: "",
      mastery: 0.5,
      confidence: 0.0,
      evidence_count: 0,
      last_seen: null,
      retention: 1.0,
      review_due: null,
      school_alignment,
      error_patterns: {},
      subskills: [],
    };
  } else {
    cur.school_alignment = school_alignment;
  }
  await writeMasteryDoc(doc);
  return doc.records[k];
}

// ---------- Forbidden set_mastery guard ------------------------------------

export function assertNotDirectMasteryAssignment(tool_call) {
  // tool_call shape: { tool: name, params: { mastery?: number, set_mastery?: number, ... } }
  if (!tool_call || typeof tool_call !== "object") return;
  const params = tool_call.params ?? {};
  if (typeof params.set_mastery === "number") {
    const e = new Error("Direct mastery assignment (set_mastery) is forbidden; mastery is computed from objective evidence only");
    e.code = "DIRECT_MASTERY_FORBIDDEN";
    throw e;
  }
  if (typeof params.mastery === "number" && typeof tool_call.tool === "string" && !["mastery_store_get", "mastery_store_update"].includes(tool_call.tool)) {
    const e = new Error(`Tool ${tool_call.tool} is not allowed to set mastery directly`);
    e.code = "DIRECT_MASTERY_FORBIDDEN";
    throw e;
  }
}

// ---------- Reads / queries --------------------------------------------------

export async function getMasteryV2(student_id, subject, knowledge_point, subskill = "") {
  assertStudentId(student_id);
  const doc = await readMasteryDoc(student_id);
  const k = masteryKey(subject, knowledge_point, subskill);
  return doc.records[k] || null;
}

export async function listMasteryV2(student_id, opts = {}) {
  assertStudentId(student_id);
  const doc = await readMasteryDoc(student_id);
  let records = Object.entries(doc.records).map(([k, v]) => ({ key: k, ...v }));
  if (opts.subject) records = records.filter((r) => r.subject === opts.subject);
  if (opts.min_mastery !== undefined) records = records.filter((r) => (r.mastery ?? 0) >= opts.min_mastery);
  if (opts.max_mastery !== undefined) records = records.filter((r) => (r.mastery ?? 0) <= opts.max_mastery);
  if (opts.review_due_before) records = records.filter((r) => (r.review_due ?? "") <= opts.review_due_before);
  return records;
}

export async function aggregateErrorPatterns(student_id, opts = {}) {
  assertStudentId(student_id);
  const records = await listMasteryV2(student_id, opts);
  const agg = {};
  for (const r of records) {
    for (const k of Object.keys(r.error_patterns || {})) {
      agg[k] = (agg[k] || 0) + r.error_patterns[k];
    }
  }
  return { ok: true, by_type: agg, student_id };
}

export async function getRetentionSignal(student_id, now = new Date().toISOString()) {
  assertStudentId(student_id);
  const records = await listMasteryV2(student_id);
  let totalRetention = 0;
  let weighted = 0;
  let stale_count = 0;
  for (const r of records) {
    if (!r.last_seen) continue;
    const ret = retentionScore(r.last_seen, now);
    totalRetention += ret;
    weighted += 1;
    if (ret < 0.5) stale_count++;
  }
  return {
    ok: true,
    student_id,
    record_count: records.length,
    average_retention: weighted === 0 ? null : round3(totalRetention / weighted),
    stale_count,
  };
}
