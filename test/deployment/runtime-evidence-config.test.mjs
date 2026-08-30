import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("P0.7 runtime evidence runner 缺 immutable images 時 fail-closed", () => {
  const result = spawnSync("sh", ["deployment/staging/run-runtime-evidence.sh"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /P0\.7_UNVERIFIED: WEB_EDGE_IMAGE/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /P0\.7_RUNTIME_EVIDENCE_OK/);
});

test("P0.7 compose 使用 digest images、隔離負向 probes 與 private network", async () => {
  const [base, evidence, runner] = await Promise.all([
    readFile("deployment/staging/compose.yaml", "utf8"),
    readFile("deployment/staging/compose.runtime-evidence.yaml", "utf8"),
    readFile("deployment/staging/run-runtime-evidence.sh", "utf8"),
  ]);
  assert.match(base, /private:\n\s+internal: true/);
  for (const name of ["WEB_EDGE_IMAGE", "TUTOR_BACKEND_IMAGE"]) assert.match(evidence, new RegExp(`\\$\\{${name}`));
  for (const service of ["tutor-invalid-runtime-credential", "tutor-contract-mismatch", "tutor-missing-capability"]) {
    assert.match(evidence, new RegExp(service));
  }
  assert.match(runner, /compose.*pull/);
  assert.match(runner, /up --detach --no-build --wait/);
  assert.match(runner, /student_test_p07_runtime/);
  assert.doesNotMatch(runner, /data\/students|production student/);
});
