// Tests: production_ai_author
// Run with: node --test test/production_ai_author.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertAuthorPayloadPrivacy,
  buildAuthorPrompt,
  validateAuthorOutput,
  parseModelJson,
  extractOutputText,
  runAuthorOnce,
  createProductionAuthorFn,
} from "../lib/production_ai_author.mjs";

// --- Privacy fence ----------------------------------------------------------

test("assertAuthorPayloadPrivacy: accepts clean payload", () => {
  assert.doesNotThrow(() =>
    assertAuthorPayloadPrivacy({
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.add-unlike-denom",
      question_type: "short_answer",
      difficulty: "medium",
    })
  );
});

test("assertAuthorPayloadPrivacy: rejects display_name at any depth", () => {
  assert.throws(
    () => assertAuthorPayloadPrivacy({
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.x",
      question_type: "short_answer",
      difficulty: "easy",
      display_name: "奐奐",
    }),
    (e) => e.code === "PRIVACY_VIOLATION" && e.forbidden.includes("display_name")
  );
});

test("assertAuthorPayloadPrivacy: rejects nested raw_learning_history", () => {
  assert.throws(
    () => assertAuthorPayloadPrivacy({
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.x",
      question_type: "short_answer",
      difficulty: "easy",
      authoring_constraints: { raw_learning_history: ["session-1"] },
    }),
    (e) => e.code === "PRIVACY_VIOLATION"
  );
});

test("assertAuthorPayloadPrivacy: rejects parent_concerns", () => {
  assert.throws(
    () => assertAuthorPayloadPrivacy({
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.x",
      question_type: "short_answer",
      difficulty: "easy",
      parent_concerns: "注意力不集中",
    }),
    (e) => e.code === "PRIVACY_VIOLATION"
  );
});

test("assertAuthorPayloadPrivacy: rejects school_name", () => {
  assert.throws(
    () => assertAuthorPayloadPrivacy({
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.x",
      question_type: "short_answer",
      difficulty: "easy",
      school_name: "台北市某某國小",
    }),
    (e) => e.code === "PRIVACY_VIOLATION"
  );
});

// --- Prompt building --------------------------------------------------------

test("buildAuthorPrompt: emits system + user + forbidden-key warnings", () => {
  const p = buildAuthorPrompt({
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.x",
    question_type: "short_answer",
    difficulty: "easy",
  });
  assert.match(p.system, /You are a teacher/);
  assert.match(p.user, /knowledge_point:\s*math\.G5\.FRAC\.x/);
  assert.match(p.user, /question_type:\s*short_answer/);
  assert.match(p.user, /difficulty:\s*easy/);
  // System must forbid PII explicitly
  assert.match(p.system, /display_name/);
  assert.match(p.system, /learning history/);
});

test("buildAuthorPrompt: rejects bad question_type", () => {
  assert.throws(() =>
    buildAuthorPrompt({
      subject: "math",
      grade: 5,
      knowledge_point: "x",
      question_type: "essay",
      difficulty: "easy",
    })
  );
});

test("buildAuthorPrompt: rejects bad difficulty", () => {
  assert.throws(() =>
    buildAuthorPrompt({
      subject: "math",
      grade: 5,
      knowledge_point: "x",
      question_type: "short_answer",
      difficulty: "brain-easy",
    })
  );
});

test("buildAuthorPrompt: rejects grade out of range", () => {
  assert.throws(() =>
    buildAuthorPrompt({
      subject: "math",
      grade: 13,
      knowledge_point: "x",
      question_type: "short_answer",
      difficulty: "easy",
    })
  );
});

// --- Output validation ------------------------------------------------------

test("validateAuthorOutput: short_answer passes", () => {
  const o = validateAuthorOutput(
    {
      stem: "1/2 + 1/3 = ?",
      answer: "5/6",
      alt_answers: ["5/6", "10/12"],
      explanation: "通分 6 後分子相加。",
      confidence: 0.9,
    },
    { question_type: "short_answer", knowledge_point: "math.G5.FRAC.x" }
  );
  assert.equal(o.answer, "5/6");
  assert.equal(o.confidence, 0.9);
});

test("validateAuthorOutput: multiple_choice requires choices=4 + numeric answer", () => {
  const ok = validateAuthorOutput(
    {
      stem: "1/2 + 1/3 = ?",
      answer: 1,
      choices: ["1/5", "5/6", "2/5", "3/4"],
      explanation: "通分 6 後 = 5/6。",
      confidence: 0.85,
    },
    { question_type: "multiple_choice", knowledge_point: "math.G5.FRAC.x" }
  );
  assert.equal(ok.answer, 1);
  assert.equal(ok.choices.length, 4);
});

test("validateAuthorOutput: multiple_choice with 3 choices fails", () => {
  assert.throws(() =>
    validateAuthorOutput(
      {
        stem: "1/2 + 1/3 = ?",
        answer: 0,
        choices: ["1/5", "5/6", "2/5"],
        explanation: "x",
        confidence: 0.5,
      },
      { question_type: "multiple_choice", knowledge_point: "x" }
    )
  );
});

test("validateAuthorOutput: true_false requires boolean", () => {
  const ok = validateAuthorOutput(
    {
      stem: "1/2 + 1/3 = 5/6 是對的嗎?",
      answer: true,
      explanation: "通分 6",
      confidence: 0.95,
    },
    { question_type: "true_false", knowledge_point: "x" }
  );
  assert.equal(ok.answer, true);
});

test("validateAuthorOutput: rejects missing explanation", () => {
  assert.throws(() =>
    validateAuthorOutput(
      { stem: "x", answer: "y", confidence: 0.5 },
      { question_type: "short_answer", knowledge_point: "x" }
    )
  );
});

test("validateAuthorOutput: rejects confidence outside [0,1]", () => {
  assert.throws(() =>
    validateAuthorOutput(
      { stem: "x", answer: "y", explanation: "z", confidence: 1.5 },
      { question_type: "short_answer", knowledge_point: "x" }
    )
  );
});

test("validateAuthorOutput: rejects forbidden references in stem", () => {
  assert.throws(
    () =>
      validateAuthorOutput(
        {
          stem: "學生 display_name 在學校的表現",
          answer: "x",
          explanation: "y",
          confidence: 0.5,
        },
        { question_type: "short_answer", knowledge_point: "x" }
      ),
    (e) => e.code === "PRIVACY_VIOLATION"
  );
});

test("validateAuthorOutput: rejects forbidden path-like reference", () => {
  assert.throws(
    () =>
      validateAuthorOutput(
        {
          stem: "請參考 data/learning-records/student_001.jsonl 的紀錄",
          answer: "x",
          explanation: "y",
          confidence: 0.5,
        },
        { question_type: "short_answer", knowledge_point: "x" }
      ),
    (e) => e.code === "PRIVACY_VIOLATION"
  );
});

// --- parseModelJson: malformed JSON recovery --------------------------------

test("parseModelJson: parses plain JSON", () => {
  assert.deepEqual(parseModelJson('{"a":1,"b":[2,3]}'), { a: 1, b: [2, 3] });
});

test("parseModelJson: strips ```json fences", () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("parseModelJson: extracts first JSON object from prose", () => {
  assert.deepEqual(
    parseModelJson('Sure! Here you go: {"stem":"x","answer":"y"}  enjoy'),
    { stem: "x", answer: "y" }
  );
});

test("parseModelJson: throws JSON_PARSE_FAILED on no JSON", () => {
  assert.throws(
    () => parseModelJson("Just prose, no JSON."),
    (e) => e.code === "JSON_PARSE_FAILED"
  );
});

// --- extractOutputText ------------------------------------------------------

test("extractOutputText: extracts from OpenResponses shape", () => {
  const txt = extractOutputText({
    output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "hello" }] },
    ],
  });
  assert.equal(txt, "hello");
});

test("extractOutputText: rejects error payload", () => {
  assert.throws(
    () => extractOutputText({ error: { message: "nope" } }),
    (e) => e.code === "GATEWAY_ERROR"
  );
});

test("extractOutputText: rejects empty output", () => {
  assert.throws(
    () => extractOutputText({ output: [] }),
    (e) => e.code === "EMPTY_RESPONSE"
  );
});

// --- runAuthorOnce: with a stubbed fetch -------------------------------------

test("runAuthorOnce: ok on valid gateway response", async () => {
  const fakeFetch = async (url, init) => {
    assert.match(url, /\/v1\/responses$/);
    assert.match(init.headers.Authorization, /^Bearer /);
    return new Response(
      JSON.stringify({
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"stem":"1/2 + 1/3 = ?","answer":"5/6","alt_answers":["5/6"],"explanation":"通分6","confidence":0.9}' }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const r = await runAuthorOnce(
    {
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.add-unlike-denom",
      question_type: "short_answer",
      difficulty: "easy",
    },
    { gatewayUrl: "http://stub", token: "token-x", fetchImpl: fakeFetch }
  );
  assert.equal(r.ok, true);
  assert.equal(r.output.answer, "5/6");
  assert.equal(r.attempts_used, 1);
});

test("runAuthorOnce: recovers from malformed JSON retry", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls === 1) {
      // First call: bad payload
      return new Response(
        JSON.stringify({
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "this is not json" }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    // Second call: valid
    return new Response(
      JSON.stringify({
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"stem":"1/2 + 1/3 = ?","answer":"5/6","explanation":"x","confidence":0.8}' }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const r = await runAuthorOnce(
    {
      subject: "math",
      grade: 5,
      knowledge_point: "math.G5.FRAC.x",
      question_type: "short_answer",
      difficulty: "easy",
    },
    { gatewayUrl: "http://stub", token: "x", fetchImpl: fakeFetch, maxRetries: 2 }
  );
  assert.equal(r.ok, true);
  assert.equal(r.attempts_used, 2);
});

test("runAuthorOnce: returns ok:false after exhausting retries", async () => {
  const fakeFetch = async () => new Response("nope", { status: 502 });
  const r = await runAuthorOnce(
    {
      subject: "math",
      grade: 5,
      knowledge_point: "x",
      question_type: "short_answer",
      difficulty: "easy",
    },
    { gatewayUrl: "http://stub", token: "x", fetchImpl: fakeFetch, maxRetries: 1 }
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "GATEWAY_TRANSIENT");
});

test("runAuthorOnce: AUTH_MISSING when token is empty", async () => {
  const r = await runAuthorOnce(
    {
      subject: "math",
      grade: 5,
      knowledge_point: "x",
      question_type: "short_answer",
      difficulty: "easy",
    },
    { token: "" }
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "AUTH_MISSING");
});

test("createProductionAuthorFn: returns null on failure (orchestrator's expected shape)", async () => {
  const fakeFetch = async () => new Response("nope", { status: 500 });
  const fn = createProductionAuthorFn({
    gatewayUrl: "http://stub",
    token: "x",
    fetchImpl: fakeFetch,
    maxRetries: 0,
  });
  const out = await fn({ subject: "math", grade: 5, kp: "x", type: "short_answer", difficulty: "easy" });
  assert.equal(out, null);
});

test("createProductionAuthorFn: low confidence -> null", async () => {
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"stem":"x","answer":"y","explanation":"z","confidence":0.1}' }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const fn = createProductionAuthorFn({ gatewayUrl: "http://stub", token: "x", fetchImpl: fakeFetch, maxRetries: 0 });
  const out = await fn({ subject: "math", grade: 5, kp: "x", type: "short_answer", difficulty: "easy" });
  assert.equal(out, null);
});

test("createProductionAuthorFn: ok path with a perfect gateway response", async () => {
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        output: [
          { type: "message", role: "assistant", content: [{ type: "output_text", text: '{"stem":"1/2 + 1/3 = ?","answer":"5/6","alt_answers":["5/6"],"explanation":"x","confidence":0.95}' }] },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const fn = createProductionAuthorFn({ gatewayUrl: "http://stub", token: "x", fetchImpl: fakeFetch, maxRetries: 0 });
  const out = await fn({ subject: "math", grade: 5, kp: "x", type: "short_answer", difficulty: "easy" });
  assert.ok(out);
  assert.equal(out.answer, "5/6");
  assert.equal(out._confidence, 0.95);
});
