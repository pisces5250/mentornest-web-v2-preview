import test from "node:test";
import assert from "node:assert/strict";
import {
  makeQuestionId,
  parseQuestionId,
  SOURCE_CLASS,
  VALID_SOURCE_CLASSES,
} from "../lib/question_id.mjs";

test("makeQuestionId accepts ai_authored and parses back", () => {
  const id = makeQuestionId({
    source_class: SOURCE_CLASS.AI_AUTHORED,
    source_id: "batch-1",
    kp: "math.G5.FRAC.add-unlike-denom",
  });
  const p = parseQuestionId(id);
  assert.ok(p);
  assert.equal(p.source_class, "ai_authored");
  assert.equal(p.kp, "math.G5.FRAC.add-unlike-denom");
});

test("VALID_SOURCE_CLASSES does NOT include commercial publisher class", () => {
  assert.deepEqual(
    [...VALID_SOURCE_CLASSES].sort(),
    ["ai_authored", "open_license", "student_private", "teacher_authored"].sort()
  );
  // explicitly: no "commercial" or "publisher" class allowed
  assert.ok(!VALID_SOURCE_CLASSES.includes("commercial"));
});

test("makeQuestionId rejects invalid source_class", () => {
  assert.throws(() =>
    makeQuestionId({ source_class: "commercial", source_id: "x", kp: "math.G5.FRAC.add-unlike-denom" })
  );
});

test("makeQuestionId rejects malformed kp", () => {
  assert.throws(() =>
    makeQuestionId({ source_class: "ai_authored", source_id: "x", kp: "math.G5.add" })
  );
});

test("makeQuestionId rejects empty source_id", () => {
  assert.throws(() =>
    makeQuestionId({ source_class: "ai_authored", source_id: "", kp: "math.G5.FRAC.add-unlike-denom" })
  );
});

test("parseQuestionId returns null for malformed id", () => {
  assert.equal(parseQuestionId("not-an-id"), null);
  assert.equal(parseQuestionId(null), null);
});
