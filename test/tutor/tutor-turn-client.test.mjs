import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Tutor turn adapter 對齊 server authority 與 writer receipts", async () => {
  const source = await readFile(new URL("../../src/tutor/TutorTurnClient.ts", import.meta.url), "utf8");
  assert.match(source, /data\.judgement/);
  assert.match(source, /data\.assessment_evidence/);
  assert.match(source, /data\.memory_write/);
  assert.match(source, /throw new Error/);
});

test("一般題型不在 browser 讀取 expected_answer 判分", async () => {
  const source = await readFile(new URL("../../src/session/QuestionRenderer.tsx", import.meta.url), "utf8");
  const generalQuestionSection = source.slice(source.indexOf("function MultipleChoiceSubtree"), source.indexOf("function OpenResponseSubtree"));
  assert.doesNotMatch(generalQuestionSection, /expected_answer/);
  assert.doesNotMatch(generalQuestionSection, /validateKeypadAnswer/);
});

test("孩子流程沒有直接跳題入口", async () => {
  const source = await readFile(new URL("../../src/session/SessionView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /skip-question|跳過這題/);
});

test("public fixtures 與 adapter 不攜帶 browser answer key", async () => {
  const paths = [
    "../../src/session/fixtures.mjs",
    "../../src/session/fixtures_p5c2.mjs",
    "../../src/session/learning-director-adapter.mjs",
    "../../src/session/learning_backend_adapter.mjs",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /expected_answer\s*:/, `${path} 不得輸出 answer key`);
  }
});

test("next_step parser 使用 allowlist 並拒絕答案欄位", async () => {
  const source = await readFile(new URL("../../src/tutor/TutorTurnClient.ts", import.meta.url), "utf8");
  assert.match(source, /NEXT_STEP_FIELDS/);
  assert.match(source, /Tutor next_step 含有非公開答案欄位/);
  assert.doesNotMatch(source.match(/NEXT_STEP_FIELDS = \[[^\]]+\]/s)?.[0] ?? "", /expected_answer|answer_key|rubric/);
});
