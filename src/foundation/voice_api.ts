// src/foundation/voice_api.ts
//
// Phase 5C-2 → Round 17 — central voice backend base URL + friendly error
// mapping. The standalone Voice Backend service lives at
// `VITE_MENTORNEST_VOICE_API_BASE` (set in Zeabur Dashboard for the
// preview deployment). Empty string = relative path (local dev with
// Vite proxy to the in-tree server/open-response.mjs).
//
// This module exposes:
//   - voiceApiBase()           : trimmed base URL with no trailing slash
//   - buildVoiceUrl(path)      : base + path with leading slash
//   - childFriendlyError()     : maps backend / network errors to
//                                child-appropriate Traditional Chinese
//                                copy. Raw diagnostics stay in the
//                                console for developers but never
//                                reach the UI.
//
// Hard invariants preserved:
//   - We never put the API URL, JSON parse errors, or stack traces in
//     user-visible UI.
//   - We never write transcripts to localStorage or long-term memory.
//   - Raw audio bytes are never persisted past the POST.

const RAW_BASE: string =
  (import.meta as any).env?.VITE_MENTORNEST_VOICE_API_BASE ?? "";

export function voiceApiBase(): string {
  // Trim trailing slash; allow empty for dev (relative path).
  return RAW_BASE.replace(/\/+$/, "");
}

export function buildVoiceUrl(path: string): string {
  const base = voiceApiBase();
  if (!path.startsWith("/")) path = "/" + path;
  // If base is empty, return the path as-is (relative). Browser will
  // hit the current origin, which in dev goes through the Vite proxy
  // to the local backend; in a static-only deployment this will simply
  // 404, which the friendly-error mapper converts into a retry hint.
  if (!base) return path;
  return base + path;
}

// -------- Child-friendly error mapping --------

export type VoiceErrorKind =
  | "network"          // fetch threw / DNS / CORS / offline
  | "busy"             // 503 with retry-after (single-inference gate)
  | "rate_limited"     // 429 / too many requests
  | "no_transcript"    // backend returned ok but empty transcript
  | "no_audio"         // backend returned ok but audio is unusable
  | "permission"       // microphone permission denied
  | "too_large"        // 413 / payload too large
  | "unsupported"      // browser lacks MediaRecorder / audio playback
  | "backend"          // any other 4xx/5xx
  | "unknown";

export interface VoiceErrorInfo {
  kind: VoiceErrorKind;
  /** Child-facing Traditional Chinese message. */
  message: string;
  /** Hint seconds to wait (only set for kind === "busy"). */
  retryAfterSeconds?: number;
  /** Raw payload, only logged via console.warn — never shown. */
  raw?: unknown;
  /** HTTP status if applicable. */
  status?: number;
}

const COPY = {
  network:
    "剛剛沒有聽清楚，再試一次就好。也可以改用文字回答。",
  busy:
    "語音服務暫時忙碌，請稍後再試。也可以改用文字回答。",
  rate_limited:
    "剛才說得太多太快，休息一下再試一次。也可以改用文字回答。",
  no_transcript:
    "沒聽清楚你說的內容，再說一次好嗎？",
  no_audio:
    "語音播放出了點問題，等一下再試一次。",
  permission:
    "需要使用麥克風才能用語音回答。可以改用文字回答，或允許麥克風權限。",
  too_large:
    "這段語音太長了，試著說短一點。也可以改用文字回答。",
  unsupported:
    "這個瀏覽器不支援語音功能。可以改用文字回答。",
  backend:
    "語音服務出了一點點問題，再試一次就好。也可以改用文字回答。",
  unknown:
    "剛剛沒有聽清楚，再試一次就好。也可以改用文字回答。",
} as const;

/**
 * Convert a thrown error / Response object / plain object into a
 * child-friendly VoiceErrorInfo. The raw payload is preserved for
 * developer-only console diagnostics.
 */
export function classifyVoiceError(input: unknown): VoiceErrorInfo {
  // 1) Response object (e.g. from fetch) — most common path.
  if (typeof Response !== "undefined" && input instanceof Response) {
    const status = input.status;
    const retryAfterHeader = input.headers?.get?.("retry-after");
    const retryAfterSeconds =
      retryAfterHeader != null ? Number(retryAfterHeader) : undefined;

    if (status === 503) {
      return {
        kind: "busy",
        message: COPY.busy,
        retryAfterSeconds:
          Number.isFinite(retryAfterSeconds as number)
            ? (retryAfterSeconds as number)
            : 1,
        status,
      };
    }
    if (status === 429) {
      return {
        kind: "rate_limited",
        message: COPY.rate_limited,
        retryAfterSeconds:
          Number.isFinite(retryAfterSeconds as number)
            ? (retryAfterSeconds as number)
            : undefined,
        status,
      };
    }
    if (status === 413) {
      return { kind: "too_large", message: COPY.too_large, status };
    }
    if (status === 403 || status === 401) {
      return { kind: "backend", message: COPY.backend, status };
    }
    if (status >= 500) {
      return { kind: "backend", message: COPY.backend, status };
    }
    if (status >= 400) {
      return { kind: "backend", message: COPY.backend, status };
    }
    // 2xx that arrived as a Response — caller should not pass here.
    return { kind: "unknown", message: COPY.unknown, status };
  }

  // 2) Backend JSON envelope: { ok:false, error:..., retry_after_seconds:... }
  if (input && typeof input === "object" && "ok" in (input as any)) {
    const env = input as {
      ok: boolean;
      error?: string;
      retry_after_seconds?: number;
    };
    if (env.ok) {
      return { kind: "unknown", message: COPY.unknown };
    }
    // Map known backend error codes to friendly copy. We do NOT
    // surface the raw `error` string to children.
    const code = (env.error || "").toLowerCase();
    if (code.includes("busy")) {
      return {
        kind: "busy",
        message: COPY.busy,
        retryAfterSeconds: env.retry_after_seconds,
      };
    }
    if (code.includes("production student_id")) {
      // This should never reach the child in preview; treat as backend.
      return { kind: "backend", message: COPY.backend };
    }
    return { kind: "backend", message: COPY.backend, raw: env };
  }

  // 3) Network / unknown JS errors.
  const msg =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : "unknown";
  return {
    kind: "network",
    message: COPY.network,
    raw: msg,
  };
}

/**
 * Developer-only diagnostic dump. Use this in catch blocks so we get a
 * console trail without leaking backend wording into the UI.
 */
export function devDiag(prefix: string, info: VoiceErrorInfo): void {
  if (typeof console !== "undefined") {
    console.warn(
      `[mentornest:${prefix}]`,
      {
        kind: info.kind,
        status: info.status,
        retryAfterSeconds: info.retryAfterSeconds,
      },
      info.raw ?? null,
    );
  }
}