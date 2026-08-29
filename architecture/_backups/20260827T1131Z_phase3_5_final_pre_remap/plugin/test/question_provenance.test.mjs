import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProvenance,
  validateProvenance,
  hashPrompt,
} from "../lib/question_provenance.mjs";

test("buildProvenance: AI_ORIGINAL", () => {
  const p = buildProvenance({
    source_class: "ai_authored",
    source_id: "batch-1",
    license: "AI_ORIGINAL",
    generated_by: "mentornest_ai",
    prompt: "Generate a fraction addition problem",
  });
  assert.equal(p.source_class, "ai_authored");
  assert.equal(p.license, "AI_ORIGINAL");
  assert.equal(p.generated_by, "mentornest_ai");
  assert.match(p.generated_at, /^2026-08-27T/);
  assert.match(p.prompt_hash, /^[0-9a-f]{16}$/);
  assert.equal(p.parent_question_id, undefined);
});

test("buildProvenance: AI_ADAPTED requires parent_question_id", () => {
  assert.throws(() =>
    buildProvenance({
      source_class: "ai_authored",
      source_id: "batch-1",
      license: "AI_ADAPTED",
      generated_by: "mentornest_ai",
    })
  );
  const p = buildProvenance({
    source_class: "ai_authored",
    source_id: "batch-1",
    license: "AI_ADAPTED",
    generated_by: "mentornest_ai",
    parent_question_id: "q.open_license.math.G5.FRAC.add-unlike-denom.aaaa",
  });
  assert.equal(p.parent_question_id, "q.open_license.math.G5.FRAC.add-unlike-denom.aaaa");
});

test("validateProvenance: ok for complete", () => {
  const p = buildProvenance({
    source_class: "ai_authored",
    source_id: "b",
    license: "AI_ORIGINAL",
    generated_by: "mentornest_ai",
    prompt: "x",
  });
  assert.deepEqual(validateProvenance(p), { ok: true });
});

test("validateProvenance: rejects missing field", () => {
  const r = validateProvenance({ source_class: "ai_authored" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing/);
});

test("validateProvenance: rejects non-ISO timestamp", () => {
  const r = validateProvenance({
    source_class: "ai_authored",
    source_id: "b",
    license: "AI_ORIGINAL",
    generated_by: "x",
    generated_at: "yesterday",
    prompt_hash: "abcdef0123456789",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /ISO/);
});

test("validateProvenance: rejects bad prompt_hash length", () => {
  const r = validateProvenance({
    source_class: "ai_authored",
    source_id: "b",
    license: "AI_ORIGINAL",
    generated_by: "x",
    generated_at: "2026-08-27T00:00:00.000Z",
    prompt_hash: "abcdef",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /prompt_hash/);
});

test("hashPrompt is deterministic for identical input", () => {
  const a = hashPrompt("hello world");
  const b = hashPrompt("hello world");
  const c = hashPrompt("hello world!");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
});
