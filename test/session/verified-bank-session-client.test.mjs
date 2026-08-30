import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../../src/session/VerifiedBankSessionClient.ts", import.meta.url), "utf8");
const home = await readFile(new URL("../../src/session/ChildHome.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../../src/views/App.tsx", import.meta.url), "utf8");

test("正式 session 從同源 Tutor verified-session endpoint 啟動", () => {
  assert.match(client, /fetch\("\/api\/tutor\/session\/start"/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /X-MentorNest-CSRF/);
  assert.match(home, /useFixtures\s*\?[^:]+buildSession/s);
  assert.match(home, /:\s*await startVerifiedSession/);
});

test("public question 嚴格排除答案、rubric 與未驗證 source", () => {
  assert.match(client, /"expected_answer", "answer", "answer_key", "rubric"/);
  assert.match(client, /source: "verified"/);
  assert.doesNotMatch(client.match(/return \{\n\s*step_id:[\s\S]+?\n\s*\};/)?.[0] ?? "", /expected_answer|answer_key|rubric/);
});

test("五科皆可由 server session 選擇且 fixture 只在明確 opt-in 使用", () => {
  for (const subject of ["math", "english", "chinese", "science", "social_studies"]) {
    assert.match(client, new RegExp(`\\"${subject}\\"`));
    assert.match(home, new RegExp(subject));
  }
  assert.match(app, /env\?\.DEV === true/);
  assert.match(app, /VITE_USE_FIXTURES === "true"/);
});

