// src/foundation/cognitive_load_scorer.mjs
// Phase 5A — Cognitive Load Scorer.

export function scoreCognitiveLoad(input) {
  const violations = [];
  const warnings = [];
  const p = input.profile;

  if (input.simultaneous_actions > p.max_simultaneous_actions) {
    violations.push(
      `simultaneous_actions=${input.simultaneous_actions} exceeds profile.max_simultaneous_actions=${p.max_simultaneous_actions} for band=${p.band}`,
    );
  }
  if (input.visible_choices > p.max_visible_choices) {
    violations.push(
      `visible_choices=${input.visible_choices} exceeds profile.max_visible_choices=${p.max_visible_choices} for band=${p.band}`,
    );
  }
  if (input.nesting_depth > p.max_nesting_depth) {
    violations.push(
      `nesting_depth=${input.nesting_depth} exceeds profile.max_nesting_depth=${p.max_nesting_depth} for band=${p.band}`,
    );
  }
  const textDensityLimit = p.typography.max_chars_per_line * 6;
  if (input.text_chars_in_view > textDensityLimit) {
    violations.push(
      `text_chars_in_view=${input.text_chars_in_view} exceeds band density limit ${textDensityLimit} (6 lines × ${p.typography.max_chars_per_line} chars)`,
    );
  }
  if (input.competing_emphasis_count > 2) {
    violations.push(`competing_emphasis_count=${input.competing_emphasis_count} exceeds global limit 2`);
  }
  if (input.animation_count > 3) {
    violations.push(`animation_count=${input.animation_count} exceeds global limit 3`);
  }
  if (typeof input.long_paragraph_chars === "number" &&
      input.long_paragraph_chars > p.typography.max_chars_per_line * 2) {
    warnings.push(
      `long paragraph ${input.long_paragraph_chars} chars exceeds 2x line limit (${p.typography.max_chars_per_line * 2}); consider splitting`,
    );
  }

  return {
    ok: violations.length === 0,
    violations: Object.freeze(violations),
    warnings: Object.freeze(warnings),
  };
}

export const CognitiveLoadScorer = Object.freeze({ scoreCognitiveLoad });