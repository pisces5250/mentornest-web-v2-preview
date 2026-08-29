// Integration test: Phase 3.5 sub-session B — Local TTS (sherpa-onnx-tts priority).
// Loads the built dist/ plugin entry and exercises all 4 new tts_* tools.
//
// Verifies:
//   - Plugin entry loads and registers all 4 new tts_* tools
//   - Each tool returns its documented shape on valid input
//   - tts_synthesize produces deterministic placeholder audio (WAV bytes)
//   - tts_synthesize never calls a cloud TTS backend (backend is local-only)
//   - tts_synthesize validation matches the documented rules
//   - data/learning-records/student_001.jsonl is UNCHANGED (line count + md5)
//   - data/students/student_001.json is UNCHANGED
//   - AGENTS.md / SOUL.md / USER.md / IDENTITY.md are UNCHANGED (MD5 stable)
//   - Manifest tool count is in the target range (125-126)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";
const WORKSPACE = "/home/node/.openclaw/workspace";
const PLUGIN_ROOT = "/home/node/.openclaw/plugins/mentornest-learning";
const RECORDS_STUDENT_001 = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
const STUDENT_001_JSON = path.join(WORKSPACE, "data/students/student_001.json");

const TTS_TOOLS = [
  "tts_synthesize",
  "tts_list_voices",
  "tts_status",
  "tts_hash_text",
];

async function loadTools() {
  // Re-import the freshly built module.
  const mod = await import(`${PLUGIN_PATH}?t=${Date.now()}_${Math.random()}`);
  const tools = [];
  const fakeApi = { registerTool(t) { tools.push(t); } };
  mod.default.register(fakeApi);
  return { mod, tools };
}

async function readFileOrNull(file) {
  try { return await fs.readFile(file, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

async function countLines(file) {
  const raw = await readFileOrNull(file);
  if (raw === null) return 0;
  return raw.split("\n").filter((l) => l.trim().length > 0).length;
}

async function fileMD5(file) {
  const buf = await readFileOrNull(file);
  if (buf === null) return null;
  return crypto.createHash("md5").update(Buffer.from(buf)).digest("hex");
}

test("plugin entry loads with all 4 tts_* tools registered", async () => {
  const { mod, tools } = await loadTools();
  assert.ok(mod.default);
  assert.equal(mod.default.id, "mentornest-learning");
  for (const name of TTS_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing tool: ${name}`);
  }
});

test("manifest contracts.tools contains all 4 tts_* entries", async () => {
  const m = JSON.parse(await fs.readFile(path.join(PLUGIN_ROOT, "openclaw.plugin.json"), "utf8"));
  assert.ok(m.contracts && Array.isArray(m.contracts.tools), "contracts.tools missing");
  for (const name of TTS_TOOLS) {
    assert.ok(m.contracts.tools.includes(name), `contracts.tools missing: ${name}`);
  }
});

test("manifest manifest.tools contains all 4 tts_* entries with metadata", async () => {
  const m = JSON.parse(await fs.readFile(path.join(PLUGIN_ROOT, "openclaw.plugin.json"), "utf8"));
  assert.ok(m.manifest && Array.isArray(m.manifest.tools), "manifest.tools missing");
  for (const name of TTS_TOOLS) {
    const entry = m.manifest.tools.find((e) => e.name === name);
    assert.ok(entry, `manifest.tools missing: ${name}`);
    assert.equal(typeof entry.description, "string");
    assert.ok(entry.description.length > 0);
    assert.ok(entry.parameters);
    assert.equal(typeof entry.handler, "string");
  }
});

test("manifest top-level tools.length is in target range 126-130 (B+D additions)", async () => {
  const m = JSON.parse(await fs.readFile(path.join(PLUGIN_ROOT, "openclaw.plugin.json"), "utf8"));
  assert.ok(Array.isArray(m.tools), "top-level tools array missing");
  assert.ok(m.tools.length >= 126 && m.tools.length <= 130, `got ${m.tools.length}`);
  for (const name of TTS_TOOLS) {
    assert.ok(m.tools.includes(name), `top-level tools missing: ${name}`);
  }
});

test("tts_synthesize: tool dispatch returns documented shape", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "Hello world", voice_id: "default", speed: 1.0 });
  assert.equal(r.details.ok, true);
  assert.equal(r.details.audio_format, "wav");
  assert.equal(r.details.voice_id, "default");
  assert.equal(typeof r.details.audio_b64, "string");
  assert.ok(r.details.audio_b64.length > 0);
  assert.equal(typeof r.details.duration_ms, "number");
  assert.equal(typeof r.details.content_hash, "string");
  assert.equal(r.details.content_hash.length, 16);
});

test("tts_synthesize: returns WAV with valid header", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "Pronunciation test" });
  const buf = Buffer.from(r.details.audio_b64, "base64");
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WAVE");
  assert.equal(buf.toString("ascii", 12, 16), "fmt ");
  assert.equal(buf.toString("ascii", 36, 40), "data");
  assert.equal(buf.readUInt16LE(20), 1, "audio format = PCM");
  assert.equal(buf.readUInt16LE(22), 1, "1 channel (mono)");
  assert.equal(buf.readUInt32LE(24), 16000, "16 kHz sample rate");
  assert.equal(buf.readUInt16LE(34), 16, "16-bit");
  assert.equal(buf.length, 44 + 8000 * 2, "WAV size = header + 0.5s @ 16kHz 16-bit mono");
});

test("tts_synthesize: never reports a cloud TTS backend", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "hi" });
  const cloud = ["google_tts", "azure_tts", "aws_polly", "elevenlabs", "openai_tts"];
  for (const b of cloud) {
    assert.notEqual(r.details.backend, b, `cloud backend ${b} forbidden`);
  }
});

test("tts_synthesize: backend is local-only (sherpa-onnx-tts or placeholder)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "hi" });
  assert.ok(["sherpa-onnx-tts", "placeholder"].includes(r.details.backend));
});

test("tts_synthesize: same inputs → same audio_b64 + content_hash (deterministic)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const a = await t.execute("c", { text: "Hello", voice_id: "default", speed: 1.0 });
  const b = await t.execute("c", { text: "Hello", voice_id: "default", speed: 1.0 });
  assert.equal(a.details.audio_b64, b.details.audio_b64);
  assert.equal(a.details.content_hash, b.details.content_hash);
});

test("tts_synthesize: different speed → different content_hash", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const a = await t.execute("c", { text: "Hello", voice_id: "default", speed: 1.0 });
  const b = await t.execute("c", { text: "Hello", voice_id: "default", speed: 1.5 });
  assert.notEqual(a.details.content_hash, b.details.content_hash);
});

test("tts_synthesize: empty text → ok:false error", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "" });
  assert.equal(r.details.ok, false);
  assert.equal(typeof r.details.error.code, "string");
});

test("tts_synthesize: text too long → ok:false error", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "a".repeat(2001) });
  assert.equal(r.details.ok, false);
});

test("tts_synthesize: unknown voice_id → ok:false error", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r = await t.execute("c", { text: "hi", voice_id: "not-a-voice" });
  assert.equal(r.details.ok, false);
  assert.equal(r.details.error.code, "voice_id-not-in-list");
});

test("tts_synthesize: out-of-range speed → ok:false error", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  const r1 = await t.execute("c", { text: "hi", speed: 0.1 });
  assert.equal(r1.details.ok, false);
  const r2 = await t.execute("c", { text: "hi", speed: 5.0 });
  assert.equal(r2.details.ok, false);
});

test("tts_list_voices: returns ≥ 1 voice with documented shape", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_list_voices");
  const r = await t.execute("c", {});
  assert.equal(r.details.ok, true);
  assert.ok(Array.isArray(r.details.voices));
  assert.ok(r.details.voices.length >= 1);
  for (const v of r.details.voices) {
    assert.equal(typeof v.voice_id, "string");
    assert.equal(typeof v.locale, "string");
    assert.equal(typeof v.gender, "string");
    assert.equal(typeof v.sample_rate_hz, "number");
    assert.equal(typeof v.description, "string");
  }
});

test("tts_status: returns backend + available + reason", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_status");
  const r = await t.execute("c", {});
  assert.equal(r.details.ok, true);
  assert.ok(["sherpa-onnx-tts", "placeholder"].includes(r.details.backend));
  assert.equal(typeof r.details.available, "boolean");
  assert.ok(r.details.reason === null || typeof r.details.reason === "string");
});

test("tts_hash_text: returns deterministic 16-hex-char hash", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_hash_text");
  const r = await t.execute("c", { text: "Hello", voice_id: "default", speed: 1.0 });
  assert.equal(r.details.ok, true);
  assert.match(r.details.content_hash, /^[0-9a-f]{16}$/);
  const r2 = await t.execute("c", { text: "Hello", voice_id: "default", speed: 1.0 });
  assert.equal(r.details.content_hash, r2.details.content_hash);
});

test("tts_hash_text: matches tts_synthesize.content_hash for same inputs", async () => {
  const { tools } = await loadTools();
  const hashT = tools.find((x) => x.name === "tts_hash_text");
  const synthT = tools.find((x) => x.name === "tts_synthesize");
  const h = await hashT.execute("c", { text: "Deterministic test", voice_id: "default", speed: 1.0 });
  const s = await synthT.execute("c", { text: "Deterministic test", voice_id: "default", speed: 1.0 });
  assert.equal(h.details.content_hash, s.details.content_hash);
});

test("tts_synthesize with student_t_tts fake id: no profile write / no record append", async () => {
  // snapshot baseline
  const recBefore = await countLines(RECORDS_STUDENT_001);
  const recMD5Before = await fileMD5(RECORDS_STUDENT_001);
  const stuBefore = await readFileOrNull(STUDENT_001_JSON);

  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "tts_synthesize");
  // Use a fake student id — the tool should NOT read or write any student
  // record/profile. (It doesn't even take student_id.)
  const r = await t.execute("c", { text: "student_t_tts fake id test", voice_id: "default", speed: 1.0 });
  assert.equal(r.details.ok, true);

  const recAfter = await countLines(RECORDS_STUDENT_001);
  const recMD5After = await fileMD5(RECORDS_STUDENT_001);
  const stuAfter = await readFileOrNull(STUDENT_001_JSON);
  assert.equal(recAfter, recBefore, `learning-records line count changed: ${recBefore} → ${recAfter}`);
  assert.equal(recMD5After, recMD5Before, `learning-records MD5 changed`);
  assert.equal(stuAfter, stuBefore, `student_001.json changed`);
});

test("AGENTS.md / SOUL.md / USER.md / IDENTITY.md UNCHANGED", async () => {
  // Workspace-level files (these are the canonical invariants).
  const targets = [
    path.join(WORKSPACE, "AGENTS.md"),
    path.join(WORKSPACE, "SOUL.md"),
    path.join(WORKSPACE, "USER.md"),
    path.join(WORKSPACE, "IDENTITY.md"),
  ];
  const expectedMD5 = {
    [path.join(WORKSPACE, "AGENTS.md")]: "fc0a1477c9bd6ae631cf2aea5ce75f1e",
    [path.join(WORKSPACE, "SOUL.md")]: "e067ae104d26c5ca90679be0b23a4fe7",
    [path.join(WORKSPACE, "USER.md")]: "9f90803726401fa166be4ab1ad848182",
    [path.join(WORKSPACE, "IDENTITY.md")]: "d165c2d42796d1f41455020b31785def",
  };
  // Run several tool calls first to make sure no tool touches these.
  const { tools } = await loadTools();
  const synth = tools.find((x) => x.name === "tts_synthesize");
  for (let i = 0; i < 5; i++) {
    await synth.execute("c", { text: `Iteration ${i}`, voice_id: "default", speed: 1.0 });
  }
  for (const f of targets) {
    const md5 = await fileMD5(f);
    assert.equal(md5, expectedMD5[f], `${path.basename(f)} MD5 changed: ${md5} ≠ ${expectedMD5[f]}`);
  }
});

test("data/learning-records/student_001.jsonl UNCHANGED (line count + MD5)", async () => {
  const recBefore = await countLines(RECORDS_STUDENT_001);
  const recMD5Before = await fileMD5(RECORDS_STUDENT_001);

  // Run several tool calls
  const { tools } = await loadTools();
  const synth = tools.find((x) => x.name === "tts_synthesize");
  for (let i = 0; i < 5; i++) {
    await synth.execute("c", { text: `Line count test ${i}`, voice_id: "default", speed: 1.0 });
  }
  const list = tools.find((x) => x.name === "tts_list_voices");
  await list.execute("c", {});
  const status = tools.find((x) => x.name === "tts_status");
  await status.execute("c", {});
  const hash = tools.find((x) => x.name === "tts_hash_text");
  await hash.execute("c", { text: "No record touch", voice_id: "default", speed: 1.0 });

  const recAfter = await countLines(RECORDS_STUDENT_001);
  const recMD5After = await fileMD5(RECORDS_STUDENT_001);
  assert.equal(recAfter, recBefore, `line count changed: ${recBefore} → ${recAfter}`);
  assert.equal(recMD5After, recMD5Before, `MD5 changed`);
});

test("data/students/student_001.json UNCHANGED", async () => {
  const before = await readFileOrNull(STUDENT_001_JSON);
  const { tools } = await loadTools();
  const synth = tools.find((x) => x.name === "tts_synthesize");
  await synth.execute("c", { text: "students no-touch test", voice_id: "default", speed: 1.0 });
  const after = await readFileOrNull(STUDENT_001_JSON);
  assert.equal(after, before, "student_001.json changed");
});