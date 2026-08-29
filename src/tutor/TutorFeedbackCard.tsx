// src/tutor/TutorFeedbackCard.tsx
//
// Phase 6A — Compact tutor feedback card.
//
// Three states:
//   1. evaluating  — placeholder while the English Specialist runs
//   2. result      — overall_result + summary + ≤3 teaching_points
//                    + 3 actions: 再讀一次 / 聽老師念 / 下一題
//   3. error       — friendly error + retry button (no harsh copy)
//
// Design rules (per sign-off):
//   - check / cross icon ≤ 48px tall (compact, not oversized)
//   - feedback card height follows content (no fixed min-height)
//   - "聽老師念" uses a child-controlled TTSPlayer; we never autoplay
//   - up to 3 teaching_points; cap is enforced by the contract
//   - low confidence ⇒ no teaching points, summary asks for retry

import React from "react";
import type { TutorEvaluation, TutorTeachingPoint } from "./TutorEvaluationContract";
import { TTSPlayer } from "../input/TTSPlayer";

export type TutorFeedbackState =
  | { kind: "evaluating" }
  | { kind: "result"; evaluation: TutorEvaluation }
  | { kind: "error"; message: string; onRetry?: () => void };

export interface TutorFeedbackCardProps {
  state: TutorFeedbackState;
  /** What "聽老師念" should read aloud — the expected passage. */
  expectedText: string;
  /** Re-read button — re-engages the recorder. */
  onReread: () => void;
  /** Advance to the next step. */
  onAdvance: () => void;
  /** Step id for stable test selectors. */
  stepId: string;
}

const TEACHING_LABEL_BY_TONE: Record<"good" | "close" | "needs_work" | "unclear", string> = {
  good: "讀得很棒",
  close: "讀得還不錯",
  needs_work: "可以再試一次",
  unclear: "再說一次好嗎",
};

export function TutorFeedbackCard(props: TutorFeedbackCardProps) {
  const { state, expectedText, onReread, onAdvance, stepId } = props;

  if (state.kind === "evaluating") {
    return (
      <div
        className="mn-tutor-feedback mn-tutor-feedback--evaluating"
        data-testid={`tutor-feedback-${stepId}`}
        data-state="evaluating"
        role="status"
        aria-live="polite"
      >
        <div className="mn-tutor-feedback__spinner" aria-hidden="true" />
        <div className="mn-tutor-feedback__copy">
          老師正在看看你的回答…
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="mn-tutor-feedback mn-tutor-feedback--error"
        data-testid={`tutor-feedback-${stepId}`}
        data-state="error"
        role="alert"
      >
        <div className="mn-tutor-feedback__copy">
          {state.message}
        </div>
        <div className="mn-tutor-feedback__actions">
          <button
            type="button"
            className="mn-action mn-action--primary"
            onClick={state.onRetry ?? onReread}
            data-testid={`tutor-feedback-retry-${stepId}`}
          >再試一次</button>
        </div>
      </div>
    );
  }

  const ev = state.evaluation;
  const tone = ev.overall_result;
  const showTeachingPoints = ev.teaching_points.length > 0;

  return (
    <div
      className={`mn-tutor-feedback mn-tutor-feedback--${tone}`}
      data-testid={`tutor-feedback-${stepId}`}
      data-state="result"
      data-result-class={tone}
      data-confidence={ev.confidence.toFixed(2)}
      role="status"
      aria-live="polite"
    >
      <div className="mn-tutor-feedback__head">
        <ResultGlyph tone={tone} />
        <div className="mn-tutor-feedback__title">{TEACHING_LABEL_BY_TONE[tone]}</div>
      </div>

      <p
        className="mn-tutor-feedback__summary"
        data-testid={`tutor-feedback-summary-${stepId}`}
      >{ev.summary}</p>

      {showTeachingPoints && (
        <ul
          className="mn-tutor-feedback__points"
          data-testid={`tutor-feedback-points-${stepId}`}
          aria-label="老師的回饋"
        >
          {ev.teaching_points.map((tp, i) => (
            <TeachingPointRow key={tp.code + i} point={tp} />
          ))}
        </ul>
      )}

      <div className="mn-tutor-feedback__actions">
        <button
          type="button"
          className="mn-action mn-action--ghost"
          onClick={onReread}
          data-testid={`tutor-feedback-reread-${stepId}`}
        >再讀一次</button>
        <span
          className="mn-tutor-feedback__listen"
          data-testid={`tutor-feedback-listen-${stepId}`}
        >
          <span className="mn-tutor-feedback__listen-label" aria-hidden="true">
            聽老師念
          </span>
          <TTSPlayer
            text={expectedText}
            ariaLabel="聽老師念"
          />
        </span>
        <button
          type="button"
          className="mn-action mn-action--primary"
          onClick={onAdvance}
          data-testid={`tutor-feedback-advance-${stepId}`}
        >下一題</button>
      </div>
    </div>
  );
}

function TeachingPointRow({ point }: { point: TutorTeachingPoint }) {
  return (
    <li className="mn-tutor-feedback__point" data-code={point.code}>
      <span className="mn-tutor-feedback__point-label" aria-hidden="true">
        {point.label}
      </span>
      <span className="mn-tutor-feedback__point-explanation">
        {point.explanation}
      </span>
    </li>
  );
}

function ResultGlyph({ tone }: { tone: "good" | "close" | "needs_work" | "unclear" }) {
  // Compact glyph: 36-48px.  We render it inline so the parent can
  // size it with CSS.
  if (tone === "good") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className="mn-tutor-feedback__glyph"
      >
        <path
          d="M5 12.5 L10 17.5 L19 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    );
  }
  if (tone === "close") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className="mn-tutor-feedback__glyph"
      >
        <path
          d="M5 12 L19 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  if (tone === "needs_work") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className="mn-tutor-feedback__glyph"
      >
        <path
          d="M6 6 L18 18 M18 6 L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
        />
      </svg>
    );
  }
  // unclear
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="mn-tutor-feedback__glyph"
    >
      <path
        d="M12 7 L12 14 M12 17 L12 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}