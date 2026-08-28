// src/foundation/cognitive_load_scorer.ts
// Phase 5A — Cognitive Load Scorer.
//
// Validates that a proposed component/pattern stays within the active
// age profile's limits. Returns {ok, violations[]} where violations
// contains every breached limit.
//
// Enforced Design Registry limits (from age-profiles.yaml):
//   - simultaneous actions on screen
//   - text density (chars per visible block)
//   - competing emphasis (multiple animated accents)
//   - animation count
//   - number of choices visible
//   - nested UI depth

import { AgeBand, AgeProfile } from "./age_profile_engine.js";

export interface CognitiveLoadInput {
  band: AgeBand;
  profile: AgeProfile;
  simultaneous_actions: number;
  text_chars_in_view: number;
  competing_emphasis_count: number;
  animation_count: number;
  visible_choices: number;
  nesting_depth: number;
  // Optional sanity: long-form text beyond max_chars_per_line per paragraph
  long_paragraph_chars?: number;
}

export interface CognitiveLoadResult {
  ok: boolean;
  violations: ReadonlyArray<string>;
  warnings: ReadonlyArray<string>;
}

/**
 * Score a proposed UI against the active age profile's cognitive load
 * limits. A single breach fails validation; returns ok=false with
 * the violation list so the caller can revise.
 */
export function scoreCognitiveLoad(input: CognitiveLoadInput): CognitiveLoadResult {
  const violations: string[] = [];
  const warnings: string[] = [];
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
  // Text density: chars in view must not exceed band's max_chars_per_line * 6
  const textDensityLimit = p.typography.max_chars_per_line * 6;
  if (input.text_chars_in_view > textDensityLimit) {
    violations.push(
      `text_chars_in_view=${input.text_chars_in_view} exceeds band density limit ${textDensityLimit} (6 lines × ${p.typography.max_chars_per_line} chars)`,
    );
  }
  // Competing emphasis: at most 2 simultaneous animated / colored emphases.
  if (input.competing_emphasis_count > 2) {
    violations.push(
      `competing_emphasis_count=${input.competing_emphasis_count} exceeds global limit 2`,
    );
  }
  // Animation: at most 3 simultaneous animations.
  if (input.animation_count > 3) {
    violations.push(
      `animation_count=${input.animation_count} exceeds global limit 3`,
    );
  }
  // Long paragraph warning (not a hard fail; just an advisory)
  if (
    typeof input.long_paragraph_chars === "number" &&
    input.long_paragraph_chars > p.typography.max_chars_per_line * 2
  ) {
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

export const CognitiveLoadScorer = Object.freeze({
  scoreCognitiveLoad,
});