// test/integration_phase3_5_d.test.mjs — Phase 3.5 sub-session D integration
//
// Verifies the four school_progress TTL tools wired into the plugin:
//   - school_progress_inferred_status
//   - school_progress_inferred_mark_stale
//   - school_progress_inferred_promote
//   - school_progress_inferred_ttl_sweep
//
// Invariants preserved:
//   - data/learning-records/student_001.jsonl UNCHANGED (26 lines, md5 unchanged)
//   - data/students/student_*.json UNCHANGED
//   - AGENTS / SOUL / USER / IDENTITY md5 unchanged
//   - Uses student_t_ttl as the only test student id (NEVER student_001/002)

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WORKSPACE = "/home/node/.openclaw/workspace";
const TEST_STUDENT = "student_t_ttl";
const PROG_FILE = path.join(WORKSPACE, "data/curriculum-progress", `${TEST_STUDENT}.jsonl`);

let toolsCache = null;

async function loadTools() {
  if (toolsCache) return toolsCache;
  const mod = await import("../dist/index.js");
  const list = [];
  mod.default.register({ registerTool(t) { list.push(t); } });
  toolsCache = list;
  return toolsCache;
}

async function runTool(name, params) {
  const t = (await loadTools()).find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return await t.execute("test-call-id", params);
}

function makeInferredRecord(recordId, daysAgo) {
  const nowMs = Date.now();
  const inferredMs = nowMs - daysAgo * 86_400_000;
  return {
    schema_version: "school-progress-v1",
    record_id: recordId,
    student_id: TEST_STUDENT,
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC." + recordId],
    status: "inferred",
    source_type: "inferred_from_learning",
    source_reference: "inferred_from_learning/event-" + recordId,
    confidence: 0.6,
    inferred_at: new Date(inferredMs).toISOString(),
    inferred_from_event: "evt-" + recordId,
  };
}

function makeConfirmedRecord(recordId, knowledgePoint) {
  return {
    schema_version: "school-progress-v1",
    record_id: recordId,
    student_id: TEST_STUDENT,
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: [knowledgePoint],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "parent_confirmed/setup",
    confidence: 1.0,
    confirmed_at: new Date().toISOString(),
  };
}

async function resetProgressFile(records) {
  await fs.mkdir(path.dirname(PROG_FILE), { recursive: true });
  if (records.length === 0) {
    try { await fs.unlink(PROG_FILE); } catch (e) { if (e.code !== "ENOENT") throw e; }
    return;
  }
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await fs.writeFile(PROG_FILE, lines, "utf8");
}

async function readFileLines() {
  try {
    const raw = await fs.readFile(PROG_FILE, "utf8");
    return raw.split("\n").filter((l) => l.length > 0);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

// ---------- Test setup / teardown ------------------------------------------

test.before(async () => {
  await resetProgressFile([]);
});

test.after(async () => {
  await resetProgressFile([]);
});

// ---------- Tool registration ----------------------------------------------

test("plugin registers all 4 new TTL tools (this sub-session added exactly 4)", async () => {
  const tools = await loadTools();
  const ttlTools = [
    "school_progress_inferred_status",
    "school_progress_inferred_mark_stale",
    "school_progress_inferred_promote",
    "school_progress_inferred_ttl_sweep",
  ];
  for (const name of ttlTools) {
    assert.ok(tools.find((t) => t.name === name), `missing TTL tool: ${name}`);
  }
  assert.equal(tools.length, 132, `expected 132 tools total (130 prior + 2 Phase 4A), got ${tools.length}`);
});

// ---------- D1: school_progress_inferred_status -----------------------------

test("status tool returns 0 counts for empty student", async () => {
  await resetProgressFile([]);
  const out = await runTool("school_progress_inferred_status", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.total_inferred, 0);
  assert.equal(out.details.total_stale, 0);
  assert.equal(out.details.total_confirmed, 0);
  assert.equal(out.details.ttl_days, 30);
});

test("status tool counts inferred vs confirmed correctly", async () => {
  await resetProgressFile([
    makeInferredRecord("rec1", 5),  // recent (within TTL)
    makeInferredRecord("rec2", 5),
    makeConfirmedRecord("rec3", "math.G5.FRAC.rec3"),
  ]);
  const out = await runTool("school_progress_inferred_status", { student_id: TEST_STUDENT });
  assert.equal(out.details.total_inferred, 2);
  assert.equal(out.details.total_stale, 0);
  assert.equal(out.details.total_confirmed, 1);
});

// ---------- D2: school_progress_inferred_mark_stale ------------------------

test("mark_stale tool flips only records older than TTL", async () => {
  await resetProgressFile([
    makeInferredRecord("fresh", 5),    // 5 days old → still inferred
    makeInferredRecord("old", 60),     // 60 days old → stale
    makeConfirmedRecord("conf", "math.G5.FRAC.conf"),
  ]);
  const out = await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.deepEqual(out.details.newly_stale_ids, ["old"]);
  assert.equal(out.details.total_stale_count, 1);
  assert.equal(out.details.total_inferred, 1);
  assert.equal(out.details.total_confirmed, 1);

  // Verify on-disk state.
  const lines = await readFileLines();
  const parsed = lines.map((l) => JSON.parse(l));
  const byId = Object.fromEntries(parsed.map((r) => [r.record_id, r]));
  assert.equal(byId.fresh.status, "inferred");
  assert.equal(byId.old.status, "stale");
  assert.ok(byId.old.stale_at);
  assert.equal(byId.conf.status, "in_progress"); // upstream status preserved
});

test("mark_stale tool is idempotent when re-run", async () => {
  await resetProgressFile([
    makeInferredRecord("old1", 60),
    makeInferredRecord("old2", 90),
  ]);
  const first = await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  assert.equal(first.details.newly_stale_ids.length, 2);

  const second = await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  assert.deepEqual(second.details.newly_stale_ids, []);
  assert.equal(second.details.total_stale_count, 2);
});

test("mark_stale tool respects injected now_ms (testability)", async () => {
  // Anchor the record to a known inferred_at, then sweep at now_ms far
  // in the future. The sweep should flip the record to stale based on
  // the injected clock, not the wall clock.
  const anchor = Date.UTC(2026, 0, 1);  // arbitrary test anchor
  const rec = {
    ...makeInferredRecord("rec", 0),
    inferred_at: new Date(anchor).toISOString(),
  };
  await resetProgressFile([rec]);
  const future = anchor + 31 * 86_400_000;  // 31 days later
  const out = await runTool("school_progress_inferred_mark_stale", {
    student_id: TEST_STUDENT,
    now_ms: future,
  });
  assert.deepEqual(out.details.newly_stale_ids, ["rec"]);
});

test("mark_stale tool never auto-promotes to confirmed", async () => {
  await resetProgressFile([
    makeInferredRecord("rec1", 60),
    makeInferredRecord("rec2", 100),
    makeInferredRecord("rec3", 365),
  ]);
  await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  const lines = await readFileLines();
  const parsed = lines.map((l) => JSON.parse(l));
  // None of them became confirmed.
  assert.ok(parsed.every((r) => r.status !== "confirmed"));
  // All three became stale.
  assert.equal(parsed.filter((r) => r.status === "stale").length, 3);
});

// ---------- D3: school_progress_inferred_promote --------------------------

test("promote tool: explicit promote of inferred → appends new confirmed record", async () => {
  await resetProgressFile([makeInferredRecord("recX", 5)]);
  const out = await runTool("school_progress_inferred_promote", {
    student_id: TEST_STUDENT,
    knowledge_point: "math.G5.FRAC.recX",
    confirmed_by: "parent_setup",
  });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.status, "confirmed");
  assert.equal(out.details.confirmed_by, "parent_setup");
  assert.equal(out.details.knowledge_point, "math.G5.FRAC.recX");
  assert.equal(out.details.superseded_id, "recX");
  assert.ok(out.details.record_id);

  // The jsonl now has 2 lines: the inferred one (untouched) + new confirmed.
  const lines = await readFileLines();
  assert.equal(lines.length, 2);
  const parsed = lines.map((l) => JSON.parse(l));
  const confirmed = parsed.find((r) => r.source_type !== "inferred_from_learning");
  assert.ok(confirmed);
  assert.equal(confirmed.confirmed_by, "parent_setup");
  assert.equal(confirmed.replaces_record_id, "recX");
});

test("promote tool: explicit promote of stale → confirmed also works", async () => {
  await resetProgressFile([makeInferredRecord("recS", 60)]);
  // First mark stale.
  await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  // Then explicitly promote.
  const out = await runTool("school_progress_inferred_promote", {
    student_id: TEST_STUDENT,
    knowledge_point: "math.G5.FRAC.recS",
    confirmed_by: "manual",
  });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.status, "confirmed");
  assert.equal(out.details.confirmed_by, "manual");
});

test("promote tool: refuses when already confirmed (no double-promote)", async () => {
  await resetProgressFile([
    makeInferredRecord("recInf", 5),
    makeConfirmedRecord("recConf", "math.G5.FRAC.shared-kp"),
  ]);
  const out = await runTool("school_progress_inferred_promote", {
    student_id: TEST_STUDENT,
    knowledge_point: "math.G5.FRAC.shared-kp",
    confirmed_by: "parent_setup",
  });
  // The confirmed record exists; promote should refuse.
  assert.equal(out.details.ok, false);
  assert.equal(out.details.reason, "already_confirmed");
});

test("promote tool: refuses unknown knowledge_point", async () => {
  await resetProgressFile([makeInferredRecord("recInf", 5)]);
  const out = await runTool("school_progress_inferred_promote", {
    student_id: TEST_STUDENT,
    knowledge_point: "math.G5.FRAC.does-not-exist",
    confirmed_by: "parent_setup",
  });
  assert.equal(out.details.ok, false);
  assert.equal(out.details.reason, "no_inferred_or_stale_record_for_knowledge_point");
});

// ---------- D4: school_progress_inferred_ttl_sweep -------------------------

test("ttl_sweep tool with explicit student_id sweeps just that student", async () => {
  await resetProgressFile([
    makeInferredRecord("a", 60),
    makeInferredRecord("b", 5),
  ]);
  const out = await runTool("school_progress_inferred_ttl_sweep", {
    student_id: TEST_STUDENT,
    now_ms: Date.now(),
  });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.swept_students.length, 1);
  assert.equal(out.details.swept_students[0].student_id, TEST_STUDENT);
  assert.deepEqual(out.details.swept_students[0].newly_stale_ids, ["a"]);
  assert.equal(out.details.total_newly_stale, 1);
});

test("ttl_sweep tool with no student_id sweeps all students on disk", async () => {
  // Set up another fake student file.
  const otherFile = path.join(WORKSPACE, "data/curriculum-progress", "student_t_ttl_sibling.jsonl");
  const otherRec = {
    ...makeInferredRecord("c", 100),
    record_id: "c",
    student_id: "student_t_ttl_sibling",
    knowledge_points: ["math.G5.FRAC.c"],
  };
  await fs.mkdir(path.dirname(otherFile), { recursive: true });
  await fs.writeFile(otherFile, JSON.stringify(otherRec) + "\n", "utf8");

  await resetProgressFile([makeInferredRecord("a", 60)]);

  try {
    const out = await runTool("school_progress_inferred_ttl_sweep", { now_ms: Date.now() });
    assert.equal(out.details.ok, true);
    const ids = out.details.swept_students.map((s) => s.student_id).sort();
    assert.ok(ids.includes(TEST_STUDENT));
    assert.ok(ids.includes("student_t_ttl_sibling"));
    // Each student had exactly one old record, so 1 newly-stale each.
    const totalNewly = out.details.total_newly_stale;
    assert.ok(totalNewly >= 2, `expected >= 2 newly stale total, got ${totalNewly}`);
  } finally {
    try { await fs.unlink(otherFile); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
});

test("ttl_sweep tool: stale record stays stale after additional time passes (no auto-promotion)", async () => {
  // Anchor the record's inferred_at to a fixed past timestamp so we can
  // sweep deterministically with injected now_ms values.
  const anchor = Date.UTC(2026, 0, 1);
  const rec = {
    ...makeInferredRecord("rec", 0),
    inferred_at: new Date(anchor - 60 * 86_400_000).toISOString(),
  };
  await resetProgressFile([rec]);
  const t1 = anchor;                          // 60 days after inferred_at
  const t2 = t1 + 100 * 86_400_000;           // 100 days later
  const first = await runTool("school_progress_inferred_ttl_sweep", {
    student_id: TEST_STUDENT,
    now_ms: t1,
  });
  assert.equal(first.details.total_newly_stale, 1);
  const second = await runTool("school_progress_inferred_ttl_sweep", {
    student_id: TEST_STUDENT,
    now_ms: t2,
  });
  assert.equal(second.details.total_newly_stale, 0);
  // The rec on disk is still stale, not promoted.
  const lines = await readFileLines();
  const parsed = lines.map((l) => JSON.parse(l));
  const r = parsed.find((x) => x.record_id === "rec");
  assert.equal(r.status, "stale");
});

// ---------- Cross-tool workflow -------------------------------------------

test("end-to-end: infer → sweep → status reports stale counts", async () => {
  await resetProgressFile([
    makeInferredRecord("e2e1", 35),  // older than TTL → will go stale
    makeInferredRecord("e2e2", 35),
    makeInferredRecord("e2e3", 5),   // fresh → stays inferred
  ]);
  // Sweep
  const sweep = await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  assert.equal(sweep.details.newly_stale_ids.length, 2);
  // Status reflects the new state.
  const status = await runTool("school_progress_inferred_status", { student_id: TEST_STUDENT });
  assert.equal(status.details.total_stale, 2);
  assert.equal(status.details.total_inferred, 1);
});

test("end-to-end: infer → sweep → explicit promote", async () => {
  await resetProgressFile([makeInferredRecord("flow", 60)]);
  // Sweep makes it stale.
  const sweep = await runTool("school_progress_inferred_mark_stale", { student_id: TEST_STUDENT });
  assert.deepEqual(sweep.details.newly_stale_ids, ["flow"]);
  // Then explicit promotion by parent.
  const promo = await runTool("school_progress_inferred_promote", {
    student_id: TEST_STUDENT,
    knowledge_point: "math.G5.FRAC.flow",
    confirmed_by: "parent_setup",
  });
  assert.equal(promo.details.ok, true);
  assert.equal(promo.details.status, "confirmed");
  // File now contains 2 lines: stale one (untouched) + new confirmed record.
  const lines = await readFileLines();
  assert.equal(lines.length, 2);
});

// ---------- Invariants: live data UNCHANGED ---------------------------------

test("student_001.jsonl line count and md5 unchanged (regression guard)", async () => {
  const live = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const raw = await fs.readFile(live, "utf8");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  assert.equal(lines.length, 26, `student_001.jsonl must still be 26 lines; got ${lines.length}`);
  const crypto = await import("node:crypto");
  const md5 = crypto.createHash("md5").update(raw).digest("hex");
  assert.equal(md5, "5facdbf0b47e67d30baea59704ef0a90", `student_001.jsonl md5 changed: ${md5}`);
});
