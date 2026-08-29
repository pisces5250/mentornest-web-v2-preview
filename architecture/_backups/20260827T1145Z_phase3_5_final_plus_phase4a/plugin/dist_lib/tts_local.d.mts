// TypeScript declarations for tts_local.mjs

export interface TtsVoice {
  voice_id: string;
  locale: string;
  gender: string;
  sample_rate_hz: number;
  description: string;
}

export type TtsBackend = "sherpa-onnx-tts" | "placeholder";

export interface TtsSynthesizeSuccess {
  ok: true;
  audio_b64: string;
  audio_format: "wav";
  duration_ms: number;
  voice_id: string;
  content_hash: string;
  backend: TtsBackend;
  placeholder: boolean;
  placeholder_reason?: string;
  next_step?: string;
  sample_rate_hz: number;
  channels: number;
  bit_depth: number;
}

export interface TtsSynthesizeError {
  ok: false;
  error: {
    code: string;
    message: string;
    voice_id?: string;
    known_voice_ids?: string[];
  };
}

export type TtsSynthesizeResult = TtsSynthesizeSuccess | TtsSynthesizeError;

export function ttsSynthesize(input: {
  text: string;
  voice_id?: string;
  speed?: number;
}): TtsSynthesizeResult;

export function ttsListVoices(): TtsVoice[];

export function ttsStatus(): {
  backend: TtsBackend;
  available: boolean;
  reason: string | null;
};

export function ttsComputeContentHash(
  text: string,
  voice_id: string,
  speed: number,
): string;