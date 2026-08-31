// src/tutor/ConversationTutor.tsx
//
// Phase 6B — Conversational English Tutor (main UI).
//
// 4-state machine: IDLE -> LISTENING -> THINKING -> SPEAKING -> ...
// VAD (voice activity detection) is client-side, energy-based.
// 700ms of silence above threshold -> POST transcript to server ->
// THINKING -> server reply -> SPEAKING -> TTS done -> LISTENING.
//
// No verdict pop-up.  The tutor's reply IS the feedback.  The child
// only sees:
//   - the tutor's greeting (text + spoken TTS)
//   - a transcript of what the system heard them say (so the child
//     can correct it if STT was wrong)
//   - the tutor's next utterance (text + spoken TTS)
//   - a single "結束對話" button to leave.
//
// Privacy:
//   - MediaRecorder is started fresh per session; tracks are released
//     on ENDED.
//   - No transcript / audio leaves the browser except via the
//     /api/tutor/english-conversation/* endpoints (which hold the
//     transcript in a server-side ring buffer, depth 5, dropped on
//     session end).
//   - No recording is persisted to disk anywhere.

import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { TTSPlayer } from "../input/TTSPlayer";
import { buildVoiceUrl } from "../foundation/voice_api";
import { browserCsrfToken } from "../foundation/browser_security";
import {
  startConversationSession,
  postConversationTurn,
  endConversationSession,
} from "./ConversationApiClient";
import {
  ConversationUiState,
  ConversationPhase,
  INITIAL_UI_STATE,
  conversationReducer,
} from "./ConversationStateMachine";

export interface ConversationTutorProps {
  studentId: string;
  knowledgePoint: string;
  ageBand: "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
  /** Optional topic hint passed to the specialist. */
  topic?: string;
  /** Optional STT locale (defaults to en-US). */
  locale?: "en-US" | "en-GB" | "en-AU" | "en-CA";
  /** Where to POST transcripts (defaults to
   *  /api/tutor/english-conversation/turn).  Provided for testability. */
  sttEndpoint?: string;
  /** 正式 learning session 在摘要安全寫入後，由孩子決定何時前往下一題。 */
  onComplete?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// VAD (Voice Activity Detection) — client-side, energy-based.
// Pure helper for testability.
// ─────────────────────────────────────────────────────────────────────────────

const SILENCE_MS = 700;
const MIN_SPEECH_MS = 250;

/**
 * Runs the VAD on a continuous AnalyserNode.  Calls onSpeechEnd() once
 * each time the user speaks for >= MIN_SPEECH_MS and then is silent for
 * >= SILENCE_MS.  Returns a stop() that detaches all listeners.
 */
function attachVad(
  analyser: AnalyserNode,
  onSpeechEnd: (chunkDurationMs: number) => void,
): () => void {
  const data = new Uint8Array(analyser.fftSize);
  const THRESHOLD = 8; // 0..255; calibrated for typical laptop mic
  let speechStartedAt: number | null = null;
  let lastSoundAt = performance.now();
  let raf = 0;
  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let rms = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      rms += v * v;
    }
    rms = Math.sqrt(rms / data.length);
    const isSpeech = rms * 128 > THRESHOLD;
    const now = performance.now();
    if (isSpeech) {
      lastSoundAt = now;
      if (speechStartedAt === null) speechStartedAt = now;
    } else if (speechStartedAt !== null && now - lastSoundAt >= SILENCE_MS) {
      const chunkMs = lastSoundAt - speechStartedAt;
      speechStartedAt = null;
      if (chunkMs >= MIN_SPEECH_MS) {
        onSpeechEnd(chunkMs);
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STT helper — POST an audio Blob to the voice backend.
// Pure for testability.
// ─────────────────────────────────────────────────────────────────────────────

async function transcribeBlob(
  endpoint: string,
  blob: Blob,
): Promise<string> {
  const r = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": blob.type || "audio/webm",
      "X-MentorNest-CSRF": browserCsrfToken(),
    },
    body: blob,
  });
  if (!r.ok) throw new Error(`stt failed: ${r.status}`);
  const data = await r.json();
  if (typeof data?.transcript === "string") return data.transcript;
  if (typeof data?.text === "string") return data.text;
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ConversationTutor(props: ConversationTutorProps) {
  const [state, dispatch] = useReducer(conversationReducer, INITIAL_UI_STATE);
  const [studentTranscript, setStudentTranscript] = useState("");
  const [busy, setBusy] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const vadStopRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTtsAtRef = useRef<number | null>(null);
  // Media/VAD callback 的生命週期長於單次 React render；server-confirmed
  // identity 與 turn index 必須由 refs 提供，不能捕捉尚未更新的 state。
  const sessionIdRef = useRef<string | null>(null);
  const turnIndexRef = useRef(0);
  const turnInFlightRef = useRef(false);

  const sttEndpoint =
    props.sttEndpoint ?? buildVoiceUrl("/api/stt/transcribe");

  const stopListening = useCallback(() => {
    try {
      mediaRecorderRef.current?.state !== "inactive" &&
        mediaRecorderRef.current?.stop();
    } catch (_) {
      /* swallow */
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    vadStopRef.current?.();
    audioCtxRef.current?.close().catch(() => {});
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    vadStopRef.current = null;
    audioCtxRef.current = null;
  }, []);

  // Tear down any in-flight media on unmount.
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.state !== "inactive" &&
          mediaRecorderRef.current?.stop();
      } catch (_) {
        /* swallow */
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      vadStopRef.current?.();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    // MediaRecorder for STT submission (one chunk per speech segment).
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: selectMime() });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    mr.start();

    vadStopRef.current = attachVad(analyser, async (_durationMs) => {
      if (turnInFlightRef.current) return;
      // Pause recording briefly, snapshot chunks, send to STT.
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") return;
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.stop();
      await stopped;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      chunksRef.current = [];
      // 一輪只收孩子的聲音；送 STT 與老師 TTS 期間釋放麥克風，避免
      // iPad 外放被 VAD 誤當成下一輪學生回答。
      stopListening();

      // Tell the UI we have heard the child.
      dispatch({ type: "STUDENT_SPOKE" });
      setBusy(true);
      turnInFlightRef.current = true;
      try {
        const transcript = await transcribeBlob(sttEndpoint, blob);
        setStudentTranscript(transcript);
        if (!transcript.trim()) {
          // Empty transcript: invite again instead of POSTing nothing.
          setBusy(false);
          dispatch({ type: "LISTEN_AGAIN" });
          void startListening();
          return;
        }
        const sessionId = sessionIdRef.current;
        if (!sessionId) throw new Error("conversation_session_missing");
        const nextTurnIndex = turnIndexRef.current + 1;
        const resp = await postConversationTurn({
          session_id: sessionId,
          transcript,
          turn_index: nextTurnIndex,
        });
        setBusy(false);
        if (resp.ok === true) {
          turnIndexRef.current = resp.turn_index;
          dispatch({
            type: "DECISION_READY",
            action: resp.decision.action,
            utterance: resp.tts_text,
          });
        } else {
          dispatch({
            type: "ENDED",
            errorMessage: "message" in resp ? (resp as any).message : null,
          });
        }
      } catch (_err) {
        setBusy(false);
        dispatch({
          type: "ENDED",
          errorMessage: "老師這邊連線有點慢，等一下再試。",
        });
      } finally {
        turnInFlightRef.current = false;
      }
    });
  }, [stopListening, sttEndpoint]);

  const onStart = useCallback(async () => {
    const resp = await startConversationSession({
      student_id: props.studentId,
      knowledge_point: props.knowledgePoint,
      age_band: props.ageBand,
      topic: props.topic,
      locale: props.locale ?? "en-US",
    });
    if (resp.ok === true) {
      sessionIdRef.current = resp.session.session_id;
      turnIndexRef.current = 0;
      dispatch({
        type: "STARTED",
        sessionId: resp.session.session_id,
        greeting: resp.greeting,
      });
      // Begin listening as soon as the greeting starts.
      void startListening();
    } else {
      dispatch({
        type: "ENDED",
        errorMessage: "message" in resp ? (resp as any).message : null,
      });
    }
  }, [props.studentId, props.knowledgePoint, props.ageBand, props.topic, props.locale, startListening]);

  const onEnd = useCallback(async () => {
    stopListening();
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      try {
        await endConversationSession({
          session_id: sessionId,
          reason: "child_ended",
        });
      } catch (_) {
        /* swallow; we are leaving anyway */
      }
    }
    sessionIdRef.current = null;
    turnIndexRef.current = 0;
    dispatch({ type: "ENDED" });
  }, [stopListening]);

  // Track when TTS playback finishes -> back to LISTENING.
  useEffect(() => {
    if (state.phase !== "SPEAKING") return;
    startTtsAtRef.current = performance.now();
  }, [state.phase]);

  return (
    <section
      className={`mn-conversation mn-conversation--${state.phase.toLowerCase()}`}
      role="region"
      aria-label="和老師說英文"
      data-phase={state.phase}
    >
      {state.phase === "IDLE" && (
        <div className="mn-conversation__idle">
          <h2 className="mn-conversation__title">和老師說英文</h2>
          <p className="mn-conversation__hint">
            按下開始，老師會在這裡聽你說話。
          </p>
          <button
            type="button"
            className="mn-conversation__btn mn-conversation__btn--primary"
            onClick={onStart}
            disabled={busy}
            data-testid="start-conversation"
          >
            開始和老師說話
          </button>
          {state.errorMessage && (
            <p className="mn-conversation__error" role="alert">
              {state.errorMessage}
            </p>
          )}
        </div>
      )}

      {state.phase !== "IDLE" && (
        <div className="mn-conversation__active">
          <header className="mn-conversation__header">
            <PhaseBadge phase={state.phase} />
            <button
              type="button"
              className="mn-conversation__btn mn-conversation__btn--ghost"
              onClick={onEnd}
              disabled={state.phase === "ENDED"}
              data-testid="end-conversation"
            >
              結束對話
            </button>
          </header>

          {/* Tutor's last utterance (also feeds TTSPlayer). */}
          <div
            className="mn-conversation__tutor"
            data-testid="tutor-utterance"
            aria-live="polite"
          >
            {state.lastUtterance ? (
              <>
                <p className="mn-conversation__tutor-text">
                  老師：{state.lastUtterance}
                </p>
                {state.phase === "SPEAKING" && (
                  <TTSPlayer
                    text={state.lastUtterance}
                    voiceId="en_US-lessac-medium"
                    onEnded={() => {
                      dispatch({ type: "TTS_DONE" });
                      if (state.lastAction !== "wrap_up") void startListening();
                    }}
                  />
                )}
              </>
            ) : (
              <p className="mn-conversation__tutor-text mn-conversation__tutor-text--muted">
                （老師準備中…）
              </p>
            )}
          </div>

          {/* Live transcript so the child can confirm what the system heard. */}
          {studentTranscript && state.phase !== "ENDED" && (
            <p
              className="mn-conversation__student"
              data-testid="student-heard"
              aria-live="polite"
            >
              我聽到：{studentTranscript}
            </p>
          )}

          {state.phase === "THINKING" && (
            <p className="mn-conversation__thinking" data-testid="thinking">
              老師想想怎麼接…
            </p>
          )}

          {state.phase === "ENDED" && (
            <div className="mn-conversation__ended" data-testid="ended">
              <p>{state.errorMessage || "對話結束，老師已整理好這次的練習。"}</p>
              {!state.errorMessage && props.onComplete && (
                <button
                  type="button"
                  className="mn-conversation__btn mn-conversation__btn--primary"
                  data-testid="conversation-next"
                  onClick={props.onComplete}
                >繼續下一題</button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PhaseBadge({ phase }: { phase: ConversationPhase }) {
  const label =
    phase === "LISTENING"
      ? "🎤 老師在聽"
      : phase === "THINKING"
      ? "💭 老師想想"
      : phase === "SPEAKING"
      ? "🔊 老師在說"
      : "結束";
  return (
    <span
      className={`mn-conversation__phase mn-conversation__phase--${phase.toLowerCase()}`}
      role="status"
      aria-live="polite"
      data-testid="phase-badge"
    >
      {label}
    </span>
  );
}

function selectMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const mimes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const m of mimes) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}
