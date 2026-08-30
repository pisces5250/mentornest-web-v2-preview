import { readFile } from "node:fs/promises";

const STAGING_SERVICE_IDS = new Set([
  "6a93e051cb61b34ad92fb553", // Web
  "6a93e04ecb61b34ad92fb541", // Tutor
  "6a93dff9cb61b34ad92fb51c", // OpenClaw Provider
]);
const DIGEST_IMAGE = /^(ghcr\.io\/pisces5250\/[a-z0-9_.\/-]+)@sha256:([a-f0-9]{64})$/i;
const SHA = /^[a-f0-9]{40}$/i;

export function validatePhase6PrebuiltPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) errors.push("plan 必須是 object");
  if (plan?.environment !== "staging") errors.push("environment 必須是 staging");
  if (plan?.service_type !== "PREBUILT_V2") errors.push("service_type 必須是 PREBUILT_V2");
  if (!STAGING_SERVICE_IDS.has(plan?.service_id)) errors.push("service_id 不在核准的 staging allowlist");
  const target = DIGEST_IMAGE.exec(plan?.target_image || "");
  if (!target) errors.push("target_image 必須是 MentorNest GHCR immutable digest reference");
  if (plan?.current_image === plan?.target_image) errors.push("target_image 必須不同於目前 image");
  if (!/^sha256:[a-f0-9]{64}$/i.test(plan?.registry_resolved_digest || "")) errors.push("registry_resolved_digest 無效");
  if (target && `sha256:${target[2]}` !== plan.registry_resolved_digest) errors.push("target image 與 registry resolved digest 不一致");
  if (!SHA.test(plan?.source_commit || "")) errors.push("source_commit 必須是完整 commit SHA");
  if (plan?.oci_revision !== plan?.source_commit) errors.push("OCI revision 必須等於 source commit");
  if (plan?.production_data_allowed !== false) errors.push("production_data_allowed 必須是 false");
  if (!/^student[-_]test[-_][a-z0-9_-]{6,}$/i.test(plan?.data_namespace || "")) errors.push("data_namespace 必須是 synthetic staging namespace");
  if (plan?.secrets?.storage !== "zeabur_encrypted") errors.push("secret storage 必須是 Zeabur encrypted storage");
  if (plan?.secrets?.exposed_to_browser !== false || plan?.secrets?.included_in_image !== false) errors.push("secret 不得進入 browser 或 image");
  if (Object.hasOwn(plan?.secrets || {}, "value")) errors.push("plan 不得包含 secret value");
  if (errors.length) throw new Error(errors.join("；"));
  return Object.freeze({
    service_id: plan.service_id,
    service_type: plan.service_type,
    target_image: plan.target_image,
    source_commit: plan.source_commit,
    data_namespace: plan.data_namespace,
    mutation_authorized: false,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  if (!input) throw new Error("請提供 deployment plan JSON path");
  const result = validatePhase6PrebuiltPlan(JSON.parse(await readFile(input, "utf8")));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
