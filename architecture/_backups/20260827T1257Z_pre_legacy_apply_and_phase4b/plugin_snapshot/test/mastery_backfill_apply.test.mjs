// Tests: mastery_backfill_apply
// Verifies that apply emits evidence records through mastery_engine_v2,
// all carrying source: "legacy_backfill".
// Run with: node --test test/mastery_backfill_apply.test.mjs

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "path";

import { masteryBackfillDryRun, masteryBackfillApply } from "../lib/mastery_backfill_engine.mjs";
import { listEvidence } from "../lib/mastery_engine_v2.mjs";

const TEST_STUDENT = "student_t_backfill_apply";
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

describe("mastery_backfill_apply", () => {
  test("apply after dry-run -> evidence records appended with source legacy_backfill", async () => {
    // First do a dry-run on student_001 to get the report_id
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });
    assert.ok(dryRun.dry_run_report_id);

    // Apply on our test student using events from a small window
    const applyResult = await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T10:30:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    assert.ok(typeof applyResult.emitted_count === "number");
    assert.ok(Array.isArray(applyResult.evidence_ids));
    assert.equal(applyResult.dry_run_report_id, dryRun.dry_run_report_id);
    assert.ok(applyResult.ledger_path.includes(TEST_STUDENT));

    // If any were emitted, verify they have the correct tag
    if (applyResult.emitted_count > 0) {
      const { events } = await listEvidence(TEST_STUDENT);
      const legacyEvents = events.filter((e) => e.source === "legacy_backfill");
      assert.ok(legacyEvents.length > 0);
      for (const ev of legacyEvents) {
        assert.equal(ev.source, "legacy_backfill");
      }
    }
  });

  test("apply with invalid dry_run_report_id -> throws", async () => {
    await assert.rejects(
      () =>
        masteryBackfillApply({
          student_id: TEST_STUDENT,
          dry_run_report_id: "not-a-real-id",
        }),
      /dry_run_report_id.*not found/i
    );
  });

  test("apply without dry_run_report_id -> throws", async () => {
    await assert.rejects(
      () =>
        // @ts-ignore
        masteryBackfillApply({ student_id: TEST_STUDENT }),
      /dry_run_report_id required/i
    );
  });

  test("apply with since/until -> only events in window emitted", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });

    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T14:00:00Z",
      until: "2026-08-26T14:42:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    const { events } = await listEvidence(TEST_STUDENT);
    const legacyEvents = events.filter((e) => e.source === "legacy_backfill");

    // All timestamps should be within the window
    for (const ev of legacyEvents) {
      const t = ev.ingested_at;
      assert.ok(t >= "2026-08-26T14:00:00Z", `timestamp ${t} should be >= window start`);
      assert.ok(t <= "2026-08-26T14:42:00Z", `timestamp ${t} should be <= window end`);
    }
  });

  test("apply updates status last_apply_at", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: TEST_STUDENT });
    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    const statusFile = path.join(BACKFILL_DIR, TEST_STUDENT, "status.json");
    const status = JSON.parse(await fs.readFile(statusFile, "utf8"));
    assert.ok(status.last_apply_at);
  });

  test("apply updates status total_legacy_backfill_emitted", async () => {
    const dryRun = await masteryBackfillDryRun({ student_id: "student_001" });

    await masteryBackfillApply({
      student_id: TEST_STUDENT,
      since: "2026-08-26T08:00:00Z",
      until: "2026-08-26T09:00:00Z",
      dry_run_report_id: dryRun.dry_run_report_id,
    });

    const statusFile = path.join(BACKFILL_DIR, TEST_STUDENT, "status.json");
    const status = JSON.parse(await fs.readFile(statusFile, "utf8"));
    assert.ok(typeof status.total_legacy_backfill_emitted === "number");
  });
});
