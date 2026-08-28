// src/input/VoiceRecorder.tsx
//
// Phase 5C-2B — Voice recorder component.
//
// Captures audio via MediaRecorder, posts to /api/stt/transcribe,
// shows transcript for child review before submit.  Hard limits:
//   - 60 second recording cap
//   - No cloud STT fallback (sensevoice_local only)
//   - No raw audio retention (sent to /tmp server-side with 30s TTL)
//
// States: idle | recording | processing | transcribed | error
//
// Privacy invariants respected:
//   - mic permission requested explicitly
//   - audio_retained: false (server-side TTL 30s)
//   - transcript NOT auto-recorded to Learning Memory
//   - child can re-record unlimited times before submit

import React, { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderState =
  | "idle"
  | "permission_denied"
  | "recording"
  | "processing"
  | "transcribed"
  | "error";

export interface VoiceRecorderProps {
  stepId: string;
  language?: "auto" | "zh" | "en";
  ariaLabel?: string;
  maxRecordingMs?: number; // default 60_000
  onSubmit: (transcript: string) => void;
  onCancel?: () => void;
}

const DEFAULT_MAX_MS = 60_000;

export function VoiceRecorder(props: VoiceRecorderProps) {
  const {
    stepId,
    language = "auto",
    ariaLabel = "語音回答",
    maxRecordingMs = DEFAULT_MAX_MS,
    onSubmit,
    onCancel,
  } = props;

  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecorder();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
  }, []);

  const beginRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState("permission_denied");
      setError("這個瀏覽器不支援麥克風");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: selectMime() });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        // Stop tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        // Send to STT
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        sendForTranscription(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setState("recording");

      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
        setElapsedMs(elapsed);
        if (elapsed >= maxRecordingMs) {
          stopRecorder();
        }
      }, 200);
    } catch (e: any) {
      setState("permission_denied");
      setError(e?.message || "麥克風權限被拒絕");
    }
  }, [maxRecordingMs, stopRecorder]);

  const stopAndTranscribe = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      setState("processing");
      stopRecorder();
    }
  }, [stopRecorder]);

  const sendForTranscription = useCallback(async (blob: Blob) => {
    try {
      setState("processing");
      const resp = await fetch(`/api/stt/transcribe?language=${encodeURIComponent(language)}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.error || "STT failed");
      const t = (json.transcript || "").trim();
      setTranscript(t);
      if (t.length === 0) {
        // Re-record prompt — don't fail the child
        setState("idle");
        setError("沒聽清楚，再說一次好嗎？");
      } else {
        setState("transcribed");
      }
    } catch (e: any) {
      setState("error");
      setError(e?.message || "STT 失敗");
    }
  }, [language]);

  const retry = useCallback(() => {
    setTranscript("");
    setError(null);
    setState("idle");
  }, []);

  const handleSubmit = useCallback(() => {
    if (!transcript.trim()) return;
    onSubmit(transcript.trim());
  }, [transcript, onSubmit]);

  const handleCancel = useCallback(() => {
    setTranscript("");
    setError(null);
    setState("idle");
    if (onCancel) onCancel();
  }, [onCancel]);

  const secondsLeft = Math.max(0, Math.ceil((maxRecordingMs - elapsedMs) / 1000));

  return (
    <div className="mn-voice" data-testid="voice-recorder">
      <div className="mn-voice__label" id={`voice-label-${stepId}`}>{ariaLabel}</div>

      {state === "idle" && (
        <div className="mn-voice__controls">
          <button
            type="button"
            className="mn-voice__mic"
            onClick={beginRecording}
            aria-label="開始錄音"
            data-testid="voice-record-start"
          >
            <span className="mn-voice__mic-icon" aria-hidden="true">●</span>
            <span className="mn-voice__mic-text">開始錄音</span>
          </button>
          {error && <div className="mn-voice__hint" role="alert">{error}</div>}
        </div>
      )}

      {state === "permission_denied" && (
        <div className="mn-voice__controls">
          <div className="mn-voice__error" role="alert">
            {error || "麥克風權限被拒絕"}
          </div>
          <button
            type="button"
            className="mn-action mn-action--ghost"
            onClick={beginRecording}
            data-testid="voice-retry-permission"
          >
            再試一次
          </button>
        </div>
      )}

      {state === "recording" && (
        <div className="mn-voice__controls mn-voice__controls--recording">
          <button
            type="button"
            className="mn-voice__mic mn-voice__mic--active"
            onClick={stopAndTranscribe}
            aria-label="停止錄音"
            data-testid="voice-record-stop"
          >
            <span className="mn-voice__mic-icon" aria-hidden="true">■</span>
            <span className="mn-voice__mic-text">停止</span>
          </button>
          <div className="mn-voice__timer" aria-live="polite">
            剩餘 {secondsLeft} 秒
          </div>
        </div>
      )}

      {state === "processing" && (
        <div className="mn-voice__controls mn-voice__controls--processing">
          <div className="mn-voice__spinner" aria-hidden="true" />
          <div className="mn-voice__hint">正在辨識你的聲音…</div>
        </div>
      )}

      {state === "transcribed" && (
        <div className="mn-voice__review">
          <label className="mn-voice__review-label" htmlFor={`voice-transcript-${stepId}`}>
            這是你說的話，可以編輯：
          </label>
          <textarea
            id={`voice-transcript-${stepId}`}
            className="mn-voice__transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            aria-label="語音轉文字內容"
            data-testid="voice-transcript-textarea"
          />
          <div className="mn-voice__review-actions">
            <button
              type="button"
              className="mn-action mn-action--ghost"
              onClick={retry}
              data-testid="voice-retry"
            >
              再說一次
            </button>
            <button
              type="button"
              className="mn-action mn-action--primary"
              onClick={handleSubmit}
              disabled={!transcript.trim()}
              data-testid="voice-submit"
            >
              確認送出
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="mn-voice__controls">
          <div className="mn-voice__error" role="alert">
            {error || "語音辨識失敗"}
          </div>
          <button
            type="button"
            className="mn-action mn-action--ghost"
            onClick={retry}
            data-testid="voice-error-retry"
          >
            再試一次
          </button>
        </div>
      )}

      {onCancel && state !== "transcribed" && (
        <button
          type="button"
          className="mn-voice__cancel"
          onClick={handleCancel}
          data-testid="voice-cancel"
        >
          改用文字回答
        </button>
      )}
    </div>
  );
}

function selectMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}