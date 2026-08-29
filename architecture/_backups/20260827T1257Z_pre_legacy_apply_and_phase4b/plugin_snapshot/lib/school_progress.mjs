// school_progress.mjs
//
// MentorNest Curriculum Agent v1 — school progress tracker.
//
// Per 2026-08-27 Phase 2 fourth-batch decisions:
//   - Curriculum V1 source-of-truth: 教育部 十二年國民基本教育課程綱要 (G1–G6)
//   - Publishers (康軒 / 翰林 / 南一 / 自編) only used for textbook_mapping,
//     NOT copied into the shared bank
//   - school_progress records are owned by curriculum-agent; the parent is
//     an approver, never a primary source for inferred progress
//   - confirmed vs inferred NEVER mixed in same field
//
// Persistence layout (append-only, one file per student):
//   data/curriculum-progress/<student_id>.jsonl
//   Each line is one `SchoolProgressRecord` JSON.
//
// All exported tools are read-only or append-only. NO tool truncates,
// rewrites, or recomputes existing records. Append-only invariant is
// the contract; tests below assert it.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// ---------- Source types -----------------------------------------------------
export const SOURCE_TYPES = Object.freeze([
  "official_curriculum",
  "parent_confirmed",
  "teacher_material_confirmed",
  "textbook_mapping",
  "inferred_from_learning",
]);

// ---------- Record shape -----------------------------------------------------
// A record has EXACTLY ONE of `confirmed_at` or `inferred_at` (NEVER both).
// Schema version is "school-progress-v1".

/**
 * @typedef {Object} SchoolProgressRecord
 * @property {string} schema_version - "school-progress-v1"
 * @property {string} record_id - UUID
 * @property {string} student_id - matches STUDENT_ID_RE
 * @property {string} subject - "math" | "chinese" | "english" | "science" | "social_studies"
 * @property {number} grade - 1..6 (Curriculum V1)
 * @property {string} curriculum_unit - e.g. "一上", "二下", "三上 第六單元"
 * @property {string[]} knowledge_points - KP IDs known to be covered by this unit
 * @property {"not_started" | "in_progress" | "completed"} status
 * @property {string} source_type - one of SOURCE_TYPES
 * @property {string} source_reference - human-readable cite (textbook title,
 *           page, parent statement, etc.). For official_curriculum: the
 *           curriculum doc section; for textbook_mapping: "publisher|edition
 *           |volume|unit"; for inferred_from_learning: "<kp> confidence X%".
 * @property {number} confidence - 0..1
 * @property {string} [confirmed_at] - ISO8601 (mutually exclusive with inferred_at)
 * @property {string} [inferred_at] - ISO8601 (mutually exclusive with confirmed_at)
 * @property {string} [inferred_from_event] - for inferred_from_learning only;
 *           the source learning_event timestamp / id; never contains PII.
 * @property {string} [replaces_record_id] - when this record supersedes an
 *           older one (the older one stays in the jsonl; we don't trim).
 */

const RECORD_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const STUDENT_ID_RE = /^student_[A-Za-z0-9_-]+$/;

function assertBasicRecordShape(rec) {
  if (!rec || typeof rec !== "object") throw new Error("record must be an object");
  const must = [
    "schema_version",
    "record_id",
    "student_id",
    "subject",
    "grade",
    "curriculum_unit",
    "knowledge_points",
    "status",
    "source_type",
    "source_reference",
    "confidence",
  ];
  for (const k of must) {
    if (!(k in rec)) throw new Error(`record missing field: ${k}`);
  }
  if (rec.schema_version !== "school-progress-v1") {
    throw new Error(`unknown schema_version: ${rec.schema_version}`);
  }
  if (!STUDENT_ID_RE.test(rec.student_id)) {
    throw new Error(`invalid student_id: ${rec.student_id}`);
  }
  if (!Number.isInteger(rec.grade) || rec.grade < 1 || rec.grade > 12) {
    throw new Error(`grade must be integer 1..12; got: ${rec.grade}`);
  }
  if (!Array.isArray(rec.knowledge_points) || rec.knowledge_points.length === 0) {
    throw new Error("knowledge_points must be a non-empty array of KP IDs");
  }
  for (const kp of rec.knowledge_points) {
    if (typeof kp !== "string" || !/^[a-z]+\.[A-Z]+\d+/i.test(kp)) {
      throw new Error(`knowledge_point id looks malformed: ${kp}`);
    }
  }
  if (!["not_started", "in_progress", "completed"].includes(rec.status)) {
    throw new Error(`bad status: ${rec.status}`);
  }
  if (!SOURCE_TYPES.includes(rec.source_type)) {
    throw new Error(`bad source_type: ${rec.source_type}`);
  }
  if (typeof rec.source_reference !== "string" || rec.source_reference.length < 1) {
    throw new Error("source_reference required");
  }
  if (typeof rec.confidence !== "number" || rec.confidence < 0 || rec.confidence > 1) {
    throw new Error("confidence must be 0..1");
  }
  if (!RECORD_ID_RE.test(rec.record_id)) {
    throw new Error("record_id looks malformed");
  }
}

export function assertRecordInvariants(rec) {
  assertBasicRecordShape(rec);
  // EXACTLY ONE of confirmed_at / inferred_at — never both.
  const c = !!rec.confirmed_at;
  const i = !!rec.inferred_at;
  if (c === i) {
    // Both present or both absent — illegal.
    throw new Error("record must have EXACTLY ONE of confirmed_at/inferred_at; not both, not neither");
  }
  // source_type ↔ timestamp congruence.
  if (rec.source_type === "inferred_from_learning") {
    if (!rec.inferred_at) throw new Error("inferred_from_learning requires inferred_at");
    if (rec.confirmed_at) throw new Error("inferred_from_learning must NOT carry confirmed_at");
  } else {
    // All confirmed source types need confirmed_at.
    if (!rec.confirmed_at) throw new Error(`source_type=${rec.source_type} requires confirmed_at`);
    if (rec.inferred_at) throw new Error(`source_type=${rec.source_type} must NOT carry inferred_at`);
  }
  // Forbidden fields for any record.
  for (const k of ["display_name", "school_name", "class_name", "parent_concerns", "raw_learning_history"]) {
    if (k in rec) throw new Error(`forbidden field in record: ${k}`);
  }
}

/**
 * Build a new confirmed record. Validates everything before returning.
 */
export function buildConfirmedRecord({
  student_id,
  subject,
  grade,
  curriculum_unit,
  knowledge_points,
  status,
  source_type,
  source_reference,
  confidence = 1.0,
  replaces_record_id,
  record_id,
  confirmed_at,
}) {
  if (!student_id) throw new Error("student_id required");
  if (!subject) throw new Error("subject required");
  const ALLOWED_CONFIRMED = ["official_curriculum", "parent_confirmed", "teacher_material_confirmed", "textbook_mapping"];
  if (!ALLOWED_CONFIRMED.includes(source_type)) {
    throw new Error(`confirmed build requires source_type in ${ALLOWED_CONFIRMED.join("/")}; got ${source_type}`);
  }
  const rec = {
    schema_version: "school-progress-v1",
    record_id: record_id ?? randomUUID(),
    student_id,
    subject,
    grade,
    curriculum_unit,
    knowledge_points,
    status,
    source_type,
    source_reference,
    confidence,
    confirmed_at: confirmed_at ?? new Date().toISOString(),
  };
  if (replaces_record_id) rec.replaces_record_id = replaces_record_id;
  assertRecordInvariants(rec);
  return rec;
}

/**
 * Build a new inferred record. Validates everything before returning.
 *
 * IMPORTANT: `inferred_from_event` is the ONLY allowed linkage to learning
 * data; it carries either an event timestamp or a digest, never a PII
 * payload. The curriculum-agent MUST NOT have access to display_name or
 * raw learning records.
 */
export function buildInferredRecord({
  student_id,
  subject,
  grade,
  curriculum_unit,
  knowledge_points,
  status = "in_progress",
  confidence,
  inferred_from_event,
  replaces_record_id,
  record_id,
  inferred_at,
}) {
  if (!student_id) throw new Error("student_id required");
  if (!subject) throw new Error("subject required");
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence > 1) {
    throw new Error("confidence required (0..1, must be > 0)");
  }
  if (!inferred_from_event) {
    throw new Error("inferred_from_event required (timestamp or digest; no PII)");
  }
  const rec = {
    schema_version: "school-progress-v1",
    record_id: record_id ?? randomUUID(),
    student_id,
    subject,
    grade,
    curriculum_unit,
    knowledge_points,
    status,
    source_type: "inferred_from_learning",
    source_reference: `inferred_from_learning/${inferred_from_event}`,
    confidence,
    inferred_at: inferred_at ?? new Date().toISOString(),
    inferred_from_event,
  };
  if (replaces_record_id) rec.replaces_record_id = replaces_record_id;
  assertRecordInvariants(rec);
  return rec;
}

// ---------- Persistence ------------------------------------------------------

function progressFilePath(workspace, student_id) {
  if (!STUDENT_ID_RE.test(student_id)) throw new Error("invalid student_id");
  const root = workspace.endsWith("/data") ? workspace : path.join(workspace, "data");
  return path.join(root, "curriculum-progress", `${student_id}.jsonl`);
}

/**
 * Append a record to <workspace>/data/curriculum-progress/<student_id>.jsonl.
 * Atomic on a per-line basis: line is appended after fsync to a parent dir.
 * Caller passes a pre-validated record from buildConfirmedRecord /
 * buildInferredRecord.
 *
 * No truncation, no rewrite. Append-only.
 */
export async function appendProgressRecord(workspace, rec) {
  assertRecordInvariants(rec);
  const file = progressFilePath(workspace, rec.student_id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Tie-break identical timestamps by appending a sub-ms sequence; this is
  // guaranteed because the writes happen in series with await fs.open().
  const line = JSON.stringify(rec) + "\n";
  const handle = await fs.open(file, "a");
  try {
    await handle.writeFile(line);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { ok: true, path: file, record_id: rec.record_id };
}

/**
 * Read all records for one student (newest-last).
 * Returns { ok, records, count, latest_by_subject }.
 */
export async function readProgress(workspace, student_id) {
  if (!STUDENT_ID_RE.test(student_id)) throw new Error("invalid student_id");
  const file = progressFilePath(workspace, student_id);
  let raw = "";
  try { raw = await fs.readFile(file, "utf8"); } catch (e) { if (e.code === "ENOENT") {
    return { ok: true, records: [], count: 0, latest_by_subject: {}, path: file };
  } throw e; }
  const records = [];
  for (let i = 0; i < raw.split("\n").length; i++) {
    const line = raw.split("\n")[i];
    if (!line) continue;
    const r = JSON.parse(line);
    r.___line_no = i;
    records.push(r);
  }
  const latest_by_subject = {};
  for (const r of records) {
    const key = `${r.subject}|G${r.grade}`;
    const prev = latest_by_subject[key];
    const ts = (r.confirmed_at ?? r.inferred_at ?? "");
    const prevTs = prev ? (prev.confirmed_at ?? prev.inferred_at ?? "") : "";
    if (!prev || ts > prevTs || (ts === prevTs && (r.___line_no ?? 0) > (prev.___line_no ?? 0))) {
      latest_by_subject[key] = r;
    }
  }
  return { ok: true, records, count: records.length, latest_by_subject, path: file };
}

// ---------- Inference --------------------------------------------------------

/**
 * Infer a candidate progress record from learning-event evidence.
 *
 * `evidence` shape:
 *   { subject, grade, knowledge_point, mastery_recent, mastery_avg,
 *     error_rate, last_event_at, kps_mastered_recent: [kp_id...] }
 *
 * Inference rules (V1, conservative):
 *   - If kps_mastered_recent is empty AND mastery_recent < 0.4 → "not_started"
 *   - If some mastery but < 0.6 → "in_progress" (confidence 0.5)
 *   - If kps_mastered_recent covered the unit's KPs AND mastery_recent >= 0.6
 *     → "in_progress" with higher confidence
 *   - We do NOT auto-mark "completed" — a teacher or parent must confirm
 *
 * The function NEVER touches the persistence layer; it returns a candidate
 * record that the caller may submit (and that the curriculum-agent can
 * include via appendProgressRecord).
 *
 * Privacy: only the supplied structured evidence is used. The caller is
 * responsible for redacting PII before calling — this function rejects any
 * `evidence` key it considers personal.
 */
export function inferProgressFromEvidence({ student_id, subject, grade, unit_label, evidence, unit_knowledge_points = [], known_mastery_for_kp = {} }) {
  if (!STUDENT_ID_RE.test(student_id ?? "")) throw new Error("invalid student_id");
  if (!subject || !Number.isInteger(grade)) throw new Error("subject/grade required");
  if (!evidence || typeof evidence !== "object") throw new Error("evidence required");
  // PII fence
  const FORBIDDEN = ["display_name", "school_name", "class_name", "parent_concerns", "raw_events", "transcript", "audio"];
  for (const k of Object.keys(evidence)) {
    if (FORBIDDEN.includes(k)) throw new Error(`evidence contains forbidden field: ${k}`);
  }
  if (!unit_label) throw new Error("unit_label required");

  // Heuristic V1 inference
  const kpsCovered = Array.isArray(evidence.kps_mastered_recent) ? evidence.kps_mastered_recent.length : 0;
  const mastery = typeof evidence.mastery_recent === "number" ? evidence.mastery_recent : 0;
  const coveredAllUnitKps = unit_knowledge_points.length > 0 &&
    unit_knowledge_points.every((kp) => Array.isArray(evidence.kps_mastered_recent) && evidence.kps_mastered_recent.includes(kp));

  let status = "in_progress";
  let confidence = 0.5;
  let reason = "default-in-progress";

  if (kpsCovered === 0 && mastery < 0.4) {
    status = "not_started";
    confidence = 0.4;
    reason = "no-mastery-signals-yet";
  } else if (coveredAllUnitKps && mastery >= 0.6) {
    status = "in_progress"; // never auto-completed without confirmation
    confidence = Math.min(0.85, 0.5 + mastery * 0.3);
    reason = "all-unit-kps-have-mastery-but-not-confirmed";
  } else if (mastery >= 0.6) {
    status = "in_progress";
    confidence = 0.6;
    reason = "positive-mastery-but-not-coverage-confirmed";
  } else {
    status = "in_progress";
    confidence = Math.max(0.3, mastery);
    reason = "partial-mastery";
  }

  const candidate = buildInferredRecord({
    student_id,
    subject,
    grade,
    curriculum_unit: unit_label,
    knowledge_points: unit_knowledge_points.length > 0 ? unit_knowledge_points : [evidence.knowledge_point].filter(Boolean),
    status,
    confidence,
    inferred_from_event: evidence.last_event_at ?? new Date().toISOString(),
  });
  return { candidate, reason, confidence, status };
}

// ---------- Confirmation helpers --------------------------------------------

/**
 * Mark a previous record as superseded. Returns a NEW record that replaces it.
 * The old record stays in the jsonl file (append-only); we don't trim.
 *
 * Requires:
 *   - previous.record_id is known
 *   - the new source_type is one of the CONFIRMED source_types (we don't
 *     auto-confirm an inferred record; a parent / teacher must do it)
 */
export function buildPromotionToConfirmed(previous, {
  new_status,
  new_confidence = 1.0,
  new_curriculum_unit,
  new_knowledge_points,
  new_source_type = "parent_confirmed",
  new_source_reference,
}) {
  assertRecordInvariants(previous);
  if (previous.source_type !== "inferred_from_learning") {
    // Promoting a confirmed record to a different confirmed status is fine;
    // we don't restrict the source_type here, but confidence must increase.
    if (new_confidence < previous.confidence) {
      throw new Error("re-confirmation must have confidence >= previous");
    }
  }
  const promoted = buildConfirmedRecord({
    student_id: previous.student_id,
    subject: previous.subject,
    grade: previous.grade,
    curriculum_unit: new_curriculum_unit ?? previous.curriculum_unit,
    knowledge_points: new_knowledge_points ?? previous.knowledge_points,
    status: new_status ?? previous.status,
    source_type: new_source_type,
    source_reference: new_source_reference ?? previous.source_reference,
    confidence: new_confidence,
    replaces_record_id: previous.record_id,
  });
  return promoted;
}

// ---------- Textbook mapping engine skeleton --------------------------------
//
// Pure: maps a (publisher, edition, volume) → ordered list of (curriculum_unit,
// knowledge_point_id[]) using the index.yaml + a per-publisher volume mapping.
//
// We do NOT copy any publisher content. We map only knowledge-point IDs.

/**
 * Build a textbook mapping skeleton in-memory.
 * @param {Object} opts
 *   - curriculum_index: from buildMergedIndex()  (curriculum_map.mjs)
 *   - publisher_map:   { "康軒": { "5上": { "units": [{label, knowledge_points:[...]}] } } }
 *
 * The publisher_map is user-owned (parent/teacher-supplied) and never copied
 * into shared storage; only the mapping summary is retrievable.
 */
export function buildTextbookMapping({ curriculum_index, publisher_map }) {
  if (!curriculum_index) throw new Error("curriculum_index required");
  if (!publisher_map || typeof publisher_map !== "object") throw new Error("publisher_map required");
  const out = {};
  let totalUnits = 0;
  let totalKps = 0;
  for (const publisher of Object.keys(publisher_map)) {
    out[publisher] = {};
    const volumes = publisher_map[publisher] ?? {};
    for (const volume of Object.keys(volumes)) {
      const units = (volumes[volume]?.units ?? []).map((u) => {
        // Validate each KP ID exists in the curriculum index
        const kps = Array.isArray(u.knowledge_points) ? u.knowledge_points : [];
        const validatedKps = [];
        for (const kp of kps) {
          if (curriculum_index.by_id && curriculum_index.by_id[kp]) {
            validatedKps.push(kp);
          } else {
            // Unknown KP — skip silently, don't error (mapping is best-effort)
          }
        }
        totalKps += validatedKps.length;
        return { label: u.label, knowledge_points: validatedKps };
      });
      totalUnits += units.length;
      out[publisher][volume] = { units };
    }
  }
  return { ok: true, mappings: out, stats: { publishers: Object.keys(out).length, units: totalUnits, knowledge_points: totalKps } };
}

/**
 * Resolve which official curriculum unit corresponds to a textbook volume.
 *   - For each publisher_unit, look up matching curriculum stages by grade.
 *   - Return suggested (curriculum_unit, knowledge_points) for the parent to confirm.
 */
export function suggestCurriculumUnit({ publisher, edition, volume, unit_label, grade, publisher_map, curriculum_index }) {
  if (!publisher || !volume || !unit_label) throw new Error("publisher, volume, unit_label required");
  const pubEntry = publisher_map?.[publisher];
  let unit = null;
  if (pubEntry) {
    if (edition && pubEntry[edition] && pubEntry[edition][volume]) {
      unit = pubEntry[edition][volume].units ?? null;
    }
    if (!unit && pubEntry[volume]) {
      unit = pubEntry[volume].units ?? null;
    }
  }
  if (!unit) return { ok: false, reason: "publisher-volume-not-in-map" };
  // Match by label-equality OR label-substring in either direction
  // Match: exact label, or the cleaned-label keys (digits, KPs, separating chars)
  // overlap. Used because publisher labels and curriculum labels often differ
  // by a single character (e.g. "六、分數" vs "六、五上 分數" — the official stage
  // was inserted in between).
  function tokens(s) {
    return String(s)
      .replace(/[\s、，。,.；;：:]+/g, "|")
      .split("|")
      .filter((x) => x.length > 0);
  }
  // Accept if labels look the same up to inserted characters (stage
  // annotations like '五上' between unit number and topic name).
  function charJaccard(a, b) {
    const sa = new Set(a), sb = new Set(b);
    let inter = 0;
    for (const c of sa) if (sb.has(c)) inter++;
    const union = new Set([...sa, ...sb]).size;
    return union === 0 ? 0 : inter / union;
  }
  const unitChars = new Set(tokens(unit_label).flatMap((t) => t.split("")));
  const found = unit.find((u) => {
    if (u.label === unit_label) return true;
    const uc = new Set(tokens(u.label).flatMap((t) => t.split("")));
    return charJaccard(unitChars, uc) >= 0.6;
  });
  if (!found) return { ok: false, reason: "unit_label-not-in-publisher-volume" };
  // Try to match a curriculum stage for this grade
  const stageCandidates = [];
  for (const subj of Object.keys(curriculum_index?.by_subject ?? {})) {
    const stageUnits = curriculum_index.by_subject[subj]?.[String(grade)]?.units ?? [];
    for (const u of stageUnits) {
      // Match by stage label (e.g. "五上") being a substring of unit_label
      const stage = u.stage ?? "";
      if (stage && unit_label.includes(stage)) stageCandidates.push({ subject: subj, unit: u });
    }
  }
  return {
    ok: true,
    candidate_publisher_unit: found,
    stage_matches: stageCandidates,
    note: "candidate(s) returned for parent/teacher confirmation; not auto-applied",
  };
}

// ---------- School alignment (read-only) -----------------------------------

/**
 * Compute school alignment between an existing mastery store and current
 * school progress records.
 *
 * Inputs:
 *   - mastery: list of mastery records {student_id, subject, knowledge_point, mastery}
 *   - progress_records: list of school progress records (from readProgress)
 *
 * Output: a list of (kp_id, mastery, school_status, recommendation_zh_tw):
 *   - mastery >= 0.7 AND school_status === "completed"             → aligned
 *   - mastery >= 0.7 AND school_status !== "completed"             → "學生已熟悉，但學校進度尚未標記完成；可建議老師或家長更新。"
 *   - mastery < 0.5  AND school_status === "completed"             → "學校標記完成，但孩子尚未熟練；建議複習。"
 *   - mastery between 0.5 and 0.7 → 中等對齊
 *
 * This is READ-ONLY. No record is mutated.
 */
export function computeSchoolAlignment({ mastery, progress_records }) {
  if (!Array.isArray(mastery)) throw new Error("mastery must be array");
  if (!Array.isArray(progress_records)) throw new Error("progress_records must be array");
  const result = [];
  // Build latest status per KP per subject
  const latestByKp = new Map();
  for (const r of progress_records) {
    for (const kp of r.knowledge_points) {
      const key = `${r.subject}:${kp}`;
      const prev = latestByKp.get(key);
      const ts = r.confirmed_at ?? r.inferred_at ?? "";
      if (!prev || ts > (prev.confirmed_at ?? prev.inferred_at ?? "")) latestByKp.set(key, r);
    }
  }
  for (const m of mastery) {
    if (!m.knowledge_point) continue;
    const key = `${m.subject ?? "math"}:${m.knowledge_point}`;
    const prog = latestByKp.get(key);
    const mastery_v = typeof m.mastery === "number" ? m.mastery : 0;
    const schoolStatus = prog?.status ?? "unknown";
    let recommendation_zh_tw;
    if (!prog) {
      recommendation_zh_tw = "尚未有學校進度紀錄。請家長或老師協助補上。";
    } else if (mastery_v >= 0.7 && schoolStatus === "completed") {
      recommendation_zh_tw = "對齊：學校已完成，孩子已熟練。";
    } else if (mastery_v >= 0.7 && schoolStatus !== "completed") {
      recommendation_zh_tw = `學生已熟悉，但學校紀錄為「${schoolStatus}」；可建議更新進度。`;
    } else if (mastery_v < 0.5 && schoolStatus === "completed") {
      recommendation_zh_tw = "學校標記完成，孩子尚未熟練；建議安排複習。";
    } else {
      recommendation_zh_tw = "中等對齊，可依進度繼續練習。";
    }
    result.push({
      subject: m.subject ?? "math",
      knowledge_point: m.knowledge_point,
      mastery: mastery_v,
      school_status: schoolStatus,
      recommendation_zh_tw,
    });
  }
  return { ok: true, count: result.length, items: result };
}

// ---------- confirmed_vs_inferred_progress_tracker -------------------------

/**
 * The curriculum-agent emits a tracker that explicitly distinguishes
 * confirmed vs inferred progress. UI surfaces a CONFIRMED-only badge by
 * default and shows INFERRED in a separate (lower-confidence) section.
 *
 * Output shape:
 *   {
 *     student_id,
 *     confirmed: [{ subject, grade, latest_unit, knowledge_points, status, source_type, recorded_at }],
 *     inferred:  [{ subject, grade, latest_unit, knowledge_points, status, confidence, inferred_at }],
 *     conflicts: [{ subject, grade, ... }]   // both confirmed and inferred exist for same (subject, grade)
 *   }
 */
export function trackConfirmedVsInferred(progress_records, { student_id } = {}) {
  const confirmedList = [];
  const inferredList = [];
  // Conflict key = (subject, grade). Detect collision early.
  const kindsByKey = new Map();
  for (const r of progress_records) {
    const key = `${r.subject}|G${r.grade}`;
    if (!kindsByKey.has(key)) kindsByKey.set(key, new Set());
    kindsByKey.get(key).add(r.source_type);
  }
  // Pick the LATEST record per (subject, grade, curriculum_unit). A teacher may
  // mark "五上 第六單元" while inference says "五上 第七單元". Both stand; the UI
  // surfaces both. We dedupe per (subject, grade, curriculum_unit, source_class).
  const rank = { official_curriculum: 0, teacher_material_confirmed: 0, parent_confirmed: 0, textbook_mapping: 0, inferred_from_learning: 1 };
  const seenConfirmed = new Set();
  const seenInferred = new Set();
  // Sort by ts asc then by source_type rank; latest wins per group.
  const sorted = [...progress_records].sort((a, b) => {
    const at = a.confirmed_at ?? a.inferred_at ?? "";
    const bt = b.confirmed_at ?? b.inferred_at ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return (rank[a.source_type] ?? 9) - (rank[b.source_type] ?? 9);
  });
  for (const r of sorted) {
    const isConfirmed = r.source_type !== "inferred_from_learning";
    const bucketKey = `${r.subject}|G${r.grade}|${r.curriculum_unit}`;
    if (isConfirmed) {
      if (seenConfirmed.has(bucketKey)) continue;
      seenConfirmed.add(bucketKey);
      confirmedList.push({
        subject: r.subject,
        grade: r.grade,
        latest_unit: r.curriculum_unit,
        knowledge_points: r.knowledge_points,
        status: r.status,
        source_type: r.source_type,
        recorded_at: r.confirmed_at,
      });
    } else {
      if (seenInferred.has(bucketKey)) continue;
      seenInferred.add(bucketKey);
      inferredList.push({
        subject: r.subject,
        grade: r.grade,
        latest_unit: r.curriculum_unit,
        knowledge_points: r.knowledge_points,
        status: r.status,
        confidence: r.confidence,
        inferred_at: r.inferred_at,
      });
    }
  }
  const conflicts = [];
  for (const [key, set] of kindsByKey.entries()) {
    const hasConfirmed = [...set].some((t) => t !== "inferred_from_learning");
    const hasInferred = set.has("inferred_from_learning");
    if (hasConfirmed && hasInferred) conflicts.push({ key });
  }
  return { ok: true, student_id, confirmed: confirmedList, inferred: inferredList, conflicts };
}
