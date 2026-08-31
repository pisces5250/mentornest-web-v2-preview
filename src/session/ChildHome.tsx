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
import type { SessionState } from "./session-types";
import { createStagingBrowserSession, startVerifiedSession, verifyVerifiedSession, VerifiedSessionError } from "./VerifiedBankSessionClient";

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
  const [loginRequired, setLoginRequired] = useState(false);
  const [entranceState, setEntranceState] = useState<"verifying" | "signed_out" | "ready" | "unavailable">("verifying");
  const [stagingPassword, setStagingPassword] = useState("");
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [resumeAtIndex, setResumeAtIndex] = useState<number | null>(null);
  const [resumeSteps, setResumeSteps] = useState<number | null>(null);
  const [resumeTopic, setResumeTopic] = useState<string | null>(null);
  const [resumeSubject, setResumeSubject] = useState<string | null>(null);

  // Phase 6B: let the student (or parent) switch subject on the home page.
  // We do NOT auto-load this from profile because the parent setup flow
  // is not yet wired into the web shell.  Persistence is local to the
  // session only — closing the tab returns to the default.
  const [subject, setSubject] = useState<string>(defaultSubject);
  const effectiveSubject =
    subject || defaultSubject || "math";
  const subjectKp: Record<string, string> = {
    math: "math.G5.FRAC.add-unlike-denom",
    chinese: "chinese.G5.READ.main-idea-multi",
    english: "english.G5.READ.read-aloud-story",
    science: "science.G5.SCI.observe-compare",
    social_studies: "social.G5.HISTORY.taiwan-early",
  };
  const effectiveKnowledgePoint = subjectKp[effectiveSubject] ?? defaultKnowledgePoint;
  const SUBJECT_LABEL_ZH: Record<string, string> = {
    math: "數學",
    chinese: "國語",
    english: "英文",
    science: "自然",
    social_studies: "社會",
  };
  const SUBJECT_MODE_ZH: Record<string, string> = {
    math: "圖解與步驟", chinese: "文句與線索", english: "聽說與句型",
    science: "觀察與證據", social_studies: "地圖、時間與資料",
  };

  useEffect(() => {
    let cancelled = false;
    if (useFixtures) { setEntranceState("ready"); return; }
    verifyVerifiedSession()
      .then((result) => { if (!cancelled) { setEntranceState(result); setLoginRequired(result === "signed_out"); } })
      .catch(() => { if (!cancelled) setEntranceState("unavailable"); });
    return () => { cancelled = true; };
  }, [useFixtures]);

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
        const firstSubject = parsed.steps[0]?.subject;
        if (firstSubject) { setResumeSubject(firstSubject); setSubject(firstSubject); }
      }
    } catch (e) {
      // ignore
    }
  }, [sessionStorageKey, studentId]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subjectChanged = resumeAvailable && resumeSubject !== null && effectiveSubject !== resumeSubject;
      if (sessionStorageKey && resumeAvailable && !subjectChanged) {
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
      const buildSession = buildSessionFromLearningDirector as unknown as (request: {
        student_id: string; age_band: string; subject: string; knowledge_point: string;
        target_steps: number; fixtureSteps?: ReadonlyArray<unknown>;
      }) => Promise<{ session: SessionState }>;
      const built = useFixtures
        ? (await buildSession({
            student_id: studentId, age_band: ageBand, subject: effectiveSubject,
            knowledge_point: effectiveKnowledgePoint, target_steps: 4, fixtureSteps,
          })).session
        : await startVerifiedSession({
            subject: effectiveSubject, ageBand, knowledgePoint: effectiveKnowledgePoint, targetSteps: 4,
            localStudentId: studentId,
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
            const initialize = sessionInitial as unknown as (request: {
              student_id: string; age_band: string; session_id: string; steps: ReadonlyArray<unknown>;
            }) => SessionState;
            finalSession = initialize({
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
      setLoginRequired(e instanceof VerifiedSessionError && e.code === "authentication_required");
      setError(e instanceof VerifiedSessionError ? e.message : "老師暫時無法準備學習內容，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [studentId, ageBand, effectiveSubject, effectiveKnowledgePoint, resumeAvailable, sessionStorageKey, useFixtures, fixtureSteps, forcedStepId]);

  const handleStagingLogin = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createStagingBrowserSession(stagingPassword);
      setStagingPassword("");
      setLoginRequired(false);
      setEntranceState("ready");
      await handleStart();
    } catch (e: any) {
      setError(e instanceof VerifiedSessionError ? e.message : "現在還連不上學習空間，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [handleStart, stagingPassword]);

  if (session) {
    return (
      <SessionView
        initialSession={session}
        storageKey={sessionStorageKey}
        onSessionEnd={onSessionEnd}
        onPause={() => setSession(null)}
      />
    );
  }

  const subjectChanged = resumeAvailable && resumeSubject !== null && effectiveSubject !== resumeSubject;
  const ctaLabel = loading
    ? "準備中…"
    : resumeAvailable && !subjectChanged
      ? "繼續上次的學習"
      : `開始${SUBJECT_LABEL_ZH[effectiveSubject] ?? "今天的"}學習`;

  const topicPhrase = kpToPhrase(subjectChanged ? effectiveKnowledgePoint : (resumeTopic ?? effectiveKnowledgePoint));
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
          <span className="mn-status-badge">{`${ageBand.replaceAll("G", "")}年級 · ${SUBJECT_LABEL_ZH[subjectChanged ? effectiveSubject : (resumeSubject ?? effectiveSubject)]}`}</span>
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

      {entranceState === "ready" && <>{/* Practice card: surface lift + hairline + plan rows. */}
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

      <details className="mn-home__subject-picker" data-testid="subject-picker">
        <summary>我想換一科</summary>
        <div className="mn-home__subject-switch" role="group" aria-label="選擇學習科目">
          {(["math", "chinese", "english", "science", "social_studies"] as const).map((s) => (
            <button key={s} type="button" className={"mn-home__subject-chip" + (effectiveSubject === s ? " mn-home__subject-chip--active" : "")}
              aria-pressed={effectiveSubject === s} onClick={() => setSubject(s)} data-testid={`subject-chip-${s}`}>
              <strong>{SUBJECT_LABEL_ZH[s]}</strong><span>{SUBJECT_MODE_ZH[s]}</span>
            </button>
          ))}
        </div>
        {subjectChanged && <p className="mn-home__subject-note" role="status">上次的進度會保留；開始後會進入你剛選的科目。</p>}
      </details>
      </>}

      {/* Primary CTA.  Single button, full-width on mobile. */}
      <div className="mn-home__actions">
        {error && (
          <div className="mn-error" role="alert" data-testid="home-error">{error}</div>
        )}
        {entranceState === "verifying" ? (
          <div className="mn-home__entrance-state" role="status" data-testid="session-verifying"><h2>正在準備學習空間</h2><p>一下就好。</p></div>
        ) : loginRequired || entranceState === "signed_out" ? (
          <form onSubmit={handleStagingLogin} data-testid="staging-login-form">
            <h2>學習空間還沒連上</h2><p>請家長協助登入，完成後會回到這裡。</p>
            <label htmlFor="staging-access-password">家長登入密碼</label>
            <input
              id="staging-access-password"
              type="password"
              value={stagingPassword}
              onChange={(event) => setStagingPassword(event.target.value)}
              autoComplete="current-password"
              required
              data-testid="staging-access-password"
            />
            <button type="submit" className="mn-button mn-button--primary mn-button--lg" disabled={loading}>
              {loading ? "登入中…" : "請家長登入"}
            </button>
          </form>
        ) : entranceState === "unavailable" ? (
          <div className="mn-home__entrance-state mn-error" role="alert" data-testid="session-unavailable">
            <h2>老師正在整理學習空間</h2><p>這次沒有動到你的進度，請稍後重新整理。</p>
          </div>
        ) : (
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
        )}
      </div>

      <span role="status" aria-live="polite" className="mn-sr-only" data-testid="sr-status-home">
        {loading ? "正在載入今天的題目。" : "點按按鈕開始今天的學習。"}
      </span>
    </section>
  );
}
