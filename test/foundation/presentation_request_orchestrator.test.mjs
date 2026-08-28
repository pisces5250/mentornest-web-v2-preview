// test/foundation/presentation_request_orchestrator.test.mjs
// Phase 5A — presentation_request_orchestrator unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPresentationRequest,
  PresentationRequestOrchestrator,
  __TEST__,
  VALID_SUBJECTS, VALID_QUESTION_TYPES, VALID_REPRESENTATION, VALID_INTERACTIONS,
} from "../../src/foundation/presentation_request_orchestrator.mjs";

const validRequest = () => ({
  subject: "math",
  grade: 3,
  question_type: "multiple_choice",
  representation_type: "text",
  learning_goal: "認識分數",
  interaction_required: "single_tap",
  hint_level: 1,
});

// ─────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────

test("orch: valid request returns ok=true with full render spec", () => {
  const r = buildPresentationRequest(validRequest());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  for (const k of ["component_type", "layout", "interaction_pattern", "visual_priority", "responsive_rules", "child_copy"]) {
    assert.ok(k in r.render_spec, `missing key: ${k}`);
  }
  assert.ok(Array.isArray(r.render_spec.visual_priority));
  assert.ok(Array.isArray(r.render_spec.responsive_rules));
  assert.equal(typeof r.render_spec.child_copy, "string");
});

test("orch: G3 multiple_choice → MultipleChoice component", () => {
  const r = buildPresentationRequest(validRequest());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.render_spec.component_type, "MultipleChoice");
  assert.equal(r.render_spec.age_band, "G3-G4");
});

test("orch: drag_drop with interaction=drag → DragDrop", () => {
  const r = buildPresentationRequest({ ...validRequest(), question_type: "drag_drop", interaction_required: "drag" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.render_spec.component_type, "DragDrop");
});

test("orch: drag_drop with non-drag interaction → DragDropAccessible (R2: keyboard fallback)", () => {
  const r = buildPresentationRequest({ ...validRequest(), question_type: "drag_drop", interaction_required: "single_tap" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.render_spec.component_type, "DragDropAccessible");
});

test("orch: drag_drop interaction_pattern includes keyboard_fallback", () => {
  const r = buildPresentationRequest({ ...validRequest(), question_type: "drag_drop", interaction_required: "drag" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.match(r.render_spec.interaction_pattern, /keyboard_fallback/);
});

test("orch: explain_thinking → ExplainThinking", () => {
  const r = buildPresentationRequest({ ...validRequest(), question_type: "explain_thinking", interaction_required: "explain" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.render_spec.component_type, "ExplainThinking");
});

test("orch: matching → keyboard_or_drag_match", () => {
  const r = buildPresentationRequest({ ...validRequest(), question_type: "matching", interaction_required: "drag" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.render_spec.interaction_pattern, "keyboard_or_drag_match");
});

// ─────────────────────────────────────────────────────────────────────
// Subject specialist authoritativeness preserved
// ─────────────────────────────────────────────────────────────────────

test("orch: teaching intent untouched (learning_goal passes through to child_copy)", () => {
  const goal = "1/2 + 1/3 的通分計算";
  const r = buildPresentationRequest({ ...validRequest(), learning_goal: goal });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.render_spec.child_copy.includes(goal), `child_copy should contain goal; got: ${r.render_spec.child_copy}`);
});

test("orch: child_copy register differs per band", () => {
  const g1 = buildPresentationRequest({ ...validRequest(), grade: 1 });
  const g5 = buildPresentationRequest({ ...validRequest(), grade: 5 });
  if (!g1.ok || !g5.ok) throw new Error("setup");
  assert.notEqual(g1.render_spec.child_copy, g5.render_spec.child_copy);
});

// ─────────────────────────────────────────────────────────────────────
// Validation rejections
// ─────────────────────────────────────────────────────────────────────

test("orch: rejects non-object input", () => {
  const r = buildPresentationRequest("nope");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "BAD_INPUT");
});

test("orch: rejects bad subject", () => {
  const r = buildPresentationRequest({ ...validRequest(), subject: "physics" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_SUBJECT");
});

test("orch: rejects bad grade (0)", () => {
  const r = buildPresentationRequest({ ...validRequest(), grade: 0 });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_GRADE");
});

test("orch: rejects bad question_type", () => {
  const r = buildPresentationRequest({ ...validRequest(), question_type: "essay" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_QUESTION_TYPE");
});

test("orch: rejects bad representation_type", () => {
  const r = buildPresentationRequest({ ...validRequest(), representation_type: "hologram" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_REPRESENTATION");
});

test("orch: rejects empty learning_goal", () => {
  const r = buildPresentationRequest({ ...validRequest(), learning_goal: "" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_LEARNING_GOAL");
});

test("orch: rejects bad interaction_required", () => {
  const r = buildPresentationRequest({ ...validRequest(), interaction_required: "shout" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_INTERACTION");
});

test("orch: rejects bad hint_level (4)", () => {
  const r = buildPresentationRequest({ ...validRequest(), hint_level: 4 });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error.code, "INVALID_HINT_LEVEL");
});

test("orch: rejects bad hint_level (-1)", () => {
  const r = buildPresentationRequest({ ...validRequest(), hint_level: -1 });
  assert.equal(r.ok, false);
});

// ─────────────────────────────────────────────────────────────────────
// Determinism
// ─────────────────────────────────────────────────────────────────────

test("orch: same input → same output (deterministic)", () => {
  const req = validRequest();
  const r1 = buildPresentationRequest(req);
  const r2 = buildPresentationRequest(req);
  assert.deepEqual(r1, r2);
});

test("orch: visual_priority depends on band", () => {
  const g1 = buildPresentationRequest({ ...validRequest(), grade: 1 });
  const g5 = buildPresentationRequest({ ...validRequest(), grade: 5 });
  if (!g1.ok || !g5.ok) throw new Error("setup");
  // G1-G2 has 'encouragement_glyph'; G5-G6 does not
  assert.ok(g1.render_spec.visual_priority.includes("encouragement_glyph"));
  assert.ok(!g5.render_spec.visual_priority.includes("encouragement_glyph"));
});

test("orch: visual_priority has 'concise_goal_card' for short goals", () => {
  const r = buildPresentationRequest({ ...validRequest(), learning_goal: "分數" });
  if (!r.ok) throw new Error("setup");
  assert.ok(r.render_spec.visual_priority.includes("concise_goal_card"));
});

test("orch: responsive_rules includes mobile_first always", () => {
  for (const grade of [1, 3, 5, 7]) {
    const r = buildPresentationRequest({ ...validRequest(), grade });
    if (!r.ok) throw new Error("setup");
    assert.ok(r.render_spec.responsive_rules.includes("mobile_first"));
  }
});

test("orch: PresentationRequestOrchestrator namespace exposes buildPresentationRequest", () => {
  assert.equal(typeof PresentationRequestOrchestrator.buildPresentationRequest, "function");
});

// ─────────────────────────────────────────────────────────────────────
// Frozen exports
// ─────────────────────────────────────────────────────────────────────

test("orch: VALID_SUBJECTS contains all 5 subjects", () => {
  assert.equal(VALID_SUBJECTS.length, 5);
  assert.ok(VALID_SUBJECTS.includes("math"));
  assert.ok(VALID_SUBJECTS.includes("chinese"));
  assert.ok(VALID_SUBJECTS.includes("english"));
  assert.ok(VALID_SUBJECTS.includes("science"));
  assert.ok(VALID_SUBJECTS.includes("social_studies"));
});

test("orch: VALID_QUESTION_TYPES contains all 8 question types", () => {
  assert.equal(VALID_QUESTION_TYPES.length, 8);
});

test("orch: __TEST__ exposes white-box helpers", () => {
  for (const k of ["pickComponent", "pickLayout", "pickInteractionPattern", "pickVisualPriority", "pickResponsiveRules", "renderChildCopy"]) {
    assert.ok(typeof __TEST__[k] === "function", `__TEST__.${k} missing`);
  }
});