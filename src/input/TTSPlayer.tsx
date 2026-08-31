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
  language?: "en-US";
  voiceId?: string;       // future: select voice persona; default "piper-lessac-en-us-high"
  defaultSpeed?: number;  // 0.5-2.0; default 1.0
  ariaLabel?: string;
  preloadAudio?: boolean; // 只準備目前顯示題目的音訊，永不自動播放
  showSpeed?: boolean;    // default true
  onEnded?: () => void;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5];

export function TTSPlayer(props: TTSPlayerProps) {
  const {
    text,
    language,
    defaultSpeed = 1.0,
    ariaLabel = "播放語音",
    preloadAudio = false,
    showSpeed = true,
  } = props;

  const [state, setState] = useState<"idle" | "preloading" | "loading" | "ready" | "playing" | "paused" | "error">("idle");
  const [speed, setSpeed] = useState(defaultSpeed);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<string> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const releaseAudio = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setAudioUrl(null);
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    releaseAudio();
    setError(null);
    setState("idle");
    return () => {
      generationRef.current += 1;
      releaseAudio();
    };
  }, [text, language, releaseAudio]);

  const prepareAudio = useCallback(async () => {
    if (objectUrlRef.current) return objectUrlRef.current;
    if (pendingRef.current) return pendingRef.current;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    const operation = (async () => {
      // application/x-www-form-urlencoded is a CORS "simple" request
      // — the browser will NOT issue an OPTIONS preflight for it.
      // This is needed because the Zeabur ingress intercepts OPTIONS
      // preflights and returns a synthetic `allow: POST` without the
      // Access-Control-Allow-Origin header, which would otherwise block
      // cross-origin calls entirely.
      const form = new URLSearchParams();
      form.set("text", text);
      if (language) form.set("language", language);
      const resp = await fetch(buildVoiceUrl("/api/tts/synthesize"), {
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
      const env = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        audio_id?: string;
        audio_url?: string;
        error?: string;
      } | null;
      if (!resp.ok || !env?.ok || !env.audio_url) {
        const info = classifyVoiceError(env ?? resp);
        devDiag("tts-player", info);
        throw new Error(info.message);
      }
      if (!/^\/api\/audio\/[a-f0-9]{16}$/i.test(env.audio_url)) {
        throw new Error("音訊位置無效，請再試一次。");
      }
      const audioResponse = await fetch(buildVoiceUrl(env.audio_url), {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!audioResponse.ok) throw new Error("老師的聲音還沒準備好，請再試一次。");
      const blob = await audioResponse.blob();
      if (generation !== generationRef.current || controller.signal.aborted) throw new DOMException("stale", "AbortError");
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setAudioUrl(url);
      return url;
    })();
    pendingRef.current = operation;
    try {
      return await operation;
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      const info = classifyVoiceError(e);
      devDiag("tts-player", info);
      setError(info.message);
      setState("error");
      throw e;
    } finally {
      if (pendingRef.current === operation) pendingRef.current = null;
    }
  }, [text, language]);

  useEffect(() => {
    if (!preloadAudio || !text || audioUrl || pendingRef.current) return;
    setState("preloading");
    prepareAudio().then(() => setState("ready")).catch((error) => {
      if (error?.name !== "AbortError") setState("error");
    });
  }, [preloadAudio, text, audioUrl, prepareAudio]);

  const togglePlay = useCallback(async () => {
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      setState("paused");
    } else if (state === "paused" && audioRef.current) {
      audioRef.current.play();
      setState("playing");
    } else if (state === "ready" && audioRef.current) {
      await audioRef.current.play();
    } else if (state === "idle" || state === "error") {
      setState("loading");
      try {
        const url = await prepareAudio();
        if (!audioRef.current) return;
        audioRef.current.src = url;
        audioRef.current.playbackRate = speed;
        await audioRef.current.play();
      } catch (error: any) {
        if (error?.name !== "AbortError") setState("error");
      }
    }
  }, [state, prepareAudio, speed]);

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

  const label = state === "playing" ? "暫停" : state === "preloading" ? "準備中…" : state === "loading" ? "載入中…" : "播放";
  const dataState = state === "playing" ? "playing" : state === "paused" ? "paused" : "ready";

  return (
    <div className="mn-tts-player" data-testid="tts-player" data-state={dataState}>
      <button
        type="button"
        className="mn-tts-player__play"
        onClick={togglePlay}
        aria-label={ariaLabel}
        data-testid="tts-play"
        disabled={state === "loading" || state === "preloading"}
      >
        {state === "loading" || state === "preloading" ? (
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
        src={audioUrl ?? undefined}
        onPlay={() => setState("playing")}
        onPause={() => setState("paused")}
        onEnded={() => {
          setState("idle");
          props.onEnded?.();
        }}
        onError={() => { setError("音訊播放失敗"); setState("error"); }}
        preload={preloadAudio ? "auto" : "none"}
        aria-hidden="true"
      />

      {error && (
        <div className="mn-tts-player__error" role="alert">{error}</div>
      )}
    </div>
  );
}
