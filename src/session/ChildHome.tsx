// src/session/ChildHome.tsx
//
// Phase 5C-1.1 Round 4 — Quiet Graph Child Home.
//
// Layouts:
//   - Desktop + tablet: two-column (identity column + practice column)
//     with a hairline vertical divider.
//   - Mobile: single-column with explicit hairline rules between regions
//     so the page does not feel like one flat plane.
//
// One primary CTA only:
//   - no resume state?     CTA label = "開始今天的學習"
//   - resumable session?   CTA label = "繼續上次的學習"
// Resume is announced as a single line of microcopy BELOW the practice
// region, never as a second affordance.  INV-CL-2 spirit for G5-G6.
//
// Minimal info row (carried over from r3):
//   - Today's topic   — derived from in-progress session step[0].kp OR
//                       defaultKnowledgePoint prop, mapped to a child-
//                       friendly phrase (presentation-only).
//   - Estimated time  — derived from in-progress session step count
//                       (presentation-only, not a timer).
//   - Simple progress — only shown when there's a resumable session,
//                       as a static ratio + slim moss progress rule.
//
// All learning authority is delegated to the plugin via the adapter;
// this component is presentation-only.

import React, { useCallback, useEffect, useState } from "react";
import { SessionView } from "./SessionView";
import { buildSessionFromLearningDirector } from "./learning-director-adapter.mjs";
import { type SessionState } from "./session-state.mjs";

// Presentation-only KP → child-friendly phrase mapping.  Mirrors the
// view-layer maps in QuestionRenderer / SessionSummaryView.  If a KP
// isn't here we fall back to "今日練習".
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

const SECONDS_PER_QUESTION = 90;
function estimateDurationZh(stepCount: number | null | undefined): string {
  if (!stepCount || stepCount <= 0) return "約 5 分鐘";
  const totalSec = stepCount * SECONDS_PER_QUESTION;
  const minutes = Math.max(1, Math.round(totalSec / 60));
  return `約 ${minutes} 分鐘`;
}

export interface ChildHomeProps {
  studentId: string;
  ageBand: "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
  defaultSubject?: string;
  defaultKnowledgePoint?: string;
  sessionStorageKey?: string | null;
  onSessionEnd?: (finalSession: SessionState) => void;
  useFixtures?: boolean;
  fixtureSteps?: ReadonlyArray<any>;
  /** Phase 5C-2 acceptance-only: pin session to one specific fixture step_id. */
  forcedStepId?: string | null;
}

export function ChildHome(props: ChildHomeProps) {
  const { studentId, ageBand, defaultSubject = "math", defaultKnowledgePoint = "", sessionStorageKey = "mentornest.session.v1", onSessionEnd, useFixtures = false, fixtureSteps, forcedStepId = null } = props;

  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [resumeAtIndex, setResumeAtIndex] = useState<number | null>(null);
  const [resumeSteps, setResumeSteps] = useState<number | null>(null);
  const [resumeTopic, setResumeTopic] = useState<string | null>(null);

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
          // fall through
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
      // Phase 5C-2 acceptance-only: if forcedStepId is set, swap the
      // session to a single-step session pinned to that fixture.
      let finalSession = built;
      if (forcedStepId && Array.isArray(fixtureSteps)) {
        const pinned = fixtureSteps.find((s: any) => s.step_id === forcedStepId);
        if (pinned) {
          // Re-normalize through sessionInitial so the step carries
          // attempts/hints_used/representation_switches/last_verdict/phase.
          finalSession = {
            ...built,
            steps: [pinned],
            current_index: 0,
          };
          try {
            const { sessionInitial } = await import("./session-state.mjs");
            finalSession = sessionInitial({
              student_id: studentId,
              age_band: ageBand,
              session_id: built.session_id,
              steps: [pinned],
            });
          } catch (e) {
            // fall through to the manually-shaped finalSession
          }
        }
      }
      setSession(finalSession);
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

  const ctaLabel = loading
    ? "準備中…"
    : resumeAvailable
      ? "繼續上次的學習"
      : "開始今天的學習";

  const topicPhrase = kpToPhrase(resumeTopic ?? defaultKnowledgePoint);
  const durationLabel = estimateDurationZh(
    resumeAvailable ? resumeSteps : 4
  );

  const progressFraction =
    resumeAvailable && resumeAtIndex !== null && resumeSteps
      ? Math.max(0, Math.min(1, (resumeAtIndex - 1) / resumeSteps))
      : null;
  const progressPercent =
    progressFraction !== null ? Math.round(progressFraction * 100) : 0;

  return (
    <section
      className="mn-home"
      data-testid="child-home"
      data-age-band={ageBand}
      data-student-id={studentId}
      data-resume-available={resumeAvailable ? "true" : "false"}
    >
      {/* Identity block: tag + headline + body.  No decorative tiles
       * (Round 7 designer feedback: the + − × ÷ anchor block looked
       * like functional UI to parents/children, but it was pure
       * decoration; removed to honour Quiet Graph's no-decoration
       * principle). */}
      <header className="mn-home__header">
        <div className="mn-home__meta">
          <span className="mn-tag">今日練習</span>
          <span className="mn-status-badge">
            {`GRADE ${ageBand.replace("G", "")} · ${(defaultSubject ?? "math").toUpperCase()}`}
          </span>
        </div>
        <h1 className="mn-home__headline" data-testid="home-headline">
          {resumeAvailable ? "歡迎回來" : "嗨，今天準備好了嗎？"}
        </h1>
        <p className="mn-home__subhead" data-testid="home-body">
          {resumeAvailable
            ? "從上次停下的地方接著練習就好。"
            : "今天的練習是為你準備的，慢慢寫就好。"}
        </p>
      </header>

      {/* Practice card: surface lift + hairline + plan rows. */}
      <div className="mn-home__plan" data-testid="home-plan">
        <div className="mn-home__plan-head">
          <h2 className="mn-home__plan-title">今天要做什麼</h2>
        </div>

        <div className="mn-home__plan-rows" data-testid="home-info-row">
          <span className="mn-home__plan-label">主題</span>
          <span className="mn-home__plan-value" data-testid="home-topic">{topicPhrase}</span>

          <span className="mn-home__plan-label">預估時間</span>
          <span className="mn-home__plan-value" data-testid="home-duration">{durationLabel}</span>

          {progressFraction !== null && (
            <>
              <span className="mn-home__plan-label">上次進度</span>
              <span className="mn-home__plan-value" data-testid="home-progress-label">
                {`已完成 ${Math.max(0, (resumeAtIndex ?? 1) - 1)} / ${resumeSteps} 題`}
              </span>
            </>
          )}
        </div>

        {progressFraction !== null && (
          <div
            className="mn-home__progress"
            role="progressbar"
            aria-label="上次進度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            data-testid="home-progress"
          >
            <span
              className="mn-home__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {resumeAvailable && resumeAtIndex !== null && (
          <div className="mn-home__status-row" data-testid="home-resume-note">
            <span className="mn-status-badge" data-tone="moss">
              {`從第 ${resumeAtIndex} 題接上`}
            </span>
          </div>
        )}
      </div>

      {/* Primary CTA.  Single button, full-width on mobile. */}
      <div className="mn-home__actions">
        {error && (
          <div className="mn-error" role="alert" data-testid="home-error">{error}</div>
        )}
        <button
          type="button"
          className="mn-button mn-button--primary mn-button--lg"
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
