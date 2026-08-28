// src/session/QuestionRenderer.tsx
//
// Phase 5C-1 — Data-driven dispatcher that maps a session step to the
// right rendering subtree.  One main instructional step at a time.
//
// Mappings (Phase 5C-1 scope):
//   multiple_choice  → MC renderer (inline; same a11y as 5A slice)
//   fraction_input   → NativeMathKeypad + MathVisualRenderer (when
//                      representation_type is fraction_bar/number_line/
//                      area_model)
//   integer_input    → NativeMathKeypad with mode="integer"
//   decimal_input    → NativeMathKeypad with mode="decimal"
//
// NOT in this round (deferred to 5C-2 / 5C-3 / later):
//   short_answer (text), true_false, matching, ordering, drag_drop,
//   handwriting, voice.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPresentationRequest } from "../foundation/presentation_request_orchestrator.mjs";
import { resolveAgeProfile } from "../foundation/age_profile_engine.mjs";
import { NativeMathKeypad, type KeypadValue } from "../input/NativeMathKeypad";
import { MathVisualRenderer } from "../math-rendering/MathVisualRenderer";
import { validateKeypadAnswer } from "../input/answer-validator.mjs";
import { nextMathHint } from "../../../../plugins/mentornest-learning/lib/math_hint_ladder_v2.mjs";
import {
  renderFractionBar,
  renderNumberLine,
  renderBarModel,
  generateFractionBarSVG,
  generateNumberLineSVG,
  generateAreaModelSVG,
} from "../../../../plugins/mentornest-learning/lib/math_visual_engine.mjs";

export type QuestionType =
  | "multiple_choice"
  | "fraction_input"
  | "integer_input"
  | "decimal_input"
  // 5C-2 / 5C-3 deferred:
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
  // Callbacks the SessionView owns:
  onSubmit: (args: {
    verdict: "correct" | "incorrect" | "unverifiable";
    error_type?: string | null;
  }) => void;
  onHint: () => void;
  onRepresentationSwitch: (to: SessionStep["representation_type"]) => void;
  onRetry: () => void;
  // Live state from session machine (so the renderer can show hint level, feedback, etc.):
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

export function QuestionRenderer(props: QuestionRendererProps) {
  const { step, ageBand, studentId, onSubmit, onHint, onRepresentationSwitch, onRetry, hintsUsed, attemptsCount, lastVerdict, phase } = props;

  // 1) Presentation orchestrator (presentation-time decision only).
  //    Phase 5C-1 maps our richer question_type to the orchestrator's
  //    presentation taxonomy: MC stays MC; typed numeric / fraction inputs
  //    map to fill_in_blank (which is what the existing 5B slice uses).
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
      hint_level: phase === "hint_level_2" || phase === "hint_level_3" ? Math.min(3, hintsUsed + 1) : hintsUsed,
    });
  }, [step.subject, step.question_type, step.knowledge_point, step.representation_type, ageBand, phase, hintsUsed, orchQuestionType]);

  const ageResolution = useMemo(
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

  // 2) Pick the renderer subtree.
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
        attemptsCount={attemptsCount}
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
      />
    );
  }

  return (
    <UnsupportedNotice
      step={step}
      reason={`question_type "${step.question_type}" is not yet supported in Phase 5C-1 (deferred to 5C-2/5C-3).`}
    />
  );
}

// ─── Subtree: multiple choice ──────────────────────────────────────────────

// Helper: build a math visual descriptor + sanitized SVG from a step.
// Returns null if the visual can't be derived from the step (e.g. missing
// operands).  Phase 5C-1 only handles fraction_bar / number_line / bar_model
// from stem-parsed operands; richer visuals come in 5C-2.
function buildMathVisual(step: SessionStep): null | {
  primitive: "fraction_bar" | "number_line" | "bar_model";
  descriptor: any;
  svg: string;
  aria_label: string;
} {
  try {
    const stem = String(step.stem ?? "");
    // fraction operand pattern: a/b + c/d (or a/b - c/d)
    const fracMatch = stem.match(/(\d+)\s*\/\s*(\d+)\s*([+\-×x*\/÷])\s*(\d+)\s*\/\s*(\d+)/);
    if (fracMatch) {
      const [, an, ad, op, bn, bd] = fracMatch;
      const numerator_a = parseInt(an, 10);
      const denominator_a = parseInt(ad, 10);
      const numerator_b = parseInt(bn, 10);
      const denominator_b = parseInt(bd, 10);
      // 1) Validate via descriptor engine.
      const desc = renderFractionBar({
        numerator: numerator_a,
        denominator: denominator_a,
        label: `${numerator_a}/${denominator_a}`,
      });
      if (desc?.constraints_check?.violations?.length) return null;
      // 2) Generate SVG from validated inputs.
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
    // integer addition: "23 + 17" or "23 × 4" etc.
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

function MultipleChoiceSubtree(props: {
  step: SessionStep;
  spec: any;
  ageBand: string;
  lastVerdict: string | null;
  phase: string;
  attemptsCount: number;
  onSubmit: (args: any) => void;
  onRetry: () => void;
}) {
  const { step, spec, lastVerdict, phase, attemptsCount, onSubmit, onRetry } = props;
  const choices = step.choices ?? [];
  const correctIndex = useMemo(() => {
    if (typeof step.expected_answer === "number") return step.expected_answer;
    const idx = choices.findIndex((c) => String(c) === String(step.expected_answer));
    return idx >= 0 ? idx : 0;
  }, [step.expected_answer, choices]);
  const [selected, setSelected] = useState<number | null>(null);

  // Feedback is shown whenever the student has submitted at least once.
  // We use the prop's `attemptsCount` value (read into a local const so
  // destructuring is unambiguous at the bundle layer) as the source of
  // truth rather than `phase`, so wrong submissions show feedback
  // immediately regardless of hint escalation phase.
  const mcAttempts = typeof attemptsCount === "number" ? attemptsCount : 0;
  const hasAttempt = mcAttempts > 0;
  const feedback = hasAttempt;

  const handleSubmit = useCallback(() => {
    if (selected === null) return;
    const verdict = selected === correctIndex ? "correct" : "incorrect";
    onSubmit({ verdict, error_type: verdict === "incorrect" ? "wrong_choice" : null });
  }, [selected, correctIndex, onSubmit]);

  const ariaCorrectness =
    feedback && lastVerdict === "correct" ? "correct" :
    feedback && lastVerdict === "incorrect" ? "incorrect" :
    "none";

  return (
    <section
      className="mn-card mn-question-card"
      aria-labelledby={`stem-${step.step_id}`}
      data-testid={`question-${step.step_id}`}
      data-knowledge-point={step.knowledge_point}
      data-question-type={step.question_type}
    >
      <header className="mn-card-header">
        <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
        <span className="mn-tag">目標：{spec.child_copy.replace(/^目標：/, "")}</span>
      </header>
      <h2 id={`stem-${step.step_id}`} className="mn-question-stem" data-testid="question-stem">
        {step.stem}
      </h2>
      <div role="radiogroup" aria-labelledby={`stem-${step.step_id}`} className="mn-choices" data-testid="choice-list">
        {choices.map((choice, idx) => {
          const checked = selected === idx;
          const isCorrect = feedback && idx === correctIndex;
          const isWrongPick = feedback && checked && idx !== correctIndex;
          return (
            <div
              key={idx}
              role="radio"
              tabIndex={selected === null ? (idx === 0 ? 0 : -1) : (selected === idx ? 0 : -1)}
              aria-checked={checked}
              aria-label={`選項 ${String.fromCharCode(65 + idx)}：${choice}`}
              data-testid={`choice-${idx}`}
              className={
                "mn-choice-key" +
                (checked ? " is-selected" : "") +
                (isCorrect ? " is-correct" : "") +
                (isWrongPick ? " is-incorrect" : "")
              }
              onClick={() => !feedback && setSelected(idx)}
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
                }
              }}
            >
              <span className="mn-choice-key-letter" aria-hidden="true">{String.fromCharCode(65 + idx)}</span>
              <span className="mn-choice-key-text">{choice}</span>
            </div>
          );
        })}
      </div>
      {feedback ? (
        <>
          <div
            className={`mn-feedback mn-feedback--${ariaCorrectness}`}
            data-testid={`feedback-${ariaCorrectness}`}
            data-state={ariaCorrectness}
          >
            {lastVerdict === "correct" ? (
              <>
                <span className="mn-feedback-icon" aria-hidden="true">✓</span>
                <span>答對了！{choices[correctIndex]} 是正確答案。</span>
              </>
            ) : (
              <>
                <span className="mn-feedback-icon" aria-hidden="true">✗</span>
                <span>再想想，正確答案是 {choices[correctIndex]}。</span>
              </>
            )}
          </div>
          {lastVerdict === "incorrect" && (
            <div className="mn-actions">
              <button
                type="button"
                className="mn-button"
                data-testid="retry-button"
                onClick={onRetry}
              >再試一次</button>
            </div>
          )}
        </>
      ) : (
        <div className="mn-actions">
          <button
            type="button"
            className="mn-button mn-button--primary"
            data-testid="mc-submit"
            disabled={selected === null}
            onClick={handleSubmit}
          >送出</button>
        </div>
      )}
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
  onSubmit: (args: any) => void;
  onHint: () => void;
  onRetry: () => void;
  onRepresentationSwitch: (to: SessionStep["representation_type"]) => void;
}) {
  const { step, spec, lastVerdict, phase, hintsUsed, attemptsCount, studentId, onSubmit, onHint, onRetry, onRepresentationSwitch } = props;

  const mode = step.question_type === "fraction_input" ? "fraction"
             : step.question_type === "decimal_input"  ? "decimal"
             : "integer";

  const submitted = phase === "feedback";
  const showVisual = (phase === "hint_level_2" || phase === "hint_level_3") && step.representation_type !== "text";

  // Hint text from the engine (Phase 5B pattern, now driven by data).
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
      console.log("[QR]", step.knowledge_point, "hintsUsed="+hintsUsed, "subject="+step.subject, "studentId="+studentId, "result="+JSON.stringify(result).slice(0,250)); return result?.hint_text_zh ?? null;
    } catch (e) {
      return null;
    }
  }, [step.subject, step.knowledge_point, step.stem, step.representation_type, hintsUsed]);

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

  // Live region message for SR.
  const liveMsg = submitted && lastVerdict
    ? lastVerdict === "correct" ? `答對了！${step.expected_answer} 是正確答案。`
    : lastVerdict === "incorrect" ? `還不對，再試一次。`
    : "已收到答案。"
    : "";

  return (
    <section
      className="mn-card mn-question-card"
      aria-labelledby={`stem-${step.step_id}`}
      data-testid={`question-${step.step_id}`}
      data-knowledge-point={step.knowledge_point}
      data-question-type={step.question_type}
      data-representation={step.representation_type}
    >
      <header className="mn-card-header">
        <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
        <span className="mn-tag">目標：{spec.child_copy.replace(/^目標：/, "")}</span>
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
          >換一種表示</button>
        )}
      </header>
      <h2 id={`stem-${step.step_id}`} className="mn-question-stem" data-testid="question-stem">{step.stem}</h2>

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

      <NativeMathKeypad
        key={step.step_id}
        mode={mode}
        on_submit={handleSubmit}
        submit_label={submitted ? "已送出" : "送出"}
        submit_disabled={submitted}
      />

      {hintText && (
        <aside
          className="mn-hint-panel"
          data-testid="hint-panel"
          data-stage={phase}
          aria-label="提示"
        >
          <span className="mn-hint-icon" aria-hidden="true">💡</span>
          <span id={`hint-text-${step.step_id}`}>{hintText}</span>
        </aside>
      )}

      {!hintText && !submitted && (attemptsCount > 0 || phase === "presenting") && (
        <button
          type="button"
          className="mn-button mn-button--ghost"
          data-testid="hint-toggle"
          onClick={onHint}
          aria-expanded={false}
        >看提示</button>
      )}

      {submitted && lastVerdict === "incorrect" && (
        <div className="mn-actions">
          <button
            type="button"
            className="mn-button"
            data-testid="retry-button"
            onClick={onRetry}
          >再試一次</button>
        </div>
      )}

      {submitted && (
        <div
          className={`mn-feedback mn-feedback--${lastVerdict === "correct" ? "correct" : "incorrect"}`}
          data-testid={`feedback-${lastVerdict === "correct" ? "correct" : "incorrect"}`}
          data-state={lastVerdict === "correct" ? "correct" : "incorrect"}
        >
          {lastVerdict === "correct" ? (
            <>
              <span className="mn-feedback-icon" aria-hidden="true">✓</span>
              <span>答對了！{step.expected_answer} 是正確答案。</span>
            </>
          ) : (
            <>
              <span className="mn-feedback-icon" aria-hidden="true">✗</span>
              <span>再試一次，正確答案是 {step.expected_answer}。</span>
            </>
          )}
        </div>
      )}

      <span role="status" aria-live="polite" className="mn-sr-only" data-testid={`sr-status-${step.step_id}`}>{liveMsg}</span>
    </section>
  );
}

// ─── Subtree: unsupported (deferred to 5C-2/5C-3) ──────────────────────────

function UnsupportedNotice(props: { step: SessionStep; reason: string }) {
  return (
    <section
      className="mn-card mn-question-card"
      data-testid={`question-${props.step.step_id}`}
      data-state="unsupported"
    >
      <header className="mn-card-header">
        <span className="mn-tag">本題暫不支援</span>
      </header>
      <p data-testid="unsupported-reason">{props.reason}</p>
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
