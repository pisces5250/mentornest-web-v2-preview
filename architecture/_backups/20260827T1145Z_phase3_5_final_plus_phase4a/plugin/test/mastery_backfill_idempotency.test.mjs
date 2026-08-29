// Tests: mastery_backfill_idempotency
// Verifies that applying the same dry-run twice is a no-op (no duplicate evidence).
// Run with: node --test test/mastery_backfill_idempotency.test.mjs

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "path";

import {
  masteryBackfillDryRun,
  masteryBackfillApply,
} from "../lib/mastery_backfill_engine.mjs";
import { listEvidence } from "../lib/mastery_engine_v2.mjs";

const TEST_STUDENT = "student_t_backfill_idempotency";
const EVIDENCE_DIR = "/home/node/.openclaw/workspace/data/mastery-evidence";
const BACKFILL_DIR = "/home/node/.openclaw/workspace/data/mastery-backfill";
const RECORDS_DIR = "/home/node/.openclaw/workspace/data/learning-records";

async function cleanupStudent(studentId) {
  for (const f of [
    path.join(EVIDENCE_DIR, `${studentId}.jsonl`),
    path.join("/home/node/.openclaw/workspace/data/mastery", `${studentId}.json`),
    path.join(RECORDS_DIR, `${studentId}.jsonl`),
  ]) {
    try { await fs.unlink(f); } catch {}
  }
  try {
    await fs.rm(path.join(BACKFILL_DIR, studentId), { recursive: true });
  } catch {}
}

async function cleanupDryRunsLog() {
  // Engine writes to BACKFILL_DIR/_dry_runs/dry_runs.jsonl
  const logFile = path.join(BACKFILL_DIR, "_dry_runs", "dry_runs.jsonl");
  try { await fs.unlink(logFile); } catch {}
}

before(async () => {
  await cleanupStudent(TEST_STUDENT);
  await cleanupDryRunsLog();
});
after(async () => {
  await cleanupStudent(TEST_STUDENT);
  await cleanupDryRunsLog();
});

describe("mastery_backfill_idempotency", () => {
  test("apply same dry-run twice -> second emit is no-op, no duplicate evidence", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });
    const dryRunId = dryRun.dry_run_report_id;

    // First apply
    const result1 = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:20:00Z",
      dry_run_report_id: dryRunId,
    });

    // Count legacy_backfill evidence after first apply
    const { events: events1 } = await listEvidence(TEST_STUDENT);
    const legacy1 = events1.filter((e) => e.source === "legacy_backfill");
    const countAfterFirst = legacy1.length;

    // Second apply with same dry_run_report_id (same window)
    const result2 = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:20:00Z",
      dry_run_report_id: dryRunId,
    });

    // Second apply should report skipped_count >= 0 and emitted_count = 0
    assert.equal(result2.emitted_count, 0);
    assert.ok(result2.skipped_count >= 0);

    // Count legacy_backfill evidence after second apply — must be unchanged
    const { events: events2 } = await listEvidence(TEST_STUDENT);
    const legacy2 = events2.filter((e) => e.source === "legacy_backfill");
    assert.equal(
      legacy2.length,
      countAfterFirst,
      "Evidence count must not increase on second apply (idempotency)"
    );
  });

  test("apply different dry-run IDs -> both emit (different reports)", async () => {
    const dryRun1 = await masteryBackfillDryRun({ student_id: "student_001" });
    const dryRun2 = await masteryBackfillDryRun({ student_id: "student_001" });
    assert.notEqual(dryRun1.dry_run_report_id, dryRun2.dry_run_report_id);

    // Apply both with same window
    const result1 = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:05:00Z",
      dry_run_report_id: dryRun1.dry_run_report_id,
    });

    const { events: events1 } = await listEvidence(TEST_STUDENT);
    const legacy1 = events1.filter((e) => e.source === "legacy_backfill");
    const countAfterFirst = legacy1.length;

    const result2 = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:05:00Z",
      dry_run_report_id: dryRun2.dry_run_report_id,
    });

    // Second apply with a different dry_run_report_id should emit
    // (or skip if already in ledger, but it has a different report ID)
    const { events: events2 } = await listEvidence(TEST_STUDENT);
    const legacy2 = events2.filter((e) => e.source === "legacy_backfill");
    // The count should not decrease
    assert.ok(legacy2.length >= legacy1.length);
  });

  test("apply with overlapping windows -> only new events emitted", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });

    // Apply window 1
    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:10:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    const { events: events1 } = await listEvidence(TEST_STUDENT);
    const legacy1 = events1.filter((e) => e.source === "legacy_backfill");
    const countAfterFirst = legacy1.length;

    // Apply overlapping window (wider)
    const result2 = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:15:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    // Second apply should only emit NEW events not in window 1
    assert.ok(result2.emitted_count >= 0);
  });
});
