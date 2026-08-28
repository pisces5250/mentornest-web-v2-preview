// src/session/SessionView.tsx
//
// Phase 5C-1 — Owns the session state machine, dispatches to QuestionRenderer,
// and writes back to localStorage for resume/reload.  No direct plugin
// calls from this layer — all authority stays in mentornest-learning.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sessionReduce, STEP_VERDICT, type SessionState } from "./session-state.mjs";
import { QuestionRenderer } from "./QuestionRenderer";
import { SessionSummaryView } from "./SessionSummaryView";

export interface SessionViewProps {
  // Pre-built session (from buildSessionFromLearningDirector).
  initialSession: SessionState;
  // LocalStorage key for resume.  Pass null to disable persistence.
  storageKey?: string | null;
  // Where to land on session end.
  onSessionEnd?: (finalSession: SessionState) => void;
}

export function SessionView(props: SessionViewProps) {
  const { initialSession, storageKey = "mentornest.session.v1", onSessionEnd } = props;
  const [state, setState] = useState<SessionState>(initialSession);
  const [resumed, setResumed] = useState(false);
  const dispatch = useRef((action: any) => {
    setState((s) => sessionReduce(s, action));
  });

  // 1) Try to resume from localStorage on mount (if a snapshot exists for this key).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.session_id !== initialSession.session_id) return;
      setState(parsed);
      setResumed(true);
    } catch (e) {
      // ignore corrupted snapshot
    }
  }, [storageKey, initialSession.session_id]);

  // 2) Persist on every change so reload resumes the same step.
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      // ignore quota errors
    }
  }, [state, storageKey]);

  // 3) Notify parent when session completes.
  useEffect(() => {
    if (state.status === "completed" && onSessionEnd) {
      onSessionEnd(state);
    }
  }, [state.status, state, onSessionEnd]);

  const currentStep = state.steps[state.current_index];

  const handleSubmit = useCallback((args: { verdict: string; error_type?: string | null }) => {
    dispatch.current({ type: "submit", verdict: args.verdict, error_type: args.error_type ?? null });
  }, []);

  const handleHint = useCallback(() => {
    dispatch.current({ type: "hint" });
  }, []);

  const handleRetry = useCallback(() => {
    dispatch.current({ type: "retry" });
  }, []);

  const handleRepresentationSwitch = useCallback((to: string) => {
    dispatch.current({ type: "representation_switch", to });
  }, []);

  const handleAdvance = useCallback(() => {
    dispatch.current({ type: "advance" });
  }, []);

  if (state.status === "completed" && state.summary) {
    return (
      <SessionSummaryView
        summary={state.summary}
        ageBand={state.age_band}
        studentId={state.student_id}
      />
    );
  }

  if (state.status === "error") {
    return (
      <div className="mn-card mn-error-card" data-testid="session-error" role="alert">
        <h2>本次練習發生錯誤</h2>
        <p>{state.error?.reason ?? "未知錯誤"}</p>
        <button
          type="button"
          className="mn-button"
          data-testid="session-error-reload"
          onClick={() => window.location.reload()}
        >重新整理</button>
      </div>
    );
  }

  if (!currentStep) {
    return (
      <div className="mn-card" data-testid="session-empty">
        <p>沒有題目可練習。</p>
      </div>
    );
  }

  return (
    <div className="mn-session" data-testid="mn-session" data-session-id={state.session_id}>
      {resumed && (
        <p className="mn-session-resumed" data-testid="session-resumed-notice">
          已從上次進度接續（題目 {state.current_index + 1} / {state.steps.length}）。
        </p>
      )}
      <p className="mn-session-progress" data-testid="session-progress">
        題目 {state.current_index + 1} / {state.steps.length}
      </p>

      <QuestionRenderer
        step={currentStep}
        ageBand={state.age_band as any}
        studentId={state.student_id}
        onSubmit={handleSubmit}
        onHint={handleHint}
        onRepresentationSwitch={handleRepresentationSwitch}
        onRetry={handleRetry}
        hintsUsed={currentStep.hints_used}
        attemptsCount={currentStep.attempts.length}
        lastVerdict={(currentStep.last_verdict as any) ?? null}
        phase={currentStep.phase as any}
      />

      {currentStep.phase === "feedback" && (
        <div className="mn-actions">
          <button
            type="button"
            className="mn-button mn-button--primary"
            data-testid="next-question"
            onClick={handleAdvance}
          >
            {state.current_index + 1 >= state.steps.length ? "完成練習" : "下一題"}
          </button>
        </div>
      )}
      {/* For wrong MC attempts the student can advance after seeing the
          feedback (retry path is also available via QuestionRenderer's
          retry-button).  We only auto-show this when attempts >= 1 to
          avoid skipping before they've tried. */}
      {currentStep.phase !== "feedback" &&
       currentStep.phase !== "presenting" &&
       currentStep.attempts.length > 0 &&
       currentStep.last_verdict === "incorrect" && (
        <div className="mn-actions">
          <button
            type="button"
            className="mn-button mn-button--ghost"
            data-testid="skip-question"
            onClick={handleAdvance}
          >跳過這題</button>
        </div>
      )}
    </div>
  );
}
