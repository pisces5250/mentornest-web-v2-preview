// src/session/ChildHome.tsx
//
// Phase 5C-1 — Child Home view.  Minimal entry point:
//   - "start today's learning" button
//   - on click, calls buildSessionFromLearningDirector (adapter)
//   - hands the resulting session to SessionView
//
// All learning authority is delegated to the plugin via the adapter; this
// component only orchestrates UI.

import React, { useCallback, useEffect, useState } from "react";
import { SessionView } from "./SessionView";
import { buildSessionFromLearningDirector } from "./learning-director-adapter.mjs";
import { type SessionState } from "./session-state.mjs";

export interface ChildHomeProps {
  studentId: string;            // MUST be a fake student ID (student_t_phase5c_*) for tests
  ageBand: "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
  defaultSubject?: string;      // e.g. "math"
  defaultKnowledgePoint?: string;
  sessionStorageKey?: string | null;
  onSessionEnd?: (finalSession: SessionState) => void;
  // Test/acceptance only: drive session with fixture steps instead of
  // asking the verified bank.  Production NEVER enables this.
  useFixtures?: boolean;
  fixtureSteps?: ReadonlyArray<any>;
}

export function ChildHome(props: ChildHomeProps) {
  const { studentId, ageBand, defaultSubject = "math", defaultKnowledgePoint = "", sessionStorageKey = "mentornest.session.v1", onSessionEnd, useFixtures = false, fixtureSteps } = props;

  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);

  // Detect a previously in-progress session for this student on mount.
  useEffect(() => {
    if (!sessionStorageKey) return;
    try {
      const raw = window.localStorage.getItem(sessionStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.student_id !== studentId) return;
      if (parsed.status === "completed" || parsed.status === "abandoned") return;
      setResumeAvailable(true);
    } catch (e) {
      // ignore
    }
  }, [sessionStorageKey, studentId]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // If a resumable snapshot exists for this student, reuse it; this is
      // what makes reload-resume actually attach the previous session_id
      // and show the resume notice.
      if (sessionStorageKey && resumeAvailable) {
        try {
          const raw = window.localStorage.getItem(sessionStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.student_id === studentId) {
              setSession(parsed);
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          // fall through to fresh build
        }
      }
      const { session: built } = await buildSessionFromLearningDirector({
        student_id: studentId,
        age_band: ageBand,
        subject: defaultSubject,
        knowledge_point: defaultKnowledgePoint,
        target_steps: 4,
        useFixtures,
        fixtureSteps,
      });
      setSession(built);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [studentId, ageBand, defaultSubject, defaultKnowledgePoint, resumeAvailable, sessionStorageKey]);

  if (session) {
    return (
      <SessionView
        initialSession={session}
        storageKey={sessionStorageKey}
        onSessionEnd={onSessionEnd}
      />
    );
  }

  return (
    <section
      className="mn-card mn-home-card"
      data-testid="child-home"
      data-age-band={ageBand}
      data-student-id={studentId}
    >
      <header className="mn-card-header">
        <span className="mn-tag">今日練習</span>
      </header>
      <h1 data-testid="home-headline">{resumeAvailable ? "繼續上次的練習" : "準備好了嗎？"}</h1>
      <p data-testid="home-body">{resumeAvailable ? "我們會從你上次停下的地方繼續。" : "我們會根據你最近的練習，選出今天適合做的題目。"}</p>
      {resumeAvailable && (
        <p className="mn-home-resume-note" data-testid="home-resume-note">偵測到上次未完成的練習，按下方按鈕繼續。</p>
      )}
      {error && (
        <div className="mn-error" role="alert" data-testid="home-error">{error}</div>
      )}
      <div className="mn-actions">
        <button
          type="button"
          className="mn-button mn-button--primary"
          data-testid="start-session"
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? "準備中…" : "開始今天的學習"}
        </button>
      </div>
      <span role="status" aria-live="polite" className="mn-sr-only" data-testid="sr-status-home">
        {loading ? "正在載入今天的題目。" : "點按按鈕開始今天的學習。"}
      </span>
    </section>
  );
}
