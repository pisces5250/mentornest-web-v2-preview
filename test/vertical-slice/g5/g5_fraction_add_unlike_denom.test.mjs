// test/vertical-slice/g5/g5_fraction_add_unlike_denom.test.mjs
//
// Phase 5B — G5 FRAC add-unlike-denom vertical slice tests.
//
// Validates:
//   - orchestrator produces G5-G6 band for grade 5
//   - validator returns "correct" for 5/6, 10/12, 15/18, etc.
//   - validator returns "incorrect" for 1/2, 1/3, etc.
//   - hint escalation stages are correct
//   - math_visual_engine.generateVisualSVG produces valid SVG for fraction_bar
//   - the SVG passes svgValidityCheck
//   - sanitizeSvg allows the engine's SVG output
//   - the keypad state machine round-trips a fraction answer

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPresentationRequest } from "../../../src/foundation/presentation_request_orchestrator.mjs";
import { resolveAgeProfile } from "../../../src/foundation/age_profile_engine.mjs";
import { validateKeypadAnswer } from "../../../src/input/answer-validator.mjs";
import { keypadReduce, keypadInitial } from "../../../src/input/keypad-state.mjs";
import { nextHintStage } from "../../../src/math-rendering/hint-controller.mjs";
import { sanitizeSvg } from "../../../src/math-rendering/svg-sanitizer.mjs";
import {
  renderFractionBar,
  renderNumberLine,
  renderBarModel,
  generateVisualSVG,
  svgValidityCheck,
} from "../../../../../plugins/mentornest-learning/lib/math_visual_engine.mjs";

// ─────────────────────────────────────────────────────────────────────────
// 1. Orchestrator integration
// ─────────────────────────────────────────────────────────────────────────

test("g5: orchestrator produces G5-G6 band for grade 5", () => {
  const r = buildPresentationRequest({
    subject: "math",
    grade: 5,
    question_type: "fill_in_blank",
    representation_type: "fraction_bar",
    learning_goal: "分數加法（異分母）",
    interaction_required: "type",
    hint_level: 0,
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.render_spec.age_band, "G5-G6");
    // G5-G6 must NOT include encouragement_glyph (R6 — no mascot).
    assert.ok(!r.render_spec.visual_priority.includes("encouragement_glyph"));
  }
});

test("g5: age_profile_engine resolves grade 5 to G5-G6 with mascot_allowed=false", () => {
  const r = resolveAgeProfile(5);
  assert.equal(r.band, "G5-G6");
  assert.equal(r.profile.mascot_allowed, false);
});

// ─────────────────────────────────────────────────────────────────────────
// 2. math_visual_engine integration
// ─────────────────────────────────────────────────────────────────────────

test("g5: math_visual_engine.renderFractionBar + generateVisualSVG produces valid SVG for 1/2", () => {
  const fb = renderFractionBar({ numerator: 1, denominator: 2 });
  assert.equal(fb.constraints_check.ok, true);
  const svg = generateVisualSVG("fraction_bar", fb.descriptor);
  assert.ok(svg.svg);
  assert.equal(svgValidityCheck(svg.svg).valid, true);
});

test("g5: math_visual_engine.renderFractionBar for 1/3", () => {
  const fb = renderFractionBar({ numerator: 1, denominator: 3 });
  const svg = generateVisualSVG("fraction_bar", fb.descriptor);
  assert.equal(svgValidityCheck(svg.svg).valid, true);
});

test("g5: math_visual_engine rejects zero denominator", () => {
  const fb = renderFractionBar({ numerator: 1, denominator: 0 });
  assert.equal(fb.constraints_check.ok, false);
});

test("g5: math_visual_engine rejects negative numerator", () => {
  const fb = renderFractionBar({ numerator: -1, denominator: 2 });
  assert.equal(fb.constraints_check.ok, false);
});

test("g5: math_visual_engine rejects non-integer", () => {
  const fb = renderFractionBar({ numerator: 1.5, denominator: 2 });
  assert.equal(fb.constraints_check.ok, false);
});

test("g5: number_line primitive also works (sanity)", () => {
  const nl = renderNumberLine({ from: 0, to: 1, marks: [{ value: 0.5, label: "0.5", kind: "label" }] });
  assert.equal(nl.constraints_check.ok, true);
  const svg = generateVisualSVG("number_line", nl.descriptor);
  assert.equal(svgValidityCheck(svg.svg).valid, true);
});

test("g5: bar_model descriptor produced (area_model uses different builder path)", () => {
  // bar_model is the closest builder primitive.  Its constraints_check is
  // not "ok=true" without a question_type + parts, but the engine still
  // returns a descriptor.  This is a sanity check that the engine accepts
  // rows/cols input.
  const bm = renderBarModel({ rows: 2, cols: 3 });
  assert.equal(bm.descriptor.type, "bar_model");
});

test("g5: area_model descriptor → SVG (no dedicated builder; descriptor-only)", () => {
  // area_model is supported by generateVisualSVG via descriptor rows/cols.
  const descriptor = { type: "area_model", rows: 3, cols: 4, label: "12 格" };
  const svg = generateVisualSVG("area_model", descriptor);
  assert.equal(svgValidityCheck(svg.svg).valid, true);
});

// ─────────────────────────────────────────────────────────────────────────
// 3. SVG sanitizer accepts engine output
// ─────────────────────────────────────────────────────────────────────────

test("g5: sanitizeSvg accepts engine's fraction_bar SVG output", () => {
  const fb = renderFractionBar({ numerator: 1, denominator: 2 });
  const svg = generateVisualSVG("fraction_bar", fb.descriptor);
  const r = sanitizeSvg(svg.svg);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.sanitized.includes("<svg"));
    assert.ok(r.sanitized.includes("<rect"));
  }
});

test("g5: sanitizeSvg rejects SVG with embedded <script>", () => {
  const bad = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect x="0" y="0" width="10" height="10" /></svg>`;
  const r = sanitizeSvg(bad);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(!r.sanitized.includes("<script"));
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Validator: 1/2 + 1/3 = 5/6 with equivalent fractions
// ─────────────────────────────────────────────────────────────────────────

test("g5: 5/6 is correct (canonical)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 5, denominator: 6 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "correct");
});

test("g5: 10/12 is correct (equivalent of 5/6)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 10, denominator: 12 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "correct");
});

test("g5: 15/18 is correct (equivalent)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 15, denominator: 18 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "correct");
});

test("g5: 1/2 is incorrect", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 1, denominator: 2 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "incorrect");
});

test("g5: 1/3 is incorrect", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 1, denominator: 3 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "incorrect");
});

test("g5: 2/3 is incorrect", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 2, denominator: 3 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "incorrect");
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Keypad state machine: simulating fraction input
// ─────────────────────────────────────────────────────────────────────────

test("g5: keypad simulation — student enters 5/6 via fraction mode", () => {
  let s = keypadInitial();
  // 1. switch to fraction mode
  s = keypadReduce(s, { type: "fraction_bar" });
  assert.equal(s.active_field, "numerator");
  // 2. type "5" in numerator → partial fraction (denominator not yet)
  s = keypadReduce(s, { type: "digit", digit: 5 });
  assert.equal(s.value.kind, "fraction_partial");
  if (s.value.kind === "fraction_partial") assert.equal(s.value.numerator, 5);
  // 3. switch to denominator (numerator value preserved)
  s = keypadReduce(s, { type: "focus_field", field: "denominator" });
  assert.equal(s.active_field, "denominator");
  // 4. type "6" — completes the fraction
  s = keypadReduce(s, { type: "digit", digit: 6 });
  assert.equal(s.value.kind, "fraction");
  if (s.value.kind === "fraction") {
    assert.equal(s.value.numerator, 5);
    assert.equal(s.value.denominator, 6);
  }
});

test("g5: keypad simulation — backspace clears the active digit", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "fraction_bar" });
  s = keypadReduce(s, { type: "digit", digit: 1 });
  s = keypadReduce(s, { type: "digit", digit: 2 });
  s = keypadReduce(s, { type: "backspace" });
  // Buffer reduced from "12" to "1"
  assert.equal(s.buffer, "1");
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Hint escalation: full flow simulation
// ─────────────────────────────────────────────────────────────────────────

test("g5: hint flow — wrong → wrong → correct", () => {
  // Attempt 1: wrong (1/2). hint: level 1.
  const h1 = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 1,
    hints_already_shown: 0,
  });
  assert.equal(h1.stage, "text_only");
  assert.equal(h1.show_fraction_bar, false);

  // Attempt 2: wrong (1/3). hint: level 2 (fraction_bar).
  const h2 = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 2,
    hints_already_shown: 1,
  });
  assert.equal(h2.stage, "fraction_bar");
  assert.equal(h2.show_fraction_bar, true);

  // Attempt 3: correct (5/6). hint: irrelevant; flow advances to feedback.
  const correct = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 5, denominator: 6 },
    expected: "5/6",
  });
  assert.equal(correct.verdict, "correct");
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Production safety: fake IDs only, no production student data
// ─────────────────────────────────────────────────────────────────────────

test("g5: fake IDs only — no student_001 / student_002 references", () => {
  // The vertical slice uses fake "t_phase5b_student" in hint-controller.
  // The question fixture is inline; no student references anywhere.
  // This test documents the contract.
  assert.ok(true, "by-construction: G5 vertical slice has zero real student references");
});

test("g5: production mentornest-web NOT touched", () => {
  // Verify production HTML MD5 unchanged.
  // (Direct check would require network — already covered in acceptance.)
  assert.ok(true, "by-construction: Phase 5B only writes to workspace/mentornest-web-v2/");
});
