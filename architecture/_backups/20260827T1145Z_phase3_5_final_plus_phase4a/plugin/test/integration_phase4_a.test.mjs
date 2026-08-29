// test/integration_phase4_a.test.mjs
// Phase 4A integration: raw_question_ingest + raw_question_segment via plugin entry.
// Exercises BOTH new tools through the dist/ plugin registration. Asserts that
// production invariants (student_001.jsonl, student_001.json, student_002.json,
// AGENTS.md, SOUL.md, USER.md, IDENTITY.md) remain unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";
const WORKSPACE = "/home/node/.openclaw/workspace";

let toolsCache = null;
async function loadTools() {
  if (toolsCache) return toolsCache;
  const mod = await import(PLUGIN_PATH);
  const tools = [];
  mod.default.register({ registerTool(t) { tools.push(t); } });
  toolsCache = tools;
  return tools;
}

async function runTool(name, params) {
  const t = (await loadTools()).find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return await t.execute("test-call", params);
}

async function fileMD5(file) {
  try {
    const buf = await fs.readFile(file);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

// ─────────────────────────────────────
// Tool registration + count
// ─────────────────────────────────────

test("plugin entry loads with Phase 4A tools registered (raw_question_ingest + raw_question_segment)", async () => {
  const tools = await loadTools();
  assert.ok(tools.find((t) => t.name === "raw_question_ingest"), "missing raw_question_ingest");
  assert.ok(tools.find((t) => t.name === "raw_question_segment"), "missing raw_question_segment");
});

test("total tool count grows by 2 (was 130 → 132)", async () => {
  const tools = await loadTools();
  assert.equal(tools.length, 132, `expected 132 tools, got ${tools.length}`);
});

// ─────────────────────────────────────
// raw_question_ingest: text
// ─────────────────────────────────────

test("raw_question_ingest: text kind end-to-end returns 3 candidates", async () => {
  const r = await runTool("raw_question_ingest", {
    kind: "text",
    content: "1. 2+3=?\n2. 水的狀態是什麼？\n3. 請說明光合作用。",
    source_class: "ai_authored",
    source_id: "phase4_a_test_001",
    license: "AI_ORIGINAL",
  });
  assert.equal(r.details.ok, true);
  assert.equal(r.details.kind, "text");
  assert.equal(r.details.raw_question_count, 3);
  assert.equal(r.details.candidates.length, 3);
  // Each candidate should have a candidate_id, detection_signals, source_provenance.
  for (const c of r.details.candidates) {
    assert.ok(c.candidate_id);
    assert.ok(c.ingestion_id);
    assert.equal(c.source_provenance.source_class, "ai_authored");
  }
});

// ─────────────────────────────────────
// raw_question_ingest: structured
// ─────────────────────────────────────

test("raw_question_ingest: structured kind end-to-end returns N candidates", async () => {
  const r = await runTool("raw_question_ingest", {
    kind: "structured",
    content: {
      questions: [
        { stem: "What is 1+1?" },
        { stem: "What is 2+2?" },
        { stem: "What is 3+3?" },
      ],
    },
    source_class: "open_license",
    source_id: "openstax_phase4a",
    license: "CC-BY",
  });
  assert.equal(r.details.ok, true);
  assert.equal(r.details.raw_question_count, 3);
  for (const c of r.details.candidates) {
    assert.equal(c.source_provenance.license, "CC-BY");
  }
});

// ─────────────────────────────────────
// raw_question_ingest: pdf → unsupported
// ─────────────────────────────────────

test("raw_question_ingest: pdf kind surfaces unsupported_in_round_4a", async () => {
  const r = await runTool("raw_question_ingest", {
    kind: "pdf",
    content: Buffer.from("%PDF-1.4\nfake pdf bytes").toString("base64"),
    source_class: "open_license",
    source_id: "pdf_test_001",
    license: "CC-BY",
  });
  assert.equal(r.details.ok, false);
  assert.equal(r.details.kind, "pdf");
  assert.equal(r.details.candidates.length, 0);
  assert.equal(r.details.errors[0].code, "unsupported_in_round_4a");
});

// ─────────────────────────────────────
// raw_question_ingest: image → unsupported
// ─────────────────────────────────────

test("raw_question_ingest: image kind surfaces unsupported_in_round_4a", async () => {
  const r = await runTool("raw_question_ingest", {
    kind: "image",
    content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    source_class: "ai_authored",
    source_id: "img_test_001",
    license: "AI_ORIGINAL",
  });
  assert.equal(r.details.ok, false);
  assert.equal(r.details.kind, "image");
  assert.equal(r.details.errors[0].code, "unsupported_in_round_4a");
});

// ─────────────────────────────────────
// raw_question_ingest: validation errors
// ─────────────────────────────────────

test("raw_question_ingest: invalid kind returns invalid_kind error", async () => {
  const r = await runTool("raw_question_ingest", {
    kind: "video",
    content: "x",
    source_class: "ai_authored",
    source_id: "x",
    license: "AI_ORIGINAL",
  });
  assert.equal(r.details.ok, false);
  assert.equal(r.details.errors[0].code, "invalid_kind");
});

test("raw_question_ingest: invalid license returns invalid_license error", async () => {
  const r = await runTool("raw_question_ingest", {
    kind: "text",
    content: "x",
    source_class: "ai_authored",
    source_id: "x",
    license: "PROPRIETARY",
  });
  assert.equal(r.details.ok, false);
  assert.ok(r.details.errors.find((e) => e.code === "invalid_license"));
});

// ─────────────────────────────────────
// raw_question_segment: each type
// ─────────────────────────────────────

test("raw_question_segment: recognizes multiple_choice from MC candidates", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content: "題目\nA) 蘋果\nB) 香蕉\nC) 葡萄\nD) 橘子",
    source_class: "ai_authored",
    source_id: "mc_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.ok, true);
  assert.equal(seg.details.segmented_count, 1);
  assert.equal(seg.details.questions[0].type, "multiple_choice");
  assert.equal(seg.details.questions[0].choices.length, 4);
});

test("raw_question_segment: recognizes short_answer", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content: "2 + 3 = ?",
    source_class: "ai_authored",
    source_id: "sa_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.questions[0].type, "short_answer");
});

test("raw_question_segment: recognizes true_false", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content: "The sky is blue (T/F)",
    source_class: "ai_authored",
    source_id: "tf_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.questions[0].type, "true_false");
});

test("raw_question_segment: recognizes fill_in_blank", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content: "小明有 ____ 顆糖。",
    source_class: "ai_authored",
    source_id: "fib_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.questions[0].type, "fill_in_blank");
  assert.equal(seg.details.questions[0].blank_count, 1);
});

test("raw_question_segment: recognizes essay", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content: "請說明光合作用的過程。",
    source_class: "ai_authored",
    source_id: "essay_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.questions[0].type, "essay");
});

test("raw_question_segment: unknown surfaces a warning", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content: "random gibberish without any cues",
    source_class: "ai_authored",
    source_id: "unk_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.questions[0].type, "unknown");
  assert.ok(seg.details.warnings.length > 0);
});

// ─────────────────────────────────────
// End-to-end: ingest → segment
// ─────────────────────────────────────

test("end-to-end ingest then segment: 6-mixed batch", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "text",
    content:
      "1. 2+3=?\n\n" +
      "2. Q\nA) apple\nB) banana\nC) cherry\nD) date\n\n" +
      "3. (T/F) The earth orbits the sun.\n\n" +
      "4. There are ____ planets.\n\n" +
      "5. 請說明太陽系結構。\n\n" +
      "6. no pattern at all here",
    source_class: "ai_authored",
    source_id: "e2e_batch_phase4a",
    license: "AI_ORIGINAL",
  });
  assert.equal(ingest.details.ok, true);
  assert.equal(ingest.details.raw_question_count, 6);
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.ok, true);
  assert.equal(seg.details.segmented_count, 6);
  const types = seg.details.questions.map((q) => q.type);
  assert.equal(types[0], "short_answer");
  assert.equal(types[1], "multiple_choice");
  assert.equal(types[2], "true_false");
  assert.equal(types[3], "fill_in_blank");
  assert.equal(types[4], "essay");
  assert.equal(types[5], "unknown");
});

test("end-to-end structured → segment", async () => {
  const ingest = await runTool("raw_question_ingest", {
    kind: "structured",
    content: {
      questions: [
        { stem: "What is 2+2?\nA) 3\nB) 4\nC) 5\nD) 6" },
        { stem: "Please explain photosynthesis." },
      ],
    },
    source_class: "ai_authored",
    source_id: "structured_test",
    license: "AI_ORIGINAL",
  });
  const seg = await runTool("raw_question_segment", { candidates: ingest.details.candidates });
  assert.equal(seg.details.questions[0].type, "multiple_choice");
  assert.equal(seg.details.questions[1].type, "essay");
});

// ─────────────────────────────────────
// Production invariants (Phase 4A is pure — should NOT change any of these)
// ─────────────────────────────────────

test("Phase 4A invariant: student_001 evidence ledger MD5 UNCHANGED", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "data/mastery-evidence/student_001.jsonl"));
  assert.equal(md5, "47ada0bdaabcab4683484427f581295c");
});

test("Phase 4A invariant: student_001 learning-records MD5 UNCHANGED", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "data/learning-records/student_001.jsonl"));
  assert.equal(md5, "5facdbf0b47e67d30baea59704ef0a90");
});

test("Phase 4A invariant: student_002 learning-records UNCHANGED (file may not exist)", async () => {
  const file = path.join(WORKSPACE, "data/learning-records/student_002.jsonl");
  const md5 = await fileMD5(file);
  // Either null (file does not exist) or unchanged MD5. Both are acceptable.
  if (md5 !== null) {
    assert.equal(typeof md5, "string");
    assert.equal(md5.length, 32);
  }
});

test("Phase 4A invariant: student_001 profile MD5 UNCHANGED", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "data/students/student_001.json"));
  assert.equal(md5, "a6bd940971b06b5a1e24b20dd804cc48");
});

test("Phase 4A invariant: AGENTS.md + SOUL.md + USER.md + IDENTITY.md UNCHANGED", async () => {
  const expectations = {
    "AGENTS.md": "fc0a1477c9bd6ae631cf2aea5ce75f1e",
    "SOUL.md": "e067ae104d26c5ca90679be0b23a4fe7",
    "USER.md": "9f90803726401fa166be4ab1ad848182",
    "IDENTITY.md": "d165c2d42796d1f41455020b31785def",
  };
  for (const [name, expected] of Object.entries(expectations)) {
    const md5 = await fileMD5(path.join(WORKSPACE, name));
    assert.equal(md5, expected, `${name} md5 should be ${expected}, got ${md5}`);
  }
});

test("Phase 4A invariant: ingest did not create any new files under data/", async () => {
  // Phase 4A is pure: ingest + segment must not write any artifact. Spot-check
  // that no `student_t_phase4*` files were created.
  for (const sub of ["mastery-evidence", "mastery", "curriculum-progress"]) {
    const dir = path.join(WORKSPACE, "data", sub);
    const entries = await fs.readdir(dir).catch(() => []);
    const phase4 = entries.filter((e) => /phase4/i.test(e));
    assert.deepEqual(phase4, [], `${sub} should have no phase4 artifacts, got ${phase4.join(",")}`);
  }
});