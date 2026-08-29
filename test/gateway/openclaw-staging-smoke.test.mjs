import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createOpenClawGateway } from "../../server/gateway/openclaw-gateway.mjs";

const TOKEN = "isolated-staging-runtime-token-32-characters";
const NAMESPACE = "mentornest-staging-contract-test";
const DIGEST = `registry.example/openclaw@sha256:${"c".repeat(64)}`;
const CAPABILITIES = [
  "learning_director.recommend",
  "assessment.submit_observation",
  "learning_memory.append_observation",
  "verified_bank.read",
];

async function startRuntime({ missingCapability, rejectMemory = false } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false }));
    }
    if (req.url === "/readyz") {
      return res.end(JSON.stringify({
        ok: true,
        contract_version: "1",
        runtime_version: "openclaw-contract-harness-1.0.0",
        image_digest: DIGEST,
        data_namespace: NAMESPACE,
        production_data_allowed: false,
        capabilities: CAPABILITIES.filter((name) => name !== missingCapability),
      }));
    }
    if (req.url !== "/v1/capabilities/invoke" || req.method !== "POST") {
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok: false }));
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    calls.push(request);
    if (!CAPABILITIES.includes(request.capability)) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok: false }));
    }
    if (rejectMemory && request.capability === "learning_memory.append_observation") {
      res.statusCode = 503;
      return res.end(JSON.stringify({ ok: false }));
    }
    return res.end(JSON.stringify({ ok: true, result: { accepted: true, capability: request.capability } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return { server, calls, baseUrl: `http://127.0.0.1:${port}` };
}

function gateway(baseUrl, token = TOKEN) {
  return createOpenClawGateway({
    baseUrl,
    token,
    requiredCapabilities: CAPABILITIES,
    contractVersion: "1",
    expectedRuntimeVersion: "openclaw-contract-harness-1.0.0",
    expectedImageDigest: DIGEST,
    expectedDataNamespace: NAMESPACE,
    requireProductionDataIsolation: true,
  });
}

test("隔離 OpenClaw contract harness 驗證 readiness 與四項 capability success path", async (t) => {
  const runtime = await startRuntime();
  t.after(() => runtime.server.close());
  assert.equal((await gateway(runtime.baseUrl).ready()).ok, true);
  for (const capability of CAPABILITIES) {
    const result = await gateway(runtime.baseUrl).invoke(capability, {
      subjectRef: "student_test_openclaw_contract",
      input: { synthetic: true },
    });
    assert.equal(result.capability, capability);
  }
  assert.equal(runtime.calls.length, 4);
  assert.ok(runtime.calls.every((call) => call.subject_ref === "student_test_openclaw_contract"));
});

test("錯誤 runtime credential、缺 capability 與 Learning Memory 拒絕皆 fail-closed", async (t) => {
  const missing = await startRuntime({ missingCapability: "verified_bank.read" });
  const refusing = await startRuntime({ rejectMemory: true });
  t.after(() => missing.server.close());
  t.after(() => refusing.server.close());

  assert.equal((await gateway(missing.baseUrl).ready()).ok, false);
  assert.deepEqual((await gateway(missing.baseUrl).ready()).missing_capabilities, ["verified_bank.read"]);
  assert.equal((await gateway(missing.baseUrl, "wrong-runtime-token-with-32-characters").ready()).ok, false);
  await assert.rejects(
    gateway(refusing.baseUrl).invoke("learning_memory.append_observation", {
      subjectRef: "student_test_openclaw_contract",
      input: { observation: { authority: "candidate" } },
    }),
    (error) => error.code === "gateway_rejected" && error.status === 503,
  );
});
