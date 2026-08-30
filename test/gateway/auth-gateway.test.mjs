import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserAuth,
  createCsrfProtection,
  createSessionToken,
  createServiceToken,
  verifyServiceToken,
  verifySessionToken,
} from "../../server/auth/session-auth.mjs";
import { createOpenClawGateway, GatewayError } from "../../server/gateway/openclaw-gateway.mjs";

const SECRET = "test-only-secret-with-at-least-32-characters";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("session token 綁定 issuer、audience、版本與期限", () => {
  const token = createSessionToken({
    subject_ref: "student_test_auth",
    scopes: ["tutor:use"],
    exp: Math.floor(Date.now() / 1000) + 60,
  }, SECRET);
  assert.equal(verifySessionToken(token, SECRET).subject_ref, "student_test_auth");
  assert.equal(verifySessionToken(`${token}x`, SECRET), null);
  const expired = createSessionToken({ subject_ref: "student_test_auth", scopes: [], exp: 1 }, SECRET);
  assert.equal(verifySessionToken(expired, SECRET), null);
  const cannotOverride = createSessionToken({
    subject_ref: "student_test_auth",
    scopes: [],
    exp: Math.floor(Date.now() / 1000) + 60,
    ver: 999,
    iss: "attacker",
    aud: "another-service",
  }, SECRET);
  assert.equal(verifySessionToken(cannotOverride, SECRET).aud, "mentornest-tutor");
});

test("production auth 不接受 test identity header", () => {
  const middleware = createBrowserAuth({ mode: "production", sessionSecret: SECRET });
  const req = { headers: {}, header(name) { return name === "X-MentorNest-Test-Subject" ? "student_test_spoof" : undefined; } };
  const res = responseRecorder();
  middleware(req, res, () => assert.fail("不得通過"));
  assert.equal(res.statusCode, 401);
});

test("session secret 與 service auth key 不可互換", () => {
  const serviceKey = "different-service-key-with-32-characters";
  const token = createServiceToken({ subjectRef: "student_test_auth", audience: "voice-backend" }, serviceKey);
  assert.equal(verifySessionToken(token, serviceKey), null);
  assert.equal(verifyServiceToken(token, { secret: SECRET, audience: "voice-backend" }), null);
  assert.equal(verifyServiceToken(token, { secret: serviceKey, audience: "tutor-backend" }), null);
  assert.equal(verifyServiceToken(token, { secret: serviceKey, audience: "voice-backend" }).subject_ref, "student_test_auth");
  const expired = createServiceToken({ subjectRef: "student_test_auth", audience: "voice-backend", ttlSeconds: -1 }, serviceKey);
  assert.equal(verifyServiceToken(expired, { secret: serviceKey, audience: "voice-backend" }), null);
});

test("CSRF 缺失時 fail-closed", () => {
  const middleware = createCsrfProtection({ mode: "test", sessionSecret: SECRET });
  const req = { method: "POST", headers: {}, header() { return undefined; } };
  const res = responseRecorder();
  middleware(req, res, () => assert.fail("不得通過"));
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "csrf_rejected");
});

test("edge auth_request 依原始 mutation method 執行 CSRF，不因 subrequest GET 繞過", () => {
  const middleware = createCsrfProtection({
    mode: "test",
    sessionSecret: SECRET,
    methodResolver: (req) => req.header("X-Original-Method") || "GET",
  });
  const rejected = {
    method: "GET",
    header(name) { return name === "X-Original-Method" ? "POST" : undefined; },
  };
  const rejectedResponse = responseRecorder();
  middleware(rejected, rejectedResponse, () => assert.fail("原始 POST 不得以 auth subrequest GET 繞過 CSRF"));
  assert.equal(rejectedResponse.statusCode, 403);

  const accepted = {
    method: "GET",
    header(name) {
      if (name === "X-Original-Method") return "POST";
      if (name === "X-MentorNest-CSRF") return "test-csrf";
      return undefined;
    },
  };
  let passed = false;
  middleware(accepted, responseRecorder(), () => { passed = true; });
  assert.equal(passed, true);
});

test("Gateway allowlist、server token 與最小 subject contract", async () => {
  let captured;
  const gateway = createOpenClawGateway({
    baseUrl: "http://openclaw.test",
    serviceAuthKey: "server-only-auth-key-with-at-least-32-characters",
    fetchImpl: async (_url, init) => {
      captured = init;
      return { ok: true, async json() { return { ok: true, result: { accepted: true } }; } };
    },
  });
  const result = await gateway.invoke("learning_memory.append_observation", {
    subjectRef: "student_test_gateway",
    input: { observation: { kind: "test" } },
  });
  assert.equal(result.accepted, true);
  assert.match(captured.headers.Authorization, /^Bearer [^.]+\.[^.]+$/);
  const body = JSON.parse(captured.body);
  assert.equal(body.subject_ref, "student_test_gateway");
  assert.equal(body.contract_version, "1");
  await assert.rejects(
    gateway.invoke("mastery.write", { subjectRef: "student_test_gateway" }),
    (error) => error instanceof GatewayError && error.code === "capability_not_allowed",
  );
});

test("Gateway 不向 caller 洩漏 upstream body", async () => {
  const gateway = createOpenClawGateway({
    baseUrl: "http://openclaw.test",
    serviceAuthKey: "server-only-auth-key-with-at-least-32-characters",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async json() { return { ok: false, token: "should-not-leak", detail: "internal" }; },
    }),
  });
  await assert.rejects(
    gateway.invoke("verified_bank.read", { subjectRef: "student_test_gateway" }),
    (error) => error.code === "gateway_rejected" && !error.message.includes("should-not-leak"),
  );
});

test("readiness 驗證 contract version 與完整 capability 宣告", async () => {
  const required = ["learning_director.recommend", "assessment.submit_observation"];
  const make = (body) => createOpenClawGateway({
    baseUrl: "http://openclaw.test",
    serviceAuthKey: "server-only-auth-key-with-at-least-32-characters",
    requiredCapabilities: required,
    contractVersion: "1",
    fetchImpl: async () => ({ ok: true, async json() { return body; } }),
  });
  assert.equal((await make({ ok: true, contract_version: "1", capabilities: required }).ready()).ok, true);
  const missing = await make({ ok: true, contract_version: "1", capabilities: [required[0]] }).ready();
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing_capabilities, [required[1]]);
  assert.equal((await make({ ok: true, contract_version: "2", capabilities: required }).ready()).ok, false);
});

test("staging readiness 綁定 runtime、image identity、namespace 與 production data isolation", async () => {
  const digest = `registry.example/openclaw@sha256:${"b".repeat(64)}`;
  const body = {
    ok: true,
    contract_version: "1",
    runtime_version: "openclaw-test-1.0.0",
    image_digest: digest,
    data_namespace: "mentornest-staging-test-isolated",
    production_data_allowed: false,
    capabilities: ["learning_memory.append_observation"],
  };
  const make = (override = {}) => createOpenClawGateway({
    baseUrl: "http://openclaw.test",
    serviceAuthKey: "server-only-auth-key-with-at-least-32-characters",
    requiredCapabilities: ["learning_memory.append_observation"],
    contractVersion: "1",
    expectedRuntimeVersion: "openclaw-test-1.0.0",
    expectedImageDigest: digest,
    expectedDataNamespace: "mentornest-staging-test-isolated",
    requireProductionDataIsolation: true,
    fetchImpl: async () => ({ ok: true, async json() { return { ...body, ...override }; } }),
  });

  assert.equal((await make().ready()).ok, true);
  assert.deepEqual((await make({ image_digest: "wrong" }).ready()).mismatches, ["image_digest"]);
  assert.deepEqual((await make({ data_namespace: "production" }).ready()).mismatches, ["data_namespace"]);
  assert.deepEqual((await make({ production_data_allowed: true }).ready()).mismatches, ["production_data_isolation"]);
});
