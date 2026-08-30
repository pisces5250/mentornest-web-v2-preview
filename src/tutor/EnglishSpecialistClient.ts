// src/tutor/EnglishSpecialistClient.ts
//
// Phase 6A — Front-end bridge to the English Specialist (Layer B).
//
// The deterministic reading comparison (Layer A) runs in the browser
// via `readingComparison.ts` for instant UI feedback during the
// "evaluating…" loading state. The English Specialist (Layer B)
// runs server-side via POST /api/tutor/english-evaluate and returns
// the full TutorEvaluation.
//
// This client:
//   - POSTs to the tutor endpoint
//   - parses the response into our typed contract
//   - maps errors to a child-friendly VoiceErrorInfo shape
//   - never throws raw to the caller; always returns a discriminated
//     union {ok:true,evaluation} | {ok:false, info}
//
// Privacy: only the transcript text crosses the wire (no audio,
// no recording metadata). The client never persists the response.

import {
  type TutorEvaluation,
  type TutorEvaluationRequest,
  type TutorEvaluationResponse,
  type TutorEvaluationError,
  isTutorEvaluationResponse,
  isTutorEvaluationError,
} from "./TutorEvaluationContract";

const ENDPOINT_PATH = "/api/tutor/english-evaluate";

export interface EnglishSpecialistClientOk {
  ok: true;
  evaluation: TutorEvaluation;
}

export interface EnglishSpecialistClientErr {
  ok: false;
  code: TutorEvaluationError["code"];
  message: string;
  retryAfterSeconds?: number;
  status?: number;
  raw?: unknown;
}

export type EnglishSpecialistClientResult =
  | EnglishSpecialistClientOk
  | EnglishSpecialistClientErr;

/**
 * Pick a backend base URL. In dev this is the Vite proxy on the
 * same origin; in prod the server is reverse-proxied at the same
 * path. We deliberately do NOT route this through the voice backend.
 */
function endpointUrl(): string {
  const base =
    typeof window !== "undefined"
      ? (window as any).__MN_TUTOR_API_BASE__ ?? ""
      : "";
  if (!base) return ENDPOINT_PATH;
  return base.replace(/\/+$/, "") + ENDPOINT_PATH;
}

/**
 * Map backend error envelopes to our discriminated union.
 * We never leak the raw `error` string to children — it goes to
 * console.warn only.
 */
function mapError(
  status: number,
  body: unknown,
): EnglishSpecialistClientErr {
  if (isTutorEvaluationError(body)) {
    const msg =
      body.code === "transcript_required"
        ? "老師還沒收到你說的內容，請再說一次。"
        : body.code === "expected_required"
          ? "這題的內容老師這邊少了一點，請再試一次。"
          : body.code === "invalid_payload"
            ? "送出的資料有問題，請再試一次。"
            : body.code === "specialist_unavailable"
              ? "老師這邊有一點點問題，再試一次就好。"
              : body.code === "timeout"
                ? "老師這邊有點忙，請稍後再試一次。"
                : "老師這邊有一點點問題，再試一次就好。";
    return {
      ok: false,
      code: body.code,
      message: msg,
      retryAfterSeconds: body.retry_after_seconds,
      status,
      raw: body,
    };
  }
  // Unknown shape — fall back to status-only mapping.
  if (status === 503) {
    return {
      ok: false,
      code: "specialist_unavailable",
      message: "老師這邊有一點點問題，再試一次就好。",
      retryAfterSeconds: 1,
      status,
    };
  }
  if (status >= 500) {
    return {
      ok: false,
      code: "specialist_unavailable",
      message: "老師這邊有一點點問題，再試一次就好。",
      status,
      raw: body,
    };
  }
  return {
    ok: false,
    code: "unknown",
    message: "老師這邊有一點點問題，再試一次就好。",
    status,
    raw: body,
  };
}

/**
 * Call the English Specialist. Always returns a discriminated union.
 */
export async function evaluateReadingWithSpecialist(
  req: TutorEvaluationRequest,
  opts: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<EnglishSpecialistClientResult> {
  const url = endpointUrl();

  // Bound the request — the specialist is deterministic and fast,
  // but we still cap to avoid a hung child UI.
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const { browserCsrfToken } = await import("../foundation/browser_security");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MentorNest-CSRF": browserCsrfToken(),
      },
      body: JSON.stringify({
        student_id: req.student_id,
        knowledge_point: req.knowledge_point,
        age_band: req.age_band,
        expected_text: req.expected_text,
        transcript: req.transcript,
        transcript_confidence: req.transcript_confidence,
      }),
      signal: controller.signal,
      credentials: "same-origin",
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok && isTutorEvaluationResponse(body)) {
      return { ok: true, evaluation: body.evaluation };
    }
    return mapError(response.status, body);
  } catch (err) {
    // AbortError or network error.
    const aborted = controller.signal.aborted;
    if (aborted) {
      return {
        ok: false,
        code: "timeout",
        message: "老師這邊有點忙，請稍後再試一次。",
        retryAfterSeconds: 1,
      };
    }
    return {
      ok: false,
      code: "unknown",
      message: "老師這邊有一點點問題，再試一次就好。",
      raw: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
