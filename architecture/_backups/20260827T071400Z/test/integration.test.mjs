// Integration test: load the dist/ plugin entry and exercise the new tools
// via their registered handlers. Tests that the plugin builds correctly and
// that each tool returns the documented shape.

import { test } from "node:test";
import assert from "node:assert/strict";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";

test("plugin entry loads and exports default", async () => {
  const mod = await import(PLUGIN_PATH);
  assert.ok(mod.default, "default export must exist");
  assert.equal(mod.default.id, "mentornest-learning");
  assert.equal(typeof mod.default.register, "function");
});

test("plugin registers all expected tools (smoke)", async () => {
  const mod = await import(PLUGIN_PATH);
  const registered = [];
  const fakeApi = {
    registerTool(tool) {
      registered.push(tool.name);
    },
  };
  mod.default.register(fakeApi);
  const expected = [
    "student_profile_get",
    "student_profile_update",
    "student_profile_v2_get",
    "student_profile_v2_update",
    "learning_record_append",
    "learning_event_reader",
    "deterministic_math_validator",
    "hint_ladder_next",
    "mastery_store_get",
    "mastery_store_update",
    "curriculum_map_lookup",
    "curriculum_meta",
  ];
  for (const name of expected) {
    assert.ok(registered.includes(name), `missing tool: ${name}`);
  }
  // generate_practice_set / classify_math_error are kept as delegation stubs
  assert.ok(registered.includes("generate_practice_set"));
  assert.ok(registered.includes("classify_math_error"));
});

test("deterministic_math_validator tool: end-to-end", async () => {
  const mod = await import(PLUGIN_PATH);
  const fakeApi = { registerTool() {} };
  mod.default.register(fakeApi);
  // Find the tool by re-running register on a capturing fakeApi — already done above.
  // Instead, we directly invoke the tool here by re-importing.
  // (We re-import because the previous register() consumed the tool into a no-op.)
  const tools = [];
  const cap = { registerTool(t) { tools.push(t); } };
  mod.default.register(cap);
  const v = tools.find((t) => t.name === "deterministic_math_validator");
  assert.ok(v, "tool registered");
  const result = await v.execute("test-call-id", {
    expected_answer: "1/2",
    student_answer: "0.5",
  });
  assert.equal(result.details.verdict, "correct");
});

test("hint_ladder_next tool: end-to-end", async () => {
  const tools = [];
  const cap = { registerTool(t) { tools.push(t); } };
  const mod = await import(PLUGIN_PATH);
  mod.default.register(cap);
  const t = tools.find((x) => x.name === "hint_ladder_next");
  const r = await t.execute("c", {
    result: "incorrect",
    attempts: 3,
    error_type: "concept_misunderstanding",
    representation_used: "symbolic-first",
  });
  assert.equal(r.details.level, 3);
  assert.equal(r.details.representation_change, true);
});

test("learning_event_reader tool: end-to-end on real data", async () => {
  const tools = [];
  const cap = { registerTool(t) { tools.push(t); } };
  const mod = await import(PLUGIN_PATH);
  mod.default.register(cap);
  const t = tools.find((x) => x.name === "learning_event_reader");
  const r = await t.execute("c", { student_id: "student_001", summary: true });
  assert.equal(r.details.student_id, "student_001");
  assert.equal(r.details.event_count, 26);
  assert.ok(r.details.bucket_count >= 1);
});

test("mastery_store_update + get round-trip", async () => {
  const tools = [];
  const cap = { registerTool(t) { tools.push(t); } };
  const mod = await import(PLUGIN_PATH);
  mod.default.register(cap);
  const upd = tools.find((x) => x.name === "mastery_store_update");
  const get = tools.find((x) => x.name === "mastery_store_get");

  const uniqKp = `math.G99.TEST-${Date.now()}`;
  await upd.execute("c", {
    student_id: "student_001",
    subject: "math",
    knowledge_point: uniqKp,
    result: "correct",
  });
  const r = await get.execute("c", {
    student_id: "student_001",
    subject: "math",
    knowledge_point: uniqKp,
  });
  assert.ok(r.details.record);
  assert.equal(r.details.record.mastery, 0.65); // 0.5 + 0.15
  // Cleanup
  const fs = await import("node:fs/promises");
  await fs.unlink("/home/node/.openclaw/workspace/data/mastery/student_001.json").catch(() => {});
});

test("curriculum_map_lookup tool: end-to-end", async () => {
  const tools = [];
  const cap = { registerTool(t) { tools.push(t); } };
  const mod = await import(PLUGIN_PATH);
  mod.default.register(cap);
  const t = tools.find((x) => x.name === "curriculum_map_lookup");
  const r = await t.execute("c", {
    grade: 5,
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
  });
  assert.equal(r.details.found, true);
});

test("student_profile_v2_get: returns v2 view of existing student_001", async () => {
  const tools = [];
  const cap = { registerTool(t) { tools.push(t); } };
  const mod = await import(PLUGIN_PATH);
  mod.default.register(cap);
  const t = tools.find((x) => x.name === "student_profile_v2_get");
  const r = await t.execute("c", { student_id: "student_001" });
  assert.equal(r.details.found, true);
  assert.equal(r.details.profile.display_name, "奐奐");
  assert.equal(r.details.profile.schema_version, 2);
});
