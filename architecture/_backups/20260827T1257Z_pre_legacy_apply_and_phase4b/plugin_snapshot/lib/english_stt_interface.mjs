// English STT interface v1.
//
// Explicit, narrow interface for local Speech-to-Text. Pure validation + request
// factory. Does NOT actually invoke the STT binary — that lives in the
// `skills/mentornest-stt/` (sherpa-onnx + SenseVoice-Small int8) pipeline.
//
// CRITICAL INVARIANTS:
//   - Cloud STT providers are FORBIDDEN. Source must be `sensevoice_local`.
//   - Audio paths MUST be local. http(s)://, s3://, :// URLs are rejected.
//   - Paths outside data/audio/ (relative to workspace) are rejected.
//   - Modes (oral_response / reading_aloud / explain_thinking) must be
//     explicitly requested. Voice input is NEVER the default — callers must
//     opt in.
//   - TTS and pronunciation scoring are documented as missing local production
//     implementations (see capabilityReport).
//
// Reference: skills/mentornest-stt/SKILL.md — local SenseVoice pipeline.

import path from "node:path";

const WORKSPACE = "/home/node/.openclaw/workspace";
const AUDIO_ROOT = path.join(WORKSPACE, "data", "audio");

const ALLOWED_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".flac", ".ogg", ".opus", ".webm"]);

const VALID_MODES = new Set(["oral_response", "reading_aloud", "explain_thinking"]);
const VALID_LOCALES = new Set(["en-US", "en-GB", "en-AU", "en-CA", "zh-TW", "zh-CN"]);
const ONLY_LOCAL_SOURCE = "sensevoice_local";

// ───────────────────────────────────────────────────────────────────
// validateAudioPath
// ───────────────────────────────────────────────────────────────────

/**
 * Validate that an audio_path is local and lives under data/audio/.
 * Rejects:
 *   - URLs (http://, https://, s3://, ://, ftp://, file://)
 *   - Absolute paths outside data/audio/
 *   - Wrong extensions
 *
 * @param {object} input
 * @param {string} input.audio_path
 * @returns {{allowed: boolean, reason?: string, normalized_path?: string}}
 */
export function validateAudioPath({ audio_path }) {
  if (typeof audio_path !== "string" || audio_path.length === 0) {
    return { allowed: false, reason: "audio_path-must-be-non-empty-string" };
  }
  // Reject URLs / network protocols.
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(audio_path)) {
    return { allowed: false, reason: "audio_path-must-not-be-a-url" };
  }
  // Reject :// schemes.
  if (audio_path.includes("://")) {
    return { allowed: false, reason: "audio_path-must-not-be-a-url" };
  }
  // Reject paths outside data/audio/.
  // We accept absolute paths only if they resolve under AUDIO_ROOT.
  // Relative paths are resolved against WORKSPACE.
  let normalized;
  try {
    if (path.isAbsolute(audio_path)) {
      normalized = path.resolve(audio_path);
    } else {
      normalized = path.resolve(WORKSPACE, audio_path);
    }
  } catch (e) {
    return { allowed: false, reason: "audio_path-could-not-be-normalized" };
  }
  // Ensure normalized path is within AUDIO_ROOT.
  const rel = path.relative(AUDIO_ROOT, normalized);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { allowed: false, reason: "audio_path-must-be-under-data-audio" };
  }
  // Check extension.
  const ext = path.extname(normalized).toLowerCase();
  if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `audio_path-extension-not-allowed:${ext}` };
  }
  return { allowed: true, normalized_path: normalized };
}

// ───────────────────────────────────────────────────────────────────
// validateTranscriptPayload
// ───────────────────────────────────────────────────────────────────

/**
 * Validate that a transcript payload is sane and was produced by the local
 * SenseVoice pipeline (NOT a cloud STT provider).
 *
 * @param {object} input
 * @param {string} input.transcript
 * @param {string} input.locale
 * @param {string} input.source
 * @returns {{ok: boolean, reason?: string, normalized?: {transcript: string, locale: string, source: string}}}
 */
export function validateTranscriptPayload({ transcript, locale, source }) {
  if (typeof transcript !== "string" || transcript.length === 0) {
    return { ok: false, reason: "transcript-must-be-non-empty-string" };
  }
  if (typeof locale !== "string" || !VALID_LOCALES.has(locale)) {
    return { ok: false, reason: `locale-not-supported:${locale}` };
  }
  if (typeof source !== "string") {
    return { ok: false, reason: "source-must-be-string" };
  }
  // Cloud STT forbidden.
  const CLOUD_SOURCES = new Set([
    "whisper_openai",
    "whisper_openai_cloud",
    "google_stt",
    "azure_speech",
    "aws_transcribe",
    "deepgram",
    "assemblyai",
    "rev_ai",
    "ibm_watson_stt",
  ]);
  if (CLOUD_SOURCES.has(source)) {
    return { ok: false, reason: `cloud-stt-source-forbidden:${source}` };
  }
  if (source !== ONLY_LOCAL_SOURCE) {
    return { ok: false, reason: `transcript-source-must-be:${ONLY_LOCAL_SOURCE}` };
  }
  return {
    ok: true,
    normalized: {
      transcript: transcript.trim(),
      locale,
      source: ONLY_LOCAL_SOURCE,
    },
  };
}

// ───────────────────────────────────────────────────────────────────
// transcriptionGate
// ───────────────────────────────────────────────────────────────────

/**
 * Decide whether a given mode may use voice input. Voice input is opt-in:
 * the caller MUST explicitly request one of oral_response | reading_aloud
 * | explain_thinking. The function never defaults to voice.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {"oral_response"|"reading_aloud"|"explain_thinking"} input.mode
 * @param {string} [input.audio_path]
 * @returns {{allowed: boolean, reason?: string, fallback: "transcribe_via_text_input", mode: string, audio_path_valid?: boolean}}
 */
export function transcriptionGate({ student_id, mode, audio_path }) {
  if (typeof mode !== "string") {
    return {
      allowed: false,
      reason: "mode-must-be-string",
      fallback: "transcribe_via_text_input",
      mode: typeof mode === "undefined" ? "" : String(mode),
    };
  }
  if (!VALID_MODES.has(mode)) {
    return {
      allowed: false,
      reason: `mode-not-supported:${mode}`,
      fallback: "transcribe_via_text_input",
      mode,
    };
  }
  if (typeof student_id !== "string" || student_id.length === 0) {
    return {
      allowed: false,
      reason: "student_id-required",
      fallback: "transcribe_via_text_input",
      mode,
    };
  }
  // If no audio_path is provided, the gate is "advisory only": voice input
  // is not yet enabled for this call. Caller should use text input.
  if (typeof audio_path !== "string" || audio_path.length === 0) {
    return {
      allowed: false,
      reason: "audio_path-required-for-voice-mode",
      fallback: "transcribe_via_text_input",
      mode,
    };
  }
  const audio_check = validateAudioPath({ audio_path });
  if (!audio_check.allowed) {
    return {
      allowed: false,
      reason: `audio_path-rejected:${audio_check.reason}`,
      fallback: "transcribe_via_text_input",
      mode,
      audio_path_valid: false,
    };
  }
  return {
    allowed: true,
    fallback: "transcribe_via_text_input",
    mode,
    audio_path_valid: true,
  };
}

// ───────────────────────────────────────────────────────────────────
// capabilityReport
// ───────────────────────────────────────────────────────────────────

/**
 * Declare current capabilities + gaps. TTS and pronunciation scoring are
 * documented as missing local production implementations.
 *
 * @returns {{
 *   stt: "ready_local_sensevoice",
 *   tts: "missing_local_production",
 *   pronunciation_scoring: "missing_local_production",
 *   gaps: string[]
 * }}
 */
export function capabilityReport() {
  return {
    stt: "ready_local_sensevoice",
    tts: "missing_local_production",
    pronunciation_scoring: "missing_local_production",
    gaps: [
      "tts:missing-local-production",
      "pronunciation-scoring:missing-local-production",
      "phoneme-level-scoring:interface-only-no-real-scoring-yet",
      "reading-aloud-word-level-alignment:not-implemented",
      "fluency-features-pause-rate:not-implemented",
      "automated-scaffolding-for-pronunciation:interface-only",
    ],
  };
}

// ───────────────────────────────────────────────────────────────────
// requestSTT
// ───────────────────────────────────────────────────────────────────

/**
 * Build a structured STT request. Pure (no actual call).
 *
 * @param {object} input
 * @param {string} input.audio_path
 * @param {string} input.locale
 * @returns {{
 *   request_id: string,
 *   provider: "sensevoice_local",
 *   audio_path: string,
 *   locale: string,
 *   expected_format: "zh-en-mixed",
 *   normalized_audio_path?: string,
 *   valid: boolean,
 *   reason?: string
 * }}
 */
export function requestSTT({ audio_path, locale }) {
  // Deterministic, time-free id so this function remains pure.
  const request_id = `stt_${Buffer.from(String(audio_path ?? "")).toString("base64url").slice(0, 16)}_${Buffer.from(String(locale ?? "")).toString("base64url").slice(0, 8)}`;
  const audio_check = validateAudioPath({ audio_path });
  const locale_ok = typeof locale === "string" && VALID_LOCALES.has(locale);
  if (!audio_check.allowed || !locale_ok) {
    return {
      request_id,
      provider: ONLY_LOCAL_SOURCE,
      audio_path: String(audio_path ?? ""),
      locale: String(locale ?? ""),
      expected_format: "zh-en-mixed",
      valid: false,
      reason: !audio_check.allowed
        ? audio_check.reason || "audio_path-invalid"
        : `locale-not-supported:${locale}`,
    };
  }
  return {
    request_id,
    provider: ONLY_LOCAL_SOURCE,
    audio_path: String(audio_path ?? ""),
    locale: String(locale ?? ""),
    expected_format: "zh-en-mixed",
    normalized_audio_path: audio_check.normalized_path,
    valid: true,
  };
}

// ─── constants exposed for tests ──────────────────────────────────
export const _internal = {
  AUDIO_ROOT,
  WORKSPACE,
  ONLY_LOCAL_SOURCE,
  ALLOWED_AUDIO_EXTENSIONS: Array.from(ALLOWED_AUDIO_EXTENSIONS),
  VALID_MODES: Array.from(VALID_MODES),
  VALID_LOCALES: Array.from(VALID_LOCALES),
};
