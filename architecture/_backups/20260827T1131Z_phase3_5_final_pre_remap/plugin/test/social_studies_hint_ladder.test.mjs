// test/social_studies_hint_ladder.test.mjs — 5-level hint ladder

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_STUDIES_HINT_LEVELS,
  nextSocialStudiesHint,
} from "../lib/social_studies_hint_ladder_v1.mjs";

test("SOCIAL_STUDIES_HINT_LEVELS has 5 entries", () => {
  assert.equal(SOCIAL_STUDIES_HINT_LEVELS.length, 5);
});

test("first hint level is 'no hint' (level 0)", () => {
  assert.equal(SOCIAL_STUDIES_HINT_LEVELS[0], "不需要提示");
});

test("nextSocialStudiesHint: returns level + text + representation", () => {
  const out = nextSocialStudiesHint({
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
  });
  assert.ok(out.level >= 0 && out.level <= 4);
  assert.ok(out.hint_text_zh.length > 0);
  assert.ok(["text", "timeline", "map", "source", "chart"].includes(out.representation_suggestion));
  assert.equal(typeof out.level_name, "string");
});

test("nextSocialStudiesHint: attempts=0 → level 1 (treated as first try)", () => {
  const out = nextSocialStudiesHint({ knowledge_point: "social.G4.TIME.timeline", attempts: 0 });
  assert.equal(out.level, 1);
  assert.equal(out.level_name, "回憶核心概念");
});

test("nextSocialStudiesHint: attempts=1 → level 1 (recall)", () => {
  const out = nextSocialStudiesHint({ knowledge_point: "social.G4.TIME.timeline", attempts: 1 });
  assert.equal(out.level, 1);
  assert.equal(out.level_name, "回憶核心概念");
});

test("nextSocialStudiesHint: attempts=2 → level 2 (steps)", () => {
  const out = nextSocialStudiesHint({ knowledge_point: "social.G4.TIME.timeline", attempts: 2 });
  assert.equal(out.level, 2);
});

test("nextSocialStudiesHint: attempts=3 → level 3 (partial demo)", () => {
  const out = nextSocialStudiesHint({ knowledge_point: "social.G4.TIME.timeline", attempts: 3 });
  assert.equal(out.level, 3);
});

test("nextSocialStudiesHint: attempts=5 → level 4 (full model)", () => {
  const out = nextSocialStudiesHint({ knowledge_point: "social.G4.TIME.timeline", attempts: 5 });
  assert.equal(out.level, 4);
});

test("nextSocialStudiesHint: timeline error code forces timeline representation", () => {
  const out = nextSocialStudiesHint({
    knowledge_point: "social.G5.HISTORY.taiwan-early",
    attempts: 2,
    error_codes: ["SS-TIME-ORDERING"],
  });
  assert.equal(out.representation_suggestion, "timeline");
});

test("nextSocialStudiesHint: map error code forces map representation", () => {
  const out = nextSocialStudiesHint({
    knowledge_point: "social.G4.REGION.taiwan-overview",
    attempts: 1,
    error_codes: ["SS-GEO-COMPASS"],
  });
  assert.equal(out.representation_suggestion, "map");
});

test("nextSocialStudiesHint: data error code forces chart representation", () => {
  const out = nextSocialStudiesHint({
    knowledge_point: "social.G6.DATA.population",
    attempts: 1,
    error_codes: ["SS-DATA-POPULATION-CHART"],
  });
  assert.equal(out.representation_suggestion, "chart");
});

test("nextSocialStudiesHint: source error code forces source representation", () => {
  const out = nextSocialStudiesHint({
    knowledge_point: "social.G6.SRC.primary-secondary",
    attempts: 1,
    error_codes: ["SS-SRC-PRIMARY-SECONDARY"],
  });
  assert.equal(out.representation_suggestion, "source");
});

test("nextSocialStudiesHint: explicit representation honored", () => {
  const out = nextSocialStudiesHint({
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
    representation: "text",
  });
  assert.equal(out.representation_suggestion, "text");
});