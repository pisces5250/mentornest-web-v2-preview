// Unit tests: tts_local (Phase 3.5-B)
// Run with: node --test test/tts_local.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ttsSynthesize,
  ttsListVoices,
  ttsStatus,
  ttsComputeContentHash,
  _internal,
} from "../lib/tts_local.mjs";

// ─────────────────────────────────────
// ttsListVoices
// ─────────────────────────────────────

test("ttsListVoices: returns at least one voice", () => {
  const voices = ttsListVoices();
  assert.ok(Array.isArray(voices));
  assert.ok(voices.length >= 1, `expected ≥ 1 voice, got ${voices.length}`);
});

test("ttsListVoices: default voice present with documented shape", () => {
  const voices = ttsListVoices();
  const def = voices.find((v) => v.voice_id === "default");
  assert.ok(def, "default voice must exist");
  assert.equal(typeof def.locale, "string");
  assert.ok(def.locale.length > 0);
  assert.equal(typeof def.gender, "string");
  assert.equal(typeof def.sample_rate_hz, "number");
  assert.ok(def.sample_rate_hz > 0);
  assert.equal(typeof def.description, "string");
});

test("ttsListVoices: every voice has the documented fields", () => {
  for (const v of ttsListVoices()) {
    assert.ok("voice_id" in v);
    assert.ok("locale" in v);
    assert.ok("gender" in v);
    assert.ok("sample_rate_hz" in v);
    assert.ok("description" in v);
  }
});

test("ttsListVoices: list is deterministic", () => {
  const a = ttsListVoices();
  const b = ttsListVoices();
  assert.deepEqual(a, b);
});

// ─────────────────────────────────────
// ttsStatus
// ─────────────────────────────────────

test("ttsStatus: returns backend + available + reason", () => {
  const r = ttsStatus();
  assert.ok(["sherpa-onnx-tts", "placeholder"].includes(r.backend));
  assert.equal(typeof r.available, "boolean");
  // reason must be string-or-null
  assert.ok(r.reason === null || typeof r.reason === "string");
});

test("ttsStatus: in sandbox, falls back to placeholder (sherpa runtime + model not installed)", () => {
  const r = ttsStatus();
  assert.equal(r.backend, "placeholder");
  assert.equal(r.available, false);
  assert.ok(typeof r.reason === "string" && r.reason.length > 0);
});

test("ttsStatus: never reports a cloud TTS backend", () => {
  const r = ttsStatus();
  const forbidden = [
    "google_tts",
    "azure_tts",
    "aws_polly",
    "elevenlabs",
    "openai_tts",
  ];
  for (const b of forbidden) {
    assert.notEqual(r.backend, b, `cloud backend ${b} must never be reported`);
  }
});

// ─────────────────────────────────────
// ttsComputeContentHash
// ─────────────────────────────────────

test("ttsComputeContentHash: returns 16 hex chars", () => {
  const h = ttsComputeContentHash("hello", "default", 1.0);
  assert.equal(typeof h, "string");
  assert.equal(h.length, 16);
  assert.match(h, /^[0-9a-f]{16}$/);
});

test("ttsComputeContentHash: same inputs → same hash (idempotent)", () => {
  const a = ttsComputeContentHash("Hello world", "default", 1.0);
  const b = ttsComputeContentHash("Hello world", "default", 1.0);
  assert.equal(a, b);
});

test("ttsComputeContentHash: different speed → different hash", () => {
  const a = ttsComputeContentHash("Hello world", "default", 1.0);
  const b = ttsComputeContentHash("Hello world", "default", 1.5);
  assert.notEqual(a, b);
});

test("ttsComputeContentHash: different voice → different hash", () => {
  const a = ttsComputeContentHash("Hello world", "default", 1.0);
  const b = ttsComputeContentHash("Hello world", "default", 1.2);
  assert.notEqual(a, b);
});

test("ttsComputeContentHash: different text → different hash", () => {
  const a = ttsComputeContentHash("Hello world", "default", 1.0);
  const b = ttsComputeContentHash("Goodbye world", "default", 1.0);
  assert.notEqual(a, b);
});

test("ttsComputeContentHash: text is normalized (trim leading/trailing whitespace)", () => {
  const a = ttsComputeContentHash("Hello world", "default", 1.0);
  const b = ttsComputeContentHash("  Hello world  ", "default", 1.0);
  assert.equal(a, b, "trimming must produce identical hash");
});

test("ttsComputeContentHash: clamps out-of-range speed deterministically", () => {
  const a = ttsComputeContentHash("hi", "default", 10); // clamps to 2.0
  const b = ttsComputeContentHash("hi", "default", 2.0);
  assert.equal(a, b);
});

// ─────────────────────────────────────
// ttsSynthesize — error paths
// ─────────────────────────────────────

test("ttsSynthesize: empty text → ok:false error", () => {
  const r = ttsSynthesize({ text: "" });
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.equal(typeof r.error.code, "string");
});

test("ttsSynthesize: non-string text → ok:false error", () => {
  const r = ttsSynthesize({ text: null });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "text-must-be-non-empty-string");
});

test("ttsSynthesize: text too long (>2000) → ok:false error", () => {
  const r = ttsSynthesize({ text: "a".repeat(2001) });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "text-too-long");
});

test("ttsSynthesize: unknown voice_id → ok:false error with known list", () => {
  const r = ttsSynthesize({ text: "hi", voice_id: "not-a-real-voice" });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "voice_id-not-in-list");
  assert.ok(Array.isArray(r.error.known_voice_ids));
  assert.ok(r.error.known_voice_ids.includes("default"));
});

test("ttsSynthesize: speed below 0.5 → ok:false error", () => {
  const r = ttsSynthesize({ text: "hi", speed: 0.1 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "speed-out-of-range");
});

test("ttsSynthesize: speed above 2.0 → ok:false error", () => {
  const r = ttsSynthesize({ text: "hi", speed: 3.0 });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "speed-out-of-range");
});

test("ttsSynthesize: non-number speed → ok:false error", () => {
  const r = ttsSynthesize({ text: "hi", speed: "fast" });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "speed-must-be-finite-number");
});

// ─────────────────────────────────────
// ttsSynthesize — success path
// ─────────────────────────────────────

test("ttsSynthesize: valid text → ok:true with audio_b64 + content_hash", () => {
  const r = ttsSynthesize({ text: "Hello world", voice_id: "default", speed: 1.0 });
  assert.equal(r.ok, true);
  assert.equal(typeof r.audio_b64, "string");
  assert.ok(r.audio_b64.length > 0);
  assert.equal(r.audio_format, "wav");
  assert.equal(r.voice_id, "default");
  assert.equal(typeof r.content_hash, "string");
  assert.equal(r.content_hash.length, 16);
  assert.equal(typeof r.duration_ms, "number");
  assert.ok(r.duration_ms > 0);
});

test("ttsSynthesize: default voice_id when omitted", () => {
  const r = ttsSynthesize({ text: "hi" });
  assert.equal(r.ok, true);
  assert.equal(r.voice_id, "default");
});

test("ttsSynthesize: default speed when omitted", () => {
  const r = ttsSynthesize({ text: "hi", voice_id: "default" });
  assert.equal(r.ok, true);
  assert.equal(typeof r.duration_ms, "number");
});

test("ttsSynthesize: same text+voice+speed → same content_hash (deterministic)", () => {
  const a = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.0 });
  const b = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.0 });
  assert.equal(a.content_hash, b.content_hash);
});

test("ttsSynthesize: same text+voice+speed → same audio_b64 (idempotent)", () => {
  const a = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.0 });
  const b = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.0 });
  assert.equal(a.audio_b64, b.audio_b64);
});

test("ttsSynthesize: different speed → different content_hash", () => {
  const a = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.0 });
  const b = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.5 });
  assert.notEqual(a.content_hash, b.content_hash);
});

test("ttsSynthesize: different text → different content_hash", () => {
  const a = ttsSynthesize({ text: "Hello", voice_id: "default", speed: 1.0 });
  const b = ttsSynthesize({ text: "Goodbye", voice_id: "default", speed: 1.0 });
  assert.notEqual(a.content_hash, b.content_hash);
});

// ─────────────────────────────────────
// WAV format verification
// ─────────────────────────────────────

test("ttsSynthesize: audio is valid WAV (RIFF...WAVE...data)", () => {
  const r = ttsSynthesize({ text: "Hi" });
  const buf = Buffer.from(r.audio_b64, "base64");
  assert.equal(buf.length, 44 + 8000 * 2, "WAV size should be header + 0.5s @ 16kHz 16-bit mono");
  // RIFF header
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WAVE");
  // fmt chunk
  assert.equal(buf.toString("ascii", 12, 16), "fmt ");
  assert.equal(buf.readUInt16LE(20), 1, "audio format = PCM");
  assert.equal(buf.readUInt16LE(22), 1, "1 channel (mono)");
  assert.equal(buf.readUInt32LE(24), 16000, "16 kHz sample rate");
  assert.equal(buf.readUInt16LE(34), 16, "16-bit");
  // data chunk
  assert.equal(buf.toString("ascii", 36, 40), "data");
});

test("ttsSynthesize: WAV audio is non-silent (real PCM samples)", () => {
  const r = ttsSynthesize({ text: "Hi" });
  const buf = Buffer.from(r.audio_b64, "base64");
  let nonZero = 0;
  for (let i = 44; i < buf.length; i += 2) {
    if (buf.readInt16LE(i) !== 0) nonZero++;
  }
  const total = (buf.length - 44) / 2;
  assert.ok(nonZero > total * 0.9, `expected >90% non-zero samples, got ${nonZero}/${total}`);
});

// ─────────────────────────────────────
// Cloud-TTS forbidden
// ─────────────────────────────────────

test("ttsStatus: backend is never a cloud TTS provider", () => {
  const r = ttsStatus();
  const cloud = ["google_tts", "azure_tts", "aws_polly", "elevenlabs", "openai_tts", "amazon_polly", "ibm_watson_tts", "deepgram_tts", "play_ht", "murf", "wellsaid_labs", "speechify"];
  for (const b of cloud) {
    assert.notEqual(r.backend, b);
  }
});

test("_internal: forbidden cloud backends list is non-empty", () => {
  assert.ok(Array.isArray(_internal.FORBIDDEN_CLOUD_BACKENDS));
  assert.ok(_internal.FORBIDDEN_CLOUD_BACKENDS.length >= 5);
  assert.ok(_internal.FORBIDDEN_CLOUD_BACKENDS.includes("google_tts"));
  assert.ok(_internal.FORBIDDEN_CLOUD_BACKENDS.includes("azure_tts"));
});

test("_internal: defaults match documented ranges", () => {
  assert.equal(_internal.DEFAULT_VOICE_ID, "default");
  assert.equal(_internal.DEFAULT_SPEED, 1.0);
  assert.equal(_internal.MIN_SPEED, 0.5);
  assert.equal(_internal.MAX_SPEED, 2.0);
  assert.equal(_internal.MIN_TEXT_LEN, 1);
  assert.equal(_internal.MAX_TEXT_LEN, 2000);
  assert.equal(_internal.HASH_HEX_LEN, 16);
});

// ─────────────────────────────────────
// Status / backend self-consistency
// ─────────────────────────────────────

test("ttsStatus: backend matches synthesize result backend (no cloud drift)", () => {
  const status = ttsStatus();
  const r = ttsSynthesize({ text: "hi" });
  assert.equal(r.ok, true);
  assert.equal(r.backend, status.backend);
});

test("ttsSynthesize: placeholder backend is marked in response", () => {
  const status = ttsStatus();
  const r = ttsSynthesize({ text: "hi" });
  if (status.backend === "placeholder") {
    assert.equal(r.placeholder, true);
    assert.ok(typeof r.placeholder_reason === "string");
    assert.ok(typeof r.next_step === "string");
  } else {
    assert.equal(r.placeholder, false);
  }
});

test("ttsSynthesize: audio_format is always 'wav' on success", () => {
  const r = ttsSynthesize({ text: "Hi", speed: 1.2 });
  assert.equal(r.ok, true);
  assert.equal(r.audio_format, "wav");
});

// ─────────────────────────────────────
// Hash utility vs synthesize — same hash for same inputs
// ─────────────────────────────────────

test("ttsSynthesize: content_hash equals ttsComputeContentHash for same inputs", () => {
  const r = ttsSynthesize({ text: "Hello world", voice_id: "default", speed: 1.0 });
  const expected = ttsComputeContentHash("Hello world", "default", 1.0);
  assert.equal(r.content_hash, expected);
});

// ─────────────────────────────────────
// No I/O / pure function guarantees
// ─────────────────────────────────────

test("ttsSynthesize: 100 calls produce same hash (no I/O drift)", () => {
  const first = ttsSynthesize({ text: "Hi", voice_id: "default", speed: 1.0 });
  for (let i = 0; i < 100; i++) {
    const r = ttsSynthesize({ text: "Hi", voice_id: "default", speed: 1.0 });
    assert.equal(r.content_hash, first.content_hash);
    assert.equal(r.audio_b64, first.audio_b64);
  }
});

// ─────────────────────────────────────
// Validation: voice_id from list
// ─────────────────────────────────────

test("ttsSynthesize: voice_id 'default' is always accepted", () => {
  const r = ttsSynthesize({ text: "hi", voice_id: "default" });
  assert.equal(r.ok, true);
  assert.equal(r.voice_id, "default");
});

test("ttsSynthesize: voice_id list exhaustively covers all listed voices", () => {
  const voices = ttsListVoices();
  for (const v of voices) {
    const r = ttsSynthesize({ text: "hi", voice_id: v.voice_id });
    assert.equal(r.ok, true, `voice ${v.voice_id} should be accepted`);
    assert.equal(r.voice_id, v.voice_id);
  }
});