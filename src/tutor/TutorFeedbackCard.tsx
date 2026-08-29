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

const TITLE_BY_TONE: Record<"good" | "close" | "needs_work" | "unclear", string> = {
  // G5 voice: mature, concrete, no over-praise.
  good: "讀得很順",
  close: "讀得不錯",
  needs_work: "我們再順一次",
  unclear: "可以再說一次嗎",
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
        <div className="mn-tutor-feedback__title">{TITLE_BY_TONE[tone]}</div>
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
        {/* Learning Designer rule: when the specialist recommends retry,
            "再讀一次" is the primary action; "下一題" demotes to ghost.
            When retry is NOT recommended (good / solid close), advance
            is the natural next step. */}
        <button
          type="button"
          className={
            ev.retry_recommended
              ? "mn-action mn-action--primary"
              : "mn-action mn-action--ghost"
          }
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
          className={
            ev.retry_recommended
              ? "mn-action mn-action--ghost"
              : "mn-action mn-action--primary"
          }
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
  // unclear — Learning Designer rule: visually distinct from
  // needs_work.  needs_work = the child got it wrong (X).
  // unclear = the system didn't hear the child well (ear + sound waves),
  // which is NOT the child's fault.  Children must see this immediately.
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="mn-tutor-feedback__glyph"
    >
      {/* Ear shape */}
      <path
        d="M9 21 L9 19 C 9 17 8 16 8 13 C 8 9 10 5 14 5 C 17 5 19 8 19 11 C 19 13 18 14 17 15 C 16 16 16 17 16 18 C 16 19.5 14.5 21 13 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sound waves (a hint that we want to listen again) */}
      <path
        d="M19 4 C 20.5 5 21 6.5 21 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M21 3 C 22.5 4.5 23 6 23 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}