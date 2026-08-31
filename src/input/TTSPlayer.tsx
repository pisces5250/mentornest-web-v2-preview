// src/input/TTSPlayer.tsx
//
// Phase 5C-2C / Round 17 — Local TTS playback component.
//
// Posts text to the standalone Voice Backend at
// `${VITE_MENTORNEST_VOICE_API_BASE}/api/tts/synthesize`, gets back
// audio_url (relative path), plays via <audio>. Speed control 0.5-2.0x.
//
// Privacy: text is sent to local sherpa-onnx TTS. Audio file is
// server-side TTL 30s. Never persisted to long-term memory.
//
// Hard Invariants:
//   - No cloud TTS fallback
//   - Speed limited to 0.5-2.0
//   - Audio never auto-recorded
//   - Local-only (offline) backend required
//   - never displays backend error wording, JSON parse errors, or
//     API URL to the child
//
// Concurrency:
//   - Single-inference voice backend returns 503 + Retry-After when
//     busy. We display a friendly retry hint; no auto-retry.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  buildVoiceUrl,
  classifyVoiceError,
  devDiag,
} from "../foundation/voice_api";
import { browserCsrfToken } from "../foundation/browser_security";

export interface TTSPlayerProps {
  text: string;
  voiceId?: string;       // future: select voice persona; default "piper-lessac-en-us-high"
  defaultSpeed?: number;  // 0.5-2.0; default 1.0
  ariaLabel?: string;
  autoPlay?: boolean;     // default false — never auto-play (avoid surprising child)
  showSpeed?: boolean;    // default true
  onEnded?: () => void;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5];

export function TTSPlayer(props: TTSPlayerProps) {
  const {
    text,
    defaultSpeed = 1.0,
    ariaLabel = "播放語音",
    autoPlay = false,
    showSpeed = true,
  } = props;

  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [speed, setSpeed] = useState(defaultSpeed);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const fetchAndPlay = useCallback(async (withPlay: boolean) => {
    setError(null);
    setState("loading");
    try {
      // application/x-www-form-urlencoded is a CORS "simple" request
      // — the browser will NOT issue an OPTIONS preflight for it.
      // This is needed because the Zeabur ingress intercepts OPTIONS
      // preflights and returns a synthetic `allow: POST` without the
      // Access-Control-Allow-Origin header, which would otherwise block
      // cross-origin calls entirely.
      const form = new URLSearchParams();
      form.set("text", text);
      form.set("speed", String(speed));
      const resp = await fetch(buildVoiceUrl("/api/tts/synthesize"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-MentorNest-CSRF": browserCsrfToken(),
        },
        body: form.toString(),
      });
      const env = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        audio_id?: string;
        audio_url?: string;
        error?: string;
      } | null;
      if (!resp.ok || !env?.ok || !env.audio_url) {
        const info = classifyVoiceError(env ?? resp);
        devDiag("tts-player", info);
        setError(info.message);
        setState("error");
        return;
      }
      // Resolve audio_url against the voice backend base.
      const url = `${buildVoiceUrl(env.audio_url)}?t=${Date.now()}`;
      setAudioUrl(url);

      // Wait for the next render cycle so the <audio> ref exists
      await new Promise((r) => setTimeout(r, 0));

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.playbackRate = speed;
        if (withPlay) {
          try {
            await audioRef.current.play();
            setState("playing");
          } catch {
            setState("idle");
          }
        } else {
          setState("idle");
        }
      }
    } catch (e: any) {
      // Network / fetch threw before we even got a Response.
      const info = classifyVoiceError(e);
      devDiag("tts-player", info);
      setError(info.message);
      setState("error");
    }
  }, [text, speed]);

  // Auto-play support
  useEffect(() => {
    if (autoPlay && text && state === "idle" && !audioUrl) {
      fetchAndPlay(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay]);

  const togglePlay = useCallback(() => {
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      setState("paused");
    } else if (state === "paused" && audioRef.current) {
      audioRef.current.play();
      setState("playing");
    } else if (state === "idle" || state === "error") {
      fetchAndPlay(true);
    }
  }, [state, fetchAndPlay]);

  const cycleSpeed = useCallback(() => {
    setSpeed((s) => {
      const i = SPEED_OPTIONS.indexOf(s);
      const next = SPEED_OPTIONS[(i + 1) % SPEED_OPTIONS.length];
      if (audioRef.current && state === "playing") {
        audioRef.current.playbackRate = next;
      }
      return next;
    });
  }, [state]);

  const label = state === "playing" ? "暫停" : state === "loading" ? "載入中…" : "播放";
  const dataState = state === "playing" ? "playing" : state === "paused" ? "paused" : "ready";

  return (
    <div className="mn-tts-player" data-testid="tts-player" data-state={dataState}>
      <button
        type="button"
        className="mn-tts-player__play"
        onClick={togglePlay}
        aria-label={ariaLabel}
        data-testid="tts-play"
        disabled={state === "loading"}
      >
        {state === "loading" ? (
          <span className="mn-tts-player__spinner" aria-hidden="true" />
        ) : state === "playing" ? (
          <span className="mn-tts-player__icon" aria-hidden="true">⏸</span>
        ) : (
          <span className="mn-tts-player__icon" aria-hidden="true">▶</span>
        )}
        <span className="mn-tts-player__label">{label}</span>
      </button>

      {showSpeed && (
        <button
          type="button"
          className="mn-tts-player__speed"
          onClick={cycleSpeed}
          aria-label={`播放速度 ${speed}x`}
          data-testid="tts-speed"
        >
          {speed}x
        </button>
      )}

      <audio
        ref={audioRef}
        onPlay={() => setState("playing")}
        onPause={() => setState("paused")}
        onEnded={() => {
          setState("idle");
          props.onEnded?.();
        }}
        onError={() => { setError("音訊播放失敗"); setState("error"); }}
        preload="none"
        aria-hidden="true"
      />

      {error && (
        <div className="mn-tts-player__error" role="alert">{error}</div>
      )}
    </div>
  );
}
