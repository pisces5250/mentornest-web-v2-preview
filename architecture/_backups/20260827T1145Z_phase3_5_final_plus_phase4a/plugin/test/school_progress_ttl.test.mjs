// Tests: school_progress_ttl (Phase 3.5 sub-session D)
//
// Pure-function tests for the TTL / stale lifecycle of inferred
// school_progress records.
//
// Run with: node --test test/school_progress_ttl.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getTtlConfig,
  computeTtlExpiryMs,
  isStale,
  markStaleRecords,
  sweepStudent,
  buildExplicitPromotion,
  TTL_ENV_VAR,
  TTL_STATUSES,
  DEFAULT_TTL_DAYS,
  MS_PER_DAY,
} from "../lib/school_progress_ttl.mjs";

// Constant anchors for deterministic time tests.
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0); // 2026-01-01T00:00:00Z
const T30 = T0 + 30 * MS_PER_DAY;

// ─── computeTtlExpiryMs: boundary cases ─────────────────────────────────────

test("computeTtlExpiryMs: ttl=0 → expiry == inferred_at", () => {
  const exp = computeTtlExpiryMs(T0, 0);
  assert.equal(exp, T0);
});

test("computeTtlExpiryMs: ttl=30 (default) → inferred_at + 30 days", () => {
  const exp = computeTtlExpiryMs(T0, 30);
  assert.equal(exp, T0 + 30 * MS_PER_DAY);
});

test("computeTtlExpiryMs: ttl=365 → inferred_at + 365 days", () => {
  const exp = computeTtlExpiryMs(T0, 365);
  assert.equal(exp, T0 + 365 * MS_PER_DAY);
});

test("computeTtlExpiryMs: leap-day-adjacent timestamp (2024-02-29)", () => {
  // 2024 is a leap year. 2024-02-29T00:00:00Z.
  const leap = Date.UTC(2024, 1, 29, 0, 0, 0);
  const exp = computeTtlExpiryMs(leap, 30);
  // Expected: 2024-02-29 + 30 days = 2024-03-30T00:00:00Z.
  assert.equal(exp, Date.UTC(2024, 2, 30, 0, 0, 0));
});

test("computeTtlExpiryMs: leap-day-adjacent timestamp (2025-02-28)", () => {
  // 2025 is NOT a leap year. 2025-02-28 + 30 days = 2025-03-30.
  const nonLeap = Date.UTC(2025, 1, 28, 0, 0, 0);
  const exp = computeTtlExpiryMs(nonLeap, 30);
  assert.equal(exp, Date.UTC(2025, 2, 30, 0, 0, 0));
});

test("computeTtlExpiryMs: ISO8601 string input is accepted", () => {
  const exp = computeTtlExpiryMs("2026-01-01T00:00:00.000Z", 30);
  assert.equal(exp, T0 + 30 * MS_PER_DAY);
});

test("computeTtlExpiryMs: rejects non-numeric ttl_days", () => {
  assert.throws(() => computeTtlExpiryMs(T0, 1.5), /non-negative integer/);
  assert.throws(() => computeTtlExpiryMs(T0, -1), /non-negative integer/);
  assert.throws(() => computeTtlExpiryMs(T0, "30"), /non-negative integer/);
});

// ─── isStale: truth table ─────────────────────────────────────────────────

test("isStale: inferred + before expiry → false", () => {
  const rec = { status: "inferred", inferred_at: new Date(T0).toISOString() };
  assert.equal(isStale(rec, T30 - 1, 30), false);
});

test("isStale: inferred + exactly at expiry → true (>= boundary)", () => {
  const rec = { status: "inferred", inferred_at: new Date(T0).toISOString() };
  assert.equal(isStale(rec, T30, 30), true);
});

test("isStale: inferred + after expiry → true", () => {
  const rec = { status: "inferred", inferred_at: new Date(T0).toISOString() };
  assert.equal(isStale(rec, T30 + 1, 30), true);
});

test("isStale: stale + before/after expiry → false (idempotent)", () => {
  const rec = { status: "stale", inferred_at: new Date(T0).toISOString() };
  assert.equal(isStale(rec, T30 + 1000, 30), false);
});

test("isStale: confirmed + after expiry → false (never auto-promotes)", () => {
  const rec = {
    status: "confirmed",
    confirmed_at: new Date(T0).toISOString(),
    inferred_at: new Date(T0).toISOString(),
  };
  assert.equal(isStale(rec, T30 + 1000, 30), false);
});

test("isStale: inferred + missing inferred_at → false (safe default)", () => {
  const rec = { status: "inferred" };
  assert.equal(isStale(rec, T30 + 1000, 30), false);
});

// ─── markStaleRecords: purity + correctness ────────────────────────────────

test("markStaleRecords: returns deep clone, never mutates input", () => {
  const rec = {
    record_id: "recA",
    status: "inferred",
    inferred_at: new Date(T0).toISOString(),
    knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
  };
  const snapshot = JSON.stringify(rec);
  const input = [rec];
  const { updated_records, newly_stale_ids } = markStaleRecords(input, T30 + 1, 30);

  // Input untouched.
  assert.equal(JSON.stringify(rec), snapshot);
  assert.equal(input.length, 1);
  assert.equal(input[0].status, "inferred");

  // Output has the right shape.
  assert.equal(updated_records.length, 1);
  assert.equal(updated_records[0].status, "stale");
  assert.equal(updated_records[0].record_id, "recA");
  assert.deepEqual(newly_stale_ids, ["recA"]);

  // Cloned object is a different reference.
  assert.notEqual(updated_records[0], rec);
});

test("markStaleRecords: only flips inferred → stale, leaves confirmed alone", () => {
  const records = [
    { record_id: "A", status: "inferred", inferred_at: new Date(T0).toISOString() },
    { record_id: "B", status: "confirmed", confirmed_at: new Date(T0).toISOString() },
    { record_id: "C", status: "stale", inferred_at: new Date(T0).toISOString() },
    { record_id: "D", status: "inferred", inferred_at: new Date(T30 - 1).toISOString() }, // not yet expired
  ];
  const { updated_records, newly_stale_ids } = markStaleRecords(records, T30 + 1000, 30);
  const byId = Object.fromEntries(updated_records.map((r) => [r.record_id, r]));

  assert.equal(byId.A.status, "stale");
  assert.equal(byId.B.status, "confirmed");
  assert.equal(byId.C.status, "stale");
  assert.equal(byId.D.status, "inferred"); // still inside window

  assert.deepEqual(newly_stale_ids.sort(), ["A"]);
});

test("markStaleRecords: idempotent — second call returns 0 newly_stale_ids", () => {
  const records = [
    { record_id: "X", status: "inferred", inferred_at: new Date(T0).toISOString() },
    { record_id: "Y", status: "inferred", inferred_at: new Date(T0 - 1000).toISOString() },
  ];

  const first = markStaleRecords(records, T30 + 1, 30);
  assert.equal(first.newly_stale_ids.length, 2);

  // Feed the updated_records back as input; should not re-flag.
  const second = markStaleRecords(first.updated_records, T30 + 1000, 30);
  assert.deepEqual(second.newly_stale_ids, []);
  // All records are still stale.
  assert.equal(second.updated_records.every((r) => r.status === "stale"), true);
});

test("markStaleRecords: stale record stays stale after additional time passes", () => {
  const rec = { record_id: "S", status: "inferred", inferred_at: new Date(T0).toISOString() };
  const sweep1 = markStaleRecords([rec], T30 + 1, 30);
  assert.equal(sweep1.updated_records[0].status, "stale");

  // 100 days later — must STILL be stale, never auto-promoted.
  const sweep2 = markStaleRecords(sweep1.updated_records, T30 + 100 * MS_PER_DAY, 30);
  assert.equal(sweep2.updated_records[0].status, "stale");
  assert.deepEqual(sweep2.newly_stale_ids, []);
});

test("markStaleRecords: empty array → empty output", () => {
  const out = markStaleRecords([], T30 + 1, 30);
  assert.deepEqual(out.updated_records, []);
  assert.deepEqual(out.newly_stale_ids, []);
});

test("markStaleRecords: rejects non-array records", () => {
  assert.throws(() => markStaleRecords(null, T0, 30), /records must be an array/);
  assert.throws(() => markStaleRecords({}, T0, 30), /records must be an array/);
});

// ─── sweepStudent: I/O via injected storage_io ──────────────────────────────

test("sweepStudent: calls storage_io.read, flips records, writes back", async () => {
  let written = null;
  let readCount = 0;
  const storage = {
    readStudentRecords: async (sid) => {
      readCount++;
      return {
        path: `/tmp/${sid}.jsonl`,
        records: [
          { record_id: "a", status: "inferred", source_type: "inferred_from_learning", inferred_at: new Date(T0).toISOString() },
          { record_id: "b", status: "in_progress", source_type: "parent_confirmed", confirmed_at: new Date(T0).toISOString() },
        ],
      };
    },
    writeStudentRecords: async (sid, recs) => {
      written = { sid, recs };
      return { ok: true, written: recs.length, path: `/tmp/${sid}.jsonl` };
    },
  };
  const out = await sweepStudent("student_t_ttl", T30 + 1, 30, storage);
  assert.equal(readCount, 1);
  assert.equal(out.student_id, "student_t_ttl");
  assert.deepEqual(out.newly_stale_ids, ["a"]);
  assert.equal(out.total_stale_count, 1);
  assert.equal(out.total_inferred, 0);
  assert.equal(out.total_confirmed, 1);
  assert.equal(written.sid, "student_t_ttl");
  assert.equal(written.recs.length, 2);
  assert.equal(written.recs[0].status, "stale");
  // The previously-confirmed record keeps its source_type and progress status.
  assert.equal(written.recs[1].source_type, "parent_confirmed");
  assert.equal(written.recs[1].status, "in_progress");
});

test("sweepStudent: no write when nothing changed (idempotent)", async () => {
  let writeCount = 0;
  const storage = {
    readStudentRecords: async () => ({
      path: "/tmp/s.jsonl",
      records: [
        { record_id: "x", status: "stale", inferred_at: new Date(T0).toISOString() },
      ],
    }),
    writeStudentRecords: async () => { writeCount++; return { ok: true, written: 1, path: "/tmp/s.jsonl" }; },
  };
  const out = await sweepStudent("student_t_ttl", T30 + 1, 30, storage);
  assert.equal(out.newly_stale_ids.length, 0);
  assert.equal(out.total_stale_count, 1);
  assert.equal(writeCount, 0, "must NOT write when nothing changed");
});

test("sweepStudent: missing readStudentRecords → throws", async () => {
  await assert.rejects(() => sweepStudent("s", T0, 30, {}), /storage_io.readStudentRecords required/);
});

test("sweepStudent: missing student_id → throws", async () => {
  const storage = { readStudentRecords: async () => ({ records: [], path: "/x" }) };
  await assert.rejects(() => sweepStudent("", T0, 30, storage), /student_id required/);
});

// ─── buildExplicitPromotion ────────────────────────────────────────────────

test("buildExplicitPromotion: promotes inferred → confirmed with confirmed_by", () => {
  const prev = {
    record_id: "recX",
    student_id: "student_t_ttl",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
    status: "inferred",
    source_type: "inferred_from_learning",
    confidence: 0.6,
    inferred_at: new Date(T0).toISOString(),
  };
  const promoted = buildExplicitPromotion(prev, {
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    confirmed_by: "parent_setup",
    now_ms: T30 + 1000,
  });
  // The promoted record carries confirmed_at + confirmed_by + a confirmed
  // source_type, which is the upstream signal of "this is confirmed".
  assert.equal(promoted.confirmed_by, "parent_setup");
  assert.equal(promoted.replaces_record_id, "recX");
  assert.ok(promoted.confirmed_at);
  assert.notEqual(promoted.source_type, "inferred_from_learning");
  assert.notEqual(promoted.record_id, "recX", "new id issued");
  // progress status follows school-progress-v1 (not_started/in_progress/completed).
  assert.ok(["not_started", "in_progress", "completed"].includes(promoted.status));
});

test("buildExplicitPromotion: promotes stale → confirmed", () => {
  const prev = {
    record_id: "recS",
    student_id: "student_t_ttl",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "stale",
    source_type: "inferred_from_learning",
    confidence: 0.5,
    inferred_at: new Date(T0).toISOString(),
    stale_at: new Date(T30).toISOString(),
  };
  const promoted = buildExplicitPromotion(prev, {
    knowledge_point: "math.G5.FRAC.x",
    confirmed_by: "manual",
    now_ms: T30 + 2000,
  });
  assert.equal(promoted.confirmed_by, "manual");
  assert.equal(promoted.replaces_record_id, "recS");
  assert.equal(promoted.source_type, "parent_confirmed");
  assert.ok(promoted.confirmed_at);
});

test("buildExplicitPromotion: refuses already-confirmed records", () => {
  const prev = {
    record_id: "recC",
    student_id: "student_t_ttl",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "confirmed",
    source_type: "parent_confirmed",
    confidence: 1.0,
    confirmed_at: new Date(T0).toISOString(),
  };
  assert.throws(() =>
    buildExplicitPromotion(prev, {
      knowledge_point: "math.G5.FRAC.x",
      confirmed_by: "manual",
    }),
    /already confirmed/
  );
});

test("buildExplicitPromotion: refuses missing knowledge_point argument", () => {
  const prev = {
    record_id: "recM",
    student_id: "student_t_ttl",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "inferred",
    source_type: "inferred_from_learning",
    confidence: 0.6,
    inferred_at: new Date(T0).toISOString(),
  };
  assert.throws(() =>
    buildExplicitPromotion(prev, { confirmed_by: "manual" }),
    /knowledge_point required/
  );
});

test("buildExplicitPromotion: refuses knowledge_point not in record.kps", () => {
  const prev = {
    record_id: "recK",
    student_id: "student_t_ttl",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "inferred",
    source_type: "inferred_from_learning",
    confidence: 0.6,
    inferred_at: new Date(T0).toISOString(),
  };
  assert.throws(() =>
    buildExplicitPromotion(prev, {
      knowledge_point: "math.G5.FRAC.different",
      confirmed_by: "manual",
    }),
    /not in record's knowledge_points/
  );
});

test("buildExplicitPromotion: refuses empty/missing confirmed_by", () => {
  const prev = {
    record_id: "recB",
    student_id: "student_t_ttl",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "inferred",
    source_type: "inferred_from_learning",
    confidence: 0.6,
    inferred_at: new Date(T0).toISOString(),
  };
  assert.throws(() =>
    buildExplicitPromotion(prev, { knowledge_point: "math.G5.FRAC.x", confirmed_by: "" }),
    /confirmed_by required/
  );
  assert.throws(() =>
    buildExplicitPromotion(prev, { knowledge_point: "math.G5.FRAC.x" }),
    /confirmed_by required/
  );
});

// ─── getTtlConfig: env handling ────────────────────────────────────────────

test("getTtlConfig: default 30 when env var unset", () => {
  const prev = process.env[TTL_ENV_VAR];
  delete process.env[TTL_ENV_VAR];
  try {
    const cfg = getTtlConfig();
    assert.equal(cfg.ttl_days, 30);
    assert.equal(cfg.ttl_days, DEFAULT_TTL_DAYS);
    assert.equal(cfg.env_var, TTL_ENV_VAR);
    assert.equal(cfg.source, "default");
  } finally {
    if (prev !== undefined) process.env[TTL_ENV_VAR] = prev;
  }
});

test("getTtlConfig: env override respected", () => {
  const prev = process.env[TTL_ENV_VAR];
  process.env[TTL_ENV_VAR] = "7";
  try {
    const cfg = getTtlConfig();
    assert.equal(cfg.ttl_days, 7);
    assert.equal(cfg.source, "env");
  } finally {
    if (prev === undefined) delete process.env[TTL_ENV_VAR];
    else process.env[TTL_ENV_VAR] = prev;
  }
});

test("getTtlConfig: invalid env value falls back to default", () => {
  const prev = process.env[TTL_ENV_VAR];
  process.env[TTL_ENV_VAR] = "not-a-number";
  try {
    const cfg = getTtlConfig();
    assert.equal(cfg.ttl_days, DEFAULT_TTL_DAYS);
    assert.equal(cfg.source, "default");
  } finally {
    if (prev === undefined) delete process.env[TTL_ENV_VAR];
    else process.env[TTL_ENV_VAR] = prev;
  }
});

test("getTtlConfig: negative env value falls back to default", () => {
  const prev = process.env[TTL_ENV_VAR];
  process.env[TTL_ENV_VAR] = "-5";
  try {
    const cfg = getTtlConfig();
    assert.equal(cfg.ttl_days, DEFAULT_TTL_DAYS);
    assert.equal(cfg.source, "default");
  } finally {
    if (prev === undefined) delete process.env[TTL_ENV_VAR];
    else process.env[TTL_ENV_VAR] = prev;
  }
});

// ─── Default TTL = 30 days when env var unset ──────────────────────────────

test("default TTL is exactly 30 days (DEFAULT_TTL_DAYS)", () => {
  assert.equal(DEFAULT_TTL_DAYS, 30);
});

test("MS_PER_DAY constant equals 86_400_000", () => {
  assert.equal(MS_PER_DAY, 86_400_000);
});

// ─── Edge cases & invariants ───────────────────────────────────────────────

test("markStaleRecords: stamps stale_at with now_ms", () => {
  const rec = { record_id: "S", status: "inferred", inferred_at: new Date(T0).toISOString() };
  const { updated_records } = markStaleRecords([rec], T30 + 5000, 30);
  assert.equal(updated_records[0].stale_at, new Date(T30 + 5000).toISOString());
});

test("markStaleRecords: ttl=0 marks any inferred record stale at now>=inferred_at", () => {
  const rec = { record_id: "Z", status: "inferred", inferred_at: new Date(T0).toISOString() };
  const { updated_records, newly_stale_ids } = markStaleRecords([rec], T0, 0);
  assert.equal(updated_records[0].status, "stale");
  assert.deepEqual(newly_stale_ids, ["Z"]);
});

test("isStale: returns false for null record", () => {
  assert.equal(isStale(null, T30, 30), false);
});

test("isStale: returns false for non-object record", () => {
  assert.equal(isStale("string", T30, 30), false);
  assert.equal(isStale(42, T30, 30), false);
});

test("sweepStudent: rejects negative ttl_days", async () => {
  const storage = { readStudentRecords: async () => ({ records: [], path: "/x" }) };
  await assert.rejects(() => sweepStudent("s", T0, -1, storage), /non-negative integer/);
});

test("sweepStudent: rejects non-integer now_ms", async () => {
  const storage = { readStudentRecords: async () => ({ records: [], path: "/x" }) };
  await assert.rejects(() => sweepStudent("s", Number.NaN, 30, storage), /finite number/);
});

test("TTL_STATUSES: contains exactly inferred, stale, confirmed", () => {
  // Just to lock down the public schema surface.
  assert.deepEqual([...TTL_STATUSES], ["inferred", "stale", "confirmed"]);
});
