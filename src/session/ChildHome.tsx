// src/session/ChildHome.tsx
//
// Phase 5C-1.1 — Child Home view.
//
// One primary CTA only:
//   - no resume state?        CTA label = "開始今天的學習"
//   - resumable session?      CTA label = "繼續上次的學習" (same single button)
// Resume is announced as a single line of microcopy BELOW the goal row,
// never as a second affordance.  This honours the INV-CL-2 spirit
// ("one decision per screen") for G5-G6.
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
  const [resumeAtIndex, setResumeAtIndex] = useState<number | null>(null);

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
      if (typeof parsed.current_index === "number") {
        setResumeAtIndex(parsed.current_index + 1);
      }
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

  // INV-CL-2: ONE primary CTA.  Resume availability only changes the label
  // and adds a single microcopy line.  No second button.
  const ctaLabel = loading
    ? "準備中…"
    : resumeAvailable
      ? "繼續上次的學習"
      : "開始今天的學習";

  return (
    <section
      className="mn-card mn-home-card"
      data-testid="child-home"
      data-age-band={ageBand}
      data-student-id={studentId}
      data-resume-available={resumeAvailable ? "true" : "false"}
    >
      <header className="mn-card-header">
        <span className="mn-tag">今日練習</span>
      </header>
      <h1 data-testid="home-headline">
        {resumeAvailable ? "歡迎回來" : "嗨，今天準備好了嗎？"}
      </h1>
      <p data-testid="home-body">
        {resumeAvailable
          ? "從上次停下的地方接著練習就好。"
          : "我們會根據你最近的練習，選出今天適合做的題目。"}
      </p>

      {/* Resume as microcopy, never as a second affordance. */}
      {resumeAvailable && resumeAtIndex !== null && (
        <p
          className="mn-home-resume-note"
          data-testid="home-resume-note"
        >
          你上次停在第 {resumeAtIndex} 題，按下「繼續上次的學習」就會自動接上。
        </p>
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
          aria-label={ctaLabel}
        >
          {ctaLabel}
        </button>
      </div>

      <span role="status" aria-live="polite" className="mn-sr-only" data-testid="sr-status-home">
        {loading ? "正在載入今天的題目。" : "點按按鈕開始今天的學習。"}
      </span>
    </section>
  );
}