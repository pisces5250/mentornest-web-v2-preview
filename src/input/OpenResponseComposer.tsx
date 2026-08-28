// src/input/OpenResponseComposer.tsx
//
// Phase 5C-2A — Open Response text composer.
//
// Multiline textarea for short_answer / explain_thinking questions.
// Free-form text input with:
//   - 240-320px height, resizable
//   - Word / char counter (e.g. "目前 0 / 240 字")
//   - Optional localStorage draft persistence (per step_id)
//   - Submit disabled if empty after trim
//   - Never sends text anywhere except the onSubmit callback
//
// Privacy: text is held in component state ONLY. Not persisted to Learning
// Memory. LocalStorage draft is local-only and can be cleared.
//
// Hard Invariants respected:
//   - WCAG AA (>= 16px text, >= 44px touch target)
//   - Keyboard reachability (textarea is native, accessible by default)
//   - No ad / tracking surface

import React, { useEffect, useRef, useState } from "react";

export interface OpenResponseComposerProps {
  stepId: string;
  initialValue?: string;
  maxLength?: number;     // hard limit; default 500
  recommendedLength?: number; // soft target shown in counter; default 120
  prompt?: string;         // placeholder hint
  ariaLabel?: string;
  disabled?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}

const DRAFT_KEY_PREFIX = "mentornest.openresponse.draft.";

export function OpenResponseComposer(props: OpenResponseComposerProps) {
  const {
    stepId,
    initialValue = "",
    maxLength = 500,
    recommendedLength = 120,
    prompt = "在這裡寫下你的想法…",
    ariaLabel = "文字回答區",
    disabled = false,
    onSubmit,
    onCancel,
  } = props;

  const [text, setText] = useState(initialValue);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const draftKey = `${DRAFT_KEY_PREFIX}${stepId}`;
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Load draft on mount (step changes only)
  useEffect(() => {
    if (initialValue) return;
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

  // Save draft on text change (debounced via timeout 0 — localStorage is sync)
  useEffect(() => {
    if (!text) return;
    try {
      window.localStorage.setItem(draftKey, text);
    } catch {}
  }, [text, draftKey]);

  const trimmed = text.trim();
  const isEmpty = trimmed.length === 0;
  const isTooLong = trimmed.length > maxLength;
  const overRecommended = trimmed.length > recommendedLength;
  const counterColor = isTooLong
    ? "var(--mn-error)"
    : overRecommended
      ? "var(--mn-amber)"
      : "var(--mn-ink-soft)";

  const handleSubmit = () => {
    setSubmitAttempted(true);
    if (isEmpty || isTooLong || disabled) return;
    // Clear draft on submit
    try { window.localStorage.removeItem(draftKey); } catch {}
    onSubmit(trimmed);
  };

  const handleCancel = () => {
    try { window.localStorage.removeItem(draftKey); } catch {}
    if (onCancel) onCancel();
  };

  const showEmptyError = submitAttempted && isEmpty;

  return (
    <div className="mn-open-response" data-testid="open-response-composer">
      <label htmlFor={`open-response-${stepId}`} className="mn-open-response__label">
        {ariaLabel}
      </label>
      <textarea
        id={`open-response-${stepId}`}
        ref={taRef}
        className={`mn-open-response__textarea ${showEmptyError ? "is-invalid" : ""}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={prompt}
        rows={6}
        maxLength={maxLength + 32} // allow user to see they're over, but flag
        aria-label={ariaLabel}
        aria-describedby={`open-response-counter-${stepId}`}
        aria-invalid={showEmptyError}
        disabled={disabled}
      />
      <div className="mn-open-response__footer">
        <span
          id={`open-response-counter-${stepId}`}
          className="mn-open-response__counter"
          style={{ color: counterColor }}
          aria-live="polite"
        >
          目前 {trimmed.length} / {recommendedLength} 字
          {isTooLong && <span className="mn-open-response__warning">（已超過 {maxLength} 字）</span>}
        </span>
        <div className="mn-open-response__actions">
          {onCancel && (
            <button
              type="button"
              className="mn-action mn-action--ghost"
              onClick={handleCancel}
              data-testid="open-response-cancel"
              disabled={disabled}
            >
              清除
            </button>
          )}
          <button
            type="button"
            className="mn-action mn-action--primary"
            onClick={handleSubmit}
            disabled={isEmpty || isTooLong || disabled}
            data-testid="open-response-submit"
          >
            送出
          </button>
        </div>
      </div>
      {showEmptyError && (
        <div className="mn-open-response__error" role="alert">
          請先寫一點內容再送出。
        </div>
      )}
    </div>
  );
}