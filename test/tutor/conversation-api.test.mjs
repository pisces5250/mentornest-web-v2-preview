// test/tutor/conversation-api.test.mjs
//
// Phase 6B — HTTP endpoint contract tests against a live server on
// an ephemeral port.  Uses MENTORNEST_LEARNING_RECORDS_DIR to redirect
// writes to a sandbox directory so production data is never touched.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { shortHash } from "../../server/tutor/conversation-state.mjs";

const SANDBOX_DIR = resolve("/tmp/mentornest-api-test-" + Date.now());
const PORT = 8787 + Math.floor(Math.random() * 200);
let serverOutput = "";

function ledgerPath(studentId) {
  return resolve(SANDBOX_DIR, `${shortHash(studentId)}.jsonl`);
}

function authHeaders(subjectRef) {
  return {
    "Content-Type": "application/json",
    "X-MentorNest-Test-Subject": subjectRef,
    "X-MentorNest-CSRF": "test-csrf",
  };
}

function startServer() {
  const child = spawn(
    "node",
    ["server/open-response.mjs"],
    {
      cwd: resolve("."),
      env: {
        ...process.env,
        PORT: String(PORT),
        MENTORNEST_LEARNING_RECORDS_DIR: SANDBOX_DIR,
        MENTORNEST_AUTH_MODE: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => { serverOutput += chunk; });
  child.stderr.on("data", (chunk) => { serverOutput += chunk; });
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/health`);
      if (r.ok) return;
    } catch (_) {
      /* not ready yet */
    }
    await wait(100);
  }
  throw new Error(`server did not become ready: ${serverOutput.trim() || "沒有 server output"}`);
}

const server = startServer();
await waitForServer();

test("AC1 start -> ok with greeting", async () => {
  const r = await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_api"),
    body: JSON.stringify({
      student_id: "student_test_api",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  });
  assert.equal(r.ok, true);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.ok(data.session.session_id);
  assert.match(data.greeting, /[\u4e00-\u9fff]/);
});

test("AC2 turn -> ok with decision + tts_text", async () => {
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_api"),
    body: JSON.stringify({
      student_id: "student_test_api",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  const r = await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/turn`, {
    method: "POST",
    headers: authHeaders("student_test_api"),
    body: JSON.stringify({
      session_id: s.session.session_id,
      transcript: "Hello teacher how are you",
      turn_index: 1,
    }),
  });
  assert.equal(r.ok, true);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.ok(typeof data.decision.action === "string");
  assert.ok(data.tts_text.length > 0);
  assert.equal(data.turn_index, 1);
});

test("AC3 multiple turns -> increment turn_index", async () => {
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_api"),
    body: JSON.stringify({
      student_id: "student_test_api",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  for (let i = 1; i <= 3; i++) {
    const r = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/turn`, {
      method: "POST",
      headers: authHeaders("student_test_api"),
      body: JSON.stringify({
        session_id: s.session.session_id,
        transcript: `turn ${i} text`,
        turn_index: i,
      }),
    })).json();
    assert.equal(r.ok, true);
    assert.equal(r.turn_index, i);
  }
  await endAndForget(s.session.session_id, "student_test_api");
});

test("AC4 invalid payload -> 400 with envelope", async () => {
  const r = await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_invalid"),
    body: JSON.stringify({ student_id: "", age_band: "G5-G6" }),
  });
  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "kp_required");
});

test("安全：body student_id 不得覆寫 authenticated subject", async () => {
  const authenticated = "student_test_authenticated";
  const spoofed = "student_test_spoofed";
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders(authenticated),
    body: JSON.stringify({
      student_id: spoofed,
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  assert.equal(s.ok, true);
  await endAndForget(s.session.session_id, authenticated);
  assert.ok(existsSync(ledgerPath(authenticated)));
  assert.equal(existsSync(ledgerPath(spoofed)), false);
});

test("AC5 end -> summary written to sandbox, not to production", async () => {
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_api_summary"),
    body: JSON.stringify({
      student_id: "student_test_api_summary",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/turn`, {
    method: "POST",
    headers: authHeaders("student_test_api_summary"),
    body: JSON.stringify({
      session_id: s.session.session_id,
      transcript: "I see a cat",
      turn_index: 1,
    }),
  })).json();
  const e = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/end`, {
    method: "POST",
    headers: authHeaders("student_test_api_summary"),
    body: JSON.stringify({ session_id: s.session.session_id }),
  })).json();
  assert.equal(e.ok, true);
  assert.equal(e.summary.turn_count, 1);
  assert.equal(e.memory_write?.accepted, true);
  assert.ok(existsSync(ledgerPath("student_test_api_summary")));
});

test("AC6 transcript never appears in summary (privacy)", async () => {
  const secret = "qwerty_secret_phrase_zxcvbn";
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_privacy_check"),
    body: JSON.stringify({
      student_id: "student_test_privacy_check",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/turn`, {
    method: "POST",
    headers: authHeaders("student_test_privacy_check"),
    body: JSON.stringify({
      session_id: s.session.session_id,
      transcript: secret,
      turn_index: 1,
    }),
  })).json();
  await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/end`, {
    method: "POST",
    headers: authHeaders("student_test_privacy_check"),
    body: JSON.stringify({ session_id: s.session.session_id }),
  })).json();

  const { readFileSync } = await import("node:fs");
  const contents = readFileSync(
    ledgerPath("student_test_privacy_check"),
    "utf8",
  );
  assert.ok(!contents.includes(secret), "transcript leaked into learning record");
});

test("AC7 ring buffer depth: 5-turn session evicts oldest", async () => {
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_ring_buffer"),
    body: JSON.stringify({
      student_id: "student_test_ring_buffer",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  for (let i = 1; i <= 7; i++) {
    const r = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/turn`, {
      method: "POST",
      headers: authHeaders("student_test_ring_buffer"),
      body: JSON.stringify({
        session_id: s.session.session_id,
        transcript: `turn ${i}`,
        turn_index: i,
      }),
    })).json();
    assert.equal(r.ok, true);
  }
  await endAndForget(s.session.session_id, "student_test_ring_buffer");
});

test("AC8 turn_after_end -> session_ended 410", async () => {
  const s = await (await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/start`, {
    method: "POST",
    headers: authHeaders("student_test_ended_session"),
    body: JSON.stringify({
      student_id: "student_test_ended_session",
      knowledge_point: "english.G5.CONV.free-conversation",
      age_band: "G5-G6",
    }),
  })).json();
  await endAndForget(s.session.session_id, "student_test_ended_session");
  const r = await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/turn`, {
    method: "POST",
    headers: authHeaders("student_test_ended_session"),
    body: JSON.stringify({
      session_id: s.session.session_id,
      transcript: "late",
      turn_index: 1,
    }),
  });
  assert.equal(r.status, 410);
  const data = await r.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "session_ended");
});

async function endAndForget(sid, subjectRef) {
  await fetch(`http://localhost:${PORT}/api/tutor/english-conversation/end`, {
    method: "POST",
    headers: authHeaders(subjectRef),
    body: JSON.stringify({ session_id: sid }),
  });
}

test.after(async () => {
  server.kill("SIGTERM");
  await wait(200);
  try {
    rmSync(SANDBOX_DIR, { recursive: true, force: true });
  } catch (_) {
    /* swallow */
  }
});
