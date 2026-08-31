// src/tutor/ConversationStateMachine.ts
//
// Phase 6B — Conversational English Tutor state machine (pure).
//
// State diagram (mirrors server conversation-state.mjs + manager):
//
//   IDLE       ─ press start ─▶      LISTENING
//   LISTENING  ─ VAD silence  ─▶      THINKING
//   THINKING   ─ server reply ─▶      SPEAKING
//   SPEAKING   ─ TTS done    ─▶      LISTENING (loop) | ENDED (wrap_up)
//   any        ─ press end   ─▶      ENDED
//
// The state machine NEVER blocks (no async work in reducer).  Side
// effects (POST, TTS play, MediaRecorder start/stop) live in
// ConversationTutor.tsx; the reducer only flips states.
//
// NOTE: this is a faithful mirror of the server-side state machine so
// that the UI can preview the state without hitting the network.
// Tests verify both stay in sync.

export type ConversationPhase =
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "ENDED";

export interface ConversationUiState {
  phase: ConversationPhase;
  sessionId: string | null;
  turnIndex: number;
  /** Last specialist action seen (debug / aria-label). */
  lastAction: string | null;
  /** Last utterance shown to the child. */
  lastUtterance: string;
  /** Optional error message when ok=false from the server. */
  errorMessage: string | null;
}

export const INITIAL_UI_STATE: ConversationUiState = {
  phase: "IDLE",
  sessionId: null,
  turnIndex: 0,
  lastAction: null,
  lastUtterance: "",
  errorMessage: null,
};

/** Pure reducer.  No I/O. */
export type ConversationEvent =
  | { type: "STARTED"; sessionId: string; greeting: string }
  | { type: "STUDENT_SPOKE" }
  | { type: "DECISION_READY"; action: string; utterance: string }
  | { type: "LISTEN_AGAIN"; errorMessage?: string | null }
  | { type: "TTS_DONE" }
  | { type: "ENDED"; errorMessage?: string | null };

export function conversationReducer(
  state: ConversationUiState,
  ev: ConversationEvent,
): ConversationUiState {
  switch (ev.type) {
    case "STARTED":
      return {
        ...INITIAL_UI_STATE,
        // Greeting 是老師的第一個 spoken turn；必須先完成播放，
        // audio ended 後才能開麥進入 LISTENING。
        phase: "SPEAKING",
        sessionId: ev.sessionId,
        turnIndex: 0,
        lastAction: "greeting",
        lastUtterance: ev.greeting,
        errorMessage: null,
      };
    case "STUDENT_SPOKE":
      // Student finished a turn; we are about to ship it to server.
      if (state.phase !== "LISTENING") return state;
      return { ...state, phase: "THINKING", errorMessage: null };
    case "DECISION_READY":
      return {
        ...state,
        phase: "SPEAKING",
        lastAction: ev.action,
        lastUtterance: ev.utterance,
        turnIndex: state.turnIndex + 1,
      };
    case "LISTEN_AGAIN":
      return {
        ...state,
        phase: "LISTENING",
        errorMessage: ev.errorMessage ?? null,
      };
    case "TTS_DONE":
      if (state.phase !== "SPEAKING") return state;
      // If the server told us the session is ended, stop.  Otherwise
      // resume listening.
      return { ...state, phase: state.lastAction === "wrap_up" ? "ENDED" : "LISTENING" };
    case "ENDED":
      return {
        ...state,
        phase: "ENDED",
        errorMessage: ev.errorMessage ?? null,
      };
    default:
      return state;
  }
}
