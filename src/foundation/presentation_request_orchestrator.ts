// src/foundation/presentation_request_orchestrator.ts
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
//   - Subjects themselves remain authoritative; this module only routes.
//
// Validation outcomes:
//   { ok: true,  render_spec: {...}, trace: [...] }
//   { ok: false, error: { code, message }, trace: [...] }

import { resolveAgeProfile, AgeBand, AgeProfile } from "./age_profile_engine.js";

export type Subject = "math" | "chinese" | "english" | "science" | "social_studies";
export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "fill_in_blank"
  | "short_answer"
  | "matching"
  | "ordering"
  | "drag_drop"
  | "explain_thinking";

export type RepresentationType = "text" | "number_line" | "fraction_bar" | "area_model" | "bar_model" | "table" | "diagram" | "none";

export type InteractionRequired = "single_tap" | "type" | "voice" | "drag" | "draw" | "explain";

export type AccessibilityContext = {
  keyboard_only?: boolean;
  screen_reader?: boolean;
  reduced_motion?: boolean;
  high_contrast?: boolean;
  color_vision_safe?: boolean;
};

export interface PresentationRequest {
  subject: Subject;
  grade: number; // 1..12
  question_type: QuestionType;
  representation_type: RepresentationType;
  learning_goal: string; // free-text subject-specialist-authored goal
  interaction_required: InteractionRequired;
  hint_level: 0 | 1 | 2 | 3;
  accessibility_context?: AccessibilityContext;
}

export interface RenderSpec {
  component_type: string;
  layout: string;
  interaction_pattern: string;
  visual_priority: ReadonlyArray<string>;
  responsive_rules: ReadonlyArray<string>;
  child_copy: string;
  age_band: AgeBand;
  trace: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Subject Specialist allowed surface
// ---------------------------------------------------------------------------

const VALID_SUBJECTS: ReadonlyArray<Subject> = ["math", "chinese", "english", "science", "social_studies"];
const VALID_QUESTION_TYPES: ReadonlyArray<QuestionType> = [
  "multiple_choice", "true_false", "fill_in_blank", "short_answer",
  "matching", "ordering", "drag_drop", "explain_thinking",
];
const VALID_REPRESENTATION: ReadonlyArray<RepresentationType> = [
  "text", "number_line", "fraction_bar", "area_model", "bar_model", "table", "diagram", "none",
];
const VALID_INTERACTIONS: ReadonlyArray<InteractionRequired> = [
  "single_tap", "type", "voice", "drag", "draw", "explain",
];

function isOneOf<T extends string>(value: unknown, allowed: ReadonlyArray<T>): value is T {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build a presentation_request from a Subject Specialist and resolve a
 * Child Learning Experience Designer render spec.
 *
 * Pure: given identical inputs, identical output.
 */
export function buildPresentationRequest(input: unknown): {
  ok: true; render_spec: RenderSpec;
} | {
  ok: false; error: { code: string; message: string };
} {
  const trace: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "input must be an object" } };
  }
  const r = input;

  // field-by-field validation
  if (!isOneOf(r.subject, VALID_SUBJECTS)) {
    return { ok: false, error: { code: "INVALID_SUBJECT", message: `subject must be one of ${VALID_SUBJECTS.join(", ")}` } };
  }
  if (!Number.isInteger(r.grade) || (r.grade as number) < 1 || (r.grade as number) > 12) {
    return { ok: false, error: { code: "INVALID_GRADE", message: "grade must be integer 1..12" } };
  }
  if (!isOneOf(r.question_type, VALID_QUESTION_TYPES)) {
    return { ok: false, error: { code: "INVALID_QUESTION_TYPE", message: `question_type must be one of ${VALID_QUESTION_TYPES.join(", ")}` } };
  }
  if (!isOneOf(r.representation_type, VALID_REPRESENTATION)) {
    return { ok: false, error: { code: "INVALID_REPRESENTATION", message: `representation_type must be one of ${VALID_REPRESENTATION.join(", ")}` } };
  }
  if (typeof r.learning_goal !== "string" || r.learning_goal.length === 0) {
    return { ok: false, error: { code: "INVALID_LEARNING_GOAL", message: "learning_goal must be non-empty string" } };
  }
  if (!isOneOf(r.interaction_required, VALID_INTERACTIONS)) {
    return { ok: false, error: { code: "INVALID_INTERACTION", message: `interaction_required must be one of ${VALID_INTERACTIONS.join(", ")}` } };
  }
  if (![0, 1, 2, 3].includes(r.hint_level as number)) {
    return { ok: false, error: { code: "INVALID_HINT_LEVEL", message: "hint_level must be 0..3" } };
  }

  trace.push("validated");

  // Resolve age band
  const ageResolution = resolveAgeProfile(r.grade as number);
  const band = ageResolution.band;

  // Component selection: locked Phase 4 mapping (deterministic)
  const component_type = pickComponent(r.question_type, r.interaction_required);
  const layout = pickLayout(band, r.question_type, r.representation_type);
  const interaction_pattern = pickInteractionPattern(r.question_type, r.interaction_required);
  const visual_priority = pickVisualPriority(band, r.learning_goal);
  const responsive_rules = pickResponsiveRules(band);
  const child_copy = renderChildCopy(band, r.learning_goal);

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

// ---------------------------------------------------------------------------
// Deterministic picking helpers
// ---------------------------------------------------------------------------

function pickComponent(qt: QuestionType, interaction: InteractionRequired): string {
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

function pickLayout(band: AgeBand, qt: QuestionType, rep: RepresentationType): string {
  // Higher density for older bands; G1-G2 prefers single-column focus.
  if (band === "G1-G2") return "focus_single_column";
  if (band === "G3-G4") return "balanced_focus";
  if (band === "G5-G6" || band === "G7+") {
    if (qt === "explain_thinking") return "multi_panel_response";
    return "structured_compact";
  }
  if (rep === "fraction_bar" || rep === "number_line" || rep === "area_model") return "visual_primary";
  return "structured_compact";
}

function pickInteractionPattern(qt: QuestionType, interaction: InteractionRequired): string {
  if (qt === "multiple_choice" || qt === "true_false") return "single_tap_choice";
  if (qt === "fill_in_blank" || qt === "short_answer") return interaction === "voice" ? "voice_or_type" : "type_with_keypad";
  if (qt === "matching") return "keyboard_or_drag_match";
  if (qt === "ordering") return "keyboard_or_drag_order";
  if (qt === "drag_drop") return "drag_drop_with_keyboard_fallback"; // R2: drag/drop can never be the only way
  if (qt === "explain_thinking") return "voice_or_text_long_form";
  return "single_tap_choice";
}

function pickVisualPriority(band: AgeBand, goal: string): string[] {
  const out: string[] = [];
  if (band === "G1-G2" || band === "G3-G4") out.push("visual_hint");
  if (goal.length < 30) out.push("concise_goal_card");
  out.push("answer_area");
  if (band === "G1-G2") out.push("encouragement_glyph");
  return out;
}

function pickResponsiveRules(band: AgeBand): string[] {
  const base = ["mobile_first", "tablet_comfortable", "desktop_structured"];
  if (band === "G1-G2") base.push("extra_padding_for_touch");
  if (band === "G5-G6" || band === "G7+") base.push("compact_information_density");
  return base;
}

function renderChildCopy(band: AgeBand, goal: string): string {
  // Renderer only — does NOT alter subject-specialist teaching intent.
  // Goal is rendered with a band-appropriate prefix.
  if (band === "G1-G2") return `我們一起：${goal}`;
  if (band === "G3-G4") return `練習：${goal}`;
  if (band === "G5-G6") return `目標：${goal}`;
  return goal;
}

/** Exported for tests / white-box use. */
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

export const PresentationRequestOrchestrator = Object.freeze({
  buildPresentationRequest,
});
