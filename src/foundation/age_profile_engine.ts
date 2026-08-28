// src/foundation/age_profile_engine.ts
// Phase 5A — Age Profile Engine.
// Pure module. Resolves the active age profile (G1-G2 / G3-G4 / G5-G6 / G7+)
// from a student grade and an optional UI preference overlay.
//
// HARD INVARIANTS (from Phase 5 product decisions + design registry):
//   - G1-G2 / G3-G4 / G5-G6 / G7+ reserved.
//   - MUST NOT change teaching intent, assessment difficulty, or mastery logic.
//   - Profile values come from architecture/design/age-profiles.yaml (Phase 4 locked).
//   - This module is the ONLY place age-profile selection happens.

export type AgeBand = "G1-G2" | "G3-G4" | "G5-G6" | "G7+";

export interface AgeProfile {
  band: AgeBand;
  min_grade: number;
  max_grade: number;
  typography: {
    base_font_size_px: number;
    body_line_height: number;
    reading_friendly_font: string;
    max_chars_per_line: number;
  };
  touch_target_min_px: number;
  max_simultaneous_actions: number;
  max_visible_choices: number;
  max_nesting_depth: number;
  animation_allowed: boolean;
  mascot_allowed: boolean;
  // R6 icon style: rounded line baseline; duotone only for feedback/progress/hints
  icon_style_baseline: "rounded_line" | "flat_line";
  icon_duotone_for: Array<"feedback" | "progress" | "hints">;
  child_copy_register: "concrete_playful" | "balanced" | "concise_adult_like";
}

const PROFILES: ReadonlyArray<AgeProfile> = Object.freeze([
  Object.freeze({
    band: "G1-G2",
    min_grade: 1,
    max_grade: 2,
    typography: Object.freeze({
      base_font_size_px: 20,
      body_line_height: 1.6,
      reading_friendly_font: "system-ui-rounded, 'PingFang TC', 'Microsoft JhengHei'",
      max_chars_per_line: 24,
    }),
    touch_target_min_px: 56,
    max_simultaneous_actions: 2,
    max_visible_choices: 3,
    max_nesting_depth: 1,
    animation_allowed: true,
    mascot_allowed: true,
    icon_style_baseline: "rounded_line",
    icon_duotone_for: Object.freeze(["feedback", "progress", "hints"]),
    child_copy_register: "concrete_playful",
  }),
  Object.freeze({
    band: "G3-G4",
    min_grade: 3,
    max_grade: 4,
    typography: Object.freeze({
      base_font_size_px: 17,
      body_line_height: 1.5,
      reading_friendly_font: "system-ui, 'PingFang TC', 'Microsoft JhengHei'",
      max_chars_per_line: 36,
    }),
    touch_target_min_px: 48,
    max_simultaneous_actions: 3,
    max_visible_choices: 4,
    max_nesting_depth: 2,
    animation_allowed: true,
    mascot_allowed: true,
    icon_style_baseline: "rounded_line",
    icon_duotone_for: Object.freeze(["feedback", "hints"]),
    child_copy_register: "balanced",
  }),
  Object.freeze({
    band: "G5-G6",
    min_grade: 5,
    max_grade: 6,
    typography: Object.freeze({
      base_font_size_px: 16,
      body_line_height: 1.45,
      reading_friendly_font: "system-ui, 'PingFang TC', 'Microsoft JhengHei'",
      max_chars_per_line: 48,
    }),
    touch_target_min_px: 44,
    max_simultaneous_actions: 4,
    max_visible_choices: 5,
    max_nesting_depth: 2,
    animation_allowed: true,
    mascot_allowed: false, // R6: G5-G6 must not look childish; no mascot
    icon_style_baseline: "rounded_line",
    icon_duotone_for: Object.freeze(["progress"]),
    child_copy_register: "concise_adult_like",
  }),
  Object.freeze({
    band: "G7+",
    min_grade: 7,
    max_grade: 99,
    typography: Object.freeze({
      base_font_size_px: 15,
      body_line_height: 1.4,
      reading_friendly_font: "system-ui",
      max_chars_per_line: 64,
    }),
    touch_target_min_px: 40,
    max_simultaneous_actions: 5,
    max_visible_choices: 6,
    max_nesting_depth: 3,
    animation_allowed: true,
    mascot_allowed: false,
    icon_style_baseline: "rounded_line",
    icon_duotone_for: Object.freeze([]),
    child_copy_register: "concise_adult_like",
  }),
]);

export type UIPreferenceOverlay = {
  simple_vs_lively?: "simple" | "lively";
  animation_tolerance?: "reduced" | "standard" | "enriched";
  font_size_preference?: "smaller" | "default" | "larger";
  character_guidance_preference?: "none" | "minimal" | "rich";
  // R10 (Privacy): license/provenance UI MUST NOT appear in child learning UI.
  // Parent/Admin only.
  hide_provenance?: boolean;
};

export interface AgeProfileResolution {
  band: AgeBand;
  profile: AgeProfile;
  overlay_applied: ReadonlyArray<string>;
  warnings: ReadonlyArray<string>;
}

/**
 * Resolve the active AgeProfile for a given grade.
 *
 * @param grade      1..12 (G7+ covers 7..12)
 * @param overlay    Optional, bounded personalization overlay
 */
export function resolveAgeProfile(grade: number, overlay?: UIPreferenceOverlay): AgeProfileResolution {
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
    throw new Error(`resolveAgeProfile: grade must be integer 1..12 (got ${grade})`);
  }
  const profile = PROFILES.find((p) => grade >= p.min_grade && grade <= p.max_grade);
  if (!profile) throw new Error(`resolveAgeProfile: no profile for grade ${grade}`);

  const applied: string[] = [];
  const warnings: string[] = [];

  // Hard guard: hide_provenance must be enforced for child learning UI (R10).
  if (overlay?.hide_provenance !== true) {
    // Not an error; but document the privacy policy.
    warnings.push("R10: license/provenance UI must never appear in child learning view");
  } else {
    applied.push("hide_provenance=true");
  }

  // Hard guard: G5-G6 must not look childish.
  if (profile.band === "G5-G6" || profile.band === "G7+") {
    if (overlay?.character_guidance_preference === "rich") {
      warnings.push(`R6: character_guidance_preference=rich rejected for ${profile.band}`);
    }
  }

  return {
    band: profile.band,
    profile,
    overlay_applied: Object.freeze(applied),
    warnings: Object.freeze(warnings),
  };
}

/** Frozen profile table for white-box tests. */
export const __TEST__ = Object.freeze({ PROFILES });

export const AgeProfileEngine = Object.freeze({
  resolveAgeProfile,
  PROFILES,
});