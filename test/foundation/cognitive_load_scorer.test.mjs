// test/foundation/cognitive_load_scorer.test.mjs
// Phase 5A — cognitive_load_scorer unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCognitiveLoad, CognitiveLoadScorer } from "../../src/foundation/cognitive_load_scorer.mjs";
import { resolveAgeProfile } from "../../src/foundation/age_profile_engine.mjs";

const g1 = resolveAgeProfile(1);
const g3 = resolveAgeProfile(3);
const g5 = resolveAgeProfile(5);
const g7 = resolveAgeProfile(7);

function loadFor(band) {
  return {
    band: band.band,
    profile: band.profile,
    simultaneous_actions: 1,
    text_chars_in_view: 30,
    competing_emphasis_count: 0,
    animation_count: 0,
    visible_choices: 2,
    nesting_depth: 1,
  };
}

test("load: within G1-G2 limits → ok=true", () => {
  const r = scoreCognitiveLoad(loadFor(g1));
  assert.equal(r.ok, true);
  assert.equal(r.violations.length, 0);
});

test("load: G1-G2 max_simultaneous_actions=2; 3 actions → violation", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g1), simultaneous_actions: 3 });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("simultaneous_actions")));
});

test("load: G3-G4 max_visible_choices=4; 5 choices → violation", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g3), visible_choices: 5 });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("visible_choices")));
});

test("load: G5-G6 max_nesting_depth=2; 3 depth → violation", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g5), nesting_depth: 3 });
  assert.equal(r.ok, false);
});

test("load: G7+ allows up to 5 simultaneous actions", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g7), simultaneous_actions: 5 });
  assert.equal(r.ok, true);
});

test("load: text_chars_in_view > 6×max_chars_per_line → violation", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g1), text_chars_in_view: 200 });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("text_chars_in_view")));
});

test("load: competing_emphasis_count > 2 → violation", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g3), competing_emphasis_count: 3 });
  assert.equal(r.ok, false);
});

test("load: animation_count > 3 → violation", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g3), animation_count: 5 });
  assert.equal(r.ok, false);
});

test("load: long_paragraph_chars > 2×max_chars_per_line → warn (not error)", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g3), long_paragraph_chars: 100 });
  assert.equal(r.ok, true); // warn does not fail
  assert.ok(r.warnings.some((w) => w.includes("long paragraph")));
});

test("load: empty/zero input → ok (under limits)", () => {
  const r = scoreCognitiveLoad({ band: "G3-G4", profile: g3.profile, simultaneous_actions: 0, text_chars_in_view: 0, competing_emphasis_count: 0, animation_count: 0, visible_choices: 0, nesting_depth: 0 });
  assert.equal(r.ok, true);
});

test("load: multiple violations all reported", () => {
  const r = scoreCognitiveLoad({ ...loadFor(g1), simultaneous_actions: 99, visible_choices: 99, animation_count: 99 });
  assert.equal(r.ok, false);
  assert.ok(r.violations.length >= 3);
});

test("load: CognitiveLoadScorer namespace exposes scoreCognitiveLoad", () => {
  assert.equal(typeof CognitiveLoadScorer.scoreCognitiveLoad, "function");
});