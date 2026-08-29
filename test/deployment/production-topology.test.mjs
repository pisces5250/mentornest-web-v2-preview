import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("production candidate 將 Tutor、Voice、Learning 路由至不同 upstream", () => {
  const nginx = read("deployment/nginx/default.conf.template");
  assert.match(nginx, /location \/api\/tutor\//);
  assert.match(nginx, /TUTOR_BACKEND_ORIGIN/);
  assert.match(nginx, /location ~ \^\/api\/\(stt\|tts\|audio\)\//);
  assert.match(nginx, /VOICE_BACKEND_ORIGIN/);
  assert.match(nginx, /location \/api\/learning\//);
  assert.match(nginx, /LEARNING_BACKEND_ORIGIN/);
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
