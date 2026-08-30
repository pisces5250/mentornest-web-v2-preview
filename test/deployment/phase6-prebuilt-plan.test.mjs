import test from "node:test";
import assert from "node:assert/strict";
import { validatePhase6PrebuiltPlan } from "../../deployment/staging/validate-phase6-prebuilt-plan.mjs";

const digest = "a".repeat(64);
const commit = "b".repeat(40);
const valid = {
  environment: "staging",
  service_type: "PREBUILT_V2",
  service_id: "6a93e04ecb61b34ad92fb541",
  current_image: `ghcr.io/pisces5250/mentornest-web-v2-preview-tutor@sha256:${"c".repeat(64)}`,
  target_image: `ghcr.io/pisces5250/mentornest-web-v2-preview-tutor@sha256:${digest}`,
  registry_resolved_digest: `sha256:${digest}`,
  source_commit: commit,
  oci_revision: commit,
  production_data_allowed: false,
  data_namespace: "student_test_phase6_staging",
  secrets: { storage: "zeabur_encrypted", exposed_to_browser: false, included_in_image: false },
};

test("Phase 6 PREBUILT_V2 plan只接受可追溯 staging immutable identity", () => {
  const result = validatePhase6PrebuiltPlan(valid);
  assert.equal(result.target_image, valid.target_image);
  assert.equal(result.mutation_authorized, false);
});

test("Phase 6 plan拒絕production、mutable或假digest identity", () => {
  assert.throws(() => validatePhase6PrebuiltPlan({ ...valid, environment: "production" }), /staging/);
  assert.throws(() => validatePhase6PrebuiltPlan({ ...valid, service_id: "6a8eaa6e7d3d98c91024fb26" }), /allowlist/);
  assert.throws(() => validatePhase6PrebuiltPlan({ ...valid, target_image: "ghcr.io/pisces5250/x:latest" }), /immutable/);
  assert.throws(() => validatePhase6PrebuiltPlan({ ...valid, registry_resolved_digest: `sha256:${"d".repeat(64)}` }), /不一致/);
});

test("Phase 6 plan拒絕secret value與非隔離資料設定", () => {
  assert.throws(() => validatePhase6PrebuiltPlan({ ...valid, production_data_allowed: true }), /false/);
  assert.throws(() => validatePhase6PrebuiltPlan({ ...valid, secrets: { ...valid.secrets, value: "forbidden" } }), /secret value/);
});
