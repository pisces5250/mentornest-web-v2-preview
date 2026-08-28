// src/vertical-slice/G5FractionAddUnlikeDenom.tsx
//
// Phase 5B — first G5 vertical slice.
//
// Flow:
//   1. Subject Specialist → presentation_request → render spec (existing).
//   2. Question rendered as a fraction-addition prompt.
//   3. Student answers using the native fraction keypad.
//   4. Validator (math_validator.validateMathAnswer) returns verdict.
//   5. Wrong → hint stage advances:
//        level 1: text-only conceptual nudge.
//        level 2: fraction-bar SVG appears + worked-example hint.
//        level 3: intermediate structure (placeholder, future Phase).
//   6. Correct → feedback + next-question CTA.
//   7. SVG (when shown) is rendered via MathVisualRenderer.
//
// Knowledge point: math.G5.FRAC.add-unlike-denom
// Question fixture: 1/2 + 1/3 = ?
// Expected answer: 5/6 (also accepts 10/12, 15/18, etc.)
//
// Production safety: all student identifiers are fake (t_phase5b_*); no
// writes to /home/node/.openclaw/workspace/data/.

import React, { useState, useMemo, useCallback } from "react";
import { buildPresentationRequest } from "../foundation/presentation_request_orchestrator.mjs";
import { resolveAgeProfile } from "../foundation/age_profile_engine.mjs";
import { lintChildCopy } from "../foundation/child_copy_linter.mjs";
import { scoreCognitiveLoad } from "../foundation/cognitive_load_scorer.mjs";
import { MathVisualRenderer } from "../math-rendering/MathVisualRenderer";
import { NativeMathKeypad, type KeypadValue } from "../input/NativeMathKeypad";
import { validateKeypadAnswer } from "../input/answer-validator.mjs";
import { nextHintStage } from "../math-rendering/hint-controller.mjs";
import {
  renderFractionBar,
  generateVisualSVG,
  svgValidityCheck,
} from "../../../../plugins/mentornest-learning/lib/math_visual_engine.mjs";

// ─────────────────────────────────────────────────────────────────────────
// Question fixture (G5 FRAC add-unlike-denom)
// ─────────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  stem: string;
  operand_a: { numerator: number; denominator: number };
  operand_b: { numerator: number; denominator: number };
  expected_answer: string;   // canonical fraction
}

const QUESTION: Question = {
  id: "q_phase5b_g5_frac_add_unlike_001",
  stem: "1/2 + 1/3 = ?",
  operand_a: { numerator: 1, denominator: 2 },
  operand_b: { numerator: 1, denominator: 3 },
  expected_answer: "5/6",
};

const PRESENTATION_INPUT = {
  subject: "math",
  grade: 5,
  question_type: "fill_in_blank",
  representation_type: "fraction_bar",
  learning_goal: "分數加法（異分母）",
  interaction_required: "type",
  hint_level: 0,
};

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

interface AttemptState {
  value: KeypadValue;
  verdict: "correct" | "incorrect" | "unverifiable" | null;
  reason: string | null;
}

export function G5FractionAddUnlikeDenom() {
  // 1) presentation_request (orchestrator)
  const request = useMemo(() => buildPresentationRequest(PRESENTATION_INPUT), []);
  if (!request.ok) {
    return (
      <div role="alert" data-testid="orchestrator-error" className="mn-card">
        Orchestrator 錯誤：{request.error.code}
      </div>
    );
  }
  const spec = request.render_spec;

  // 2) Age profile + copy lint + cognitive load (foundation integration)
  const ageResolution = useMemo(() => resolveAgeProfile(PRESENTATION_INPUT.grade), []);
  const copyLint = useMemo(
    () => lintChildCopy({ band: spec.age_band, text: spec.child_copy, location: "question-card-goal" }),
    [spec.age_band, spec.child_copy],
  );
  const stemLint = useMemo(
    () => lintChildCopy({ band: spec.age_band, text: QUESTION.stem, location: "question-card-stem" }),
    [spec.age_band],
  );
  const loadCheck = useMemo(
    () => scoreCognitiveLoad({
      band: spec.age_band,
      profile: ageResolution.profile,
      simultaneous_actions: 2,
      text_chars_in_view: QUESTION.stem.length,
      competing_emphasis_count: 0,
      animation_count: 0,
      visible_choices: 1,    // keypad is the only choice surface
      nesting_depth: 2,
    }),
    [spec.age_band, ageResolution.profile],
  );

  // 3) State: attempts + hint stage + feedback
  const [attempts, setAttempts] = useState<AttemptState[]>([]);
  const wrongCount = attempts.filter((a) => a.verdict === "incorrect").length;
  const submitted = attempts.length > 0 && attempts[attempts.length - 1].verdict === "correct";

  const hint = useMemo(() => nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: wrongCount,
    hints_already_shown: 0,
    representation_used: "symbolic",
    error_type: attempts[attempts.length - 1]?.reason ?? null,
  }), [wrongCount, attempts]);

  // 4) SVG generation (only when hint says show_fraction_bar)
  const fractionBarSvg = useMemo(() => {
    if (!hint.show_fraction_bar) return null;
    // Visualize operand_a + operand_b as a fraction bar pair.
    const fb = renderFractionBar({
      numerator: QUESTION.operand_a.numerator,
      denominator: QUESTION.operand_a.denominator,
      label: `${QUESTION.operand_a.numerator}/${QUESTION.operand_a.denominator}`,
    });
    const fb2 = renderFractionBar({
      numerator: QUESTION.operand_b.numerator,
      denominator: QUESTION.operand_b.denominator,
      label: `${QUESTION.operand_b.numerator}/${QUESTION.operand_b.denominator}`,
    });
    // Combine SVGs (descriptor-based) — concatenate via descriptor; we render
    // them as two separate MathVisualRenderer instances at the slice level.
    const svgA = generateVisualSVG("fraction_bar", fb.descriptor);
    const svgB = generateVisualSVG("fraction_bar", fb2.descriptor);
    if (!svgA.validity?.valid || !svgB.validity?.valid) return null;
    // Sanity check via svgValidityCheck (the engine's own helper).
    if (!svgValidityCheck(svgA.svg).valid || !svgValidityCheck(svgB.svg).valid) return null;
    return { svgA: svgA.svg, svgB: svgB.svg };
  }, [hint.show_fraction_bar]);

  // 5) Submit handler — runs validator
  const handleSubmit = useCallback((value: KeypadValue) => {
    const result = validateKeypadAnswer({
      keypad_value: value,
      expected: QUESTION.expected_answer,
    });
    setAttempts((prev) => [...prev, {
      value,
      verdict: result.verdict,
      reason: result.reason,
    }]);
  }, []);

  // 6) Reset
  const handleReset = useCallback(() => {
    setAttempts([]);
  }, []);

  // 7) Render
  const lastVerdict = attempts[attempts.length - 1]?.verdict ?? null;
  const showFeedback = submitted;
  const showHintPanel = wrongCount > 0 && !submitted;

  return (
    <section
      className="mn-card mn-question-card"
      aria-labelledby="g5-stem"
      data-testid="g5-frac-add-unlike"
      data-age-band={spec.age_band}
      data-knowledge-point="math.G5.FRAC.add-unlike-denom"
      data-attempts={attempts.length}
      data-submitted={submitted}
      data-last-verdict={lastVerdict ?? ""}
    >
      <header className="mn-card-header">
        <span className="mn-tag" data-testid="age-band">{spec.age_band}</span>
        <span className="mn-tag">目標：{spec.child_copy.replace(/^目標：/, "")}</span>
      </header>

      <h2 id="g5-stem" className="mn-question-stem" data-testid="question-stem">
        {QUESTION.stem}
      </h2>

      {(copyLint?.issues?.length ?? 0) > 0 && (
        <div role="status" className="mn-warning" data-testid="copy-lint">
          用語檢查：{(copyLint!.issues as any[]).map((i) => i.code).join("、")}
        </div>
      )}
      {(stemLint?.issues?.length ?? 0) > 0 && (
        <div role="status" className="mn-warning" data-testid="stem-lint">
          題目用語檢查：{(stemLint!.issues as any[]).map((i) => i.code).join("、")}
        </div>
      )}
      {!loadCheck.ok && (
        <div role="status" className="mn-warning" data-testid="load-check">
          認知負荷：{loadCheck.violations.join("、")}
        </div>
      )}

      {/* Hint panel — only shown after first wrong */}
      {showHintPanel && (
        <aside
          className="mn-hint-panel"
          role="note"
          aria-labelledby="hint-text"
          data-testid="hint-panel"
          data-stage={hint.stage}
        >
          <div className="mn-hint-panel__badge" aria-hidden="true">提示</div>
          <p id="hint-text" className="mn-hint-panel__text">{hint.hint_text_zh}</p>

          {/* Fraction-bar SVG appears at level 2+ */}
          {fractionBarSvg && (
            <div className="mn-hint-panel__visual" data-testid="hint-visual">
              <div className="mn-hint-panel__visual-label">分數圖示：</div>
              <div className="mn-hint-panel__visual-row">
                <MathVisualRenderer
                  primitive="fraction_bar"
                  descriptor={{
                    type: "fraction_bar",
                    numerator: QUESTION.operand_a.numerator,
                    denominator: QUESTION.operand_a.denominator,
                    label: `${QUESTION.operand_a.numerator}/${QUESTION.operand_a.denominator}`,
                  }}
                  svg={fractionBarSvg.svgA}
                  aria_label={`第一個分數：${QUESTION.operand_a.numerator} 分之 ${QUESTION.operand_a.denominator}`}
                  aspect_ratio="4/3"
                  variant="minimal"
                />
                <span aria-hidden="true" className="mn-hint-panel__op">＋</span>
                <MathVisualRenderer
                  primitive="fraction_bar"
                  descriptor={{
                    type: "fraction_bar",
                    numerator: QUESTION.operand_b.numerator,
                    denominator: QUESTION.operand_b.denominator,
                    label: `${QUESTION.operand_b.numerator}/${QUESTION.operand_b.denominator}`,
                  }}
                  svg={fractionBarSvg.svgB}
                  aria_label={`第二個分數：${QUESTION.operand_b.numerator} 分之 ${QUESTION.operand_b.denominator}`}
                  aspect_ratio="4/3"
                  variant="minimal"
                />
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Keypad */}
      <NativeMathKeypad
        mode="fraction"
        on_submit={handleSubmit}
        submit_disabled={submitted}
        submit_label={submitted ? "已送出" : "送出"}
      />

      {/* Feedback */}
      {showFeedback && (
        <div
          className="mn-feedback"
          data-state="correct"
          role="status"
          aria-live="polite"
          data-testid="feedback-correct"
        >
          <span aria-hidden="true">✓</span>
          <span>答對了！{QUESTION.expected_answer} 是正確答案。</span>
        </div>
      )}
      {!showFeedback && wrongCount > 0 && (
        <div
          className="mn-feedback"
          data-state="incorrect"
          role="status"
          aria-live="polite"
          data-testid="feedback-incorrect"
        >
          <span aria-hidden="true">✗</span>
          <span>再想想看，提示在上面。</span>
        </div>
      )}

      {/* Live region for screen readers */}
      <span className="mn-sr-only" role="status" aria-live="polite" data-testid="sr-status-g5">
        {showFeedback && "答對了。"}
        {!showFeedback && wrongCount > 0 && "答案不對。請看提示。"}
      </span>

      {/* Reset / next-question */}
      {submitted && (
        <button
          type="button"
          className="mn-button"
          data-testid="next-question"
          onClick={handleReset}
        >
          下一題
        </button>
      )}
    </section>
  );
}
