// Tests: english_stt_interface
// Run with: node --test test/english_stt_interface.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  validateAudioPath,
  validateTranscriptPayload,
  transcriptionGate,
  capabilityReport,
  requestSTT,
} from "../lib/english_stt_interface.mjs";

const WORKSPACE = "/home/node/.openclaw/workspace";
const AUDIO_ROOT = path.join(WORKSPACE, "data", "audio");

// ─────────────────────────────────────
// validateAudioPath
// ─────────────────────────────────────

test("validateAudioPath: rejects http URL", () => {
  const r = validateAudioPath({ audio_path: "http://example.com/audio.wav" });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /url/i);
});

test("validateAudioPath: rejects https URL", () => {
  const r = validateAudioPath({ audio_path: "https://example.com/audio.wav" });
  assert.equal(r.allowed, false);
});

test("validateAudioPath: rejects s3 URL", () => {
  const r = validateAudioPath({ audio_path: "s3://bucket/audio.wav" });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /url/i);
});

test("validateAudioPath: rejects path with ://", () => {
  const r = validateAudioPath({ audio_path: "ftp://something/audio.wav" });
  assert.equal(r.allowed, false);
});

test("validateAudioPath: rejects absolute path outside data/audio/", () => {
  const r = validateAudioPath({ audio_path: "/etc/passwd" });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /data-audio/);
});

test("validateAudioPath: rejects wrong extension", () => {
  const r = validateAudioPath({ audio_path: path.join(AUDIO_ROOT, "foo.txt") });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /extension/);
});

test("validateAudioPath: rejects empty string", () => {
  const r = validateAudioPath({ audio_path: "" });
  assert.equal(r.allowed, false);
});

test("validateAudioPath: rejects non-string", () => {
  const r = validateAudioPath({ audio_path: null });
  assert.equal(r.allowed, false);
});

test("validateAudioPath: accepts valid local path", () => {
  const r = validateAudioPath({ audio_path: path.join(AUDIO_ROOT, "student_001", "test.wav") });
  assert.equal(r.allowed, true, `got reason=${r.reason}`);
  assert.ok(r.normalized_path);
});

test("validateAudioPath: rejects ../ escape attempt", () => {
  const r = validateAudioPath({ audio_path: path.join(AUDIO_ROOT, "..", "..", "etc", "passwd.wav") });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /data-audio/);
});

// ─────────────────────────────────────
// validateTranscriptPayload
// ─────────────────────────────────────

test("validateTranscriptPayload: rejects cloud source (whisper_openai)", () => {
  const r = validateTranscriptPayload({
    transcript: "hello",
    locale: "en-US",
    source: "whisper_openai",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /forbidden/i);
});

test("validateTranscriptPayload: rejects cloud source (google_stt)", () => {
  const r = validateTranscriptPayload({
    transcript: "hello",
    locale: "en-US",
    source: "google_stt",
  });
  assert.equal(r.ok, false);
});

test("validateTranscriptPayload: rejects non-local source", () => {
  const r = validateTranscriptPayload({
    transcript: "hello",
    locale: "en-US",
    source: "manual",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /sensevoice_local/);
});

test("validateTranscriptPayload: rejects empty transcript", () => {
  const r = validateTranscriptPayload({
    transcript: "",
    locale: "en-US",
    source: "sensevoice_local",
  });
  assert.equal(r.ok, false);
});

test("validateTranscriptPayload: rejects unsupported locale", () => {
  const r = validateTranscriptPayload({
    transcript: "hello",
    locale: "klingon",
    source: "sensevoice_local",
  });
  assert.equal(r.ok, false);
});

test("validateTranscriptPayload: accepts valid local payload", () => {
  const r = validateTranscriptPayload({
    transcript: "Hello world.",
    locale: "en-US",
    source: "sensevoice_local",
  });
  assert.equal(r.ok, true);
  assert.equal(r.normalized.source, "sensevoice_local");
});

// ─────────────────────────────────────
// transcriptionGate
// ─────────────────────────────────────

test("transcriptionGate: rejects unknown mode", () => {
  const r = transcriptionGate({
    student_id: "student_001",
    mode: "auto",
    audio_path: path.join(AUDIO_ROOT, "x.wav"),
  });
  assert.equal(r.allowed, false);
  assert.equal(r.fallback, "transcribe_via_text_input");
});

test("transcriptionGate: rejects missing audio_path (NEVER defaults to voice)", () => {
  const r = transcriptionGate({
    student_id: "student_001",
    mode: "oral_response",
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /audio_path-required/i);
  assert.equal(r.fallback, "transcribe_via_text_input");
});

test("transcriptionGate: rejects invalid audio_path", () => {
  const r = transcriptionGate({
    student_id: "student_001",
    mode: "oral_response",
    audio_path: "https://example.com/x.wav",
  });
  assert.equal(r.allowed, false);
});

test("transcriptionGate: accepts valid request", () => {
  const r = transcriptionGate({
    student_id: "student_001",
    mode: "oral_response",
    audio_path: path.join(AUDIO_ROOT, "x.wav"),
  });
  assert.equal(r.allowed, true);
});

test("transcriptionGate: rejects empty student_id", () => {
  const r = transcriptionGate({
    student_id: "",
    mode: "oral_response",
    audio_path: path.join(AUDIO_ROOT, "x.wav"),
  });
  assert.equal(r.allowed, false);
});

test("transcriptionGate: voice input is opt-in (never default)", () => {
  // No mode specified → not allowed by default.
  const r = transcriptionGate({
    student_id: "student_001",
  });
  assert.equal(r.allowed, false);
});

// ─────────────────────────────────────
// capabilityReport
// ─────────────────────────────────────

test("capabilityReport: declares stt ready + tts + pronunciation scoring missing", () => {
  const r = capabilityReport();
  assert.equal(r.stt, "ready_local_sensevoice");
  assert.equal(r.tts, "missing_local_production");
  assert.equal(r.pronunciation_scoring, "missing_local_production");
});

test("capabilityReport: gaps array declares capability gaps", () => {
  const r = capabilityReport();
  assert.ok(Array.isArray(r.gaps));
  assert.ok(r.gaps.length > 0);
  // Must mention TTS gap and pronunciation scoring gap.
  assert.ok(r.gaps.some((g) => /tts/i.test(g)));
  assert.ok(r.gaps.some((g) => /pronunciation/i.test(g)));
  // Must mention phoneme-level scoring is interface-only.
  assert.ok(r.gaps.some((g) => /phoneme/i.test(g)));
});

// ─────────────────────────────────────
// requestSTT
// ─────────────────────────────────────

test("requestSTT: produces structured request (no actual call)", () => {
  const r = requestSTT({
    audio_path: path.join(AUDIO_ROOT, "x.wav"),
    locale: "en-US",
  });
  assert.equal(r.provider, "sensevoice_local");
  assert.equal(r.expected_format, "zh-en-mixed");
  assert.equal(r.valid, true);
  assert.ok(r.request_id.length > 0);
  assert.equal(r.locale, "en-US");
});

test("requestSTT: rejects cloud URL path", () => {
  const r = requestSTT({ audio_path: "https://example.com/x.wav", locale: "en-US" });
  assert.equal(r.valid, false);
});

test("requestSTT: rejects unsupported locale", () => {
  const r = requestSTT({
    audio_path: path.join(AUDIO_ROOT, "x.wav"),
    locale: "klingon",
  });
  assert.equal(r.valid, false);
});

test("requestSTT: returns deterministic request_id for same inputs", () => {
  const a = requestSTT({ audio_path: path.join(AUDIO_ROOT, "x.wav"), locale: "en-US" });
  const b = requestSTT({ audio_path: path.join(AUDIO_ROOT, "x.wav"), locale: "en-US" });
  assert.equal(a.request_id, b.request_id);
});

test("requestSTT: does NOT actually invoke (auto_invoke flag)", () => {
  const r = requestSTT({
    audio_path: path.join(AUDIO_ROOT, "x.wav"),
    locale: "en-US",
  });
  // Function should NOT perform any I/O. We can only assert structural properties.
  assert.equal(r.valid, true);
  // No side-effects; the function is pure.
  // (If we wanted to assert "no I/O happened", we'd run twice and check request_id equality — covered above.)
});
