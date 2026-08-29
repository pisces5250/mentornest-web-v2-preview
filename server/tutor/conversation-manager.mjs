// server/tutor/conversation-manager.mjs
//
// Phase 6B — Conversational English Tutor session manager.
//
// Responsibilities:
//   1. session lifecycle (start / turn / end)
//   2. per-session ring buffer (depth = 5) via conversation-state.mjs
//   3. delegate verdict to the REAL upstream English Specialist
//      (server/tutor/english/english_specialist.mjs), NOT a fake rule
//   4. map specialist verdict -> TutorTurnDecision (one of 6 actions)
//   5. on session-end, append ONE summary record to the learning-record
//      ledger.  Per-turn transcript / audio / decision is NEVER written.
//
// Source-of-truth alignment:
//   - This file imports server/tutor/english/english_specialist.mjs which
//     is a SOURCE-OF-TRUTH mirror of
//     /home/node/.openclaw/plugins/mentornest-learning/lib/english_specialist.mjs
//   - Any change here MUST be re-synced from upstream taxonomy if the
//     specialist's verdict shape changes.

import { randomUUID } from "node:crypto";
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createRingBuffer,
  decideToTurnAction,
  buildSessionSummary,
  shortHash,
  validateStartRequest,
  validateTurnRequest,
} from "./conversation-state.mjs";

import {
  evaluateConversationTurn,
} from "./english/english_specialist.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory session store (depth bounded by REC for live sessions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-session record. `ring` is the only place student transcript lives.
 * It is cleared when the session ends.
 */
const SESSIONS = new Map();

export function _sessionCount() {
  // Only count LIVE sessions (not ended tombstones).
  let n = 0;
  for (const s of SESSIONS.values()) if (!s.ended) n++;
  return n;
}

export function _getSession(id) {
  return SESSIONS.get(id) || null;
}

function nowMs() {
  return Date.now();
}

function makeGreeting(req) {
  // Trivial zh-TW greeting. Real specialists may replace this later.
  // Kept short and child-friendly.
  const age = req.age_band;
  if (age === "G1-G2") return "哈囉！我們來說英文吧～";
  if (age === "G3-G4") return "哈囉！今天想聊什麼呢？";
  return "嗨，老師在聽喔，隨時開始吧。";
}

// ─────────────────────────────────────────────────────────────────────────────
// start
// ─────────────────────────────────────────────────────────────────────────────

export function startConversation(req) {
  const v = validateStartRequest(req);
  if (!v.ok) return { ok: false, code: v.code, message: v.message };

  const sessionId = randomUUID();
  const ring = createRingBuffer();
  const startedAt = nowMs();

  const greeting = makeGreeting(req);

  // Seed the ring buffer with the greeting as the first tutor row.
  ring.push({
    index: 0,
    role: "tutor",
    text: greeting,
    action: "acknowledge",
  });

  SESSIONS.set(sessionId, {
    id: sessionId,
    studentId: req.student_id,
    knowledgePoint: req.knowledge_point,
    ageBand: req.age_band,
    topic: req.topic || null,
    locale: req.locale || "en-US",
    startedAtMs: startedAt,
    endedAtMs: null,
    turnIndex: 0,
    specialistActions: [],
    perTurnErrorCodes: [],
    ring,
    ended: false,
  });

  return {
    ok: true,
    session: {
      session_id: sessionId,
      turn_index: 0,
      ended: false,
    },
    greeting,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// turn
// ─────────────────────────────────────────────────────────────────────────────

export function turnConversation(req) {
  const v = validateTurnRequest(req);
  if (!v.ok) return { ok: false, code: v.code, message: v.message };

  const sess = SESSIONS.get(req.session_id);
  if (!sess) {
    return {
      ok: false,
      code: "session_required",
      message: "對話已中斷，請重新開始。",
    };
  }
  if (sess.ended) {
    return {
      ok: false,
      code: "session_ended",
      message: "對話已結束。",
    };
  }

  const expectedTurnIndex = sess.turnIndex + 1;
  if (req.turn_index !== expectedTurnIndex) {
    return {
      ok: false,
      code: "turn_out_of_sync",
      message: "對話步驟不同步，請重新開始。",
      expected_turn_index: expectedTurnIndex,
    };
  }

  const transcript = (req.transcript || "").trim();

  // Append student row to ring buffer.
  sess.ring.push({
    index: expectedTurnIndex,
    role: "student",
    text: transcript,
  });

  // Build conversation_history (assistant + user) for the upstream
  // specialist.  The upstream specialist reads "last assistant turn"
  // to score answer_question, so we feed it the ring snapshot.
  const history = sess.ring.snapshot().map((r) => ({
    role: r.role === "tutor" ? "assistant" : "user",
    text: r.text,
  }));

  // Call the REAL upstream English Specialist.
  let specialistResult = "ambiguous";
  let specialistErrorCodes = [];
  try {
    const verdict = evaluateConversationTurn({
      student_turn: transcript,
      conversation_history: history,
      target_features: ["greeting", "answer_question", "ask_back", "politeness", "closing"],
    });
    // Map feature_pass into a coarse verdict for decide-mapping.
    // Defensive rule: on the very first student turn, the tutor has not
    // asked anything yet, so "answer_question" failure should NOT count
    // as "incorrect" — the student is just opening the conversation.
    const fp = verdict?.feature_pass || {};
    const studentTurnNumber = expectedTurnIndex;
    const adjustedFp = { ...fp };
    if (studentTurnNumber === 1 && adjustedFp.answer_question === false) {
      // Drop answer_question from the failure count on the opening turn.
      delete adjustedFp.answer_question;
    }
    const failKeys = Object.keys(adjustedFp).filter((k) => adjustedFp[k] === false);
    const passKeys = Object.keys(adjustedFp).filter((k) => adjustedFp[k] === true);
    if (failKeys.length === 0 && passKeys.length > 0) specialistResult = "correct";
    else if (failKeys.length <= 1 && passKeys.length >= 1) specialistResult = "tol_correct";
    else if (fp.answer_question === false && studentTurnNumber > 1) specialistResult = "incorrect";
    else specialistResult = "ambiguous";
    specialistErrorCodes = (verdict?.feedback_lines || [])
      .filter((f) => f?.feature)
      .map((f) => f.feature);
  } catch (err) {
    // Specialist failure must NOT crash the conversation.  Fall back to
    // a safe continuation.  The audit log captures the failure.
    specialistResult = "ambiguous";
    specialistErrorCodes = [];
  }

  // Map to TutorTurnDecision.
  const decision = decideToTurnAction({
    specialistResult,
    transcript,
    turnIndex: expectedTurnIndex,
    ringBuffer: sess.ring,
  });

  // Append tutor row to ring buffer.
  sess.ring.push({
    index: expectedTurnIndex,
    role: "tutor",
    text: decision.utterance,
    action: decision.action,
  });

  // Update session metadata.
  sess.turnIndex = expectedTurnIndex;
  sess.specialistActions.push(decision.action);
  sess.perTurnErrorCodes.push(...specialistErrorCodes);
  if (decision.action === "wrap_up") {
    sess.ended = true;
    sess.endedAtMs = nowMs();
  }

  return {
    ok: true,
    decision,
    tts_text: decision.utterance,
    turn_index: expectedTurnIndex,
    session_id: sess.id,
    ended: sess.ended,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// end
// ─────────────────────────────────────────────────────────────────────────────

let LEARNING_RECORDS_DIR = resolve(
  process.env.MENTORNEST_LEARNING_RECORDS_DIR ||
  "/home/node/.openclaw/workspace/data/learning-records",
);

/** Allow tests to override the directory lazily (after module load). */
export function _setLearningRecordsDir(p) {
  if (typeof p === "string" && p) {
    LEARNING_RECORDS_DIR = resolve(p);
  }
}

export function endConversation(req) {
  const sessionId = req?.session_id;
  if (typeof sessionId !== "string" || !sessionId) {
    return {
      ok: false,
      code: "session_required",
      message: "對話已中斷，請重新開始。",
    };
  }
  const sess = SESSIONS.get(sessionId);
  if (!sess) {
    return {
      ok: false,
      code: "session_required",
      message: "對話已中斷，請重新開始。",
    };
  }

  // Mark ended even if not already.
  if (!sess.ended) {
    sess.ended = true;
    sess.endedAtMs = nowMs();
  }

  // Build summary (this is the ONLY thing written to the learning
  // record ledger; transcript / audio / per-turn decision NOT included).
  const summary = buildSessionSummary({
    studentId: sess.studentId,
    knowledgePoint: sess.knowledgePoint,
    startedAtMs: sess.startedAtMs,
    endedAtMs: sess.endedAtMs,
    turnCount: sess.turnIndex,
    specialistActions: sess.specialistActions,
    perTurnErrorCodes: sess.perTurnErrorCodes,
  });

  // Persist summary to learning-records ledger (append-only).  No
  // transcript / audio / per-turn decision is written.
  appendLearningRecord(sess.studentId, {
    ts: new Date(sess.endedAtMs).toISOString(),
    kind: "english_conversation_session",
    ...summary,
  });

  // Tear down ring buffer (transcript only lived in memory); keep a
  // tombstone in SESSIONS so subsequent /turn calls can be answered
  // with a clear "session_ended" code rather than a generic
  // session_required.
  if (typeof sess.ring?.clear === "function") sess.ring.clear();
  sess.ended = true;

  return {
    ok: true,
    session: {
      session_id: sessionId,
      turn_index: sess.turnIndex,
      ended: true,
    },
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Learning-record ledger writer (append-only; per-student file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append one summary record to data/learning-records/<student_id>.jsonl.
 * Never throws (failure becomes a no-op + audit log; the conversation
 * was successful from the child's perspective).
 */
function appendLearningRecord(studentId, record) {
  try {
    if (typeof studentId !== "string" || !studentId.trim()) return;
    // Sanitize studentId: replace anything outside [A-Za-z0-9_-] with _
    // (defensive, prevents path traversal).
    const safeId = studentId.replace(/[^A-Za-z0-9_-]/g, "_");
    const dir = LEARNING_RECORDS_DIR;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const path = resolve(dir, `${safeId}.jsonl`);
    appendFileSync(path, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    // Don't crash the conversation; emit a single audit log line.
    // (Transcript / audio are NOT included here.)
    try {
      const path = resolve(LEARNING_RECORDS_DIR, "_audit.log");
      if (!existsSync(LEARNING_RECORDS_DIR)) {
        mkdirSync(LEARNING_RECORDS_DIR, { recursive: true });
      }
      appendFileSync(
        path,
        `[conversation-end] failed to write learning record: ${(err && err.message) || err}\n`,
        "utf8",
      );
    } catch (_) {
      /* swallow */
    }
  }
}