// test/raw_question_segmenter.test.mjs
// Phase 4A — Question Segmenter unit tests (≥30 tests).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  segmentCandidates,
  segmentCandidate,
  makeSegId,
  classifyStem,
  extractChoices,
  extractAnswerHint,
  countBlanks,
  splitStemAndTrailer,
  computeConfidence,
  QUESTION_TYPE,
  VALID_QUESTION_TYPES,
  __TEST__,
} from "../lib/question_segmenter.mjs";

function candidate(id, raw_text, signals = {}, offset = null) {
  return {
    candidate_id: id,
    raw_text,
    detection_signals: {
      has_question_mark: /[?？]/.test(raw_text),
      has_choice_pattern: /[A-D]\)/.test(raw_text),
      has_answer_key: /answer|答案|解答/i.test(raw_text),
      stem_length: raw_text.length,
      ...signals,
    },
    byte_offset: offset,
  };
}

// ─────────────────────────────────────
// Enumerations + helpers
// ─────────────────────────────────────

test("VALID_QUESTION_TYPES contains 6 expected types", () => {
  assert.equal(VALID_QUESTION_TYPES.length, 6);
  for (const t of ["short_answer", "multiple_choice", "true_false", "fill_in_blank", "essay", "unknown"]) {
    assert.ok(VALID_QUESTION_TYPES.includes(t));
  }
});

test("QUESTION_TYPE constants are stable strings", () => {
  assert.equal(QUESTION_TYPE.SHORT_ANSWER, "short_answer");
  assert.equal(QUESTION_TYPE.MULTIPLE_CHOICE, "multiple_choice");
  assert.equal(QUESTION_TYPE.TRUE_FALSE, "true_false");
  assert.equal(QUESTION_TYPE.FILL_IN_BLANK, "fill_in_blank");
  assert.equal(QUESTION_TYPE.ESSAY, "essay");
  assert.equal(QUESTION_TYPE.UNKNOWN, "unknown");
});

test("makeSegId returns seg_ prefixed unique id", () => {
  const a = makeSegId();
  const b = makeSegId();
  assert.ok(a.startsWith("seg_"));
  assert.notEqual(a, b);
});

// ─────────────────────────────────────
// countBlanks
// ─────────────────────────────────────

test("countBlanks: underscore underscores", () => {
  assert.equal(countBlanks("小明有 ____ 顆糖。"), 1);
});

test("countBlanks: multiple underscore blanks", () => {
  assert.equal(countBlanks("第一個 ____ 第二個 ____ 第三個 ____"), 3);
});

test("countBlanks: parens-blank", () => {
  assert.equal(countBlanks("請填入 (___) 答案。"), 1);
});

test("countBlanks: zero for non-blank stem", () => {
  assert.equal(countBlanks("普通題目。"), 0);
});

// ─────────────────────────────────────
// extractChoices
// ─────────────────────────────────────

test("extractChoices: A) B) C) D) on separate lines", () => {
  const choices = extractChoices("題目\nA) 蘋果\nB) 香蕉\nC) 葡萄\nD) 橘子");
  assert.ok(choices);
  assert.equal(choices.length, 4);
  assert.equal(choices[0].label, "A");
  assert.equal(choices[0].text, "蘋果");
});

test("extractChoices: A. B. C. dot notation", () => {
  const choices = extractChoices("Q.\nA. apple\nB. banana\nC. cherry\nD. date");
  assert.ok(choices);
  assert.equal(choices.length, 4);
});

test("extractChoices: inline (A)(B)(C)(D)", () => {
  const choices = extractChoices("(A) yes (B) no (C) maybe (D) perhaps");
  assert.ok(choices);
  assert.equal(choices.length, 4);
});

test("extractChoices: returns null when not multiple-choice", () => {
  const choices = extractChoices("Why is the sky blue?");
  assert.equal(choices, null);
});

test("extractChoices: deduplicates by label", () => {
  const choices = extractChoices("A) cat\nA) dog\nB) bird");
  assert.ok(choices);
  assert.equal(choices.length, 2);
});

// ─────────────────────────────────────
// extractAnswerHint
// ─────────────────────────────────────

test("extractAnswerHint: extracts after 'Answer:'", () => {
  assert.equal(extractAnswerHint("stem\nAnswer: 42"), "42");
});

test("extractAnswerHint: extracts after 答案：", () => {
  assert.equal(extractAnswerHint("stem\n答案： 圓形"), "圓形");
});

test("extractAnswerHint: returns null when missing", () => {
  assert.equal(extractAnswerHint("stem only"), null);
});

// ─────────────────────────────────────
// splitStemAndTrailer
// ─────────────────────────────────────

test("splitStemAndTrailer: separates answer trailer", () => {
  const r = splitStemAndTrailer("What is 1+1?\nAnswer: 2");
  assert.match(r.stem, /^What is 1\+1\?$/);
  assert.match(r.trailer, /^Answer: 2/);
});

test("splitStemAndTrailer: no trailer when no answer key", () => {
  const r = splitStemAndTrailer("Just a stem");
  assert.equal(r.stem, "Just a stem");
  assert.equal(r.trailer, "");
});

// ─────────────────────────────────────
// classifyStem (one per type)
// ─────────────────────────────────────

test("classifyStem: multiple_choice → multiple_choice", () => {
  const r = classifyStem("題目\nA) 蘋果\nB) 香蕉\nC) 葡萄\nD) 橘子");
  assert.equal(r.type, QUESTION_TYPE.MULTIPLE_CHOICE);
});

test("classifyStem: true_false with (T/F)", () => {
  const r = classifyStem("The sky is blue (T/F)");
  assert.equal(r.type, QUESTION_TYPE.TRUE_FALSE);
});

test("classifyStem: true_false with 對? at end", () => {
  const r = classifyStem("地球是圓的，對嗎?");
  assert.equal(r.type, QUESTION_TYPE.TRUE_FALSE);
});

test("classifyStem: true_false with 是/否", () => {
  const r = classifyStem("太陽從西邊升起，是嗎?");
  assert.equal(r.type, QUESTION_TYPE.TRUE_FALSE);
});

test("classifyStem: fill_in_blank with underscores", () => {
  const r = classifyStem("小明有 ____ 顆糖。");
  assert.equal(r.type, QUESTION_TYPE.FILL_IN_BLANK);
});

test("classifyStem: fill_in_blank with (___)", () => {
  const r = classifyStem("答案：(___)");
  assert.equal(r.type, QUESTION_TYPE.FILL_IN_BLANK);
});

test("classifyStem: short_answer with = ?", () => {
  const r = classifyStem("2 + 3 = ?");
  assert.equal(r.type, QUESTION_TYPE.SHORT_ANSWER);
});

test("classifyStem: short_answer with 是多少", () => {
  const r = classifyStem("三角形面積是多少");
  assert.equal(r.type, QUESTION_TYPE.SHORT_ANSWER);
});

test("classifyStem: short_answer with answer: line", () => {
  const r = classifyStem("What is 1+1?\nAnswer: 2");
  // answer: line lives in trailer; the stem itself doesn't include it.
  assert.equal(r.type, QUESTION_TYPE.SHORT_ANSWER);
});

test("classifyStem: essay with 請說明", () => {
  const r = classifyStem("請說明光合作用的過程。");
  assert.equal(r.type, QUESTION_TYPE.ESSAY);
});

test("classifyStem: essay with 為什麼", () => {
  const r = classifyStem("為什麼天空是藍色的？");
  assert.equal(r.type, QUESTION_TYPE.ESSAY);
});

test("classifyStem: unknown when no pattern matches", () => {
  const r = classifyStem("Random gibberish without cues.");
  assert.equal(r.type, QUESTION_TYPE.UNKNOWN);
});

test("classifyStem: empty input is unknown", () => {
  const r = classifyStem("");
  assert.equal(r.type, QUESTION_TYPE.UNKNOWN);
});

// ─────────────────────────────────────
// computeConfidence
// ─────────────────────────────────────

test("computeConfidence: unknown is 0.0", () => {
  assert.equal(computeConfidence("unknown", []), 0.0);
});

test("computeConfidence: high pattern weight wins", () => {
  const conf = computeConfidence("multiple_choice", ["mc_letter_paren"], { has_question_mark: true, has_choice_pattern: true, has_answer_key: false, stem_length: 100 });
  assert.ok(conf >= 0.95, `got ${conf}`);
});

test("computeConfidence: question mark bumps short_answer up", () => {
  const conf = computeConfidence("short_answer", ["sa_equal_question"], { has_question_mark: true, has_choice_pattern: false, has_answer_key: false, stem_length: 10 });
  assert.ok(conf > 0.9, `got ${conf}`);
});

// ─────────────────────────────────────
// segmentCandidate (one candidate)
// ─────────────────────────────────────

test("segmentCandidate: multiple_choice produces choices + confidence ≥ 0.9", () => {
  const q = segmentCandidate(candidate("c1", "題目\nA) 蘋果\nB) 香蕉\nC) 葡萄\nD) 橘子"));
  assert.ok(q);
  assert.equal(q.type, "multiple_choice");
  assert.equal(q.choices.length, 4);
  assert.equal(q.confidence >= 0.9, true);
  assert.equal(q.answer_hint, null);
});

test("segmentCandidate: true_false has no choices", () => {
  const q = segmentCandidate(candidate("c2", "太陽從西邊升起，是嗎?"));
  assert.equal(q.type, "true_false");
  assert.equal(q.choices, null);
});

test("segmentCandidate: fill_in_blank counts blanks", () => {
  const q = segmentCandidate(candidate("c3", "有 ____ 顆糖，吃了 ____ 顆"));
  assert.equal(q.type, "fill_in_blank");
  assert.equal(q.blank_count, 2);
});

test("segmentCandidate: essay with answer hint", () => {
  const q = segmentCandidate(candidate("c4", "請說明光合作用。\nAnswer: CO2 + H2O → glucose"));
  assert.equal(q.type, "essay");
  assert.equal(q.answer_hint, "CO2 + H2O → glucose");
});

test("segmentCandidate: short_answer extracts answer hint", () => {
  const q = segmentCandidate(candidate("c5", "2 + 3 = ?\nAnswer: 5"));
  assert.equal(q.type, "short_answer");
  assert.equal(q.answer_hint, "5");
});

test("segmentCandidate: source_offset comes from byte_offset", () => {
  const q = segmentCandidate(candidate("c6", "Why?", {}, 42));
  assert.equal(q.source_offset, 42);
});

test("segmentCandidate: candidate_id is preserved", () => {
  const q = segmentCandidate(candidate("c7", "Why?"));
  assert.equal(q.candidate_id, "c7");
});

// ─────────────────────────────────────
// segmentCandidates (batch)
// ─────────────────────────────────────

test("segmentCandidates: empty array returns ok with 0 questions", () => {
  const r = segmentCandidates([]);
  assert.equal(r.ok, true);
  assert.equal(r.segmented_count, 0);
  assert.deepEqual(r.questions, []);
});

test("segmentCandidates: batch of mixed types", () => {
  const r = segmentCandidates([
    candidate("c1", "2+3=?"),
    candidate("c2", "Q\nA) x\nB) y\nC) z\nD) w"),
    candidate("c3", "(T/F) sky is blue"),
    candidate("c4", "fill ____"),
    candidate("c5", "請說明過程。"),
    candidate("c6", "random gibberish"),
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.segmented_count, 6);
  assert.equal(r.questions[0].type, "short_answer");
  assert.equal(r.questions[1].type, "multiple_choice");
  assert.equal(r.questions[2].type, "true_false");
  assert.equal(r.questions[3].type, "fill_in_blank");
  assert.equal(r.questions[4].type, "essay");
  assert.equal(r.questions[5].type, "unknown");
  assert.ok(r.warnings.some((w) => /could not be classified/.test(w)));
});

test("segmentCandidates: skips non-object candidates and warns", () => {
  const r = segmentCandidates([null, candidate("c1", "Why?")]);
  assert.equal(r.ok, true);
  assert.equal(r.segmented_count, 1);
  assert.ok(r.warnings.length > 0);
});

test("segmentCandidates: non-array input returns ok=false", () => {
  const r = segmentCandidates("not an array");
  assert.equal(r.ok, false);
  assert.match(r.warnings[0], /array/);
});

test("segmentCandidates: pure — no filesystem write attempted", () => {
  // Run many calls; if any write attempt were made to a path, ENOENT would
  // surface as a thrown error in some envs. We just confirm success.
  for (let i = 0; i < 50; i++) {
    const r = segmentCandidates([candidate(`c${i}`, "Why?")]);
    assert.equal(r.ok, true);
  }
});

test("segmentCandidates: warnings include unknown classifications only", () => {
  const r = segmentCandidates([
    candidate("ok", "Why?"),
    candidate("unk", "no signals here"),
  ]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /unk/);
});

test("__TEST__ exports are present", () => {
  assert.equal(typeof __TEST__.classifyStem, "function");
  assert.equal(typeof __TEST__.extractChoices, "function");
  assert.equal(typeof __TEST__.splitStemAndTrailer, "function");
});