// src/session/SessionView.tsx
//
// Phase 5C-1 — Owns the session state machine, dispatches to QuestionRenderer,
// and writes back to localStorage for resume/reload.  No direct plugin
// calls from this layer — all authority stays in mentornest-learning.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sessionReduce } from "./session-state.mjs";
import type { SessionState } from "./session-types";
import { QuestionRenderer } from "./QuestionRenderer";
import { SessionSummaryView } from "./SessionSummaryView";
import { evaluateTutorTurn, type TutorTurnEvaluator } from "../tutor/TutorTurnClient";
import { TeacherTurnPanel } from "../tutor/TeacherTurnPanel";
import type { TutorTurnResponse } from "../tutor/TutorTurnContract";

export interface SessionViewProps {
  // Pre-built session (from buildSessionFromLearningDirector).
  initialSession: SessionState;
  // LocalStorage key for resume.  Pass null to disable persistence.
  storageKey?: string | null;
  // Where to land on session end.
  onSessionEnd?: (finalSession: SessionState) => void;
  evaluateTurn?: TutorTurnEvaluator;
  onPause?: () => void;
}

export function SessionView(props: SessionViewProps) {
  const { initialSession, storageKey = "mentornest.session.v1", onSessionEnd, evaluateTurn = evaluateTutorTurn, onPause } = props;
  const publicInitialSession = useMemo(() => shapePublicSession(initialSession), [initialSession]);
  const [state, setState] = useState<SessionState>(publicInitialSession);
  const [resumed, setResumed] = useState(false);
  const [teacherState, setTeacherState] = useState<
    { kind: "idle" } | { kind: "evaluating" } | { kind: "error"; message: string } | { kind: "result"; turn: TutorTurnResponse }
  >({ kind: "idle" });
  const dispatch = useRef((action: any) => {
    setState((s: SessionState) => sessionReduce(s, action) as SessionState);
  });
  const pendingTurn = useRef<Parameters<TutorTurnEvaluator>[0] | null>(null);

  // 1) Try to resume from localStorage on mount (if a snapshot exists for this key).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.session_id !== publicInitialSession.session_id) return;
      setState(shapePublicSession(parsed));
      setResumed(true);
    } catch (e) {
      // ignore corrupted snapshot
    }
  }, [storageKey, publicInitialSession.session_id]);

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

  const handleSubmit = useCallback(async (args: { answer: unknown; answer_kind: "choice" | "math" | "text" | "voice" }) => {
    if (!currentStep || teacherState.kind === "evaluating") return;
    dispatch.current({ type: "evaluating" });
    setTeacherState({ kind: "evaluating" });
    try {
      const response = typeof args.answer === "object" ? JSON.stringify(args.answer) : String(args.answer);
      const reusable = pendingTurn.current?.question_id === currentStep.step_id && pendingTurn.current.response === response;
      const request = reusable ? pendingTurn.current! : {
        question_id: currentStep.step_id, response_id: `resp_${crypto.randomUUID()}`, response,
        attempt_index: currentStep.attempts.length + 1, hints_used: currentStep.hints_used,
        occurred_at: new Date().toISOString(),
      };
      // Writer 結果不明時保留完全相同的 transaction；孩子改答案才建立新 response_id。
      pendingTurn.current = request;
      const turn = await evaluateTurn(request);
      if (!turn.memory_write_failed) dispatch.current({
        type: "submit", verdict: turn.verdict,
        error_type: turn.verdict === "incorrect" ? "tutor_diagnosed" : null,
        assessment_evidence_id: turn.assessment_evidence_id,
        learning_memory_receipt_id: turn.learning_memory_receipt_id,
        next_step: turn.loop_completed ? turn.next_step : null,
      });
      setTeacherState({ kind: "result", turn });
      if (turn.loop_completed || turn.verdict === "unverifiable") pendingTurn.current = null;
    } catch (_) {
      dispatch.current({ type: "retry" });
      setTeacherState({ kind: "error", message: "連線有點慢，你的答案還沒有被判定。" });
    }
  }, [currentStep, evaluateTurn, teacherState.kind]);

  const handleHint = useCallback(() => {
    dispatch.current({ type: "hint" });
  }, []);

  const handleRetry = useCallback(() => {
    dispatch.current({ type: "retry" });
    setTeacherState({ kind: "idle" });
  }, []);

  const handleSaveRetry = useCallback(async () => {
    const request = pendingTurn.current;
    if (!request || teacherState.kind === "evaluating") return;
    setTeacherState({ kind: "evaluating" });
    try {
      const turn = await evaluateTurn(request);
      if (turn.loop_completed) dispatch.current({
        type: "submit", verdict: turn.verdict,
        error_type: turn.verdict === "incorrect" ? "tutor_diagnosed" : null,
        assessment_evidence_id: turn.assessment_evidence_id,
        learning_memory_receipt_id: turn.learning_memory_receipt_id,
        next_step: turn.loop_completed ? turn.next_step : null,
      });
      setTeacherState({ kind: "result", turn });
      if (turn.loop_completed) pendingTurn.current = null;
    } catch (_) {
      setTeacherState({ kind: "error", message: "正在確認學習紀錄，請再試一次。" });
    }
  }, [evaluateTurn, teacherState.kind]);

  const handleRepresentationSwitch = useCallback((to: string) => {
    dispatch.current({ type: "representation_switch", to });
  }, []);

  const handleAdvance = useCallback(() => {
    dispatch.current({ type: "advance" });
    setTeacherState({ kind: "idle" });
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
        <p>這次進度沒有改動，請重新整理後再試。</p>
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
    <div className="mn-session" data-testid="mn-session" data-session-id={state.session_id} data-evaluating={teacherState.kind === "evaluating" ? "true" : "false"} aria-busy={teacherState.kind === "evaluating"}>
      <div className="mn-session-meta-row" data-testid="session-meta-row">
        <span className="mn-status-badge mn-status-badge--mono" data-testid="session-progress">
          題目 {state.current_index + 1} / {state.steps.length}
        </span>
        {resumed && (
          <span className="mn-status-badge" data-tone="ink" data-testid="session-resumed-notice">
            已從上次進度接續
          </span>
        )}
        {onPause && <button type="button" className="mn-button mn-button--ghost" data-testid="pause-session" onClick={onPause}>先休息</button>}
      </div>

      {/* iPad 工作區只建立一個 DOM／焦點順序；寬螢幕的雙欄完全由 CSS
          排版，Split View、放大或直向時會安全回到單欄。 */}
      <section className="mn-learning-workspace" data-testid="learning-workspace" aria-label="學習題目工作區">
        <div className="mn-learning-workspace__question" data-testid="learning-workspace-question">
          <QuestionRenderer
            key={`${currentStep.step_id}-${currentStep.attempts.length}`}
            step={currentStep}
            ageBand={state.age_band}
            studentId={state.student_id}
            onSubmit={handleSubmit}
            onHint={handleHint}
            onRepresentationSwitch={handleRepresentationSwitch}
            onRetry={handleRetry}
            onAdvance={handleAdvance}
            hintsUsed={currentStep.hints_used}
            attemptsCount={currentStep.attempts.length}
            lastVerdict={teacherState.kind === "result" ? teacherState.turn.verdict : null}
            phase={teacherState.kind === "evaluating"
              ? "evaluating"
              : teacherState.kind === "result" ? "feedback" : "presenting"}
          />
        </div>

        <div className="mn-learning-workspace__feedback" data-testid="learning-workspace-feedback">
          <TeacherTurnPanel state={teacherState} onRetry={handleRetry} onHint={handleHint} onAdvance={handleAdvance} onSaveRetry={handleSaveRetry} />
        </div>
      </section>
    </div>
  );
}

/** Browser session 僅保留呈現欄位；answer key 永遠留在 server。 */
export function shapePublicSession(session: SessionState): SessionState {
  return {
    ...session,
    steps: session.steps.map((step) => {
      const { expected_answer: _answerKey, answer_key: _legacyKey, ...publicStep } = step as any;
      return publicStep;
    }),
  } as SessionState;
}
