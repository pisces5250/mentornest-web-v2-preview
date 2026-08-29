// TypeScript declarations for english_stt_interface.mjs

export type EnglishLocale = "en-US" | "en-GB" | "en-AU" | "en-CA" | "zh-TW" | "zh-CN";
export type EnglishVoiceMode = "oral_response" | "reading_aloud" | "explain_thinking";

export function validateAudioPath(input: {
  audio_path: string;
}): { allowed: boolean; reason?: string; normalized_path?: string };

export function validateTranscriptPayload(input: {
  transcript: string;
  locale: string;
  source: string;
}): {
  ok: boolean;
  reason?: string;
  normalized?: { transcript: string; locale: string; source: string };
};

export function transcriptionGate(input: {
  student_id: string;
  mode: EnglishVoiceMode | string;
  audio_path?: string;
}): {
  allowed: boolean;
  reason?: string;
  fallback: "transcribe_via_text_input";
  mode: string;
  audio_path_valid?: boolean;
};

export function capabilityReport(): {
  stt: "ready_local_sensevoice";
  tts: "missing_local_production";
  pronunciation_scoring: "missing_local_production";
  gaps: string[];
};

export function requestSTT(input: {
  audio_path: string;
  locale: string;
}): {
  request_id: string;
  provider: "sensevoice_local";
  audio_path: string;
  locale: string;
  expected_format: "zh-en-mixed";
  normalized_audio_path?: string;
  valid: boolean;
  reason?: string;
};
