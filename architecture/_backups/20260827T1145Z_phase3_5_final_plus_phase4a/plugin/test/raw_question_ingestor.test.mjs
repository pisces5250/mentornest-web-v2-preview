// test/raw_question_ingestor.test.mjs
// Phase 4A — Raw Question Ingestor unit tests (≥30 tests).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingestRawQuestion,
  makeCandidateId,
  makeIngestionId,
  isValidKind,
  isValidSourceClass,
  isValidLicense,
  computeSignals,
  splitTextIntoBlocks,
  normalizeStructuredQuestions,
  buildCandidate,
  __TEST__,
  VALID_KINDS,
  VALID_SOURCE_CLASSES,
  VALID_LICENSES,
  INGESTION_KIND,
  SOURCE_CLASS,
  LICENSE,
} from "../lib/raw_question_ingestor.mjs";

const STD_META = {
  source_class: SOURCE_CLASS.AI_AUTHORED,
  source_id: "test_batch_42",
  license: LICENSE.AI_ORIGINAL,
};

// ─────────────────────────────────────
// Enumerations
// ─────────────────────────────────────

test("VALID_KINDS contains 4 expected kinds", () => {
  assert.equal(VALID_KINDS.length, 4);
  for (const k of ["text", "structured", "pdf", "image"]) {
    assert.ok(VALID_KINDS.includes(k), `missing kind ${k}`);
  }
});

test("VALID_SOURCE_CLASSES contains 4 expected classes", () => {
  assert.equal(VALID_SOURCE_CLASSES.length, 4);
  for (const c of ["student_private", "ai_authored", "open_license", "teacher_authored"]) {
    assert.ok(VALID_SOURCE_CLASSES.includes(c), `missing source_class ${c}`);
  }
});

test("VALID_LICENSES contains 6 expected licenses", () => {
  assert.equal(VALID_LICENSES.length, 6);
  for (const l of ["AI_ORIGINAL", "AI_ADAPTED", "CC-BY", "CC-BY-SA", "CC0", "PRIVATE"]) {
    assert.ok(VALID_LICENSES.includes(l), `missing license ${l}`);
  }
});

test("isValidKind returns true for valid kinds and false for invalid", () => {
  assert.equal(isValidKind("text"), true);
  assert.equal(isValidKind("structured"), true);
  assert.equal(isValidKind("pdf"), true);
  assert.equal(isValidKind("image"), true);
  assert.equal(isValidKind("bogus"), false);
  assert.equal(isValidKind(""), false);
});

test("isValidSourceClass returns true for valid classes", () => {
  for (const c of VALID_SOURCE_CLASSES) assert.equal(isValidSourceClass(c), true);
  assert.equal(isValidSourceClass("commercial"), false);
  assert.equal(isValidSourceClass(""), false);
});

test("isValidLicense returns true for valid licenses", () => {
  for (const l of VALID_LICENSES) assert.equal(isValidLicense(l), true);
  assert.equal(isValidLicense("PROPRIETARY"), false);
  assert.equal(isValidLicense(""), false);
});

// ─────────────────────────────────────
// computeSignals
// ─────────────────────────────────────

test("computeSignals: question mark detected (ASCII)", () => {
  const s = computeSignals("What is 2+2?");
  assert.equal(s.has_question_mark, true);
  assert.equal(s.has_choice_pattern, false);
  assert.equal(s.has_answer_key, false);
  assert.equal(s.stem_length, 12);
});

test("computeSignals: question mark detected (CJK)", () => {
  const s = computeSignals("水是什麼？");
  assert.equal(s.has_question_mark, true);
  assert.equal(s.stem_length, 5);
});

test("computeSignals: choice pattern A) B) detected", () => {
  const s = computeSignals("A) cat\nB) dog");
  assert.equal(s.has_choice_pattern, true);
});

test("computeSignals: choice pattern (A) (B) detected", () => {
  const s = computeSignals("(A) yes (B) no");
  assert.equal(s.has_choice_pattern, true);
});

test("computeSignals: answer key detected (answer:)", () => {
  const s = computeSignals("stem\nAnswer: 42");
  assert.equal(s.has_answer_key, true);
});

test("computeSignals: answer key detected (答案：)", () => {
  const s = computeSignals("stem\n答案： 圓形");
  assert.equal(s.has_answer_key, true);
});

test("computeSignals: empty text", () => {
  const s = computeSignals("");
  assert.equal(s.has_question_mark, false);
  assert.equal(s.has_choice_pattern, false);
  assert.equal(s.has_answer_key, false);
  assert.equal(s.stem_length, 0);
});

// ─────────────────────────────────────
// splitTextIntoBlocks
// ─────────────────────────────────────

test("splitTextIntoBlocks: single block from single line", () => {
  const blocks = splitTextIntoBlocks("Hello world");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "Hello world");
});

test("splitTextIntoBlocks: two blocks split on blank line", () => {
  const blocks = splitTextIntoBlocks("foo\n\nbar");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, "foo");
  assert.equal(blocks[1].text, "bar");
});

test("splitTextIntoBlocks: three blocks split on numbered prefixes", () => {
  const blocks = splitTextIntoBlocks("1. apple\n2. banana\n3. cherry");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].text, "1. apple");
  assert.equal(blocks[2].text, "3. cherry");
});

test("splitTextIntoBlocks: empty string returns no blocks", () => {
  const blocks = splitTextIntoBlocks("");
  assert.equal(blocks.length, 0);
});

test("splitTextIntoBlocks: returns byte_offset for each block", () => {
  const blocks = splitTextIntoBlocks("first\n\nsecond");
  assert.equal(typeof blocks[0].byte_offset, "number");
  assert.equal(blocks[0].byte_offset >= 0, true);
  assert.ok(blocks[1].byte_offset > blocks[0].byte_offset);
});

test("splitTextIntoBlocks: handles CRLF line endings", () => {
  const blocks = splitTextIntoBlocks("foo\r\n\r\nbar");
  assert.equal(blocks.length, 2);
});

// ─────────────────────────────────────
// normalizeStructuredQuestions
// ─────────────────────────────────────

test("normalizeStructuredQuestions: bare array", () => {
  const items = normalizeStructuredQuestions([{ stem: "x" }, { stem: "y" }]);
  assert.equal(items.length, 2);
});

test("normalizeStructuredQuestions: {questions: [...]}", () => {
  const items = normalizeStructuredQuestions({ questions: [{ stem: "x" }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].stem, "x");
});

test("normalizeStructuredQuestions: {items: [...]} alt key", () => {
  const items = normalizeStructuredQuestions({ items: [{ stem: "y" }] });
  assert.equal(items.length, 1);
});

test("normalizeStructuredQuestions: single object with stem", () => {
  const items = normalizeStructuredQuestions({ stem: "single" });
  assert.equal(items.length, 1);
  assert.equal(items[0].stem, "single");
});

// ─────────────────────────────────────
// makeCandidateId / makeIngestionId / buildCandidate
// ─────────────────────────────────────

test("makeCandidateId returns a string starting with cand_", () => {
  const id = makeCandidateId();
  assert.equal(typeof id, "string");
  assert.ok(id.startsWith("cand_"));
  assert.ok(id.length > 16);
});

test("makeCandidateId is monotonically sortable", () => {
  const a = makeCandidateId(1000);
  const b = makeCandidateId(2000);
  assert.ok(a < b, `${a} should be < ${b}`);
});

test("makeIngestionId returns a unique string", () => {
  const a = makeIngestionId();
  const b = makeIngestionId();
  assert.equal(typeof a, "string");
  assert.ok(a.startsWith("ing_"));
  assert.notEqual(a, b);
});

test("buildCandidate populates all required fields", () => {
  const c = buildCandidate({
    source_kind: INGESTION_KIND.TEXT,
    raw_text: "Why?",
    byte_offset: 0,
    ingestion_id: "ing_test",
    source_class: "ai_authored",
    source_id: "batch_1",
    license: "AI_ORIGINAL",
  });
  assert.equal(typeof c.candidate_id, "string");
  assert.equal(c.source_kind, "text");
  assert.equal(c.raw_text, "Why?");
  assert.equal(c.byte_offset, 0);
  assert.equal(c.ingestion_id, "ing_test");
  assert.equal(c.source_provenance.source_class, "ai_authored");
  assert.match(c.ingested_at, /^20\d\d-\d\d-\d\dT/);
});

// ─────────────────────────────────────
// ingestRawQuestion — text kind
// ─────────────────────────────────────

test("ingestRawQuestion: text kind with multiple questions", () => {
  const r = ingestRawQuestion({
    kind: "text",
    content: "1. 2+3=?\n2. 水的狀態是什麼？\n3. 請說明光合作用。",
    ...STD_META,
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, "text");
  assert.equal(r.raw_question_count, 3);
  assert.equal(r.candidates.length, 3);
  assert.equal(r.warning, null);
});

test("ingestRawQuestion: text kind empty content returns warning", () => {
  const r = ingestRawQuestion({ kind: "text", content: "", ...STD_META });
  assert.equal(r.ok, true);
  assert.equal(r.raw_question_count, 0);
  assert.match(r.warning, /no non-empty/i);
});

test("ingestRawQuestion: text kind requires string content", () => {
  const r = ingestRawQuestion({ kind: "text", content: { not: "string" }, ...STD_META });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "invalid_content_type");
});

// ─────────────────────────────────────
// ingestRawQuestion — structured kind
// ─────────────────────────────────────

test("ingestRawQuestion: structured kind with array input", () => {
  const r = ingestRawQuestion({
    kind: "structured",
    content: [{ stem: "What is 1+1?" }, { stem: "What is 2+2?" }],
    ...STD_META,
  });
  assert.equal(r.ok, true);
  assert.equal(r.raw_question_count, 2);
  assert.equal(r.candidates[0].byte_offset, 0);
  assert.equal(r.candidates[1].byte_offset, 1);
});

test("ingestRawQuestion: structured kind with {questions:...}", () => {
  const r = ingestRawQuestion({
    kind: "structured",
    content: { questions: [{ stem: "x" }, { stem: "y" }] },
    ...STD_META,
  });
  assert.equal(r.ok, true);
  assert.equal(r.raw_question_count, 2);
});

test("ingestRawQuestion: structured kind with empty array fails", () => {
  const r = ingestRawQuestion({
    kind: "structured",
    content: [],
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "no_questions_in_payload");
});

test("ingestRawQuestion: structured kind with non-object content fails", () => {
  const r = ingestRawQuestion({
    kind: "structured",
    content: "a string",
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "invalid_content_type");
});

// ─────────────────────────────────────
// ingestRawQuestion — pdf + image (unsupported_in_round_4a)
// ─────────────────────────────────────

test("ingestRawQuestion: pdf kind returns unsupported_in_round_4a", () => {
  const r = ingestRawQuestion({
    kind: "pdf",
    content: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // %PDF
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "pdf");
  assert.equal(r.raw_question_count, 0);
  assert.equal(r.candidates.length, 0);
  assert.equal(r.errors[0].code, "unsupported_in_round_4a");
  assert.match(r.errors[0].message, /Phase 4A/);
});

test("ingestRawQuestion: pdf kind accepts base64 too", () => {
  const r = ingestRawQuestion({
    kind: "pdf",
    content: Buffer.from("hello").toString("base64"),
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "unsupported_in_round_4a");
});

test("ingestRawQuestion: image kind returns unsupported_in_round_4a", () => {
  const r = ingestRawQuestion({
    kind: "image",
    content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // PNG magic
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "image");
  assert.equal(r.raw_question_count, 0);
  assert.equal(r.candidates.length, 0);
  assert.equal(r.errors[0].code, "unsupported_in_round_4a");
});

test("ingestRawQuestion: image kind rejects non-binary content", () => {
  const r = ingestRawQuestion({
    kind: "image",
    content: { not: "binary" },
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "invalid_content_type");
});

// ─────────────────────────────────────
// ingestRawQuestion — validation
// ─────────────────────────────────────

test("ingestRawQuestion: invalid kind returns invalid_kind error", () => {
  const r = ingestRawQuestion({
    kind: "weird_kind",
    content: "foo",
    ...STD_META,
  });
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, "invalid_kind");
});

test("ingestRawQuestion: invalid source_class returns error", () => {
  const r = ingestRawQuestion({
    kind: "text",
    content: "foo",
    source_class: "commercial",
    source_id: "x",
    license: "AI_ORIGINAL",
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.find((e) => e.code === "invalid_source_class"));
});

test("ingestRawQuestion: missing source_id returns error", () => {
  const r = ingestRawQuestion({
    kind: "text",
    content: "foo",
    source_class: "ai_authored",
    source_id: "",
    license: "AI_ORIGINAL",
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.find((e) => e.code === "missing_source_id"));
});

test("ingestRawQuestion: invalid license returns error", () => {
  const r = ingestRawQuestion({
    kind: "text",
    content: "foo",
    source_class: "ai_authored",
    source_id: "x",
    license: "PROPRIETARY",
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.find((e) => e.code === "invalid_license"));
});

// ─────────────────────────────────────
// Provenance preserved through candidate
// ─────────────────────────────────────

test("ingestRawQuestion: provenance flows into candidate", () => {
  const r = ingestRawQuestion({
    kind: "text",
    content: "What is 2+2?",
    source_class: "open_license",
    source_id: "openstax_alg_1.1",
    license: "CC-BY",
  });
  assert.equal(r.ok, true);
  const prov = r.candidates[0].source_provenance;
  assert.equal(prov.source_class, "open_license");
  assert.equal(prov.source_id, "openstax_alg_1.1");
  assert.equal(prov.license, "CC-BY");
});

test("ingestRawQuestion: candidate_id and ingestion_id are distinct", () => {
  const r = ingestRawQuestion({
    kind: "text",
    content: "1. a?\n\n2. b?",
    ...STD_META,
  });
  assert.equal(r.ok, true);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].ingestion_id, r.candidates[1].ingestion_id);
  assert.notEqual(r.candidates[0].candidate_id, r.candidates[1].candidate_id);
});

test("ingestRawQuestion: ingestion_id matches across all candidates of one call", () => {
  const r = ingestRawQuestion({
    kind: "structured",
    content: [{ stem: "x" }, { stem: "y" }, { stem: "z" }],
    ...STD_META,
  });
  assert.equal(r.ok, true);
  const iid = r.candidates[0].ingestion_id;
  for (const c of r.candidates) {
    assert.equal(c.ingestion_id, iid);
  }
});

test("ingestRawQuestion: __TEST__ asUint8Array handles Uint8Array input", () => {
  const u = new Uint8Array([1, 2, 3]);
  assert.strictEqual(__TEST__.asUint8Array(u), u);
});

test("ingestRawQuestion: __TEST__ asUint8Array handles base64 input", () => {
  const r = __TEST__.asUint8Array(Buffer.from("hello").toString("base64"));
  assert.ok(r instanceof Uint8Array);
  assert.equal(r.length, 5);
});

test("ingestRawQuestion: __TEST__ asUint8Array returns null for garbage", () => {
  const r = __TEST__.asUint8Array({ weird: "object" });
  assert.equal(r, null);
});