// Tests: english_hint_ladder
// Run with: node --test test/english_hint_ladder.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextEnglishHint,
  ENGLISH_HINT_LEVELS,
  ENGLISH_REPRESENTATIONS,
} from "../lib/english_hint_ladder_v1.mjs";

test("ENGLISH_HINT_LEVELS has 5 levels", () => {
  assert.equal(ENGLISH_HINT_LEVELS.length, 5);
  assert.equal(ENGLISH_HINT_LEVELS[0], "none");
  assert.equal(ENGLISH_HINT_LEVELS[4], "full_model_answer");
});

test("ENGLISH_REPRESENTATIONS includes all 4", () => {
  assert.deepEqual(ENGLISH_REPRESENTATIONS, ["text", "phonics", "oral", "visual"]);
});

test("first attempt → level 1 (concept_prompt)", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 1,
  });
  assert.equal(r.level, 1);
  assert.equal(r.level_name, "concept_prompt");
  assert.ok(r.hint_text_en.length > 0);
  assert.ok(r.hint_text_zh.length > 0);
});

test("second attempt → level 2 (scaffolded_question)", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 2,
  });
  assert.equal(r.level, 2);
  assert.equal(r.level_name, "scaffolded_question");
});

test("third/fourth attempt → level 3 (worked_example_partial)", () => {
  for (const a of [3, 4]) {
    const r = nextEnglishHint({ knowledge_point: "english.G3.PHONE.letter-sound", attempts: a });
    assert.equal(r.level, 3, `attempts=${a}`);
    assert.equal(r.level_name, "worked_example_partial");
  }
});

test("fifth+ attempt → level 4 (full_model_answer)", () => {
  const r = nextEnglishHint({ knowledge_point: "english.G3.PHONE.letter-sound", attempts: 5 });
  assert.equal(r.level, 4);
  assert.equal(r.mastery_check_suggested, true);
});

test("phonics error code → phonics representation", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 1,
    error_codes: ["EN-PHON-LS"],
  });
  assert.equal(r.representation_suggestion, "phonics");
  assert.match(r.hint_text_en, /sound/i);
});

test("speaking error code → oral representation", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G5.SPEAK.short-dialog",
    attempts: 1,
    error_codes: ["EN-SPK-PRON"],
  });
  assert.equal(r.representation_suggestion, "oral");
});

test("reading error code → visual representation", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G5.READ.passage-inference",
    attempts: 1,
    error_codes: ["EN-RD-EXP-MISSED"],
  });
  assert.equal(r.representation_suggestion, "visual");
});

test("listening error code → visual representation", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.LIS.basic-listen",
    attempts: 1,
    error_codes: ["EN-LIS-SEG"],
  });
  assert.equal(r.representation_suggestion, "visual");
});

test("transcription error code → text representation (defer to text)", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.SPEAK.basic-phrase",
    attempts: 1,
    error_codes: ["EN-STT-AMBIG"],
  });
  assert.equal(r.representation_suggestion, "text");
  assert.match(r.hint_text_en, /text mode/i);
});

test("hint_history >= 4 escalates level", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 1,
    hint_history: [
      { level: 1, text: "h1" },
      { level: 2, text: "h2" },
      { level: 3, text: "h3" },
      { level: 4, text: "h4" },
    ],
  });
  assert.equal(r.level, 2); // bumped from 1 → 2
});

test("mini_lesson_suggested at level 3+", () => {
  for (const a of [3, 4, 5]) {
    const r = nextEnglishHint({ knowledge_point: "english.G3.PHONE.letter-sound", attempts: a });
    assert.equal(r.mini_lesson_suggested, true, `attempts=${a}`);
  }
});

test("primary_error_code reflects error_codes[0]", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 1,
    error_codes: ["EN-PHON-VT", "EN-PHON-CB"],
  });
  assert.equal(r.primary_error_code, "EN-PHON-VT");
});

test("zh hint text present for phonics errors", () => {
  const r = nextEnglishHint({
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 1,
    error_codes: ["EN-PHON-LS"],
  });
  assert.match(r.hint_text_zh, /發音|字母|唸/);
});
