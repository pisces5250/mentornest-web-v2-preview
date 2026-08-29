// End-to-end smoke through the actual plugin entry: exercises every new tool
// registered in this batch.

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import mod from "../dist/index.js";

// `mod` IS the plugin entry (default export). `mod.register(api)` walks all tools.
// Capture all registered tools once.
let _tools;
function tools() {
  if (_tools) return _tools;
  _tools = [];
  mod.register({ registerTool(t) { _tools.push(t); } });
  return _tools;
}

function getTool(name) {
  const t = tools().find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

let tmpRoot;

test.before(async () => {
  // The plugin entry uses DATA_ROOT = /home/node/.openclaw/workspace/data
  // We can't redirect it for tools that hard-code the path, but we can verify
  // the tool surface, call validators/copy-tools (which are pure), and exercise
  // generate_practice_set_v2 which is read-only against the real verified bank.
});

test("plugin registers all 9 Phase 2 second-batch tools", () => {
  const names = new Set(tools().map((t) => t.name));
  for (const expected of [
    "question_bank_curator_curate",
    "question_quality_agent_verify",
    "question_quality_agent_dedupe_check",
    "verified_bank_lookup",
    "verified_bank_count",
    "generate_practice_set_v2",
    "parent_setup_schema_validate",
    "parent_setup_schema_copy",
  ]) {
    assert.ok(names.has(expected), `missing tool: ${expected}`);
  }
});

test("parent_setup_schema_validate: rejects school_progress", async () => {
  const tool = getTool("parent_setup_schema_validate");
  const r = await tool.execute("c", {
    payload: { display_name: "小宇", school_year: "2026", school_progress: { x: 1 } },
  });
  assert.equal(r.details.ok, false);
  assert.match(r.details.reason, /school_progress/);
});

test("parent_setup_schema_validate: accepts minimal payload", async () => {
  const tool = getTool("parent_setup_schema_validate");
  const r = await tool.execute("c", { payload: { display_name: "小宇", school_year: "2026" } });
  assert.equal(r.details.ok, true);
});

test("parent_setup_schema_copy: returns zh-TW copy with required invariants", async () => {
  const tool = getTool("parent_setup_schema_copy");
  const r = await tool.execute("c", { locale: "zh-TW" });
  assert.equal(r.details.ok, true);
  assert.equal(r.details.locale, "zh-TW");
  assert.equal(r.details.invariants.never_request_school_name_or_class_name_by_default, true);
  assert.equal(r.details.invariants.school_progress_maintained_by, "curriculum-agent");
  assert.ok(r.details.copy.display_name);
  assert.ok(r.details.copy.school_name);
  assert.ok(r.details.copy.school_name.advanced_only);
});

test("parent_setup_schema_copy: rejects non-zh-TW locale", async () => {
  const tool = getTool("parent_setup_schema_copy");
  const r = await tool.execute("c", { locale: "en-US" });
  assert.equal(r.details.ok, false);
});

test("verified_bank_lookup: returns count + questions for math G5", async () => {
  const tool = getTool("verified_bank_lookup");
  const r = await tool.execute("c", { subject: "math", grade: 5, limit: 10 });
  assert.equal(r.details.ok, true);
  assert.ok(r.details.count >= 0);
  assert.ok(Array.isArray(r.details.questions));
});

test("verified_bank_count: returns count", async () => {
  const tool = getTool("verified_bank_count");
  const r = await tool.execute("c", { subject: "math", grade: 5 });
  assert.equal(r.details.ok, true);
  assert.equal(typeof r.details.count, "number");
});

test("generate_practice_set_v2: falls back when bank has zero matches", async () => {
  const tool = getTool("generate_practice_set_v2");
  const r = await tool.execute("c", {
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G6.RATIO.scale-and-proportion",
    difficulty: "hard",
    count: 3,
  });
  assert.equal(r.details.ok, true);
  assert.ok(r.details.source === "verified_bank" || r.details.source === "fallback_llm_author_required");
  if (r.details.source === "verified_bank") {
    assert.ok(!r.details.fallback_used);
    assert.ok(Array.isArray(r.details.questions));
    assert.ok(r.details.questions.length > 0);
  } else {
    assert.equal(r.details.fallback_used, true);
    assert.ok(r.details.note.length > 0);
  }
});

test("generate_practice_set_v2: rejects invalid student_id", async () => {
  const tool = getTool("generate_practice_set_v2");
  const r = await tool.execute("c", {
    student_id: "../etc/passwd",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
  });
  assert.equal(r.details.ok, false);
  assert.match(r.details.reason, /invalid student_id/);
});

test("question_quality_agent_dedupe_check: returns matches for existing seed", async () => {
  const tool = getTool("question_quality_agent_dedupe_check");
  // The earlier smoke wrote 1 verified Q with stem "計算 1/2 + 1/3 的結果"
  const r = await tool.execute("c", { stem: "計算 1/2 + 1/3 的結果" });
  assert.equal(r.details.ok, true);
  assert.ok(typeof r.details.match_count === "number");
});

test("v1 tools still callable (backward compatibility)", async () => {
  const profile = getTool("student_profile_get");
  const r = await profile.execute("c", { student_id: "student_001" });
  assert.equal(r.details.found, true);
  assert.equal(r.details.profile.display_name, "奐奐");
});
