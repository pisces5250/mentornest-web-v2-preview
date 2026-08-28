// src/session/QuestionRenderer.tsx
//
// Phase 5C-1.1 Round 4 — Quiet Graph Question Renderer.
//
// Layout: four horizontal regions stacked on the grid, NOT a wrapping
// card:
//   1. Meta strip  (KP phrase left, representation-switch right)
//   2. Stem        (no border, on grid)
//   3. Answer area (4px moss left accent bar + faint surface interior +
//                    hairline top; only place where surface lift appears)
//   4. CTAs        (primary right-aligned, ghost left)
//
// Hint / feedback surface is a grid row inserted between regions 3 and 4
// with a 4px left accent bar in moss/amber.  When no hint is active,
// the row collapses to zero layout footprint; the DOM stays mounted for
// screen-reader / live-region continuity (per sign-off 2026-08-28 13:29).
//
// MC options are ROWS, not cards.  3-column grid: letter disc | value |
// state column.  State communicated via letter disc fill, 2px bottom
// rule color, state column icon + mono label, never color alone.
//
// INV-AP-56-2 enforcement (unchanged):
//   First-incorrect feedback does NOT reveal the expected answer.
//   Primary next action is "看提示" (primary button).  Expected answer
//   revealed only after hintsUsed >= 1 OR review_needed.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildPresentationRequest } from "../foundation/presentation_request_orchestrator.mjs";
import { resolveAgeProfile } from "../foundation/age_profile_engine.mjs";
import { useCoarseViewport } from "../foundation/use_coarse_viewport.ts";
import { useKeypadVisibility } from "../foundation/use_keypad_visibility.ts";
import { NativeMathKeypad, type KeypadValue } from "../input/NativeMathKeypad";
import { MathVisualRenderer } from "../math-rendering/MathVisualRenderer";
import { validateKeypadAnswer } from "../input/answer-validator.mjs";
import { nextMathHint } from "../math-rendering/math_hint_ladder_v2.mjs";
import {
  renderFractionBar,
  renderBarModel,
  generateFractionBarSVG,
  generateAreaModelSVG,
} from "../math-rendering/math_visual_engine_render.mjs";

// View-layer KP ID → child-facing zh-TW phrase.
const KP_PHRASE_ZH: Record<string, string> = {
  "math.G3.MULT.two-digit": "兩位數乘法",
  "math.G4.DIV.estimate":  "除法的估算",
  "math.G5.FRAC.add-unlike-denom": "分數加法（不同分母）",
  "math.G5.DEC.add":       "小數加法",
};
function kpToPhrase(kp: string | undefined | null): string {
  if (!kp) return "這一題";
  return KP_PHRASE_ZH[kp] ?? "這一題";
}

const MAX_HINT_LEVEL = 3;

export type QuestionType =
  | "multiple_choice"
  | "fraction_input"
  | "integer_input"
  | "decimal_input"
  | "short_answer"
  | "true_false";

export interface SessionStep {
  step_id: string;
  knowledge_point: string;
  subject: string;
  question_type: QuestionType;
  representation_type: "text" | "fraction_bar" | "number_line" | "area_model";
  stem: string;
  choices?: ReadonlyArray<string>;
  expected_answer: string | number;
  difficulty: "easy" | "medium" | "hard";
  source: "verified" | "generated";
  license: string;
}

export interface QuestionRendererProps {
  step: SessionStep;
  ageBand: "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
  studentId: string;
  onSubmit: (args: {
    verdict: "correct" | "incorrect" | "unverifiable";
    error_type?: string | null;
  }) => void;
  onHint: () => void;
  onRepresentationSwitch: (to: SessionStep["representation_type"]) => void;
  onRetry: () => void;
  hintsUsed: number;
  attemptsCount: number;
  lastVerdict: "correct" | "incorrect" | "unverifiable" | null;
  phase:
    | "presenting"
    | "hint_level_1"
    | "hint_level_2"
    | "hint_level_3"
    | "feedback"
    | "completed";
}

function shouldRevealAnswer(
  phase: string,
  hintsUsed: number,
  lastVerdict: string | null,
  reviewNeeded: boolean,
): boolean {
  if (phase !== "feedback") return false;
  if (hintsUsed >= 1) return true;
  if (reviewNeeded) return true;
  return false;
}

function buildMathVisual(step: SessionStep): null | {
  primitive: "fraction_bar" | "bar_model";
  descriptor: any;
  svg: string;
  aria_label: string;
} {
  try {
    const stem = String(step.stem ?? "");
    const fracMatch = stem.match(/(\d+)\s*\/\s*(\d+)\s*([+\-×x*\/÷])\s*(\d+)\s*\/\s*(\d+)/);
    if (fracMatch) {
      const [, an, ad, op, bn, bd] = fracMatch;
      const numerator_a = parseInt(an, 10);
      const denominator_a = parseInt(ad, 10);
      const numerator_b = parseInt(bn, 10);
      const denominator_b = parseInt(bd, 10);
      const desc = renderFractionBar({
        numerator: numerator_a,
        denominator: denominator_a,
        label: `${numerator_a}/${denominator_a}`,
      });
      if (desc?.constraints_check?.violations?.length) return null;
      const svgResult = generateFractionBarSVG({
        numerator: numerator_a,
        denominator: denominator_a,
        label: `${numerator_a}/${denominator_a}`,
      });
      if (!svgResult?.svg) return null;
      return {
        primitive: "fraction_bar",
        descriptor: desc.descriptor,
        svg: svgResult.svg,
        aria_label: `分數圖示：${numerator_a}/${denominator_a} ${op} ${numerator_b}/${denominator_b}`,
      };
    }
    const intMatch = stem.match(/(\d+)\s*([+\-×x*])\s*(\d+)/);
    if (intMatch && step.representation_type === "bar_model") {
      const [, an, , cn] = intMatch;
      const a = parseInt(an, 10);
      const c = parseInt(cn, 10);
      const desc = renderBarModel({ rows: Math.max(1, Math.min(10, a)), cols: Math.max(1, Math.min(10, c)) });
      if (desc?.constraints_check?.violations?.length) return null;
      const svgResult = generateAreaModelSVG({
        rows: Math.max(1, Math.min(10, a)),
        cols: Math.max(1, Math.min(10, c)),
        label: `${a}×${c}`,
      });
      if (!svgResult?.svg) return null;
      return {
        primitive: "bar_model",
        descriptor: desc.descriptor,
        svg: svgResult.svg,
        aria_label: `條形圖：${a} 乘 ${c}`,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Helper: render a stem with math expressions in mono.  Splits on
// math-expression patterns and wraps each in <span class="mn-mono">.
// The stem string can mix Chinese text and math (e.g. "1/3 + 1/2 = ?").
function stemWithMono(stem: string): React.ReactNode {
  // Split on math operators + numbers.  We treat any run of digits,
// operators, slashes, and dots as a math expression.
  const parts: React.ReactNode[] = [];
  const re = /([0-9]+\s*[\/÷×x*+\-.]\s*[0-9]+(?:[^a-zA-Z\u4e00-\u9fff]*)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(stem)) !== null) {
    if (m.index > last) parts.push(<React.Fragment key={key++}>{stem.slice(last, m.index)}</React.Fragment>);
    parts.push(<span key={key++} className="mn-mono">{m[0].trim()}</span>);
    last = m.index + m[0].length;
  }
  if (last < stem.length) parts.push(<React.Fragment key={key++}>{stem.slice(last)}</React.Fragment>);
  return parts;
}

// ─────────────────────────────────────────────────────────────────────
// Top-level dispatch
// ─────────────────────────────────────────────────────────────────────

export function QuestionRenderer(props: QuestionRendererProps) {
  const { step, ageBand, studentId, onSubmit, onHint, onRepresentationSwitch, onRetry, hintsUsed, attemptsCount, lastVerdict, phase } = props;

  const orchQuestionType =
    step.question_type === "multiple_choice" ? "multiple_choice" : "fill_in_blank";
  const request = useMemo(() => {
    return buildPresentationRequest({
      subject: step.subject,
      grade: ageBandToGradeNumber(ageBand),
      question_type: orchQuestionType,
      representation_type: step.representation_type === "text" && step.question_type === "fraction_input" ? "fraction_bar" : step.representation_type,
      learning_goal: step.knowledge_point,
      interaction_required: step.question_type === "multiple_choice" ? "single_tap" : "type",
      hint_level: phase === "hint_level_2" || phase === "hint_level_3" ? Math.min(MAX_HINT_LEVEL, hintsUsed + 1) : hintsUsed,
    });
  }, [step.subject, step.question_type, step.knowledge_point, step.representation_type, ageBand, phase, hintsUsed, orchQuestionType]);

  useMemo(
    () => resolveAgeProfile(ageBandToGradeNumber(ageBand)),
    [ageBand]
  );

  const spec = request.ok ? request.render_spec : {
    age_band: ageBand,
    child_copy: step.knowledge_point,
    component_type: "GenericQuestion",
    layout: "structured_compact",
    interaction_pattern: "single_tap_choice",
  };

  const goalPhrase = kpToPhrase(step.knowledge_point);

  if (step.question_type === "multiple_choice") {
    return (
      <MultipleChoiceSubtree
        step={step}
        spec={spec}
        ageBand={ageBand}
        lastVerdict={lastVerdict}
        phase={phase}
        onSubmit={onSubmit}
        onRetry={onRetry}
        onHint={onHint}
        attemptsCount={attemptsCount}
        hintsUsed={hintsUsed}
        goalPhrase={goalPhrase}
      />
    );
  }

  if (
    step.question_type === "fraction_input" ||
    step.question_type === "integer_input" ||
    step.question_type === "decimal_input"
  ) {
    return (
      <InputSubtree
        step={step}
        spec={spec}
        ageBand={ageBand}
        studentId={studentId}
        lastVerdict={lastVerdict}
        phase={phase}
        hintsUsed={hintsUsed}
        attemptsCount={attemptsCount}
        onSubmit={onSubmit}
        onHint={onHint}
        onRetry={onRetry}
        onRepresentationSwitch={onRepresentationSwitch}
        goalPhrase={goalPhrase}
      />
    );
  }

  return <UnsupportedNotice step={step} />;
}

// ─── Subtree: multiple choice ─────────────────────────────────────────────
//
// Quiet Graph: options are rows in a single column (always), each row
// being a 3-column grid: 32px letter disc | flex value | 40px state.
// State changes: 2px bottom rule color + letter disc fill + state column.

function MultipleChoiceSubtree(props: {
  step: SessionStep;
  spec: any;
  ageBand: string;
  lastVerdict: string | null;
  phase: string;
  attemptsCount: number;
  hintsUsed: number;
  goalPhrase: string;
  onSubmit: (args: any) => void;
  onRetry: () => void;
  onHint: () => void;
}) {
  const { step, spec, lastVerdict, phase, attemptsCount, hintsUsed, goalPhrase, onSubmit, onRetry, onHint } = props;
  const choices = step.choices ?? [];
  const correctIndex = useMemo(() => {
    if (typeof step.expected_answer === "number") return step.expected_answer;
    const idx = choices.findIndex((c) => String(c) === String(step.expected_answer));
    return idx >= 0 ? idx : 0;
  }, [step.expected_answer, choices]);
  const [selected, setSelected] = useState<number | null>(null);

  const mcAttempts = typeof attemptsCount === "number" ? attemptsCount : 0;
  const hasAttempt = mcAttempts > 0;
  const feedback = hasAttempt;

  useEffect(() => { setSelected(null); }, [step.step_id]);

  const reveal = shouldRevealAnswer(phase, hintsUsed, lastVerdict, false);

  const handleSubmit = useCallback(() => {
    if (selected === null) return;
    const verdict = selected === correctIndex ? "correct" : "incorrect";
    onSubmit({ verdict, error_type: verdict === "incorrect" ? "wrong_choice" : null });
  }, [selected, correctIndex, onSubmit]);

  // Hint row content: empty when no hint yet, otherwise a feedback /
  // hint banner with the appropriate accent + mono label.
  const hintActive = lastVerdict === "incorrect" && !reveal;
  const hintLabel =
    lastVerdict === "correct" ? "答對了"
    : hintActive ? "再試一次"
    : hintsUsed > 0 ? `提示 ${Math.min(hintsUsed, MAX_HINT_LEVEL)}/${MAX_HINT_LEVEL}`
    : null;
  const hintBody =
    lastVerdict === "correct" ? "很好，繼續下一題。"
    : hintActive ? "再仔細看看題目，或者按下面的「看提示」。"
    : null;
  const hintTone =
    lastVerdict === "correct" ? "moss"
    : hintActive ? "amber"
    : hintsUsed > 0 ? (hintsUsed >= 2 ? "amber" : "moss")
    : "ink";

  return (
    <section
      className="mn-question-card"
      aria-labelledby={`stem-${step.step_id}`}
      data-testid={`question-${step.step_id}`}
      data-knowledge-point={step.knowledge_point}
      data-question-type={step.question_type}
      aria-label={`${goalPhrase} 選擇題`}
    >
      {/* Region 1: meta strip */}
      <div className="mn-question-card__meta">
        <div className="mn-question-card__meta-left">
          <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
          <span className="mn-question-goal">{`主題：${goalPhrase}`}</span>
        </div>
      </div>

      {/* Region 2: stem */}
      <div className="mn-question-card__stem-wrap">
        <h2 id={`stem-${step.step_id}`} className="mn-question-stem" data-testid="question-stem">
          {stemWithMono(step.stem)}
        </h2>
      </div>

      {/* Region 3a: choices (rows) */}
      <div role="radiogroup" aria-labelledby={`stem-${step.step_id}`} className="mn-choices" data-testid="choice-list">
        {choices.map((choice, idx) => {
          const checked = selected === idx;
          const state = !feedback
            ? (checked ? "selected" : "default")
            : (idx === correctIndex
                ? "correct"
                : (checked ? "incorrect" : "default"));

          // State column content (always rendered so the row has a
          // consistent 3-column anatomy, even when empty).
          let stateIcon: React.ReactNode = null;
          let stateLabel: string | null = null;
          if (state === "correct") {
            stateIcon = <CheckIcon />;
            stateLabel = "正確";
          } else if (state === "incorrect") {
            stateIcon = <CrossIcon />;
            stateLabel = "不對";
          } else if (state === "selected") {
            stateLabel = "已選";
          }

          return (
            <div key={idx} className="mn-choice-cell">
              <button
                type="button"
                className="mn-choice mn-choice--card"
                role="radio"
                aria-checked={checked}
                aria-label={`選項 ${String.fromCharCode(65 + idx)}：${choice}`}
                tabIndex={selected === null ? (idx === 0 ? 0 : -1) : (selected === idx ? 0 : -1)}
                data-testid={`choice-${idx}`}
                data-state={state}
                data-selected={checked ? "true" : "false"}
                disabled={feedback}
                onClick={() => { if (!feedback) setSelected(idx); }}
                onKeyDown={(e) => {
                  if (feedback) return;
                  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                    e.preventDefault();
                    setSelected((idx + 1) % choices.length);
                  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    setSelected((idx - 1 + choices.length) % choices.length);
                  } else if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setSelected(idx);
                  } else if (e.key >= "1" && e.key <= String(choices.length)) {
                    const n = parseInt(e.key, 10) - 1;
                    if (n < choices.length) {
                      e.preventDefault();
                      setSelected(n);
                    }
                  }
                }}
              >
                <span className="mn-choice-key" aria-hidden="true">{String.fromCharCode(65 + idx)}</span>
                <span className="mn-choice-text">{choice}</span>
                <span className="mn-choice__state" aria-hidden="true">
                  <span className="mn-choice__state-icon">{stateIcon}</span>
                  {stateLabel && <span className="mn-choice__state-label">{stateLabel}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Region 3b: hint / feedback row.  Mounted always; layout footprint
       *  collapses to zero when inactive (per sign-off 2026-08-28 13:29). */}
      <div
        className="mn-question-card__hint-row"
        data-active={hintLabel ? "true" : "false"}
        data-testid="hint-row"
        aria-live="polite"
        aria-atomic="false"
      >
        {hintLabel && (
          <aside
            className="mn-hint-panel"
            data-testid="hint-panel"
            data-tone={hintTone}
            data-stage={phase}
          >
            <span className="mn-hint-pill" data-tone={hintTone} aria-hidden="true">
              {hintLabel}
            </span>
            {hintBody && <p className="mn-hint-panel__text">{hintBody}</p>}
          </aside>
        )}
      </div>

      {/* Region 4: CTAs.  Primary right-aligned, ghost left.
       *
       * Note: the "下一題 / 完成練習" button is rendered by SessionView
       * AFTER QuestionRenderer (it appears when currentStep.phase ===
       * "feedback").  QuestionRenderer only owns the pre-submit CTAs
       * ("看提示" / "送出答案") and the post-incorrect CTA pair
       * ("換一個答案" / "看提示").  We do NOT render a next-question
       * button here — it would conflict with SessionView's
       * data-testid="next-question" element. */}
      <div className="mn-question-card__cta-row">
        {!feedback ? (
          <>
            <button
              type="button"
              className="mn-button mn-button--ghost"
              data-testid="hint-toggle"
              onClick={onHint}
            >看提示</button>
            <button
              type="button"
              className="mn-button mn-button--primary"
              data-testid="mc-submit"
              disabled={selected === null}
              onClick={handleSubmit}
            >送出答案</button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="mn-button mn-button--ghost"
              data-testid="retry-button"
              onClick={onRetry}
            >換一個答案</button>
            {hintActive ? (
              <button
                type="button"
              className="mn-button mn-button--primary"
              data-testid="hint-cta"
              onClick={onHint}
            >看提示</button>
            ) : (
              <span
                className="mn-question-card__advance-hint"
                data-testid="advance-hint"
                aria-hidden="true"
              >按下方「下一題」繼續</span>
            )}
          </>
        )}
      </div>

      <span role="status" aria-live="polite" className="mn-sr-only" data-testid={`sr-status-${step.step_id}`}></span>
    </section>
  );
}

// ─── Subtree: numeric / fraction input ────────────────────────────────────

function InputSubtree(props: {
  step: SessionStep;
  spec: any;
  ageBand: string;
  studentId: string;
  lastVerdict: string | null;
  phase: string;
  hintsUsed: number;
  attemptsCount: number;
  goalPhrase: string;
  onSubmit: (args: any) => void;
  onHint: () => void;
  onRetry: () => void;
  onRepresentationSwitch: (to: SessionStep["representation_type"]) => void;
}) {
  const { step, spec, lastVerdict, phase, hintsUsed, attemptsCount, studentId, onSubmit, onHint, onRetry, onRepresentationSwitch, goalPhrase } = props;

  const mode = step.question_type === "fraction_input" ? "fraction"
             : step.question_type === "decimal_input"  ? "decimal"
             : "integer";

  // Submitted = the student has at least one recorded verdict.  We
  //  do NOT key off `phase === "feedback"` because the reducer sends
  //  incorrect submissions to HINT_LEVEL_1, not FEEDBACK.  The UI
  //  view of "submitted" means "we have an answer on record".
  const submitted = lastVerdict !== null && lastVerdict !== undefined;
  const showVisual = (phase === "hint_level_2" || phase === "hint_level_3") && step.representation_type !== "text";

  const reveal = shouldRevealAnswer(phase, hintsUsed, lastVerdict, false);

  const isFraction = step.question_type === "fraction_input";
  const isCoarse = useCoarseViewport();
  const keypadShouldExpand = useKeypadVisibility();
  const toggleable = isFraction;
  // Round 5 (2026-08-28 14:25): default visibility follows the
  // keypad_visibility hook (tablet expanded, phone/desktop collapsed)
  // rather than coarse_pointer alone.  Phones now default to hidden so
  // the OS keyboard is the primary input.
  const default_visible = keypadShouldExpand;

  const hintText = useMemo(() => {
    if (hintsUsed === 0) return null;
    try {
      const result = nextMathHint({
        student_id: studentId,
        subject: step.subject,
        knowledge_point: step.knowledge_point,
        attempts: 1,
        hints_given: hintsUsed,
        representation_used: step.representation_type,
        stem: step.stem,
      });
      return result?.hint_text_zh ?? null;
    } catch (e) {
      return null;
    }
  }, [step.subject, step.knowledge_point, step.stem, step.representation_type, hintsUsed, studentId]);

  const handleSubmit = useCallback((value: KeypadValue) => {
    const result = validateKeypadAnswer({
      keypad_value: value,
      expected: step.expected_answer,
    });
    onSubmit({
      verdict: result.verdict,
      error_type: result.verdict === "incorrect" ? "wrong_value" : null,
    });
  }, [step.expected_answer, onSubmit]);

  const hintActive = !!hintText || (submitted && lastVerdict === "incorrect" && !reveal) || (submitted && lastVerdict === "correct");
  const hintLabel =
    submitted && lastVerdict === "correct" ? "答對了"
    : submitted && lastVerdict === "incorrect" && !reveal ? "再試一次"
    : hintText ? `提示 ${Math.min(hintsUsed, MAX_HINT_LEVEL)}/${MAX_HINT_LEVEL}`
    : null;
  const hintTone =
    submitted && lastVerdict === "correct" ? "moss"
    : submitted && lastVerdict === "incorrect" && !reveal ? "amber"
    : hintText && hintsUsed >= 2 ? "amber"
    : "moss";

  const liveMsg = submitted && lastVerdict
    ? lastVerdict === "correct" ? `答對了！`
    : lastVerdict === "incorrect" ? `還不對，看下面的提示。`
    : "已收到答案。"
    : "";

  return (
    <section
      className="mn-question-card"
      aria-labelledby={`stem-${step.step_id}`}
      data-testid={`question-${step.step_id}`}
      data-knowledge-point={step.knowledge_point}
      data-question-type={step.question_type}
      data-representation={step.representation_type}
      aria-label={`${goalPhrase} 輸入題`}
    >
      {/* Region 1: meta strip */}
      <div className="mn-question-card__meta">
        <div className="mn-question-card__meta-left">
          <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
          <span className="mn-question-goal">{`主題：${goalPhrase}`}</span>
        </div>
        <div className="mn-question-card__meta-right">
          {step.representation_type !== "text" && (
            <button
              type="button"
              className="mn-button mn-button--ghost"
              data-testid="representation-toggle"
              onClick={() => onRepresentationSwitch(
                step.representation_type === "fraction_bar" ? "number_line" :
                step.representation_type === "number_line"  ? "area_model" :
                "fraction_bar"
              )}
            >換一種表示 →</button>
          )}
        </div>
      </div>

      {/* Region 2: stem */}
      <div className="mn-question-card__stem-wrap">
        <h2 id={`stem-${step.step_id}`} className="mn-question-stem" data-testid="question-stem">
          {stemWithMono(step.stem)}
        </h2>
      </div>

      {/* Optional math visual (only when hint_level >= 2). */}
      {showVisual && (() => {
        const visual = buildMathVisual(step);
        if (!visual) return null;
        return (
          <MathVisualRenderer
            primitive={visual.primitive}
            descriptor={visual.descriptor}
            svg={visual.svg}
            aria_label={visual.aria_label}
            aspect_ratio="4/3"
            variant="minimal"
          />
        );
      })()}

      {/* Region 3: answer area — the ONLY region with surface lift. */}
      <div className="mn-question-card__answer-area">
        <NativeMathKeypad
          key={step.step_id}
          mode={mode}
          toggleable={toggleable}
          default_visible={default_visible}
          on_submit={handleSubmit}
          submit_label={submitted ? "已送出" : "送出"}
          submit_disabled={submitted}
        />
      </div>

      {/* Region 3b: hint / feedback row.  Mounted always; zero footprint
       *  when inactive (per sign-off 2026-08-28 13:29). */}
      <div
        className="mn-question-card__hint-row"
        data-active={hintActive ? "true" : "false"}
        data-testid="hint-row"
        aria-live="polite"
        aria-atomic="false"
      >
        {hintLabel && (
          <aside
            className="mn-hint-panel"
            data-testid="hint-panel"
            data-tone={hintTone}
            data-stage={phase}
          >
            <span className="mn-hint-pill" data-tone={hintTone} aria-hidden="true">
              {hintLabel}
            </span>
            {hintText && <p className="mn-hint-panel__text">{hintText}</p>}
            {submitted && lastVerdict === "incorrect" && !reveal && !hintText && (
              <p className="mn-hint-panel__text">再仔細看看題目，或者按下面的「看提示」。</p>
            )}
            {submitted && lastVerdict === "correct" && (
              <p className="mn-hint-panel__text">答對了！按下「下一題」繼續。</p>
            )}
          </aside>
        )}
      </div>

      {/* Region 4: CTAs.  See MC subtree note — the next-question button
       *  is owned by SessionView, not QuestionRenderer. */}
      <div className="mn-question-card__cta-row">
        {!submitted ? (
          <>
            <button
              type="button"
              className="mn-button mn-button--ghost"
              data-testid="hint-toggle"
              onClick={onHint}
            >看提示</button>
            <button
              type="button"
              className="mn-button mn-button--primary"
              data-testid="hint-cta-bottom"
              onClick={onHint}
            >送出答案</button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="mn-button mn-button--ghost"
              data-testid="retry-button"
              onClick={onRetry}
            >換一個答案</button>
            {lastVerdict === "incorrect" && !reveal ? (
              <button
                type="button"
                className="mn-button mn-button--primary"
                data-testid="hint-cta-after"
                onClick={onHint}
              >看提示</button>
            ) : (
              <span
                className="mn-question-card__advance-hint"
                data-testid="advance-hint"
                aria-hidden="true"
              >按下方「下一題」繼續</span>
            )}
          </>
        )}
      </div>

      <span role="status" aria-live="polite" className="mn-sr-only" data-testid={`sr-status-${step.step_id}`}>{liveMsg}</span>
    </section>
  );
}

// ─── Subtree: unsupported ────────────────────────────────────────────────

function UnsupportedNotice(props: { step: SessionStep }) {
  return (
    <section
      className="mn-question-card"
      data-testid={`question-${props.step.step_id}`}
      data-state="unsupported"
      aria-label="本題暫不支援"
    >
      <div className="mn-question-card__meta">
        <div className="mn-question-card__meta-left">
          <span className="mn-tag">本題暫不支援</span>
        </div>
      </div>
      <div className="mn-question-card__stem-wrap">
        <p>老師正在準備這個題型，請先練習別的題目。</p>
      </div>
    </section>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function ageBandToGradeNumber(band: string): number {
  switch (band) {
    case "G1-G2": return 2;
    case "G3-G4": return 4;
    case "G5-G6": return 6;
    case "G7+":   return 8;
    default:      return 6;
  }
}

// Tiny inline SVG icons (Quiet Graph: weight-1.5 stroke, square caps).
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 8.5 L6.5 12 L13 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}
