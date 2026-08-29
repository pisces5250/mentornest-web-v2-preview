// server/tutor/conversation-state.mjs
//
// Phase 6B — Pure (no I/O) helpers for the conversational English tutor.
//
// Three responsibilities:
//   1. Per-session ring buffer (depth = 5 turns) for specialist context.
//   2. Decide-mapping: turn the upstream English Specialist's decision
//      into a TutorTurnDecision (one of 6 actions) the UI can render.
//   3. End-of-session summary builder (what gets written to the
//      learning-record ledger as the ONLY trace of the session).
//
// Hard rules:
//   - This module NEVER persists transcript. Buffers are in-memory and
//     thrown away when the session ends.
//   - This module NEVER persists audio.
//   - The summary builder is the ONLY place that emits structured data
//     suitable for the learning-record ledger.
//
// Source-of-truth alignment:
//   - TutorTurnDecision / TutorTurnAction / ConversationSessionSummary
//     shapes mirror src/tutor/TutorEvaluationContract.ts (Phase 6B
//     additions).
//   - Specialist verdict codes come from the upstream taxonomy
//     (server/tutor/english/english_error_taxonomy.mjs); we do NOT
//     invent new codes here.

import { lookupErrorCode } from "./english/english_error_taxonomy.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Ring buffer (per session, in-memory, depth = 5)
// ─────────────────────────────────────────────────────────────────────────────

export const RING_BUFFER_DEPTH = 5;

/** Create a fresh ring buffer (depth = 5, oldest evicted). */
export function createRingBuffer() {
  const items = [];
  const push = (record) => {
    items.push(record);
    if (items.length > RING_BUFFER_DEPTH) {
      items.shift();
    }
    return record;
  };
  const snapshot = () => items.slice();
  const last = () => items[items.length - 1] || null;
  const lastTutor = () => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].role === "tutor") return items[i];
    }
    return null;
  };
  const lastStudent = () => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].role === "student") return items[i];
    }
    return null;
  };
  const clear = () => {
    items.length = 0;
  };
  const size = () => items.length;
  return { push, snapshot, last, lastTutor, lastStudent, clear, size };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decide-mapping: upstream English Specialist verdict -> TutorTurnDecision
// ─────────────────────────────────────────────────────────────────────────────

/** Decide-mapping input. Mirrors the upstream specialist's decide()
 *  output plus the latest transcript and ring context. */
export function decideToTurnAction({ specialistResult, transcript, turnIndex, ringBuffer }) {
  // Map upstream specialist verdict to one of six actions.
  // Rules (kept simple and reviewable):
  //   specialistResult === "correct" + turnIndex < 4  -> ask_question (keep going)
  //   specialistResult === "correct" + turnIndex >= 4 -> extend (push deeper)
  //   specialistResult === "tol_correct"             -> acknowledge + optional ask
  //   specialistResult === "ambiguous"               -> model_phrase (give exemplar)
  //   specialistResult === "incorrect"               -> correct_gently
  //   empty transcript / silence                     -> ask_question (invite to speak)

  const lastTutor = ringBuffer?.lastTutor?.();
  const isOpening = !lastTutor;

  if (!transcript || !transcript.trim()) {
    return {
      action: "ask_question",
      utterance: "我在聽喔，你想說什麼呢？",
      subskill: "fluency",
      rationale: "empty transcript; invite the child to speak",
      confidence: 0.7,
    };
  }

  switch (specialistResult) {
    case "correct":
      return {
        action: turnIndex >= 4 ? "extend" : "ask_question",
        utterance:
          turnIndex >= 4
            ? "說得很好！可以再多說一點嗎？"
            : "嗯嗯，不錯喔。還想說什麼？",
        subskill: "fluency",
        rationale: `correct; ${isOpening ? "first turn" : "follow-up"}; turnIndex=${turnIndex}`,
        confidence: 0.9,
      };

    case "tol_correct":
      return {
        action: "acknowledge",
        utterance: "可以的！再試一次看看？",
        subskill: "fluency",
        rationale: "tol_correct; soft praise",
        confidence: 0.7,
      };

    case "ambiguous":
      return {
        action: "model_phrase",
        utterance: "我示範一次給你聽。",
        prompt: { exemplar: "(老師說一遍簡單的英文示範)" },
        subskill: "pronunciation",
        rationale: "ambiguous; provide a model so the child can imitate",
        confidence: 0.6,
      };

    case "incorrect":
      return {
        action: "correct_gently",
        utterance: "差一點點！我們再說一次。",
        prompt: { exemplar: "(老師重複正確的說法)" },
        subskill: "vocab",
        rationale: "incorrect; gentle correction + repeat",
        confidence: 0.65,
      };

    default:
      // Unknown verdict — fall back to a safe continuation question.
      return {
        action: "ask_question",
        utterance: "然後呢？",
        subskill: "fluency",
        rationale: `unknown verdict '${specialistResult}'; default to ask_question`,
        confidence: 0.5,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// End-of-session summary builder
//
// The ONLY thing written to data/learning-records/<id>.jsonl.
// Hard rules:
//   - Never include transcript.
//   - Never include per-turn specialist decision.
//   - Only structural metadata + a short summary string.
// ─────────────────────────────────────────────────────────────────────────────

/** Tiny deterministic string-hash so the learning record does not leak
 *  raw student_id. FNV-1a 32-bit, output hex (8 chars). */
export function shortHash(input) {
  if (typeof input !== "string" || input.length === 0) return "00000000";
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 8-char hex (32-bit).
  return ((h >>> 0).toString(16)).padStart(8, "0");
}

/** Compute the dominant error code from a sequence of codes (most frequent). */
export function dominantErrorCode(codes) {
  if (!codes || codes.length === 0) return null;
  const counts = new Map();
  for (const c of codes) {
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = null;
  let bestCount = -1;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  // Verify the dominant code actually exists in the upstream taxonomy;
  // if not, return null (do not invent codes).
  if (best && !lookupErrorCode(best)) return null;
  return best;
}

/** Build the learning-record summary from session metadata. */
export function buildSessionSummary({
  studentId,
  knowledgePoint,
  startedAtMs,
  endedAtMs,
  turnCount,
  specialistActions,
  perTurnErrorCodes,
}) {
  const durationSec = Math.max(
    0,
    Math.round((endedAtMs - startedAtMs) / 1000),
  );
  const summaryText =
    `conversation session: ${turnCount} turns over ${durationSec}s; ` +
    `actions=${specialistActions.join(",") || "none"}`;
  return {
    student_id_hash: shortHash(studentId || ""),
    knowledge_point: knowledgePoint || "english.G5.CONV.free-conversation",
    session_duration_sec: durationSec,
    turn_count: turnCount,
    specialist_actions: Array.isArray(specialistActions)
      ? specialistActions.slice()
      : [],
    dominant_error_code: dominantErrorCode(perTurnErrorCodes || []),
    summary: summaryText,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export const AGE_BANDS = new Set(["G1-G2", "G3-G4", "G5-G6", "G7+"]);

export function validateStartRequest(req) {
  if (!req || typeof req !== "object") {
    return { ok: false, code: "invalid_payload", message: "請求格式不對，請再試一次。" };
  }
  if (typeof req.student_id !== "string" || !req.student_id.trim()) {
    return { ok: false, code: "student_required", message: "找不到你的學習資料，請再試一次。" };
  }
  if (typeof req.knowledge_point !== "string" || !req.knowledge_point.trim()) {
    return { ok: false, code: "kp_required", message: "找不到練習主題，請再試一次。" };
  }
  if (!AGE_BANDS.has(req.age_band)) {
    return { ok: false, code: "invalid_payload", message: "學習年級資料不對，請再試一次。" };
  }
  return { ok: true };
}

export function validateTurnRequest(req) {
  if (!req || typeof req !== "object") {
    return { ok: false, code: "invalid_payload", message: "請求格式不對，請再試一次。" };
  }
  if (typeof req.session_id !== "string" || !req.session_id.trim()) {
    return { ok: false, code: "session_required", message: "對話已中斷，請重新開始。" };
  }
  if (typeof req.transcript !== "string") {
    return { ok: false, code: "transcript_required", message: "找不到這次的錄音內容。請再試一次。" };
  }
  if (typeof req.turn_index !== "number" || req.turn_index < 0) {
    return { ok: false, code: "invalid_payload", message: "對話步驟資料不對，請重新開始。" };
  }
  return { ok: true };
}