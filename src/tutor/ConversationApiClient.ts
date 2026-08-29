// src/tutor/ConversationApiClient.ts
//
// Phase 6B — Conversational English Tutor HTTP polling client.
//
// Thin fetch wrapper for the three Phase 6B endpoints.  Mirrors the
// server contract from src/tutor/TutorEvaluationContract.ts.
//
// Privacy:
//   - Never logs transcript text or student_id (matches the server-side
//     audit policy from Phase 6A v2 / 6B).

import {
  ConversationStartRequest,
  ConversationStartResponse,
  ConversationTurnRequest,
  ConversationTurnResponse,
  ConversationEndRequest,
  ConversationEndResponse,
  isConversationStartResponse,
  isConversationTurnResponse,
  isConversationEndResponse,
  TutorEvaluationError,
  isTutorEvaluationError,
} from "./TutorEvaluationContract";

const DEFAULT_TIMEOUT_MS = 8000;

function endpointUrl(path: string): string {
  // Vite dev proxy uses same-origin; in prod the server is reverse-proxied
  // so absolute URLs are not needed.
  if (typeof window === "undefined") return path;
  return path;
}

async function postJson<T>(
  path: string,
  body: unknown,
  guard: (x: unknown) => x is T,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | TutorEvaluationError> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(endpointUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (guard(data)) return data;
    if (isTutorEvaluationError(data)) return data;
    return {
      ok: false,
      code: "unknown",
      message: "老師這邊連線有點問題，再試一次就好。",
    };
  } catch (_err) {
    return {
      ok: false,
      code: "timeout",
      message: "老師這邊連線有點慢，再試一次就好。",
    };
  } finally {
    clearTimeout(t);
  }
}

export async function startConversationSession(
  body: ConversationStartRequest,
): Promise<ConversationStartResponse | TutorEvaluationError> {
  return postJson(
    "/api/tutor/english-conversation/start",
    body,
    isConversationStartResponse,
  );
}

export async function postConversationTurn(
  body: ConversationTurnRequest,
): Promise<ConversationTurnResponse | TutorEvaluationError> {
  return postJson(
    "/api/tutor/english-conversation/turn",
    body,
    isConversationTurnResponse,
  );
}

export async function endConversationSession(
  body: ConversationEndRequest,
): Promise<ConversationEndResponse | TutorEvaluationError> {
  return postJson(
    "/api/tutor/english-conversation/end",
    body,
    isConversationEndResponse,
  );
}