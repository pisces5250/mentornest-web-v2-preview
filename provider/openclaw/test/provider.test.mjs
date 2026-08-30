import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.mjs";
import { createProviderServer } from "../src/app.mjs";
import { createServiceToken } from "../../../server/auth/session-auth.mjs";

const SERVICE_AUTH_KEY = "synthetic-openclaw-service-auth-key-32-characters";
const DIGEST = `ghcr.io/example/provider@sha256:${"a".repeat(64)}`;

function environment(overrides = {}) {
  return {
    MENTORNEST_ENV: "staging",
    MENTORNEST_DATA_NAMESPACE: "student-test-staging-p09",
    MENTORNEST_DATA_ROOT: "/tmp/mentornest-provider-test",
    MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA: "false",
    OPENCLAW_SERVICE_AUTH_KEY: SERVICE_AUTH_KEY,
    OPENCLAW_IMAGE_DIGEST: DIGEST,
    PORT: "18789",
    ...overrides,
  };
}

async function start(config) {
  const server = createProviderServer(config);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { server, baseUrl };
}

function credential({ subjectRef = "service_readiness", audience = "openclaw-learning", ttlSeconds = 60, scopes } = {}) {
  return createServiceToken({ subjectRef, audience, ttlSeconds, scopes }, SERVICE_AUTH_KEY);
}

const assessmentInput = Object.freeze({
  assessment_kind: "diagnostic",
  subject: "math",
  knowledge_point: "fake-kp",
  instrument: { question_id: "q.fake.verified", verification_status: "verified", answer_key_version: "key-v1" },
  attempt: { response_id: "response.fake.001", result: "correct", hints_used: 0, first_attempt: true, occurred_at: "2026-08-30T00:00:00Z" },
});

async function request(baseUrl, route, { token = credential(), method = "GET", body } = {}) {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
}

test("啟動設定對缺少namespace、production path與mutable image fail-closed", () => {
  assert.throws(() => loadConfig(environment({ MENTORNEST_DATA_NAMESPACE: "" })), /MENTORNEST_DATA_NAMESPACE/);
  assert.throws(() => loadConfig(environment({ MENTORNEST_DATA_NAMESPACE: "production-students" })), /namespace/);
  assert.throws(() => loadConfig(environment({ MENTORNEST_DATA_NAMESPACE: "..\/..\/staging-escape" })), /namespace/);
  assert.throws(() => loadConfig(environment({ MENTORNEST_DATA_ROOT: "/data/production/learning" })), /production path/);
  assert.throws(() => loadConfig(environment({ MENTORNEST_DATA_ROOT: "/home/node/.openclaw/workspace/data" })), /歷史 production workspace/);
  assert.throws(() => loadConfig(environment({ MENTORNEST_DATA_ROOT: "" })), /MENTORNEST_DATA_ROOT/);
  assert.throws(() => loadConfig(environment({ OPENCLAW_IMAGE_DIGEST: "provider:latest" })), /immutable digest/);
  assert.throws(() => loadConfig(environment({ MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA: "true" })), /必須明確設為 false/);
});

test("四項capability與dependency成立時readiness才成功", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-provider-ready-p09-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = await start(loadConfig(environment({ MENTORNEST_DATA_ROOT: root })));
  t.after(() => runtime.server.close());

  const readiness = await request(runtime.baseUrl, "/readyz");
  assert.equal(readiness.status, 200);
  const body = await readiness.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.capabilities, [
    "learning_director.recommend",
    "assessment.submit_observation",
    "learning_memory.append_observation",
    "verified_bank.read",
  ]);
  assert.equal(body.production_data_allowed, false);
  assert.equal(body.data_namespace, "student-test-staging-p09");
  assert.deepEqual(body.missing_capabilities, []);
  assert.deepEqual(body.dependencies, [{ name: "staging_data_root", ready: true }]);

  const discovery = await request(runtime.baseUrl, "/v1/capabilities");
  const discovered = await discovery.json();
  assert.equal(discovered.capabilities.length, 4);
  assert.equal(discovered.capabilities.find((item) => item.name === "assessment.submit_observation").status, "available");
  assert.equal(discovered.capabilities.find((item) => item.name === "assessment.submit_observation").implementation, "native");
  assert.equal(discovered.capabilities.find((item) => item.name === "verified_bank.read").implementation, "adapter");
  assert.ok(discovered.capabilities.every((item) => item.contract_version === "1"));
});

test("錯誤credential、contract mismatch、unknown及Assessment缺scope皆拒絕", async (t) => {
  const runtime = await start(loadConfig(environment()));
  t.after(() => runtime.server.close());

  assert.equal((await request(runtime.baseUrl, "/readyz", { token: "wrong-token-with-at-least-32-characters" })).status, 401);
  assert.equal((await request(runtime.baseUrl, "/readyz", { token: credential({ audience: "voice-backend" }) })).status, 401);
  assert.equal((await request(runtime.baseUrl, "/readyz", { token: credential({ ttlSeconds: -1 }) })).status, 401);
  assert.equal((await request(runtime.baseUrl, "/readyz", { token: credential({ ttlSeconds: 3600 }) })).status, 401);
  const signed = credential();
  assert.equal((await request(runtime.baseUrl, "/readyz", { token: `${signed.slice(0, -1)}x` })).status, 401);
  const base = { contract_version: "1", subject_ref: "student_test_p09", input: {} };
  assert.equal((await request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09" }), method: "POST", body: { ...base, contract_version: "2", capability: "learning_memory.append_observation" },
  })).status, 409);
  assert.equal((await request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09" }), method: "POST", body: { ...base, capability: "not.registered" },
  })).status, 403);
  assert.equal((await request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09" }), method: "POST",
    body: { ...base, capability: "assessment.submit_observation", input: assessmentInput },
  })).status, 403);
  assert.equal((await request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09", scopes: ["service:invoke", "capability:verified_bank.read"] }), method: "POST",
    body: { ...base, capability: "learning_memory.append_observation", input: { observation: { kind: "synthetic_attempt" } } },
  })).status, 403);
});

test("Assessment observation是verified-only、deterministic且不寫mastery", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-assessment-p010-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = await start(loadConfig(environment({ MENTORNEST_DATA_ROOT: root })));
  t.after(() => runtime.server.close());
  const token = credential({
    subjectRef: "student_test_p010",
    scopes: ["service:invoke", "capability:assessment.submit_observation"],
  });
  const invoke = (input) => request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token, method: "POST", body: {
      contract_version: "1", capability: "assessment.submit_observation",
      subject_ref: "student_test_p010", input,
    },
  });
  const first = await invoke(assessmentInput);
  const second = await invoke(assessmentInput);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.result.schema_version, "assessment-observation-v1");
  assert.equal(firstBody.result.observation_id, secondBody.result.observation_id);
  assert.equal(firstBody.result.mastery_effect, "none");
  assert.equal(firstBody.result.authority, "assessment_observation_only");
  assert.equal((await invoke({ ...assessmentInput, instrument: { ...assessmentInput.instrument, verification_status: "raw" } })).status, 400);
  assert.equal((await invoke({ ...assessmentInput, mastery_verdict: "mastered" })).status, 400);
  assert.equal((await invoke({ ...assessmentInput, tutor_feedback: { result: "correct" } })).status, 400);
  assert.deepEqual(await fs.readdir(root), []);
});

test("Learning Director分離confirmed mastery與observed attempt，Verified Bank只讀verified staging資料", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-provider-adapters-p09-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = loadConfig(environment({ MENTORNEST_DATA_ROOT: root }));
  const verifiedRoot = path.join(config.verifiedBankRoot, "math", "G5");
  await fs.mkdir(verifiedRoot, { recursive: true });
  await fs.writeFile(path.join(verifiedRoot, "verified.json"), JSON.stringify({
    id: "q.synthetic.verified", verification_status: "verified", subject: "math", grade: 5,
    knowledge_point: "fake-kp", difficulty: "easy", type: "multiple_choice",
  }));
  await fs.writeFile(path.join(verifiedRoot, "raw.json"), JSON.stringify({
    id: "q.synthetic.raw", verification_status: "raw", subject: "math", grade: 5,
  }));
  const runtime = await start(config);
  t.after(() => runtime.server.close());
  const invoke = (capability, input) => request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09", scopes: ["service:invoke", `capability:${capability}`] }), method: "POST",
    body: { contract_version: "1", capability, subject_ref: "student_test_p09", input },
  });

  const director = await invoke("learning_director.recommend", { confirmed_mastery: [
    { subject: "math", knowledge_point: "fake-low", mastery: 0.2, evidence_status: "confirmed" },
    { subject: "chinese", knowledge_point: "fake-high", mastery: 0.8, evidence_status: "confirmed" },
  ] });
  assert.equal(director.status, 200);
  assert.equal((await director.json()).result.recommendations[0].knowledge_point, "fake-low");
  const adapted = await invoke("learning_director.recommend", {
    confirmed_mastery: [
      { subject: "chinese", knowledge_point: "fake-high", mastery: 0.8, evidence_status: "confirmed" },
    ],
    recent_observations: [
      { evidence_status: "observed", subject: "math", knowledge_point: "fake-kp", result: "incorrect", error_code: "MATH-WRONG-VALUE", hints_used: 1 },
    ],
  });
  assert.equal(adapted.status, 200);
  const adaptedBody = await adapted.json();
  assert.equal(adaptedBody.result.recommendations[0].knowledge_point, "fake-kp");
  assert.equal(adaptedBody.result.evidence_basis, "confirmed_plus_observed_separated");
  const confirmation = await invoke("learning_director.recommend", {
    confirmed_mastery: [],
    recent_observations: [
      { evidence_status: "observed", subject: "math", knowledge_point: "fake-kp", result: "correct", error_code: null, hints_used: 0 },
    ],
  });
  assert.equal((await confirmation.json()).result.evidence_basis, "observed_only_no_mastery_promotion");
  assert.equal((await invoke("learning_director.recommend", { confirmed_mastery: [
    { subject: "math", knowledge_point: "fake", mastery: 0.2, evidence_status: "inferred" },
  ] })).status, 400);

  const bank = await invoke("verified_bank.read", { subject: "math", grade: 5, limit: 10 });
  const bankBody = await bank.json();
  assert.equal(bank.status, 200);
  assert.deepEqual(bankBody.result.questions.map((item) => item.id), ["q.synthetic.verified"]);
  const exact = await invoke("verified_bank.read", { question_id: "q.synthetic.verified", limit: 1 });
  assert.equal((await exact.json()).result.questions[0].id, "q.synthetic.verified");
});

test("Learning Memory writer只接受synthetic subject並寫入隔離namespace", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-provider-p09-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = await start(loadConfig(environment({ MENTORNEST_DATA_ROOT: root })));
  t.after(() => runtime.server.close());

  const invoke = (subjectRef) => request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef, scopes: ["service:invoke", "capability:learning_memory.append_observation"] }),
    method: "POST",
    body: {
      contract_version: "1",
      capability: "learning_memory.append_observation",
      subject_ref: subjectRef,
      input: { observation: { kind: "synthetic_attempt", mastery_candidate_kps: ["fake-kp"] } },
    },
  });
  assert.equal((await invoke("real-student-id")).status, 400);
  assert.equal((await invoke("student_test_p09")).status, 200);

  const target = path.join(root, "student-test-staging-p09", "learning-memory", "student_test_p09.jsonl");
  const records = (await fs.readFile(target, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 1);
  assert.equal(records[0].subject_ref, "student_test_p09");
  assert.equal(records[0].observation.mastery_candidate_kps[0], "fake-kp");

  const rejected = await request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09", scopes: ["service:invoke", "capability:learning_memory.append_observation"] }),
    method: "POST",
    body: {
      contract_version: "1",
      capability: "learning_memory.append_observation",
      subject_ref: "student_test_p09",
      input: { observation: { kind: "synthetic_attempt", transcript: "不得保存的內容", mastered: true } },
    },
  });
  assert.equal(rejected.status, 400);
  assert.equal((await fs.readFile(target, "utf8")).trim().split("\n").length, 1);
});

test("staging namespace symlink不得逃逸data root", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-provider-root-p09-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "mentornest-provider-outside-p09-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, "student-test-staging-p09"));
  const runtime = await start(loadConfig(environment({ MENTORNEST_DATA_ROOT: root })));
  t.after(() => runtime.server.close());
  const response = await request(runtime.baseUrl, "/v1/capabilities/invoke", {
    token: credential({ subjectRef: "student_test_p09", scopes: ["service:invoke", "capability:learning_memory.append_observation"] }), method: "POST",
    body: {
      contract_version: "1", capability: "learning_memory.append_observation",
      subject_ref: "student_test_p09", input: { observation: { kind: "synthetic_escape" } },
    },
  });
  assert.equal(response.status, 500);
  await assert.rejects(fs.access(path.join(outside, "learning-memory", "student_test_p09.jsonl")));
});
