// test/social_studies_subskill_map.test.mjs — subskill classifier tests

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySocialStudiesSubskill,
  listSocialStudiesSubskills,
} from "../lib/social_studies_subskill_map.mjs";

test("listSocialStudiesSubskills: returns all 9 subskills", () => {
  const subs = listSocialStudiesSubskills();
  assert.ok(subs.length >= 9);
  for (const expected of [
    "history", "geography", "civics", "culture",
    "data_interpretation", "source_comparison", "timeline", "map", "causality",
  ]) {
    assert.ok(subs.includes(expected), `missing subskill: ${expected}`);
  }
});

test("classifySocialStudiesSubskill: TIME/TIMELINE → timeline primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G4.TIME.timeline" });
  assert.equal(out.primary_subskill, "timeline");
});

test("classifySocialStudiesSubskill: HISTORY → history primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G5.HISTORY.taiwan-early" });
  assert.equal(out.primary_subskill, "history");
});

test("classifySocialStudiesSubskill: GEO/REGION → geography primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G4.REGION.taiwan-overview" });
  assert.equal(out.primary_subskill, "geography");
});

test("classifySocialStudiesSubskill: GOV → civics primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G5.GOV.local-rules" });
  assert.equal(out.primary_subskill, "civics");
});

test("classifySocialStudiesSubskill: CULT → culture primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G5.CULT.ethnic" });
  assert.equal(out.primary_subskill, "culture");
});

test("classifySocialStudiesSubskill: DATA/POPULATION → data_interpretation", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G6.DATA.population-pyramid" });
  assert.equal(out.primary_subskill, "data_interpretation");
});

test("classifySocialStudiesSubskill: SRC/PRIMARY → source_comparison", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G6.SRC.primary-secondary" });
  assert.equal(out.primary_subskill, "source_comparison");
});

test("classifySocialStudiesSubskill: CAUSAL → causality primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G5.CAUSAL.multi-cause" });
  assert.equal(out.primary_subskill, "causality");
});

test("classifySocialStudiesSubskill: MAP/PATH → map primary", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G4.MAP.path-route" });
  assert.equal(out.primary_subskill, "map");
});

test("classifySocialStudiesSubskill: empty KP defaults to history", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "" });
  assert.equal(out.primary_subskill, "history");
});

test("classifySocialStudiesSubskill: secondary_subskills is an array (≤ 3)", () => {
  const out = classifySocialStudiesSubskill({ knowledge_point: "social.G4.TIME.timeline" });
  assert.ok(Array.isArray(out.secondary_subskills));
  assert.ok(out.secondary_subskills.length <= 3);
});