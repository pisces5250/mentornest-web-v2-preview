import React, { useEffect, useRef } from "react";
import type { TutorTurnResponse } from "./TutorTurnContract";
import { SpecialistRepresentation } from "./SpecialistRepresentation";

export interface TeacherTurnPanelProps {
  state: { kind: "idle" } | { kind: "evaluating" } | { kind: "error"; message: string } | { kind: "result"; turn: TutorTurnResponse };
  onRetry: () => void;
  onHint: () => void;
  onAdvance: () => void;
}

export function TeacherTurnPanel({ state, onRetry, onHint, onAdvance }: TeacherTurnPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state.kind === "result" || state.kind === "error") headingRef.current?.focus();
  }, [state.kind]);
  if (state.kind === "idle") return null;
  if (state.kind === "evaluating") {
    return <section className="mn-teacher-turn" data-testid="teacher-turn-evaluating" role="status" aria-live="polite" aria-busy="true">老師正在看你的想法…</section>;
  }
  if (state.kind === "error") {
    return <section className="mn-teacher-turn mn-teacher-turn--error" data-testid="teacher-turn-error" role="alert"><h2 ref={headingRef} tabIndex={-1}>老師暫時沒有收到答案</h2><p>{state.message}</p><button type="button" className="mn-button mn-button--primary" onClick={onRetry}>再送一次</button></section>;
  }
  const turn = state.turn;
  const action = turn.recommended_action;
  return (
    <section className="mn-teacher-turn" data-testid="teacher-turn-result" data-verdict={turn.verdict} aria-labelledby="teacher-turn-title">
      <h2 id="teacher-turn-title" ref={headingRef} tabIndex={-1}>老師的回饋</h2>
      <p className="mn-teacher-turn__summary">{turn.summary}</p>
      {turn.diagnosis && <p><strong>我看到的關鍵：</strong>{turn.diagnosis}</p>}
      {turn.teaching_point && <p><strong>一起想：</strong>{turn.teaching_point}</p>}
      {turn.hint && <p className="mn-teacher-turn__hint"><strong>提示：</strong>{turn.hint}</p>}
      {turn.representation && <SpecialistRepresentation data={turn.representation} />}
      <div className="mn-teacher-turn__actions">
        {(action === "retry" || action === "explain") && <button type="button" className="mn-button mn-button--primary" data-testid="teacher-retry" onClick={onRetry}>再答一次</button>}
        {action === "hint" && <button type="button" className="mn-button mn-button--primary" data-testid="teacher-hint" onClick={onHint}>看一個提示</button>}
        {action === "review" && <button type="button" className="mn-button mn-button--primary" data-testid="teacher-review" onClick={onRetry}>再練一題</button>}
        {action === "next" && <button type="button" className="mn-button mn-button--primary" data-testid="next-question" onClick={onAdvance}>下一題</button>}
      </div>
    </section>
  );
}
