// test/foundation/age_profile_engine.test.mjs
// Phase 5A — age_profile_engine unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAgeProfile, PROFILES, __TEST__, AgeProfileEngine } from "../../src/foundation/age_profile_engine.mjs";

test("age: G1 → G1-G2 band", () => {
  const r = resolveAgeProfile(1);
  assert.equal(r.band, "G1-G2");
  assert.equal(r.profile.touch_target_min_px, 56);
});

test("age: G2 → G1-G2 band", () => {
  assert.equal(resolveAgeProfile(2).band, "G1-G2");
});

test("age: G3 → G3-G4 band", () => {
  const r = resolveAgeProfile(3);
  assert.equal(r.band, "G3-G4");
  assert.equal(r.profile.touch_target_min_px, 48);
});

test("age: G4 → G3-G4 band", () => {
  assert.equal(resolveAgeProfile(4).band, "G3-G4");
});

test("age: G5 → G5-G6 band; mascot_allowed=false (R6)", () => {
  const r = resolveAgeProfile(5);
  assert.equal(r.band, "G5-G6");
  assert.equal(r.profile.mascot_allowed, false);
});

test("age: G6 → G5-G6 band", () => {
  assert.equal(resolveAgeProfile(6).band, "G5-G6");
});

test("age: G7 → G7+ band (reserved)", () => {
  assert.equal(resolveAgeProfile(7).band, "G7+");
});

test("age: G12 → G7+ band", () => {
  assert.equal(resolveAgeProfile(12).band, "G7+");
});

test("age: rejects grade 0", () => {
  assert.throws(() => resolveAgeProfile(0), /integer 1\.\.12/);
});

test("age: rejects grade 13", () => {
  assert.throws(() => resolveAgeProfile(13), /integer 1\.\.12/);
});

test("age: rejects non-integer grade", () => {
  assert.throws(() => resolveAgeProfile(3.5), /integer 1\.\.12/);
});

test("age: rejects string grade", () => {
  assert.throws(() => resolveAgeProfile("3"), /integer 1\.\.12/);
});

test("age: 4 profile bands present", () => {
  assert.equal(PROFILES.length, 4);
});

test("age: each profile has required fields", () => {
  for (const p of PROFILES) {
    assert.ok(p.band);
    assert.ok(Number.isInteger(p.min_grade));
    assert.ok(Number.isInteger(p.max_grade));
    assert.ok(p.typography);
    assert.ok(Number.isInteger(p.touch_target_min_px));
    assert.ok(Number.isInteger(p.max_simultaneous_actions));
    assert.ok(Number.isInteger(p.max_visible_choices));
    assert.ok(Number.isInteger(p.max_nesting_depth));
  }
});

test("age: G1-G2 has smaller max_chars_per_line than G5-G6", () => {
  const g1g2 = resolveAgeProfile(1).profile;
  const g5g6 = resolveAgeProfile(5).profile;
  assert.ok(g1g2.typography.max_chars_per_line < g5g6.typography.max_chars_per_line);
});

test("age: G1-G2 has fewer max_visible_choices than G7+", () => {
  const g1g2 = resolveAgeProfile(1).profile;
  const g7 = resolveAgeProfile(7).profile;
  assert.ok(g1g2.max_visible_choices < g7.max_visible_choices);
});

test("age: R10 — hide_provenance=true applies", () => {
  const r = resolveAgeProfile(3, { hide_provenance: true });
  assert.ok(r.overlay_applied.includes("hide_provenance=true"));
  // No R10 warning emitted
  assert.equal(r.warnings.filter((w) => w.includes("R10")).length, 0);
});

test("age: R10 — without overlay, warns that provenance UI must not appear in child learning view", () => {
  const r = resolveAgeProfile(3);
  const w = r.warnings.find((x) => x.includes("R10"));
  assert.ok(w, "expected R10 warning");
});

test("age: R6 — G5-G6 rejects rich character guidance", () => {
  const r = resolveAgeProfile(5, { character_guidance_preference: "rich" });
  assert.ok(r.warnings.some((w) => w.includes("R6")));
});

test("age: R6 — G1-G2 accepts rich character guidance", () => {
  const r = resolveAgeProfile(1, { character_guidance_preference: "rich" });
  assert.equal(r.warnings.filter((w) => w.includes("R6")).length, 0);
});

test("age: icon_style_baseline is 'rounded_line' for every band (R6)", () => {
  for (const band of [1, 3, 5, 7]) {
    assert.equal(resolveAgeProfile(band).profile.icon_style_baseline, "rounded_line");
  }
});

test("age: profiles frozen (cannot be mutated)", () => {
  assert.equal(Object.isFrozen(PROFILES), true);
  for (const p of PROFILES) {
    assert.equal(Object.isFrozen(p), true);
    assert.equal(Object.isFrozen(p.typography), true);
  }
});

test("age: AgeProfileEngine namespace exposes resolveAgeProfile", () => {
  assert.equal(typeof AgeProfileEngine.resolveAgeProfile, "function");
});

test("age: __TEST__ exposes PROFILES", () => {
  assert.ok(__TEST__.PROFILES);
  assert.equal(__TEST__.PROFILES.length, 4);
});