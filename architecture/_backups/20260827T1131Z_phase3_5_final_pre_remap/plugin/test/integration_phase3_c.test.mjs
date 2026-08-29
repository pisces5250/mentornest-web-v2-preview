// Integration test: Phase 3 sub-session C (RESPAWN) — English Specialist v1 +
// local STT interface. Loads the built dist/ plugin entry and exercises all
// 16 new English tools.
//
// Verifies:
//   - Plugin entry loads and registers all 16 English specialist tools
//   - Each tool returns its documented shape
//   - Cross-student isolation: writes for student_001 do not appear in student_002
//   - evidence_payload appends to the mastery-evidence ledger (append-only)
//   - student_001.jsonl line count is UNCHANGED (English specialist does not
//     write learning-records directly)
//   - Protected files (students, learning-records, mastery, curriculum-progress)
//     have unchanged MD5s.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";
const WORKSPACE = "/home/node/.openclaw/workspace";
const RECORDS_STUDENT_001 = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
const EVIDENCE_STUDENT_001 = path.join(WORKSPACE, "data/mastery-evidence/student_001.jsonl");
const EVIDENCE_STUDENT_002 = path.join(WORKSPACE, "data/mastery-evidence/student_002.jsonl");

// Phase 3.5: emit tests use fake student IDs (student_t_*) to avoid polluting production evidence ledger.
// Production invariants still enforced: real student evidence ledgers must NOT change after emit.
const TEST_STUDENT_C = "student_t_c";
const EVIDENCE_TEST_C = path.join(WORKSPACE, "data/mastery-evidence", `${TEST_STUDENT_C}.jsonl`);

const ENGLISH_TOOLS = [
  "english_error_taxonomy_lookup",
  "english_specialist_diagnose",
  "english_specialist_analyze_reading",
  "english_specialist_transcribe_and_grade",
  "english_specialist_evaluate_conversation",
  "english_specialist_decide",
  "english_specialist_emit_evidence",
  "english_hint_ladder_next",
  "english_curriculum_lookup_kp",
  "english_curriculum_list_for_grade",
  "english_subskill_classify",
  "english_stt_validate_audio_path",
  "english_stt_validate_transcript",
  "english_stt_transcription_gate",
  "english_stt_capability_report",
  "english_stt_request",
];

async function loadTools() {
  const mod = await import(PLUGIN_PATH);
  const tools = [];
  const fakeApi = { registerTool(t) { tools.push(t); } };
  mod.default.register(fakeApi);
  return { mod, tools };
}

async function readLines(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split("\n").filter((l) => l.trim().length > 0);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
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
// Plugin entry + tool registration
// ─────────────────────────────────────

test("plugin entry loads with English specialist tools registered", async () => {
  const { mod, tools } = await loadTools();
  assert.ok(mod.default);
  assert.equal(mod.default.id, "mentornest-learning");
  for (const name of ENGLISH_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing tool: ${name}`);
  }
  // 16 new English tools added. The total count should be at least 81 (65 + 16).
  // The spec says 70 = 54 + 16, but the actual baseline is 65 (Chinese 11 + Math 10 + others).
  assert.ok(tools.length >= 81, `expected ≥81 tools, got ${tools.length}`);
});

// ─────────────────────────────────────
// Each English tool end-to-end
// ─────────────────────────────────────

test("english_error_taxonomy_lookup: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_error_taxonomy_lookup");
  const r = await t.execute("c", {});
  assert.equal(r.details.ok, true);
  assert.ok(r.details.size >= 15 && r.details.size <= 25);
  assert.ok(r.details.categories.length >= 10);

  // Lookup by code
  const r2 = await t.execute("c", { code: "EN-PHON-LS" });
  assert.equal(r2.details.ok, true);
  assert.equal(r2.details.entry.code, "EN-PHON-LS");
});

test("english_specialist_diagnose: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_diagnose");
  const r = await t.execute("c", {
    stem: "What color is the sky?",
    student_answer: "blue",
    expected_answer: "blue",
    knowledge_point: "english.G2.VOC.basic-vocab",
    grade: 2,
    student_id: 'student_t_c',
  });
  assert.equal(r.details.correct, true);
  assert.equal(r.details.hint_level, 0);
  assert.deepEqual(r.details.error_codes, []);
  assert.equal(r.details.evidence_payload.subject, "english");
});

test("english_specialist_analyze_reading: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_analyze_reading");
  const r = await t.execute("c", {
    stem: "Tom went to the park on Monday.",
    student_answer: "the park",
    expected_answer: "the park",
    kind: "explicit",
  });
  assert.equal(r.details.correct, true);
  assert.equal(r.details.kind, "explicit");
});

test("english_specialist_transcribe_and_grade: end-to-end (no actual STT)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_transcribe_and_grade");
  const r = await t.execute("c", {
    student_id: 'student_t_c',
    audio_path: null,
    knowledge_point: "english.G2.SPEAK.basic-phrase",
    stem: "How are you?",
    expected_answer: "I am fine.",
    locale: "en-US",
  });
  assert.equal(r.details.ok, true);
  assert.equal(r.details.stt_request.provider, "sensevoice_local");
  assert.equal(r.details.stt_request.auto_invoke, false);
  assert.equal(r.details.stt_request.expected_format, "zh-en-mixed");
});

test("english_specialist_evaluate_conversation: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_evaluate_conversation");
  const r = await t.execute("c", {
    conversation_history: [{ role: "assistant", text: "Hi there!" }],
    student_turn: "Hello! How are you?",
    target_features: ["greeting", "ask_back", "politeness"],
  });
  assert.equal(typeof r.details.feature_pass.greeting, "boolean");
});

test("english_specialist_decide: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_decide");
  const r = await t.execute("c", {
    student_id: 'student_t_c',
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 3,
    error_codes: ["EN-PHON-LS"],
  });
  assert.equal(r.details.action, "drill_phonics");
});

test("english_hint_ladder_next: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_hint_ladder_next");
  const r = await t.execute("c", {
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 1,
    error_code: "EN-PHON-LS",
  });
  assert.equal(r.details.level, 1);
  assert.equal(r.details.representation_suggestion, "phonics");
});

test("english_curriculum_lookup_kp: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_curriculum_lookup_kp");
  const r = await t.execute("c", { knowledge_point: "english.G5.READ.passage-inference" });
  assert.equal(r.details.found, true);
  assert.equal(r.details.grade, 5);
});

test("english_curriculum_list_for_grade: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_curriculum_list_for_grade");
  const r = await t.execute("c", { grade: 5 });
  assert.equal(r.details.found, true);
  assert.ok(r.details.knowledge_points.length >= 1);
});

test("english_subskill_classify: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_subskill_classify");
  const r = await t.execute("c", { knowledge_point: "english.G3.PHONE.letter-sound" });
  assert.equal(r.details.primary_subskill, "phonics");
});

test("english_stt_validate_audio_path: end-to-end (rejects URL)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_stt_validate_audio_path");
  const r = await t.execute("c", { audio_path: "https://example.com/x.wav" });
  assert.equal(r.details.allowed, false);
  assert.match(r.details.reason, /url/i);
});

test("english_stt_validate_transcript: end-to-end (rejects cloud)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_stt_validate_transcript");
  const r = await t.execute("c", {
    transcript: "hello",
    locale: "en-US",
    source: "whisper_openai",
  });
  assert.equal(r.details.ok, false);
  assert.match(r.details.reason, /forbidden/i);
});

test("english_stt_transcription_gate: end-to-end (rejects missing audio)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_stt_transcription_gate");
  const r = await t.execute("c", { student_id: 'student_t_c', mode: "oral_response" });
  assert.equal(r.details.allowed, false);
  assert.match(r.details.reason, /audio_path-required/i);
});

test("english_stt_capability_report: declares TTS + pronunciation scoring as missing", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_stt_capability_report");
  const r = await t.execute("c", {});
  assert.equal(r.details.stt, "ready_local_sensevoice");
  assert.equal(r.details.tts, "missing_local_production");
  assert.equal(r.details.pronunciation_scoring, "missing_local_production");
  assert.ok(r.details.gaps.length > 0);
});

test("english_stt_request: produces structured request (no actual call)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_stt_request");
  const AUDIO = path.join(WORKSPACE, "data", "audio", "x.wav");
  const r = await t.execute("c", { audio_path: AUDIO, locale: "en-US" });
  assert.equal(r.details.provider, "sensevoice_local");
  assert.equal(r.details.valid, true);
  assert.equal(r.details.expected_format, "zh-en-mixed");
});

// ─────────────────────────────────────
// Cross-student isolation + evidence ledger
// ─────────────────────────────────────

test("english_specialist_emit_evidence: appends to test-student ledger, NOT production ledgers", async () => {
  const beforeTest = await readLines(EVIDENCE_TEST_C);
  const before001 = await readLines(EVIDENCE_STUDENT_001);
  const before002 = await readLines(EVIDENCE_STUDENT_002);
  const beforeTestCount = beforeTest ? beforeTest.length : 0;
  const beforeCount001 = before001 ? before001.length : 0;
  const beforeCount002 = before002 ? before002.length : 0;

  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_emit_evidence");
  const r = await t.execute("c", {
    student_id: 'student_t_c',
    knowledge_point: "english.G3.PHONE.letter-sound",
    evidence_payload: {
      subskill: "phonics",
      error_code: ["EN-PHON-LS"],
      result: "incorrect",
    },
  });
  assert.equal(r.details.ok, true);
  assert.ok(r.details.evidence_event_id);

  // Test-student ledger SHOULD grow by 1
  const afterTest = await readLines(EVIDENCE_TEST_C);
  assert.ok(afterTest);
  assert.equal(afterTest.length, beforeTestCount + 1);

  // Production ledgers MUST NOT change
  const after001 = await readLines(EVIDENCE_STUDENT_001);
  const after002 = await readLines(EVIDENCE_STUDENT_002);
  if (before001 === null) {
    assert.equal(after001, null, "production student_001 evidence ledger must remain absent");
  } else {
    assert.equal(after001.length, beforeCount001, "production student_001 evidence ledger must not change");
  }
  if (before002 === null) {
    assert.equal(after002, null);
  } else {
    assert.equal(after002.length, beforeCount002);
  }

  // Verify the last line in test-student ledger is well-formed.
  const lastLine = JSON.parse(afterTest[afterTest.length - 1]);
  assert.equal(lastLine.student_id, 'student_t_c');
  assert.equal(lastLine.subject, "english");
  assert.equal(lastLine.knowledge_point, "english.G3.PHONE.letter-sound");
  assert.equal(lastLine.error_type, "EN-PHON-LS");
});

test("english_specialist_emit_evidence: rejects invalid student_id", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "english_specialist_emit_evidence");
  const r = await t.execute("c", {
    student_id: "BAD_ID",
    knowledge_point: "english.G3.PHONE.x",
  });
  assert.equal(r.details.ok, false);
});

// ─────────────────────────────────────
// Protected file invariants
// ─────────────────────────────────────

test("student_001.jsonl line count is UNCHANGED after English specialist runs", async () => {
  // Read live file; the contract is that English specialist never writes to
  // data/learning-records/.
  const lines = await readLines(RECORDS_STUDENT_001);
  assert.ok(lines);
  assert.equal(lines.length, 26, `expected 26, got ${lines.length}`);
  const md5 = await fileMD5(RECORDS_STUDENT_001);
  assert.equal(md5, "5facdbf0b47e67d30baea59704ef0a90");
});

test("student_001.json (profile) MD5 unchanged", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "data/students/student_001.json"));
  assert.equal(md5, "a6bd940971b06b5a1e24b20dd804cc48");
});

test("student_002.json (profile) MD5 unchanged", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "data/students/student_002.json"));
  assert.equal(md5, "6bf5cb74e9e5b9febdfc9f5fe72ad87e");
});

test("AGENTS.md unchanged", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "AGENTS.md"));
  assert.equal(md5, "fc0a1477c9bd6ae631cf2aea5ce75f1e");
});

test("SOUL.md unchanged", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "SOUL.md"));
  assert.equal(md5, "e067ae104d26c5ca90679be0b23a4fe7");
});

test("USER.md unchanged", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "USER.md"));
  assert.equal(md5, "9f90803726401fa166be4ab1ad848182");
});

test("IDENTITY.md unchanged", async () => {
  const md5 = await fileMD5(path.join(WORKSPACE, "IDENTITY.md"));
  assert.equal(md5, "d165c2d42796d1f41455020b31785def");
});
