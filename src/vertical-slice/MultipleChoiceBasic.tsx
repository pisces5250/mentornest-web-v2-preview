import React, { useState, useMemo, useRef, useCallback } from "react";
import { buildPresentationRequest } from "../foundation/presentation_request_orchestrator.mjs";
import { resolveAgeProfile } from "../foundation/age_profile_engine.mjs";
import { scoreCognitiveLoad } from "../foundation/cognitive_load_scorer.mjs";
import { lintChildCopy } from "../foundation/child_copy_linter.mjs";

// ─────────────────────────────────────────────────────────────────────
// Fixture: one G3-G4 multiple_choice question.
// In production, this arrives from a Subject Specialist via presentation_request.
// Here it is inline so the vertical slice is self-contained.
// ─────────────────────────────────────────────────────────────────────

const SUBJECT_SPECIALIST_INPUT = {
  subject: "math",
  grade: 3,
  question_type: "multiple_choice",
  representation_type: "text",
  learning_goal: "認識分數",
  interaction_required: "single_tap",
  hint_level: 1,
} as const;

const QUESTION = {
  stem: "1/2 + 1/3 = ?",
  choices: ["1/5", "2/6", "5/6", "3/4"] as const,
  correct_index: 2,
  hint: "把兩個分數變成同樣的分母再相加",
};

const KEY_LABELS = ["A", "B", "C", "D"] as const;

export function MultipleChoiceBasic() {
  // Build the presentation request once.
  const request = useMemo(() => buildPresentationRequest(SUBJECT_SPECIALIST_INPUT), []);
  if (!request.ok) {
    return <div data-testid="orchestrator-error">Orchestrator 錯誤：{request.error.code}</div>;
  }
  const spec = request.render_spec;
  const ageResolution = resolveAgeProfile(SUBJECT_SPECIALIST_INPUT.grade);

  // Cognitive-load pre-check on the design itself.
  const loadCheck = useMemo(() => scoreCognitiveLoad({
    band: spec.age_band,
    profile: ageResolution.profile,
    simultaneous_actions: 2,            // 1 choice grid + 1 hint button
    text_chars_in_view: QUESTION.stem.length + QUESTION.choices.reduce((a, c) => a + c.length, 0),
    competing_emphasis_count: 0,
    animation_count: 0,
    visible_choices: QUESTION.choices.length,
    nesting_depth: 2,
  }), [spec.age_band, ageResolution.profile]);

  // Child-copy lint
  const copyLint = useMemo(() => lintChildCopy({
    band: spec.age_band,
    text: spec.child_copy,
    location: "question-card-goal",
  }), [spec.age_band, spec.child_copy]);

  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleSelect = useCallback((idx: number) => {
    if (submitted) return;
    setSelected(idx);
  }, [submitted]);

  const handleSubmit = useCallback(() => {
    if (selected === null) return;
    setSubmitted(true);
  }, [selected]);

  const handleNext = useCallback(() => {
    setSelected(null);
    setSubmitted(false);
    setHintShown(false);
    choiceRefs.current[0]?.focus();
  }, []);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    // Keyboard-only navigation: arrow keys move selection; Space/Enter selects.
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % QUESTION.choices.length;
      choiceRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + QUESTION.choices.length) % QUESTION.choices.length;
      choiceRefs.current[prev]?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleSelect(idx);
    }
  }, [handleSelect]);

  const correct = submitted && selected === QUESTION.correct_index;
  const incorrect = submitted && selected !== null && selected !== QUESTION.correct_index;

  // Hint linter
  const hintLint = useMemo(() => hintShown ? lintChildCopy({
    band: spec.age_band,
    text: QUESTION.hint,
    location: "hint-panel",
    is_hint: true,
    correct_answer_text: QUESTION.choices[QUESTION.correct_index],
  }) : null, [hintShown, spec.age_band]);

  return (
    <section
      className="mn-question-card"
      aria-labelledby="question-stem"
      data-testid="multiple-choice-basic"
      data-age-band={spec.age_band}
      data-component={spec.component_type}
    >
      <h2 id="question-stem" className="mn-question-stem">{QUESTION.stem}</h2>
      <p className="mn-question-goal">{spec.child_copy}</p>

      {!loadCheck.ok && (
        <div role="alert" data-testid="cognitive-load-warning">
          Cognitive load 警告（仍可渲染）：{loadCheck.violations.join("；")}
        </div>
      )}
      {copyLint && !copyLint.ok && (
        <div role="alert" data-testid="copy-lint-warning">
          兒童用語警告：{copyLint.issues.map((i) => i.code).join("，")}
        </div>
      )}

      <div
        className="mn-choices"
        role="radiogroup"
        aria-labelledby="question-stem"
        aria-describedby={hintShown ? "hint-text" : undefined}
      >
        {QUESTION.choices.map((choice, idx) => {
          const isSelected = selected === idx;
          const state = !submitted
            ? (isSelected ? "selected" : "default")
            : (idx === QUESTION.correct_index
              ? "correct"
              : (idx === selected ? "incorrect" : "default"));
          return (
            <div key={idx} className="mn-choice-cell">
              <button
                type="button"
                ref={(el) => { choiceRefs.current[idx] = el; }}
                className="mn-choice"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected || (selected === null && idx === 0) ? 0 : -1}
                data-state={state}
                data-selected={isSelected ? "true" : "false"}
                onClick={() => handleSelect(idx)}
                onKeyDown={(e) => handleKey(e, idx)}
                disabled={submitted}
              >
                <span className="mn-choice-key" aria-hidden="true">{KEY_LABELS[idx]}</span>
                <span className="mn-choice-text">{choice}</span>
                {state === "correct" && <span aria-hidden="true" className="mn-feedback-icon">✓</span>}
                {state === "incorrect" && <span aria-hidden="true" className="mn-feedback-icon">✗</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mn-button-row" role="group" aria-label="題目操作">
        <button
          type="button"
          className="mn-button"
          onClick={() => setHintShown((v) => !v)}
          aria-expanded={hintShown}
          aria-controls="hint-text"
          data-testid="hint-toggle"
        >
          {hintShown ? "收合提示" : "看提示"}
        </button>
        {!submitted ? (
          <button
            type="button"
            className="mn-button"
            onClick={handleSubmit}
            disabled={selected === null}
            data-testid="submit"
          >
            送出
          </button>
        ) : (
          <button type="button" className="mn-button" onClick={handleNext} data-testid="next">
            下一題
          </button>
        )}
      </div>

      <div
        id="hint-text"
        className="mn-hint-panel"
        role="note"
        hidden={!hintShown}
        data-testid="hint-panel"
      >
        <span aria-hidden="true">💡</span> {QUESTION.hint}
        {hintLint && !hintLint.ok && (
          <div role="alert" data-testid="hint-lint-warning">
            提示語警告：{hintLint.issues.map((i) => i.code).join("，")}
          </div>
        )}
      </div>

      {/* Live region for screen-reader feedback */}
      <div className="mn-sr-only" role="status" aria-live="polite" data-testid="sr-status-mc">
        {correct && "答對了。"}
        {incorrect && "再想想看。"}
      </div>

      {submitted && (
        <div
          className="mn-feedback"
          data-state={correct ? "correct" : "incorrect"}
          data-testid="feedback"
        >
          <span aria-hidden="true" className="mn-feedback-icon">{correct ? "✓" : "✗"}</span>
          <span>
            {correct ? "答對了！" : "再想想看，下一題加油。"}
          </span>
        </div>
      )}
    </section>
  );
}