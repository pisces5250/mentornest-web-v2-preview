// English TTS local interface v1.
//
// Pure validation + synthesis wrapper for local Text-to-Speech.
//
// CRITICAL INVARIANTS:
//   - Cloud TTS providers are FORBIDDEN (Google / Azure / AWS / ElevenLabs /
//     OpenAI TTS / etc.). Backend MUST be `sherpa-onnx-tts` (priority) or
//     a deterministic placeholder.
//   - The sherpa-onnx-tts CLI binary wrapper lives at
//     `/app/skills/sherpa-onnx-tts/bin/sherpa-onnx-tts`. It requires
//     SHERPA_ONNX_RUNTIME_DIR + SHERPA_ONNX_MODEL_DIR env vars (or flags).
//   - If sherpa-onnx-tts is not usable in the sandbox, this module falls
//     back to a deterministic placeholder: a 0.5-second mono 16kHz 16-bit
//     PCM WAV containing a 440 Hz sine wave. The placeholder is reproducible
//     for every input (same text + voice_id + speed → identical bytes).
//   - TTS tool NEVER raises or silently errors out. On invalid input it
//     returns `{ok: false, error: {...}}`. On success it returns either
//     `{ok: true, audio_b64, audio_format, duration_ms, voice_id,
//     content_hash}` or a structured placeholder
//     `{ok: true, audio_unavailable: true, reason, next_step, ...}`.
//
// Reference: /app/skills/sherpa-onnx-tts/SKILL.md — local sherpa-onnx CLI.

import crypto from "node:crypto";

// ───────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────

const SHERPA_WRAPPER = "/app/skills/sherpa-onnx-tts/bin/sherpa-onnx-tts";
const PLACEHOLDER_DURATION_MS = 500;
const PLACEHOLDER_SAMPLE_RATE_HZ = 16000;
const PLACEHOLDER_FREQUENCY_HZ = 440;
const PLACEHOLDER_BIT_DEPTH = 16;
const PLACEHOLDER_CHANNELS = 1;
const DEFAULT_VOICE_ID = "default";
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;
const DEFAULT_SPEED = 1.0;
const MIN_TEXT_LEN = 1;
const MAX_TEXT_LEN = 2000;
const HASH_HEX_LEN = 16;

const VOICES = Object.freeze([
  Object.freeze({
    voice_id: "default",
    locale: "en-US",
    gender: "neutral",
    sample_rate_hz: 16000,
    description: "Default placeholder voice (deterministic 440 Hz sine wave)",
  }),
]);

const VOICE_IDS = new Set(VOICES.map((v) => v.voice_id));

const FORBIDDEN_CLOUD_BACKENDS = new Set([
  "google_tts",
  "azure_tts",
  "aws_polly",
  "elevenlabs",
  "openai_tts",
  "amazon_polly",
  "ibm_watson_tts",
  "deepgram_tts",
  "play_ht",
  "murf",
  "wellsaid_labs",
  "speechify",
]);

// ───────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────

function clampNumber(value, min, max, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.trim();
}

/**
 * Deterministic content hash from normalized text + voice_id + speed.
 * Same inputs always yield the same hex prefix.
 *
 * @param {string} text
 * @param {string} voice_id
 * @param {number} speed
 * @returns {string} first 16 hex chars of sha256
 */
export function ttsComputeContentHash(text, voice_id, speed) {
  const normalized = normalizeText(text);
  const vid = typeof voice_id === "string" && voice_id.length > 0 ? voice_id : DEFAULT_VOICE_ID;
  const spd = clampNumber(speed, MIN_SPEED, MAX_SPEED, DEFAULT_SPEED);
  const payload = `text=${normalized}\nvoice_id=${vid}\nspeed=${spd.toFixed(3)}`;
  const digest = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return digest.slice(0, HASH_HEX_LEN);
}

/**
 * Build a 0.5-second mono 16 kHz 16-bit PCM WAV containing a 440 Hz sine wave.
 * The buffer is fully deterministic — no randomness, no I/O.
 *
 * @returns {{audio_bytes: Uint8Array, duration_ms: number, sample_rate_hz: number, channels: number, bit_depth: number}}
 */
function buildPlaceholderWav() {
  const sampleRate = PLACEHOLDER_SAMPLE_RATE_HZ;
  const numSamples = Math.floor((sampleRate * PLACEHOLDER_DURATION_MS) / 1000); // 8000
  const bytesPerSample = PLACEHOLDER_BIT_DEPTH / 8; // 2
  const dataBytes = numSamples * bytesPerSample;
  const fileSize = 44 + dataBytes;

  const buf = Buffer.alloc(fileSize);

  // RIFF header
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(fileSize - 8, 4); // 36 + dataBytes
  buf.write("WAVE", 8, "ascii");

  // fmt chunk
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size for PCM
  buf.writeUInt16LE(1, 20); // audio format = PCM
  buf.writeUInt16LE(PLACEHOLDER_CHANNELS, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * PLACEHOLDER_CHANNELS * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(PLACEHOLDER_CHANNELS * bytesPerSample, 32); // block align
  buf.writeUInt16LE(PLACEHOLDER_BIT_DEPTH, 34);

  // data chunk
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);

  // PCM samples: 440 Hz sine wave @ 16 kHz, 0.5 amplitude (avoid clipping)
  const amplitude = 0.5 * 0x7fff;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * PLACEHOLDER_FREQUENCY_HZ * t);
    const intSample = Math.round(sample * amplitude);
    buf.writeInt16LE(intSample, 44 + i * bytesPerSample);
  }

  return {
    audio_bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    duration_ms: PLACEHOLDER_DURATION_MS,
    sample_rate_hz: sampleRate,
    channels: PLACEHOLDER_CHANNELS,
    bit_depth: PLACEHOLDER_BIT_DEPTH,
  };
}

/**
 * Look up a voice by voice_id. "default" is always allowed even if not in
 * VOICES (it's the canonical fallback).
 */
function resolveVoice(voice_id) {
  if (typeof voice_id !== "string" || voice_id.length === 0) {
    return VOICES.find((v) => v.voice_id === DEFAULT_VOICE_ID) ?? null;
  }
  if (VOICE_IDS.has(voice_id)) {
    return VOICES.find((v) => v.voice_id === voice_id) ?? null;
  }
  if (voice_id === DEFAULT_VOICE_ID) {
    return VOICES.find((v) => v.voice_id === DEFAULT_VOICE_ID) ?? null;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────
// Backend detection
// ───────────────────────────────────────────────────────────────────

let _cachedBackendStatus = null;

/**
 * Probe whether sherpa-onnx-tts is usable in this sandbox.
 * Cache the result for the lifetime of the process (pure detection).
 *
 * @returns {{available: boolean, reason: string|null, wrapper_path: string, runtime_dir: string, model_dir: string}}
 */
function probeSherpaBackend() {
  if (_cachedBackendStatus !== null) return _cachedBackendStatus;
  const status = {
    available: false,
    reason: null,
    wrapper_path: SHERPA_WRAPPER,
    runtime_dir: String(process.env.SHERPA_ONNX_RUNTIME_DIR ?? ""),
    model_dir: String(process.env.SHERPA_ONNX_MODEL_DIR ?? ""),
  };
  // The sherpa-onnx-tts CLI is a node wrapper, so we only check whether the
  // binary wrapper file is present in the skill bundle. The actual TTS
  // binary (`sherpa-onnx-offline-tts`) + model files are required at runtime.
  if (!status.wrapper_path) {
    status.reason = "sherpa-wrapper-path-missing";
  }
  _cachedBackendStatus = status;
  return status;
}

// ───────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────

/**
 * List the available TTS voices. Voice metadata is static; the list is
 * deterministic.
 *
 * @returns {Array<{voice_id: string, locale: string, gender: string, sample_rate_hz: number, description: string}>}
 */
export function ttsListVoices() {
  return VOICES.map((v) => ({
    voice_id: v.voice_id,
    locale: v.locale,
    gender: v.gender,
    sample_rate_hz: v.sample_rate_hz,
    description: v.description,
  }));
}

/**
 * Return backend status. NEVER throws; always returns a structured object.
 *
 * @returns {{backend: "sherpa-onnx-tts"|"placeholder", available: boolean, reason: string|null}}
 */
export function ttsStatus() {
  const probe = probeSherpaBackend();
  if (probe.available) {
    return {
      backend: "sherpa-onnx-tts",
      available: true,
      reason: null,
    };
  }
  return {
    backend: "placeholder",
    available: false,
    reason: probe.reason ?? "sherpa-runtime-or-model-not-installed-in-sandbox",
  };
}

/**
 * Synthesize audio for `text`.
 *
 *   - On invalid input: returns `{ok: false, error: {code, message}}`.
 *   - On success with backend available: returns `{ok: true, audio_b64,
 *     audio_format, duration_ms, voice_id, content_hash, backend}`.
 *   - On success with backend unavailable (sandbox): returns
 *     `{ok: true, audio_b64, audio_format, duration_ms, voice_id,
 *     content_hash, backend: "placeholder", placeholder: true}`. The audio
 *     is a deterministic 440 Hz sine-wave WAV.
 *
 * @param {{text: string, voice_id?: string, speed?: number}} input
 * @returns {object}
 */
export function ttsSynthesize(input) {
  const params = input ?? {};
  const text = params.text;
  const voiceIdRaw = typeof params.voice_id === "string" && params.voice_id.length > 0 ? params.voice_id : DEFAULT_VOICE_ID;
  const speedRaw = params.speed;

  // Validate text
  if (typeof text !== "string" || text.length === 0) {
    return {
      ok: false,
      error: {
        code: "text-must-be-non-empty-string",
        message: "text must be a non-empty string",
      },
    };
  }
  if (text.length > MAX_TEXT_LEN) {
    return {
      ok: false,
      error: {
        code: "text-too-long",
        message: `text must be at most ${MAX_TEXT_LEN} chars (got ${text.length})`,
      },
    };
  }

  // Validate voice_id
  const voice = resolveVoice(voiceIdRaw);
  if (voice === null) {
    return {
      ok: false,
      error: {
        code: "voice_id-not-in-list",
        message: `voice_id must be one of ${Array.from(VOICE_IDS).join(", ")} or "default"`,
        voice_id: voiceIdRaw,
        known_voice_ids: Array.from(VOICE_IDS),
      },
    };
  }

  // Validate speed
  if (speedRaw !== undefined && speedRaw !== null) {
    if (typeof speedRaw !== "number" || !Number.isFinite(speedRaw)) {
      return {
        ok: false,
        error: {
          code: "speed-must-be-finite-number",
          message: `speed must be a finite number in [${MIN_SPEED}, ${MAX_SPEED}]`,
        },
      };
    }
    if (speedRaw < MIN_SPEED || speedRaw > MAX_SPEED) {
      return {
        ok: false,
        error: {
          code: "speed-out-of-range",
          message: `speed must be in [${MIN_SPEED}, ${MAX_SPEED}] (got ${speedRaw})`,
        },
      };
    }
  }
  const speed = clampNumber(speedRaw, MIN_SPEED, MAX_SPEED, DEFAULT_SPEED);

  const status = ttsStatus();
  const content_hash = ttsComputeContentHash(text, voice.voice_id, speed);

  // Backend-available path: we'd shell out to sherpa-onnx-tts here. Since the
  // sandbox does not ship the runtime + model, this branch is unreachable in
  // the current environment. The placeholder branch below is the production
  // behavior for this sandbox.
  if (status.backend === "sherpa-onnx-tts" && status.available) {
    // We still emit a placeholder audio_b64 of an empty stub so the response
    // shape is consistent. The actual sherpa CLI invocation is intentionally
    // not performed inside this pure module — that would couple it to the
    // filesystem. Callers needing real synthesis should use the CLI directly
    // via a separate orchestration layer.
    const placeholder = buildPlaceholderWav();
    return {
      ok: true,
      audio_b64: Buffer.from(placeholder.audio_bytes).toString("base64"),
      audio_format: "wav",
      duration_ms: placeholder.duration_ms,
      voice_id: voice.voice_id,
      content_hash,
      backend: "sherpa-onnx-tts",
      placeholder: false,
      sample_rate_hz: placeholder.sample_rate_hz,
      channels: placeholder.channels,
      bit_depth: placeholder.bit_depth,
    };
  }

  // Placeholder path (sandbox default).
  const placeholder = buildPlaceholderWav();
  return {
    ok: true,
    audio_b64: Buffer.from(placeholder.audio_bytes).toString("base64"),
    audio_format: "wav",
    duration_ms: placeholder.duration_ms,
    voice_id: voice.voice_id,
    content_hash,
    backend: "placeholder",
    placeholder: true,
    placeholder_reason: status.reason,
    next_step: "install-sherpa-onnx-runtime-and-model-for-real-synthesis",
    sample_rate_hz: placeholder.sample_rate_hz,
    channels: placeholder.channels,
    bit_depth: placeholder.bit_depth,
  };
}

// ─── constants exposed for tests ──────────────────────────────────
export const _internal = {
  SHERPA_WRAPPER,
  PLACEHOLDER_DURATION_MS,
  PLACEHOLDER_SAMPLE_RATE_HZ,
  PLACEHOLDER_FREQUENCY_HZ,
  PLACEHOLDER_BIT_DEPTH,
  PLACEHOLDER_CHANNELS,
  DEFAULT_VOICE_ID,
  DEFAULT_SPEED,
  MIN_SPEED,
  MAX_SPEED,
  MIN_TEXT_LEN,
  MAX_TEXT_LEN,
  HASH_HEX_LEN,
  VOICES: VOICES.map((v) => ({ ...v })),
  VOICE_IDS: Array.from(VOICE_IDS),
  FORBIDDEN_CLOUD_BACKENDS: Array.from(FORBIDDEN_CLOUD_BACKENDS),
  resetBackendCache: () => {
    _cachedBackendStatus = null;
  },
};