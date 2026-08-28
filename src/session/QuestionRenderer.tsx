// src/session/QuestionRenderer.tsx
//
// Phase 5C-1.1 — Data-driven dispatcher.
//
// Maps a session step to the right rendering subtree.  One main instructional
// step at a time.
//
// Phase 5C-1.1 INV-AP-56-2 enforcement:
//   First-incorrect feedback does NOT reveal the expected answer.
//   The primary next action is "看提示" (看提示 CTA, ghost button).
//   The expected answer is revealed only AFTER one of:
//     - hintsUsed >= 1     (a hint has been revealed)
//     - review_needed      (the session machine flagged review state)
//
// Child-facing copy contract:
//   - No KP IDs, no license, no source, no fixture / debug strings
//   - No VOCAB_CEILING or other lint codes shown to the child
//   - Header tag is the age band (e.g. "G5-G6") and a friendly goal phrase
//
// Mappings (Phase 5C-1 scope):
//   multiple_choice  → MC renderer (inline; same a11y as 5A slice)
//   fraction_input   → NativeMathKeypad + MathVisualRenderer
//   integer_input    → NativeMathKeypad with mode="integer"
//   decimal_input    → NativeMathKeypad with mode="decimal"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPresentationRequest } from "../foundation/presentation_request_orchestrator.mjs";
import { resolveAgeProfile } from "../foundation/age_profile_engine.mjs";
import { NativeMathKeypad, type KeypadValue } from "../input/NativeMathKeypad";
import { MathVisualRenderer } from "../math-rendering/MathVisualRenderer";
import { validateKeypadAnswer } from "../input/answer-validator.mjs";
import { nextMathHint } from "../math-rendering/math_hint_ladder_v2.mjs";
import {
  renderFractionBar,
  renderNumberLine,
  renderBarModel,
  generateFractionBarSVG,
  generateNumberLineSVG,
  generateAreaModelSVG,
} from "../math-rendering/math_visual_engine_render.mjs";

// ─── KP ID → child-facing zh-TW phrase (view-layer only) ──────────────────
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

// Maximum hint escalation level.  INV-IP-HINT-1.
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

// ─── Reveal-answer policy (INV-AP-56-2) ────────────────────────────────────
// Returns true only when:
//   - student is on the feedback phase (an answer was submitted), AND
//   - EITHER at least one hint has been revealed (hintsUsed >= 1)
//   - OR the session machine explicitly flagged review_needed.
// In all other cases (especially first-incorrect) we hide the expected
// answer and surface "看提示" as the next primary action.
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

// Helper: build a math visual descriptor + sanitized SVG from a step.
function buildMathVisual(step: SessionStep): null | {
  primitive: "fraction_bar" | "number_line" | "bar_model";
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

// ─────────────────────────────────────────────────────────────────────────
// Top-level dispatch
// ─────────────────────────────────────────────────────────────────────────

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

  // Children never see internal KP IDs, lint codes, or fixture strings.
  // Goal tag is derived from a view-layer phrase map.
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

  return (
    <UnsupportedNotice
      step={step}
      reason={`question_type "${step.question_type}" is not yet supported in Phase 5C-1.1 (deferred to 5C-2/5C-3).`}
    />
  );
}

// ─── Subtree: multiple choice ─────────────────────────────────────────────

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

  // Reset selection when the step changes.
  useEffect(() => { setSelected(null); }, [step.step_id]);

  // Reveal-answer policy.
  const reveal = shouldRevealAnswer(phase, hintsUsed, lastVerdict, false);

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
      aria-label={`${goalPhrase} 選擇題`}
    >
      <header className="mn-card-header">
        <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
        <span className="mn-tag">主題：{goalPhrase}</span>
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
          {/* INV-AP-56-2 — first-incorrect: hide answer; primary next action = 看提示 */}
          {lastVerdict === "incorrect" && !reveal ? (
            <div className="mn-actions">
              <button
                type="button"
                className="mn-button mn-button--primary"
                data-testid="hint-cta"
                onClick={onHint}
              >看提示</button>
              <button
                type="button"
                className="mn-button mn-button--ghost"
                data-testid="retry-button"
                onClick={onRetry}
              >換一個答案</button>
            </div>
          ) : (
            <div
              className={`mn-feedback mn-feedback--${ariaCorrectness}`}
              data-testid={`feedback-${ariaCorrectness}`}
              data-state={ariaCorrectness}
            >
              <span className="mn-feedback-icon" aria-hidden="true">
                {lastVerdict === "correct" ? "✓" : "✓"}
              </span>
              <span>
                {lastVerdict === "correct"
                  ? "答對了！"
                  : `正確答案是 ${choices[correctIndex]}。`}
              </span>
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
          <button
            type="button"
            className="mn-button mn-button--ghost"
            data-testid="hint-toggle"
            onClick={onHint}
          >看提示</button>
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

  const submitted = phase === "feedback";
  const showVisual = (phase === "hint_level_2" || phase === "hint_level_3") && step.representation_type !== "text";

  // Reveal-answer policy.
  const reveal = shouldRevealAnswer(phase, hintsUsed, lastVerdict, false);

  // Decide keypad default visibility:
  //   - desktop users typically have a physical keyboard; default collapse.
  //   - mobile / tablet users may want the keypad; default open.
  // Phase 5C-1.1 honours the parent's responsibility: caller passes
  // `toggleable + default_visible`.  When NOT collapsible, the keypad is
  // always visible (no regression for callers that don't pass toggleable).
  const isFraction = step.question_type === "fraction_input";
  const toggleable = isFraction; // Phase 5C-1.1 ships collapse only for fraction_input
  const default_visible = true;   // Default-open keeps the path simple; user collapses via toggle.

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

  const liveMsg = submitted && lastVerdict
    ? lastVerdict === "correct" ? `答對了！`
    : lastVerdict === "incorrect" ? `還不對，看下面的提示。`
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
      aria-label={`${goalPhrase} 輸入題`}
    >
      <header className="mn-card-header">
        <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
        <span className="mn-tag">主題：{goalPhrase}</span>
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
        toggleable={toggleable}
        default_visible={default_visible}
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
          <span className="mn-hint-pill" aria-hidden="true">提示 {Math.min(hintsUsed, MAX_HINT_LEVEL)}/{MAX_HINT_LEVEL}</span>
          <p id={`hint-text-${step.step_id}`} className="mn-hint-panel__text">{hintText}</p>
        </aside>
      )}

      {/* First-incorrect: primary CTA = 看提示 (NOT submit) */}
      {!hintText && !submitted && (attemptsCount > 0 || phase === "presenting") && (
        <button
          type="button"
          className="mn-button mn-button--primary"
          data-testid="hint-cta"
          onClick={onHint}
        >看提示</button>
      )}

      {/* After submit: primary action depends on verdict + reveal policy */}
      {submitted && lastVerdict === "incorrect" && !reveal && (
        <div className="mn-actions">
          <button
            type="button"
            className="mn-button mn-button--primary"
            data-testid="hint-cta-after"
            onClick={onHint}
          >看提示</button>
          <button
            type="button"
            className="mn-button mn-button--ghost"
            data-testid="retry-button"
            onClick={onRetry}
          >換一個答案</button>
        </div>
      )}

      {submitted && reveal && (
        <div
          className={`mn-feedback mn-feedback--${lastVerdict === "correct" ? "correct" : "incorrect"}`}
          data-testid={`feedback-${lastVerdict === "correct" ? "correct" : "incorrect"}`}
          data-state={lastVerdict === "correct" ? "correct" : "incorrect"}
        >
          <span className="mn-feedback-icon" aria-hidden="true">{lastVerdict === "correct" ? "✓" : "✓"}</span>
          <span>
            {lastVerdict === "correct"
              ? `答對了！${step.expected_answer} 是正確答案。`
              : `正確答案是 ${step.expected_answer}。`}
          </span>
        </div>
      )}

      {submitted && lastVerdict === "correct" && !reveal && (
        // Defensive: correct should always reveal, but if hintsUsed is 0 for
        // some reason, we still want the success message.
        <div
          className="mn-feedback mn-feedback--correct"
          data-testid="feedback-correct"
          data-state="correct"
        >
          <span className="mn-feedback-icon" aria-hidden="true">✓</span>
          <span>答對了！</span>
        </div>
      )}

      <span role="status" aria-live="polite" className="mn-sr-only" data-testid={`sr-status-${step.step_id}`}>{liveMsg}</span>
    </section>
  );
}

// ─── Subtree: unsupported (deferred to 5C-2/5C-3) ──────────────────────────

function UnsupportedNotice(props: { step: SessionStep; reason: string }) {
  // No internal reason text exposed to children.
  return (
    <section
      className="mn-card mn-question-card"
      data-testid={`question-${props.step.step_id}`}
      data-state="unsupported"
      aria-label="本題暫不支援"
    >
      <header className="mn-card-header">
        <span className="mn-tag">本題暫不支援</span>
      </header>
      <p>老師正在準備這個題型，請先練習別的題目。</p>
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