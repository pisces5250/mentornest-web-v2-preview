// Tests: mastery_backfill_rollback
// Verifies that rollback removes/invalidates only evidence tagged with the
// specific dry_run_report_id, leaving raw learning records untouched.
// Run with: node --test test/mastery_backfill_rollback.test.mjs

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "path";

import {
  masteryBackfillDryRun,
  masteryBackfillApply,
  masteryBackfillRollback,
} from "../lib/mastery_backfill_engine.mjs";
import { listEvidence } from "../lib/mastery_engine_v2.mjs";

const TEST_STUDENT = "student_t_backfill_rollback";
const RECORDS_DIR = "/home/node/.openclaw/workspace/data/learning-records";
const EVIDENCE_DIR = "/home/node/.openclaw/workspace/data/mastery-evidence";
const BACKFILL_DIR = "/home/node/.openclaw/workspace/data/mastery-backfill";

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

describe("mastery_backfill_rollback", () => {
  test("rollback invalidates evidence for the specific dry_run_report_id", async () => {
    // Do dry-run on student_001
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });
    assert.ok(dryRun.dry_run_report_id);

    // Apply a small window
    const applyResult = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:38:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    // Rollback
    const rollbackResult = await masteryBackfillRollback({
      student_id: TEST_STUDENT,
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    assert.equal(rollbackResult.dry_run_report_id, dryRun.dry_run_report_id);
    assert.ok(typeof rollbackResult.invalidated_count === "number");
    assert.ok(Array.isArray(rollbackResult.invalidated_evidence_ids));

    // Verify invalidation markers were appended to the ledger
    const afterRollback = await listEvidence(TEST_STUDENT);
    const invalidationMarkers = afterRollback.events.filter(
      (e) => e._invalidated === true && e._dry_run_report_id === dryRun.dry_run_report_id
    );
    assert.equal(invalidationMarkers.length, rollbackResult.invalidated_count);
  });

  test("rollback with unknown dry_run_report_id -> throws", async () => {
    await assert.rejects(
      () =>
        masteryBackfillRollback({
          student_id: TEST_STUDENT,
          dry_run_report_id: "00000000-0000-0000-0000-000000000000",
        }),
      /dry_run_report_id.*not found/i
    );
  });

  test("rollback without dry_run_report_id -> throws", async () => {
    await assert.rejects(
      () =>
        // @ts-ignore
        masteryBackfillRollback({ student_id: TEST_STUDENT }),
      /dry_run_report_id required/i
    );
  });

  test("rollback does NOT modify raw learning records", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });
    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:30:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    // Read raw records (should not exist or be empty for our test student)
    const rawFile = path.join(RECORDS_DIR, `${TEST_STUDENT}.jsonl`);
    let rawContent = "";
    try {
      rawContent = await fs.readFile(rawFile, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }

    // Perform rollback
    await masteryBackfillRollback({
      student_id: TEST_STUDENT,
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    // Raw file must be unchanged
    const rawAfter = await fs.readFile(rawFile, "utf8").catch(() => "");
    assert.equal(rawContent, rawAfter, "raw learning records must not be modified by rollback");
  });

  test("rollback twice on same report -> second is no-op (no error)", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });
    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T08:20:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    await masteryBackfillRollback({
      student_id: TEST_STUDENT,
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    // Second rollback should succeed (rolled-back report has no applied keys left)
    const secondRollback = await masteryBackfillRollback({
      student_id: TEST_STUDENT,
      dry_run_report_id: dryRun.dry_run_report_id,
    });
    assert.equal(secondRollback.invalidated_count, 0);
  });
});
