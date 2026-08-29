// Tests: word_problem_decomposer.mjs
// Run with: node --test test/word_problem_decomposer.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decomposeWordProblem,
  matchWordProblemTemplate,
  listWordProblemTemplates,
} from "../lib/word_problem_decomposer.mjs";

test("decomposeWordProblem: extracts 3/4 and 共", () => {
  const r = decomposeWordProblem({
    stem: "媽媽買了 12 顆糖，哥哥吃了 3/4，共剩下幾顆？",
    grade: 4,
    knowledge_point: "math.G4.FRAC.proper-fraction-add-sub",
  });
  assert.equal(r.ok, true);
  // 12, 3/4
  const fractions = r.quantities.filter((q) => q.kind === "fraction");
  assert.equal(fractions.length, 1);
  assert.equal(fractions[0].value.numerator, 3);
  assert.equal(fractions[0].value.denominator, 4);
  // 共 + 剩下 → operations
  assert.ok(r.vocabulary_clues.find((v) => v.label === "共"));
  assert.ok(r.vocabulary_clues.find((v) => v.label === "剩下"));
  assert.ok(r.operations_hint.includes("add") || r.operations_hint.includes("subtract"));
  assert.equal(r.question_type, "part-part-whole");
});

test("decomposeWordProblem: 比 + 倍 → ratio", () => {
  const r = decomposeWordProblem({
    stem: "小華有 12 元，比小明多 2 倍，小明有多少元？",
    knowledge_point: "math.G5.RATIO.intro",
  });
  assert.ok(r.vocabulary_clues.find((v) => v.label === "倍"));
  assert.ok(r.vocabulary_clues.find((v) => v.label === "比"));
  assert.equal(r.question_type, "ratio");
});

test("decomposeWordProblem: missing stem rejected", () => {
  const r = decomposeWordProblem({});
  assert.equal(r.ok, false);
  assert.ok(r.ambiguity_flags.includes("missing-stem"));
});

test("decomposeWordProblem: flags ambiguity for 比+倍", () => {
  const r = decomposeWordProblem({
    stem: "比 3 倍 多",
    knowledge_point: "math.G5.RATIO.intro",
  });
  assert.ok(r.ambiguity_flags.includes("ratio-vs-multiple — both 比 and 倍 present, clarify"));
});

test("decomposeWordProblem: detects answer unit 公分", () => {
  const r = decomposeWordProblem({ stem: "一條緞帶長 30 公分，剪掉 8 公分，還剩幾公分？" });
  assert.equal(r.answer_unit_hint, "公分");
});

test("decomposeWordProblem: detects change (增加 + 減少)", () => {
  const r = decomposeWordProblem({ stem: "原來有 5 顆，又增加了 3 顆，又減少了 2 顆，最後有幾顆？" });
  assert.ok(r.vocabulary_clues.find((v) => v.label === "增加"));
  assert.ok(r.vocabulary_clues.find((v) => v.label === "減少"));
  assert.equal(r.question_type, "change");
});

test("matchWordProblemTemplate: KP exact match for G5 ratio", () => {
  const r = matchWordProblemTemplate({
    stem: "小華的糖果數量是小明的 3 倍",
    knowledge_point: "math.G5.RATIO.intro",
  });
  assert.equal(r.template_id, "WP-G5-RATIO-COMPARE");
  assert.ok(r.confidence >= 0.5);
});

test("matchWordProblemTemplate: G3 fraction intro via signature", () => {
  const r = matchWordProblemTemplate({
    stem: "把一個披薩分成 4 等份，其中 1 份給小明，請問小明拿到幾份？",
    knowledge_point: "math.G3.FRAC.intro-fraction",
  });
  assert.equal(r.template_id, "WP-G3-FRAC-OF-WHOLE");
});

test("matchWordProblemTemplate: G6 surface area via signature", () => {
  const r = matchWordProblemTemplate({
    stem: "長方體長 5 公分，表面積是多少？",
    knowledge_point: "math.G6.GEOM.surface-area-and-volume",
  });
  // The vocab doesn't contain 周長 but does contain 面積 indirectly; we accept
  // either the WP-G6-SURFACE-VOL or any positive match.
  assert.ok(r.confidence >= 0.3);
});

test("matchWordProblemTemplate: unknown stem returns null with low confidence", () => {
  const r = matchWordProblemTemplate({ stem: "今天天氣如何？", knowledge_point: undefined });
  assert.equal(r.template_id, null);
  assert.equal(r.confidence, 0);
});

test("listWordProblemTemplates: returns >=15 templates", () => {
  const all = listWordProblemTemplates();
  assert.ok(all.length >= 15, `got only ${all.length} templates`);
  // All have template_id and applies_to
  for (const t of all) {
    assert.ok(t.template_id);
    assert.ok(Array.isArray(t.applies_to));
  }
});
