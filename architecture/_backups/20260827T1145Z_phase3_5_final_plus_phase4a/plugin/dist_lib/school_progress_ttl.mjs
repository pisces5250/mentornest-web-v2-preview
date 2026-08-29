// school_progress_ttl.mjs
//
// Phase 3.5 sub-session D — Curriculum inferred `school_progress` TTL /
// stale lifecycle.
//
// Contract (binding):
//   - TTL = 30 days exactly, configurable via SCHOOL_PROGRESS_INFERRED_TTL_DAYS
//     env var (default 30).
//   - Stale records STAY on disk; only the `status` field flips
//     `inferred → stale`.
//   - Stale records MUST NEVER auto-promote to `confirmed`. The only
//     promotion path is the explicit human-approval tool
//     `school_progress_inferred_promote`.
//   - All exported functions are pure (no I/O) except `sweepStudent`,
//     which delegates I/O to an injected `storage_io` interface to keep
//     the file system out of pure-function tests.
//   - Time handling is deterministic via injected `now_ms` arguments.

import { randomUUID } from "node:crypto";

export const TTL_ENV_VAR = "SCHOOL_PROGRESS_INFERRED_TTL_DAYS";
export const DEFAULT_TTL_DAYS = 30;
export const MS_PER_DAY = 86_400_000;

// Status values we emit. "inferred" and "confirmed" come from the
// upstream school-progress-v1 schema; "stale" is a TTL-only lifecycle
// state added by this module and never written by upstream tools.
export const TTL_STATUSES = Object.freeze(["inferred", "stale", "confirmed"]);

/**
 * @typedef {Object} StorageIo
 * @property {() => Promise<{records: Array<Object>, path: string}>} readStudentRecords
 *   Read all progress records for one student.
 * @property {(records: Array<Object>) => Promise<{ok: true, written: number, path: string}>} writeStudentRecords
 *   Atomically replace the full set of records for one student.
 * @property {() => Promise<string[]>} listStudentIds
 *   List all student ids that have a progress file on disk.
 * @property {(student_id: string) => Promise<boolean>} studentHasRecords
 *   Convenience check (optional). Defaults to listStudentIds if absent.
 */

/**
 * Read TTL configuration from env. Pure-ish (reads process.env only when
 * called). The "read env" step is the only side-effect and is unavoidable;
 * callers who need full purity can pass `ttl_days` directly.
 *
 * @returns {{ ttl_days: number, env_var: string, source: "env" | "default" }}
 */
export function getTtlConfig() {
  const raw = process.env[TTL_ENV_VAR];
  if (raw === undefined || raw === null || raw === "") {
    return { ttl_days: DEFAULT_TTL_DAYS, env_var: TTL_ENV_VAR, source: "default" };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    // Defensive: bad env value falls back to default rather than throwing,
    // because the sweep must remain safe to call from a scheduler.
    return { ttl_days: DEFAULT_TTL_DAYS, env_var: TTL_ENV_VAR, source: "default" };
  }
  return { ttl_days: n, env_var: TTL_ENV_VAR, source: "env" };
}

/**
 * Compute the TTL expiry timestamp for a record.
 *
 * @param {number|string} inferred_at_ms
 *   Either a numeric epoch ms timestamp or an ISO8601 string (parseable by Date).
 * @param {number} ttl_days
 * @param {number} [now_ms]
 *   Unused; kept for symmetry with the rest of the API.
 * @returns {number} expiry epoch ms
 */
export function computeTtlExpiryMs(inferred_at_ms, ttl_days, now_ms) {
  const inferredMs = toEpochMs(inferred_at_ms, "inferred_at_ms");
  if (!Number.isFinite(ttl_days) || !Number.isInteger(ttl_days) || ttl_days < 0) {
    throw new Error(`ttl_days must be a non-negative integer; got ${ttl_days}`);
  }
  // now_ms is accepted but not consulted; expiry is anchored to
  // inferred_at_ms + ttl, not to now. This makes expiry deterministic
  // regardless of when the sweep runs.
  void now_ms;
  return inferredMs + ttl_days * MS_PER_DAY;
}

/**
 * Decide whether a single record is stale RIGHT NOW.
 *
 * Stale iff:
 *   - record.status === "inferred", AND
 *   - now_ms >= computeTtlExpiryMs(record.inferred_at, ttl_days)
 *
 * A "stale" record stays stale forever (never auto-promotes).
 * A "confirmed" record is never stale.
 *
 * @param {Object} record
 * @param {number} now_ms
 * @param {number} ttl_days
 * @returns {boolean}
 */
export function isStale(record, now_ms, ttl_days) {
  if (!record || typeof record !== "object") return false;
  // Only inferred records can become stale. Confirmed records stay
  // confirmed; non-status-bearing records are out of scope.
  if (record.status !== "inferred") return false;
  // No inferred_at → cannot compute expiry; treat as not-stale to be safe.
  if (record.inferred_at === undefined || record.inferred_at === null) return false;
  const expiry = computeTtlExpiryMs(record.inferred_at, ttl_days);
  return now_ms >= expiry;
}

/**
 * Pure transformation: produce a deep-cloned, updated record list and the
 * list of ids that flipped to `stale` during this call. The input array
 * is NEVER mutated.
 *
 * Behaviour:
 *   - Records that are already `stale` or `confirmed` are cloned but not
 *     re-stamped. We do NOT downgrade `stale` back to `inferred`.
 *   - Records that are `inferred` and past their expiry are cloned with
 *     `status: "stale"` added.
 *   - Records that are `inferred` but not yet past expiry are cloned
 *     unchanged.
 *
 * @param {Array<Object>} records
 * @param {number} now_ms
 * @param {number} ttl_days
 * @returns {{ updated_records: Array<Object>, newly_stale_ids: string[] }}
 */
export function markStaleRecords(records, now_ms, ttl_days) {
  if (!Array.isArray(records)) {
    throw new Error("records must be an array");
  }
  if (!Number.isFinite(now_ms)) {
    throw new Error("now_ms must be a finite number");
  }
  if (!Number.isFinite(ttl_days) || !Number.isInteger(ttl_days) || ttl_days < 0) {
    throw new Error("ttl_days must be a non-negative integer");
  }

  const updated_records = [];
  const newly_stale_ids = [];

  for (const rec of records) {
    // Deep clone via JSON round-trip so we never mutate the caller's object.
    const cloned = deepClone(rec);
    if (isStale(cloned, now_ms, ttl_days)) {
      // Flip status to stale. We stamp `stale_at` so the lifecycle
      // is observable in the jsonl, but `status` is the canonical flag.
      cloned.status = "stale";
      cloned.stale_at = new Date(now_ms).toISOString();
      newly_stale_ids.push(cloned.record_id);
    }
    updated_records.push(cloned);
  }

  return { updated_records, newly_stale_ids };
}

/**
 * Sweep one student: read → mark stale → write back iff there were
 * changes. Returns the newly-stale ids plus the total stale count after
 * the sweep and the sweep timestamp.
 *
 * I/O is delegated to the injected `storage_io` interface so unit tests
 * can run against in-memory stores.
 *
 * @param {string} student_id
 * @param {number} now_ms
 * @param {number} ttl_days
 * @param {StorageIo} storage_io
 * @returns {Promise<{ student_id: string, newly_stale_ids: string[], total_stale_count: number, total_inferred: number, total_confirmed: number, swept_at: string }>}
 */
export async function sweepStudent(student_id, now_ms, ttl_days, storage_io) {
  if (!student_id || typeof student_id !== "string") {
    throw new Error("student_id required");
  }
  if (!Number.isFinite(now_ms)) {
    throw new Error("now_ms must be a finite number");
  }
  if (!Number.isFinite(ttl_days) || !Number.isInteger(ttl_days) || ttl_days < 0) {
    throw new Error("ttl_days must be a non-negative integer");
  }
  if (!storage_io || typeof storage_io.readStudentRecords !== "function") {
    throw new Error("storage_io.readStudentRecords required");
  }

  const { records } = await storage_io.readStudentRecords(student_id);
  const beforeStale = records.filter((r) => r.status === "stale").length;
  const beforeInferred = records.filter((r) => r.status === "inferred").length;
  const beforeConfirmed = records.filter((r) => r.status === "confirmed").length;

  const { updated_records, newly_stale_ids } = markStaleRecords(records, now_ms, ttl_days);

  // Only write back if at least one record changed. This keeps the
  // append-only spirit (we still rewrite the whole file, but only when
  // there is something to update) and makes idempotent re-runs a no-op
  // at the I/O level.
  if (newly_stale_ids.length > 0 && typeof storage_io.writeStudentRecords === "function") {
    await storage_io.writeStudentRecords(student_id, updated_records);
  }

  const total_stale_count = updated_records.filter((r) => r.status === "stale").length;
  const total_inferred = updated_records.filter((r) => r.status === "inferred").length;
  // "confirmed" in this schema is determined by source_type. A record with
  // source_type !== "inferred_from_learning" was authored via a confirmed
  // source path (parent_confirmed, official_curriculum, etc.).
  const total_confirmed = updated_records.filter((r) => r.source_type !== "inferred_from_learning").length;

  void beforeStale;
  void beforeInferred;
  void beforeConfirmed;

  return {
    student_id,
    newly_stale_ids,
    total_stale_count,
    total_inferred,
    total_confirmed,
    swept_at: new Date(now_ms).toISOString(),
  };
}

/**
 * Promote ONE inferred OR stale record to confirmed. EXPLICIT human
 * approval only — there is no time- or sweep-based promotion. Refuses
 * if the record is already confirmed.
 *
 * NOTE: This function does NOT write to disk; the caller (the
 * `school_progress_inferred_promote` tool) is responsible for calling
 * the existing `appendProgressRecord` so we get the same append-only
 * semantics as a fresh confirmation.
 *
 * @param {Object} previous_record
 * @param {{ knowledge_point: string, confirmed_by: string, new_source_type?: string, new_source_reference?: string, new_status?: string, new_confidence?: number, now_ms?: number }} opts
 * @returns {Object} new confirmed record
 */
export function buildExplicitPromotion(previous_record, opts) {
  if (!previous_record || typeof previous_record !== "object") {
    throw new Error("previous_record required");
  }
  if (previous_record.status === "confirmed") {
    throw new Error("record is already confirmed; cannot promote again");
  }
  if (!opts || typeof opts !== "object") throw new Error("opts required");
  if (!opts.knowledge_point || typeof opts.knowledge_point !== "string") {
    throw new Error("knowledge_point required");
  }
  if (!opts.confirmed_by || typeof opts.confirmed_by !== "string") {
    throw new Error("confirmed_by required (explicit human approval token)");
  }
  const allowed = new Set(["inferred", "stale"]);
  if (!allowed.has(previous_record.status)) {
    throw new Error(`previous record status must be inferred or stale; got ${previous_record.status}`);
  }
  // The promoted record MUST contain the target knowledge_point.
  const kps = Array.isArray(previous_record.knowledge_points) ? previous_record.knowledge_points : [];
  if (!kps.includes(opts.knowledge_point)) {
    throw new Error(`knowledge_point ${opts.knowledge_point} not in record's knowledge_points`);
  }

  const now_ms = Number.isFinite(opts.now_ms) ? opts.now_ms : Date.now();
  // The promoted record's `status` follows the school-progress-v1 schema
  // ("not_started" | "in_progress" | "completed") — NOT "confirmed". The
  // "confirmed" semantic lives in source_type + confirmed_at. The tool
  // layer translates this into { status: "confirmed" } in its response.
  const defaultStatus =
    previous_record.status === "stale" || previous_record.status === "inferred"
      ? "in_progress"
      : (previous_record.status ?? "in_progress");
  const new_record = {
    schema_version: "school-progress-v1",
    record_id: randomUUID(),
    student_id: previous_record.student_id,
    subject: previous_record.subject,
    grade: previous_record.grade,
    curriculum_unit: previous_record.curriculum_unit,
    knowledge_points: previous_record.knowledge_points,
    status: opts.new_status ?? defaultStatus,
    source_type: opts.new_source_type ?? "parent_confirmed",
    source_reference: opts.new_source_reference ?? `explicit_promotion/${opts.confirmed_by}`,
    confidence: typeof opts.new_confidence === "number" ? opts.new_confidence : 1.0,
    confirmed_at: new Date(now_ms).toISOString(),
    confirmed_by: opts.confirmed_by,
    replaces_record_id: previous_record.record_id,
    prev_progress_status: previous_record.status,
  };
  return new_record;
}

// ---------- helpers ----------------------------------------------------------

function toEpochMs(value, label) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const t = Date.parse(value);
    if (!Number.isFinite(t)) {
      throw new Error(`${label} not parseable as ISO8601 or epoch ms: ${value}`);
    }
    return t;
  }
  throw new Error(`${label} required (epoch ms or ISO8601 string)`);
}

function deepClone(obj) {
  // Structured-clone via JSON is sufficient because every school-progress
  // record is plain JSON (numbers, strings, booleans, arrays, objects).
  return JSON.parse(JSON.stringify(obj));
}
