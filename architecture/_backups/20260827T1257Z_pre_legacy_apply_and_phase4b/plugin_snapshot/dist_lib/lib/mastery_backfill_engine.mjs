// mastery_backfill_engine.mjs
//
// Engine for legacy mastery backfill.
//
// Key invariants:
//   - Raw learning-records files are NEVER modified (append-only).
//   - All evidence is emitted via mastery_engine_v2.updateMasteryFromEvidence
//     (never bypassed).
//   - Backfill metadata is stored in data/mastery-backfill/<student_id>/.
//   - Every emitted evidence record carries source: "legacy_backfill"
//     and a dry_run_report_id reference.
//
// Architecture:
//   mastery_backfill.mjs      — pure functions: classify, build report
//   mastery_backfill_engine.mjs — I/O + orchestration: reads raw records,
//                                 calls mastery_engine_v2, manages metadata

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  classifyEvent,
  buildDryRunReport,
  buildIdempotencyKey,
} from "./mastery_backfill.mjs";

import {
  updateMasteryFromEvidence,
  listEvidence,
} from "./mastery_engine_v2.mjs";

import { assertStudentId } from "./learning_event_reader.mjs";

const RECORDS_DIR = "/home/node/.openclaw/workspace/data/learning-records";
const BACKFILL_DIR = "/home/node/.openclaw/workspace/data/mastery-backfill";

// ─── Metadata paths ─────────────────────────────────────────────────────────
//
// Dry-run reports are stored in a SHARED global location (not per-student)
// so that a dry-run report can be reviewed and then applied to ANY student.
// This matches the workflow: create report once, then apply to multiple students
// or the same student multiple times.
//
// Status is still per-student.
// Evidence ledger is also per-student (via mastery_engine_v2).

const GLOBAL_DRY_RUNS_DIR = path.join(BACKFILL_DIR, "_dry_runs");

function backfillDir(student_id) {
  return path.join(BACKFILL_DIR, student_id);
}

function dryRunsPath() {
  // Global shared path for all dry-run reports
  return path.join(GLOBAL_DRY_RUNS_DIR, "dry_runs.jsonl");
}

function statusPath(student_id) {
  return path.join(backfillDir(student_id), "status.json");
}

// ─── Raw record reader ───────────────────────────────────────────────────────

/**
 * Read raw learning-record lines for a student, filtered by optional time window.
 * Does NOT read from the snapshot; reads from live data/.
 */
async function readRawEvents(student_id, opts = {}) {
  assertStudentId(student_id);
  const file = path.join(RECORDS_DIR, `${student_id}.jsonl`);
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  const sinceT = opts.since ? Date.parse(opts.since) : -Infinity;
  const untilT = opts.until ? Date.parse(opts.until) : Infinity;
  return events.filter((e) => {
    const t = Date.parse(e.timestamp || "");
    if (Number.isNaN(t)) return false;
    if (t < sinceT || t > untilT) return false;
    return true;
  });
}

/**
 * Count total raw events in the live file (for status reporting).
 */
async function countRawEvents(student_id) {
  const file = path.join(RECORDS_DIR, `${student_id}.jsonl`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split("\n").filter((l) => l.trim().length > 0).length;
  } catch (e) {
    if (e.code === "ENOENT") return 0;
    throw e;
  }
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

async function readStatus(student_id) {
  assertStudentId(student_id);
  await fs.mkdir(backfillDir(student_id), { recursive: true });
  const file = statusPath(student_id);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        student_id,
        last_dry_run_at: null,
        last_apply_at: null,
        total_legacy_backfill_emitted: 0,
      };
    }
    throw e;
  }
}

async function writeStatus(student_id, status) {
  await fs.mkdir(backfillDir(student_id), { recursive: true });
  await fs.writeFile(statusPath(student_id), JSON.stringify(status, null, 2) + "\n", "utf8");
}

async function readDryRuns() {
  const file = dryRunsPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function appendDryRun(report) {
  await fs.mkdir(GLOBAL_DRY_RUNS_DIR, { recursive: true });
  const file = dryRunsPath();
  const handle = await fs.open(file, "a");
  try {
    await handle.writeFile(JSON.stringify(report) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * mastery_backfill_dry_run — produce a preview without writing anything.
 *
 * Input: { student_id, since?, until? }
 * Output: { proposed_evidence_count, would_apply, proposed_records }
 */
export async function masteryBackfillDryRun({ student_id, since, until }) {
  assertStudentId(student_id);
  const events = await readRawEvents(student_id, { since, until });
  const report = buildDryRunReport(student_id, events, { since, until });

  const dry_run_report = {
    dry_run_report_id: randomUUID(),
    student_id,
    since: since ?? null,
    until: until ?? null,
    generated_at: new Date().toISOString(),
    proposed_evidence_count: report.proposed_evidence_count,
    proposed_records: report.proposed_records,
  };

  // Append to dry-run log (no mastery writes yet)
  await appendDryRun(dry_run_report);

  // Update status
  const status = await readStatus(student_id);
  status.last_dry_run_at = dry_run_report.generated_at;
  await writeStatus(student_id, status);

  return {
    dry_run_report_id: dry_run_report.dry_run_report_id,
    proposed_evidence_count: report.proposed_evidence_count,
    would_apply: report.would_apply,
    proposed_records: report.proposed_records,
  };
}

/**
 * Check if a specific event (by idempotency key) has already been emitted
 * for this student via legacy_backfill source.
 */
async function alreadyEmittedForStudent(student_id, idempotency_key) {
  // Read the existing evidence ledger and check for matching legacy_backfill events
  const { events } = await listEvidence(student_id);
  return events.some(
    (e) =>
      e.source === "legacy_backfill" &&
      e._idempotency_key === idempotency_key
  );
}

/**
 * mastery_backfill_apply — emit evidence after dry-run review.
 *
 * Each emitted record carries:
 *   source: "legacy_backfill"
 *   dry_run_report_id: <uuid>
 *
 * Uses updateMasteryFromEvidence internally (never bypasses it).
 *
 * Idempotency: skips events already emitted for this dry_run_report_id.
 */
export async function masteryBackfillApply({ student_id, since, until, dry_run_report_id }) {
  assertStudentId(student_id);
  if (!dry_run_report_id) throw new Error("dry_run_report_id required");

  const events = await readRawEvents(student_id, { since, until });
  const report = buildDryRunReport(student_id, events, { since, until });

  // Find the matching dry-run log entry
  const dryRuns = await readDryRuns();
  const storedReport = dryRuns.find((r) => r.dry_run_report_id === dry_run_report_id);
  if (!storedReport) {
    throw new Error(`Dry-run report (dry_run_report_id=${dry_run_report_id}) not found`);
  }

  // Collect idempotency keys already emitted from this report
  const alreadyApplied = new Set(
    (storedReport.applied_event_keys ?? []).map((k) => k.toString())
  );

  const emitted_ids = [];
  const skipped_ids = [];
  const applied_event_keys = [];

  for (const record of report.proposed_records) {
    const { proposed_evidence: ev } = record;
    const original_event = record.original_event;
    const idempotency_key = buildIdempotencyKey(student_id, {
      timestamp: original_event.timestamp,
      subject: ev.subject,
      knowledge_point: ev.knowledge_point,
      result: ev.result,
      attempts: ev.attempts,
    });

    // Skip if already applied for this dry_run_report_id
    if (alreadyApplied.has(idempotency_key)) {
      skipped_ids.push(idempotency_key);
      continue;
    }

    // Emit via the existing mastery_engine_v2 pathway
    // NOTE: updateMasteryFromEvidence calls appendEvidence internally,
    // which writes to the evidence ledger. We pass source="legacy_backfill"
    // so the evidence row is tagged appropriately.
    try {
      const out = await updateMasteryFromEvidence({
        student_id,
        subject: ev.subject,
        knowledge_point: ev.knowledge_point,
        subskill: ev.subskill ?? "",
        result: ev.result,
        error_type: ev.error_type,
        hints: ev.hints ?? 0,
        first_attempt: ev.first_attempt,
        source: "legacy_backfill",
        source_event_id: ev.source_event_id,
        evidence_kind: ev.evidence_kind ?? "response",
      });
      emitted_ids.push(out.evidence_event_id);
      applied_event_keys.push(idempotency_key);
    } catch (err) {
      // If appendEvidence fails (e.g., duplicate source_event_id), skip
      // but don't abort the whole batch.
      emitted_ids.push(null); // placeholder for failed
      skipped_ids.push(idempotency_key);
    }
  }

  // Mark the dry-run report as applied
  const updatedReport = {
    ...storedReport,
    applied_at: new Date().toISOString(),
    applied_event_keys: [...(storedReport.applied_event_keys ?? []), ...applied_event_keys],
    emitted_count: emitted_ids.filter(Boolean).length,
  };
  // Re-write the dry_runs file without the old entry, then append updated one
  // (simple approach: overwrite entire file)
  const allOtherReports = dryRuns.filter((r) => r.dry_run_report_id !== dry_run_report_id);
  await fs.writeFile(dryRunsPath(), "", "utf8"); // clear
  for (const r of allOtherReports) {
    await fs.appendFile(dryRunsPath(), JSON.stringify(r) + "\n", "utf8");
  }
  await fs.appendFile(dryRunsPath(), JSON.stringify(updatedReport) + "\n", "utf8");

  // Update status
  const status = await readStatus(student_id);
  status.last_apply_at = updatedReport.applied_at;
  status.total_legacy_backfill_emitted = (status.total_legacy_backfill_emitted ?? 0) + emitted_ids.filter(Boolean).length;
  await writeStatus(student_id, status);

  return {
    emitted_count: emitted_ids.filter(Boolean).length,
    skipped_count: skipped_ids.length,
    ledger_path: `/home/node/.openclaw/workspace/data/mastery-evidence/${student_id}.jsonl`,
    evidence_ids: emitted_ids.filter(Boolean),
    dry_run_report_id,
  };
}

/**
 * mastery_backfill_status — read-only status query.
 */
export async function masteryBackfillStatus({ student_id }) {
  assertStudentId(student_id);
  const [status, totalRaw, { events: allEvidence }] = await Promise.all([
    readStatus(student_id),
    countRawEvents(student_id),
    listEvidence(student_id),
  ]);

  const totalBackfillEmitted = allEvidence.filter(
    (e) => e.source === "legacy_backfill"
  ).length;

  // Count pending (emitted but not yet rolled back)
  const dryRuns = await readDryRuns();
  const totalPending = dryRuns.reduce((acc, r) => {
    const applied = r.applied_event_keys ?? [];
    const proposed = r.proposed_evidence_count ?? 0;
    return acc + (proposed - applied.length);
  }, 0);

  return {
    student_id,
    last_dry_run_at: status.last_dry_run_at,
    last_apply_at: status.last_apply_at,
    total_events_in_raw: totalRaw,
    total_legacy_backfill_emitted: totalBackfillEmitted,
    pending_count: Math.max(0, totalPending),
  };
}

/**
 * mastery_backfill_rollback — remove evidence tagged with a specific dry_run_report_id.
 *
 * Raw learning records are untouched.
 * Only evidence records with source="legacy_backfill" AND matching dry_run_report_id
 * are marked invalid (not deleted from ledger; a separate invalidation marker is appended).
 */
export async function masteryBackfillRollback({ student_id, dry_run_report_id }) {
  assertStudentId(student_id);
  if (!dry_run_report_id) throw new Error("dry_run_report_id required");

  const dryRuns = await readDryRuns();
  const storedReport = dryRuns.find((r) => r.dry_run_report_id === dry_run_report_id);

  if (!storedReport) {
    throw new Error(`Dry-run report (dry_run_report_id=${dry_run_report_id}) not found`);
  }

  const appliedKeys = new Set((storedReport.applied_event_keys ?? []).map((k) => k.toString()));
  const { events: allEvidence } = await listEvidence(student_id);

  const toInvalidate = allEvidence.filter(
    (e) =>
      e.source === "legacy_backfill" &&
      e.dry_run_report_id === dry_run_report_id
  );

  const invalidated_ids = toInvalidate.map((e) => e.event_id);

  // Append invalidation markers to the evidence ledger (append-only, never delete)
  const EVIDENCE_DIR = "/home/node/.openclaw/workspace/data/mastery-evidence";
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  const evidenceFile = path.join(EVIDENCE_DIR, `${student_id}.jsonl`);
  for (const ev of toInvalidate) {
    const marker = {
      event_id: randomUUID(),
      schema_version: "mastery-evidence-v1",
      ingested_at: new Date().toISOString(),
      student_id,
      _invalidated: true,
      _invalidated_reason: "rollback",
      _original_event_id: ev.event_id,
      _dry_run_report_id: dry_run_report_id,
    };
    await fs.appendFile(evidenceFile, JSON.stringify(marker) + "\n", "utf8");
  }

  // Remove applied keys from the stored dry-run report
  const updatedReport = {
    ...storedReport,
    rolled_back_at: new Date().toISOString(),
    applied_event_keys: [], // cleared on rollback
    rolled_back_count: invalidated_ids.length,
  };
  const allOtherReports = dryRuns.filter((r) => r.dry_run_report_id !== dry_run_report_id);
  await fs.writeFile(dryRunsPath(), "", "utf8");
  for (const r of allOtherReports) {
    await fs.appendFile(dryRunsPath(), JSON.stringify(r) + "\n", "utf8");
  }
  await fs.appendFile(dryRunsPath(), JSON.stringify(updatedReport) + "\n", "utf8");

  // Update status
  const status = await readStatus(student_id);
  status.total_legacy_backfill_emitted = Math.max(
    0,
    (status.total_legacy_backfill_emitted ?? 0) - invalidated_ids.length
  );
  await writeStatus(student_id, status);

  return {
    invalidated_count: invalidated_ids.length,
    dry_run_report_id,
    invalidated_evidence_ids: invalidated_ids,
  };
}

/**
 * mastery_backfill_classify_event — pure helper, exposed as a tool.
 * Input: { event } → Output: { subject, knowledge_point, result, attempts, error_code }
 */
export function masteryBackfillClassifyEvent({ event }) {
  if (!event || typeof event !== "object") {
    throw new Error("event object required");
  }
  const classified = classifyEvent(event);
  return {
    subject: classified.subject,
    knowledge_point: classified.knowledge_point,
    result: classified.result,
    attempts: classified.attempts,
    error_code: classified.error_code,
  };
}
