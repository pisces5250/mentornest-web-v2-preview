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
// Minimal info row (Phase 5C-1.1 polish round 3):
//   - Today's topic   — derived from in-progress session step[0].kp OR the
//                       defaultKnowledgePoint prop, mapped to a child-
//                       friendly phrase (presentation-only).
//   - Estimated time  — derived from in-progress session step count OR a
//                       static fallback if no session yet.  Not a timer.
//   - Simple progress — only shown when there's a resumable session, as
//                       a static ratio "上次完成 X / Y 題".  Never animated.
//
// All learning authority is delegated to the plugin via the adapter; this
// component only orchestrates UI.  This module does NOT modify learning
// logic, mastery, question selection, validation, or session-state behavior.

import React, { useCallback, useEffect, useState } from "react";
import { SessionView } from "./SessionView";
import { buildSessionFromLearningDirector } from "./learning-director-adapter.mjs";
import { type SessionState } from "./session-state.mjs";

// Presentation-only KP → child-friendly phrase mapping.  Mirrors the
// internal map in QuestionRenderer / SessionSummaryView.  No KPs are
// added/removed; if a KP isn't here we fall back to "今日練習".
const KP_PHRASE_ZH: Record<string, string> = {
  "math.G3.MULT.two-digit": "兩位數乘法",
  "math.G4.DIV.estimate": "除法的估算",
  "math.G5.FRAC.add-unlike-denom": "分數加法（不同分母）",
  "math.G5.DEC.add": "小數加法",
};

function kpToPhrase(kp: string | null | undefined): string {
  if (!kp) return "今日練習";
  return KP_PHRASE_ZH[kp] ?? "今日練習";
}

// Presentation-only estimate.  Conservative upper bound for a single
// math question at G5-G6.  Not a measurement — just enough for the
// child to see "around N minutes" before starting.
const SECONDS_PER_QUESTION = 90;
function estimateDurationZh(stepCount: number | null | undefined): string {
  if (!stepCount || stepCount <= 0) return "約 5 分鐘";
  const totalSec = stepCount * SECONDS_PER_QUESTION;
  const minutes = Math.max(1, Math.round(totalSec / 60));
  return `約 ${minutes} 分鐘`;
}

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
  const [resumeSteps, setResumeSteps] = useState<number | null>(null);
  const [resumeTopic, setResumeTopic] = useState<string | null>(null);

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
      if (Array.isArray(parsed.steps)) {
        setResumeSteps(parsed.steps.length);
        const firstKp = parsed.steps[0]?.knowledge_point;
        if (firstKp) setResumeTopic(firstKp);
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

  // Info row values.  When resuming we use the persisted state; otherwise
  // we use the prop or a generic default.  All presentation-only.
  const topicPhrase = kpToPhrase(resumeTopic ?? defaultKnowledgePoint);
  const durationLabel = estimateDurationZh(
    resumeAvailable ? resumeSteps : 4
  );

  // Progress: only meaningful when resuming.  "上次完成 X / Y 題".
  // current_index is 0-based; "completed" = (current_index) so far,
  // rounded.  Clamped to steps length.  Hidden entirely when no resume so
  // the info row stays clean for first-time visits.
  const progressFraction =
    resumeAvailable && resumeAtIndex !== null && resumeSteps
      ? Math.max(0, Math.min(1, (resumeAtIndex - 1) / resumeSteps))
      : null;
  const progressPercent =
    progressFraction !== null ? Math.round(progressFraction * 100) : 0;

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
          : "今天的練習是為你準備的，慢慢寫就好。"}
      </p>

      {/* Minimal info row (Phase 5C-1.1 polish round 3).  Always present
       *  so the home never reads as an empty shell, even when there's no
       *  resumable session. */}
      <div className="mn-home-card__info-row" data-testid="home-info-row">
        <div className="mn-home-card__info-item">
          <span className="mn-home-card__info-label">主題</span>
          <span className="mn-home-card__info-value" data-testid="home-topic">{topicPhrase}</span>
        </div>
        <div className="mn-home-card__info-item">
          <span className="mn-home-card__info-label">預估時間</span>
          <span className="mn-home-card__info-value" data-testid="home-duration">{durationLabel}</span>
        </div>
        {progressFraction !== null && (
          <div className="mn-home-card__info-item">
            <span className="mn-home-card__info-label">上次進度</span>
            <span className="mn-home-card__info-value" data-testid="home-progress-label">
              已完成 {Math.max(0, (resumeAtIndex ?? 1) - 1)} / {resumeSteps} 題
            </span>
          </div>
        )}
      </div>

      {progressFraction !== null && (
        <div
          className="mn-home-card__progress"
          role="progressbar"
          aria-label="上次進度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          data-testid="home-progress"
        >
          <span
            className="mn-home-card__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

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

      <div className="mn-actions mn-actions--home">
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