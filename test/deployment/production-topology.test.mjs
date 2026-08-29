import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("production candidate 將 Tutor、Voice、Learning 路由至不同 upstream", () => {
  const nginx = read("deployment/nginx/default.conf.template");
  assert.match(nginx, /location \/api\/tutor\//);
  assert.match(nginx, /TUTOR_BACKEND_ORIGIN/);
  assert.match(nginx, /location ~ \^\/api\/\(stt\|tts\|audio\)\//);
  assert.match(nginx, /VOICE_BACKEND_ORIGIN/);
  assert.match(nginx, /location \/api\/learning\//);
  assert.match(nginx, /GATEWAY_BACKEND_ORIGIN/);
  assert.doesNotMatch(nginx, /LEARNING_BACKEND_ORIGIN/);
  assert.match(nginx, /auth_request \/_auth\/session/);
});

test("staging 將 OpenClaw 留在內網且不把 runtime token 放進 Web Edge", () => {
  const compose = read("deployment/staging/compose.yaml");
  const dockerfile = read("Dockerfile");
  assert.match(compose, /openclaw-learning:/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /OPENCLAW_GATEWAY_TOKEN/);
  assert.match(compose, /OPENCLAW_REQUIRED_CAPABILITIES: learning_director,assessment,learning_memory,verified_bank_read/);
  assert.match(compose, /OPENCLAW_CAPABILITY_CONTRACT_VERSION: "1"/);
  const webEdge = compose.split("  tutor-backend:")[0];
  assert.doesNotMatch(webEdge, /OPENCLAW_GATEWAY_TOKEN/);
  assert.doesNotMatch(webEdge, /MENTORNEST_SERVICE_AUTH_KEY/);
  assert.doesNotMatch(dockerfile, /OPENCLAW_GATEWAY_TOKEN/);
  assert.doesNotMatch(dockerfile, /MENTORNEST_SERVICE_AUTH_KEY/);
});

test("staging Voice 是獨立且 fail-closed 的跨 repo image", () => {
  const compose = read("deployment/staging/compose.yaml");
  const architecture = read("architecture/staging-topology-p05.md");
  assert.match(compose, /VOICE_BACKEND_IMAGE:\?需提供已由 Voice repository 驗證的 immutable image digest/);
  assert.match(architecture, /沒有驗證.*Voice/);
  assert.match(architecture, /不承載 Tutor、Assessment、Learning Memory 或 mastery 邏輯/);
});

test("staging 契約保留 production fallback 並禁止自動 cutover", () => {
  const architecture = read("architecture/staging-topology-p05.md");
  assert.match(architecture, /必須保留為 fallback/);
  assert.match(architecture, /不改 production DNS、route 或/);
  assert.match(architecture, /需人類核准/);
});

test("staging environment guard fail-closed 並接受隔離、digest-pinned 設定", () => {
  const script = fileURLToPath(new URL("../../deployment/staging/validate-env.mjs", import.meta.url));
  const validEnv = {
    PATH: process.env.PATH ?? "",
    MENTORNEST_ENV: "staging",
    STAGING_DEPLOYMENT_ID: "staging-candidate-001",
    PRODUCTION_FALLBACK_SERVICE_ID: "6a8eaa6e7d3d98c91024fb26",
    STAGING_DATA_NAMESPACE: "mentornest-staging-isolated",
    VOICE_BACKEND_IMAGE: `voice@sha256:${"a".repeat(64)}`,
    OPENCLAW_LEARNING_IMAGE: `openclaw@sha256:${"b".repeat(64)}`,
    OPENCLAW_RUNTIME_VERSION: "openclaw-test-1.0.0",
    MENTORNEST_GATEWAY_SESSION_SECRET: "test-only-session-secret-at-least-32-chars",
    MENTORNEST_SERVICE_AUTH_KEY: "test-only-service-key-at-least-32-chars",
    OPENCLAW_GATEWAY_TOKEN: "test-only-openclaw-token-at-least-32-chars",
  };
  const rejected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /STAGING_GUARD/);

  const placeholderRejected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...validEnv, VOICE_BACKEND_IMAGE: "registry.example/voice@sha256:replace-with-digest" },
  });
  assert.notEqual(placeholderRejected.status, 0);
  assert.match(placeholderRejected.stderr, /VOICE_BACKEND_IMAGE 尚未安全設定/);

  const productionTargetRejected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...validEnv, STAGING_DEPLOYMENT_ID: validEnv.PRODUCTION_FALLBACK_SERVICE_ID },
  });
  assert.notEqual(productionTargetRejected.status, 0);
  assert.match(productionTargetRejected.stderr, /不得指向 production fallback service/);

  const ambiguousNamespaceRejected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...validEnv, STAGING_DATA_NAMESPACE: "mentornest-shared" },
  });
  assert.notEqual(ambiguousNamespaceRejected.status, 0);
  assert.match(ambiguousNamespaceRejected.stderr, /必須明確標示為 staging 隔離空間/);

  const registryMismatchRejected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...validEnv, PRODUCTION_FALLBACK_SERVICE_ID: "unknown-production-service" },
  });
  assert.notEqual(registryMismatchRejected.status, 0);
  assert.match(registryMismatchRejected.stderr, /architecture registry 不一致/);

  const accepted = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: validEnv,
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /STAGING_GUARD_OK/);
});

test("Web image 有 SPA fallback 與 healthcheck，且不包含 Node backend", () => {
  const dockerfile = read("Dockerfile");
  const nginx = read("deployment/nginx/default.conf.template");
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.doesNotMatch(dockerfile, /server\/open-response\.mjs/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html/);
  assert.match(nginx, /location = \/healthz/);
});

test("production 文件明定 fallback、同源 auth 與 writer boundaries", () => {
  const architecture = read("architecture/production-integration-p0.md");
  assert.match(architecture, /candidate_not_cut_over/);
  assert.match(architecture, /production `mentornest-web` 保留為 fallback/);
  assert.match(architecture, /HttpOnly/);
  assert.match(architecture, /不得信任 client 提供的 `student_id`/);
  assert.match(architecture, /不得直接寫 production JSONL/);
});
