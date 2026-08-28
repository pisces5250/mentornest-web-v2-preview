// src/foundation/presentation_request_orchestrator.mjs
// Phase 5A — Presentation Request Orchestrator.
//
// Validates the existing locked presentation_request_v1 contract:
//   subject_specialist -> Child Learning Experience Designer -> render spec.
//
// INPUT (locked Phase 4 contract):
//   { subject, grade, question_type, representation_type,
//     learning_goal, interaction_required, hint_level, accessibility_context }
//
// OUTPUT (locked Phase 4 contract):
//   { component_type, layout, interaction_pattern,
//     visual_priority, responsive_rules, child_copy }
//
// THIS MODULE:
//   - Pure: no DOM, no fetch, no Math.random.
//   - Validates the input contract; rejects unknown / malformed requests.
//   - Resolves the output render spec deterministically from the input.
//   - MUST NOT change teaching intent / assessment difficulty / mastery logic.

import { resolveAgeProfile } from "./age_profile_engine.mjs";

export const VALID_SUBJECTS = Object.freeze(["math", "chinese", "english", "science", "social_studies"]);
export const VALID_QUESTION_TYPES = Object.freeze([
  "multiple_choice", "true_false", "fill_in_blank", "short_answer",
  "matching", "ordering", "drag_drop", "explain_thinking",
]);
export const VALID_REPRESENTATION = Object.freeze([
  "text", "number_line", "fraction_bar", "area_model", "table", "diagram", "none",
]);
export const VALID_INTERACTIONS = Object.freeze([
  "single_tap", "type", "voice", "drag", "draw", "explain",
]);

function isOneOf(value, allowed) {
  return typeof value === "string" && allowed.includes(value);
}

export function buildPresentationRequest(input) {
  const trace = [];

  if (!input || typeof input !== "object") {
    return { ok: false, error: { code: "BAD_INPUT", message: "input must be an object" } };
  }

  if (!isOneOf(input.subject, VALID_SUBJECTS)) {
    return { ok: false, error: { code: "INVALID_SUBJECT", message: `subject must be one of ${VALID_SUBJECTS.join(", ")}` } };
  }
  if (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 12) {
    return { ok: false, error: { code: "INVALID_GRADE", message: "grade must be integer 1..12" } };
  }
  if (!isOneOf(input.question_type, VALID_QUESTION_TYPES)) {
    return { ok: false, error: { code: "INVALID_QUESTION_TYPE", message: `question_type must be one of ${VALID_QUESTION_TYPES.join(", ")}` } };
  }
  if (!isOneOf(input.representation_type, VALID_REPRESENTATION)) {
    return { ok: false, error: { code: "INVALID_REPRESENTATION", message: `representation_type must be one of ${VALID_REPRESENTATION.join(", ")}` } };
  }
  if (typeof input.learning_goal !== "string" || input.learning_goal.length === 0) {
    return { ok: false, error: { code: "INVALID_LEARNING_GOAL", message: "learning_goal must be non-empty string" } };
  }
  if (!isOneOf(input.interaction_required, VALID_INTERACTIONS)) {
    return { ok: false, error: { code: "INVALID_INTERACTION", message: `interaction_required must be one of ${VALID_INTERACTIONS.join(", ")}` } };
  }
  if (![0, 1, 2, 3].includes(input.hint_level)) {
    return { ok: false, error: { code: "INVALID_HINT_LEVEL", message: "hint_level must be 0..3" } };
  }

  trace.push("validated");

  const ageResolution = resolveAgeProfile(input.grade);
  const band = ageResolution.band;

  const component_type = pickComponent(input.question_type, input.interaction_required);
  const layout = pickLayout(band, input.question_type, input.representation_type);
  const interaction_pattern = pickInteractionPattern(input.question_type, input.interaction_required);
  const visual_priority = pickVisualPriority(band, input.learning_goal);
  const responsive_rules = pickResponsiveRules(band);
  const child_copy = renderChildCopy(band, input.learning_goal);

  trace.push(`band=${band}`, `component=${component_type}`);

  return {
    ok: true,
    render_spec: {
      component_type,
      layout,
      interaction_pattern,
      visual_priority: Object.freeze(visual_priority),
      responsive_rules: Object.freeze(responsive_rules),
      child_copy,
      age_band: band,
      trace: Object.freeze(trace),
    },
  };
}

function pickComponent(qt, interaction) {
  if (qt === "multiple_choice") return "MultipleChoice";
  if (qt === "true_false") return "TrueFalse";
  if (qt === "fill_in_blank") return "FillInBlank";
  if (qt === "short_answer") return "ShortAnswer";
  if (qt === "matching") return "Matching";
  if (qt === "ordering") return "Ordering";
  if (qt === "drag_drop") return interaction === "drag" ? "DragDrop" : "DragDropAccessible";
  if (qt === "explain_thinking") return "ExplainThinking";
  return "GenericQuestion";
}

function pickLayout(band, qt, rep) {
  if (band === "G1-G2") return "focus_single_column";
  if (band === "G3-G4") return "balanced_focus";
  if (band === "G5-G6" || band === "G7+") {
    if (qt === "explain_thinking") return "multi_panel_response";
    return "structured_compact";
  }
  if (rep === "fraction_bar" || rep === "number_line" || rep === "area_model") return "visual_primary";
  return "structured_compact";
}

function pickInteractionPattern(qt, interaction) {
  if (qt === "multiple_choice" || qt === "true_false") return "single_tap_choice";
  if (qt === "fill_in_blank" || qt === "short_answer") return interaction === "voice" ? "voice_or_type" : "type_with_keypad";
  if (qt === "matching") return "keyboard_or_drag_match";
  if (qt === "ordering") return "keyboard_or_drag_order";
  if (qt === "drag_drop") return "drag_drop_with_keyboard_fallback"; // R2
  if (qt === "explain_thinking") return "voice_or_text_long_form";
  return "single_tap_choice";
}

function pickVisualPriority(band, goal) {
  const out = [];
  if (band === "G1-G2" || band === "G3-G4") out.push("visual_hint");
  if (goal.length < 30) out.push("concise_goal_card");
  out.push("answer_area");
  if (band === "G1-G2") out.push("encouragement_glyph");
  return out;
}

function pickResponsiveRules(band) {
  const base = ["mobile_first", "tablet_comfortable", "desktop_structured"];
  if (band === "G1-G2") base.push("extra_padding_for_touch");
  if (band === "G5-G6" || band === "G7+") base.push("compact_information_density");
  return base;
}

function renderChildCopy(band, goal) {
  if (band === "G1-G2") return `我們一起：${goal}`;
  if (band === "G3-G4") return `練習：${goal}`;
  if (band === "G5-G6") return `目標：${goal}`;
  return goal;
}

export const __TEST__ = Object.freeze({
  pickComponent,
  pickLayout,
  pickInteractionPattern,
  pickVisualPriority,
  pickResponsiveRules,
  renderChildCopy,
  VALID_SUBJECTS,
  VALID_QUESTION_TYPES,
  VALID_REPRESENTATION,
  VALID_INTERACTIONS,
});

export const PresentationRequestOrchestrator = Object.freeze({ buildPresentationRequest });