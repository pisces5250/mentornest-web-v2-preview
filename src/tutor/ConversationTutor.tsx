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
import { buildVoiceUrl, classifyVoiceError, devDiag } from "../foundation/voice_api";
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
const STT_TIMEOUT_MS = 20_000;
const TTS_TIMEOUT_MS = 20_000;

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
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": blob.type || "audio/webm",
        "X-MentorNest-CSRF": browserCsrfToken(),
      },
      body: blob,
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`stt failed: ${r.status}`);
    const data = await r.json();
    if (typeof data?.transcript === "string") return data.transcript;
    if (typeof data?.text === "string") return data.text;
    return "";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("stt_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ConversationTutor(props: ConversationTutorProps) {
  const [state, dispatch] = useReducer(conversationReducer, INITIAL_UI_STATE);
  const [studentTranscript, setStudentTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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
  const conversationAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAbortRef = useRef<AbortController | null>(null);
  const playbackObjectUrlRef = useRef<string | null>(null);
  const playbackGenerationRef = useRef(0);
  const playbackActiveRef = useRef(false);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const sttEndpoint =
    props.sttEndpoint ?? buildVoiceUrl("/api/stt/transcribe?language=en");

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

  const releaseConversationAudio = useCallback(() => {
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
    playbackActiveRef.current = false;
    const audio = conversationAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (playbackObjectUrlRef.current) {
      URL.revokeObjectURL(playbackObjectUrlRef.current);
      playbackObjectUrlRef.current = null;
    }
  }, []);

  // iPad Safari 必須在明確 user gesture 中解鎖同一個 audio element。
  // 這段只播放 20ms 靜音，後續每一輪仍使用本機 Voice TTS 音訊。
  const primeConversationAudio = useCallback(() => {
    const audio = conversationAudioRef.current;
    if (!audio) return;
    const sampleCount = 160;
    const wav = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(wav);
    const text = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, sampleCount * 2, true);
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    audio.muted = true;
    audio.src = url;
    const priming = audio.play();
    void priming.catch(() => {}).finally(() => {
      if (!playbackActiveRef.current) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      audio.muted = false;
      URL.revokeObjectURL(url);
    });
  }, []);

  const playTutorAudio = useCallback(async (utterance: string) => {
    if (!utterance.trim() || !sessionIdRef.current) return;
    stopListening();
    releaseConversationAudio();
    setPlaybackError(null);
    const generation = ++playbackGenerationRef.current;
    const controller = new AbortController();
    playbackAbortRef.current = controller;
    const deadline = window.setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    try {
      const form = new URLSearchParams();
      form.set("text", utterance);
      form.set("language", props.locale ?? "en-US");
      const response = await fetch(buildVoiceUrl("/api/tts/synthesize"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-MentorNest-CSRF": browserCsrfToken(),
        },
        body: form.toString(),
        signal: controller.signal,
        cache: "no-store",
      });
      const envelope = await response.json().catch(() => null) as {
        ok?: boolean;
        audio_url?: string;
      } | null;
      if (!response.ok || !envelope?.ok || !envelope.audio_url) {
        throw response;
      }
      if (!/^\/api\/audio\/[a-f0-9]{16}$/i.test(envelope.audio_url)) {
        throw new Error("invalid_audio_url");
      }
      const audioResponse = await fetch(buildVoiceUrl(envelope.audio_url), {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!audioResponse.ok) throw audioResponse;
      const blob = await audioResponse.blob();
      if (generation !== playbackGenerationRef.current) return;
      const audio = conversationAudioRef.current;
      if (!audio) return;
      const url = URL.createObjectURL(blob);
      playbackObjectUrlRef.current = url;
      audio.muted = false;
      audio.src = url;
      audio.playbackRate = 1;
      playbackActiveRef.current = true;
      await audio.play();
    } catch (error) {
      if (generation !== playbackGenerationRef.current) return;
      playbackActiveRef.current = false;
      const info = classifyVoiceError(error);
      devDiag("conversation-playback", info);
      setPlaybackError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "瀏覽器暫停了自動播放，點一下就能繼續。"
          : "老師的聲音沒有播放成功，可以再試一次。",
      );
    } finally {
      window.clearTimeout(deadline);
    }
  }, [props.locale, releaseConversationAudio, stopListening]);

  const finishTutorAudio = useCallback(() => {
    if (!playbackActiveRef.current) return;
    playbackActiveRef.current = false;
    if (playbackObjectUrlRef.current) {
      URL.revokeObjectURL(playbackObjectUrlRef.current);
      playbackObjectUrlRef.current = null;
    }
    const shouldResume = stateRef.current.lastAction !== "wrap_up";
    dispatch({ type: "TTS_DONE" });
    if (shouldResume && sessionIdRef.current) {
      void startListeningRef.current?.();
    }
  }, []);

  // Tear down any in-flight media on unmount.
  useEffect(() => {
    return () => {
      playbackGenerationRef.current += 1;
      releaseConversationAudio();
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
  }, [releaseConversationAudio]);

  const startListening = useCallback(async () => {
    if (mediaStreamRef.current || stateRef.current.phase === "ENDED") return;
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
      let resumeListening = false;
      try {
        const transcript = await transcribeBlob(sttEndpoint, blob);
        setStudentTranscript(transcript);
        if (!transcript.trim()) {
          // Empty transcript: invite again instead of POSTing nothing.
          resumeListening = true;
          dispatch({
            type: "LISTEN_AGAIN",
            errorMessage: "這次沒有聽清楚，請再說一次。",
          });
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
      } catch (error) {
        resumeListening = true;
        dispatch({
          type: "LISTEN_AGAIN",
          errorMessage:
            error instanceof Error && error.message === "stt_timeout"
              ? "語音辨識等太久了，請再說一次。"
              : "老師剛剛沒有接好，請再說一次。",
        });
      } finally {
        setBusy(false);
        turnInFlightRef.current = false;
        if (resumeListening && sessionIdRef.current) {
          void startListening().catch(() => {
            dispatch({
              type: "ENDED",
              errorMessage: "無法重新開啟麥克風，請檢查權限後再開始。",
            });
          });
        }
      }
    });
  }, [stopListening, sttEndpoint]);
  startListeningRef.current = startListening;

  const onStart = useCallback(async () => {
    // 必須同步發生在按鈕 click call stack，才能合法解鎖 Safari audio。
    primeConversationAudio();
    setBusy(true);
    setPlaybackError(null);
    try {
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
      } else {
        dispatch({
          type: "ENDED",
          errorMessage: "message" in resp ? (resp as any).message : null,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [props.studentId, props.knowledgePoint, props.ageBand, props.topic, props.locale, primeConversationAudio]);

  const onEnd = useCallback(async () => {
    stopListening();
    playbackGenerationRef.current += 1;
    releaseConversationAudio();
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
  }, [releaseConversationAudio, stopListening]);

  // Track when TTS playback finishes -> back to LISTENING.
  useEffect(() => {
    if (state.phase !== "SPEAKING") return;
    startTtsAtRef.current = performance.now();
    void playTutorAudio(state.lastUtterance);
  }, [state.phase, state.lastUtterance, playTutorAudio]);

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

          {/* Tutor's last utterance；Conversation 專用 controller 自動播放。 */}
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
                {state.phase === "SPEAKING" && !playbackError && (
                  <p className="mn-conversation__speaking" data-testid="conversation-auto-speaking">
                    老師正在說話…
                  </p>
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

          {state.errorMessage && state.phase !== "ENDED" && (
            <p className="mn-conversation__error" role="alert">
              {state.errorMessage}
            </p>
          )}

          {playbackError && state.phase === "SPEAKING" && (
            <div className="mn-conversation__playback-recovery" role="alert">
              <p>{playbackError}</p>
              <button
                type="button"
                className="mn-conversation__btn mn-conversation__btn--primary"
                onClick={() => void playTutorAudio(state.lastUtterance)}
                data-testid="conversation-playback-retry"
              >點一下聽老師說</button>
              <button
                type="button"
                className="mn-conversation__btn mn-conversation__btn--ghost"
                onClick={() => {
                  releaseConversationAudio();
                  dispatch({ type: "TTS_DONE" });
                  if (state.lastAction !== "wrap_up") void startListening();
                }}
                data-testid="conversation-playback-skip"
              >略過這次，繼續說</button>
            </div>
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
      <audio
        ref={conversationAudioRef}
        preload="auto"
        aria-hidden="true"
        data-testid="conversation-audio"
        onEnded={finishTutorAudio}
        onError={() => {
          if (playbackActiveRef.current) {
            playbackActiveRef.current = false;
            setPlaybackError("老師的聲音沒有播放成功，可以再試一次。");
          }
        }}
      />
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
  const mimes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of mimes) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}
