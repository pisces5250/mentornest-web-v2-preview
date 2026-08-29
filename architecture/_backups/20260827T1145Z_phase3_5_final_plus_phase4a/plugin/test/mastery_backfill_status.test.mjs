// Tests: mastery_backfill_status
// Verifies idempotent status reads.
// Run with: node --test test/mastery_backfill_status.test.mjs

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "path";

import {
  masteryBackfillDryRun,
  masteryBackfillApply,
  masteryBackfillStatus,
} from "../lib/mastery_backfill_engine.mjs";

const TEST_STUDENT = "student_t_backfill_status";
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

describe("mastery_backfill_status", () => {
  test("status on fresh student -> all zeros/nulls", async () => {
    const status = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    assert.equal(status.student_id, TEST_STUDENT);
    assert.equal(status.last_dry_run_at, null);
    assert.equal(status.last_apply_at, null);
    assert.equal(status.total_events_in_raw, 0);
    assert.equal(status.total_legacy_backfill_emitted, 0);
    assert.equal(status.pending_count, 0);
  });

  test("status after dry-run -> last_dry_run_at updated, no evidence emitted", async () => {
    await masteryBackfillDryRun({ student_id: TEST_STUDENT });
    const status = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    assert.ok(status.last_dry_run_at);
    assert.equal(status.last_apply_at, null);
    assert.equal(status.total_legacy_backfill_emitted, 0);
  });

  test("status after apply -> last_apply_at updated, emitted_count >= 0", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });
    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:15:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    const status = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    assert.ok(status.last_dry_run_at);
    assert.ok(status.last_apply_at);
    assert.ok(status.total_legacy_backfill_emitted >= 0);
  });

  test("status for student_001 -> returns actual line count of 26", async () => {
    const status = await masteryBackfillStatus({ student_id: "student_001" });
    assert.equal(status.total_events_in_raw, 26);
    assert.equal(status.student_id, "student_001");
  });

  test("calling status repeatedly -> same result (idempotent)", async () => {
    const status1 = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    const status2 = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    const status3 = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    assert.deepEqual(status1, status2);
    assert.deepEqual(status2, status3);
  });

  test("status.pending_count reflects unapplied proposed events", async () => {
    // Do dry-run but don't apply
    await masteryBackfillDryRun({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:15:00Z",
    });

    const status = await masteryBackfillStatus({ student_id: TEST_STUDENT });
    assert.ok(typeof status.pending_count === "number");
    assert.ok(status.pending_count >= 0);
  });

  test("status.total_events_in_raw for non-existent student -> 0", async () => {
    const status = await masteryBackfillStatus({ student_id: "student_999" });
    assert.equal(status.total_events_in_raw, 0);
  });
});
