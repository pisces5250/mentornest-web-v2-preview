import process from "node:process";

const RETAINED_PRODUCTION_FALLBACK_ID = "6a8eaa6e7d3d98c91024fb26";
const RETAINED_PRODUCTION_OPENCLAW_ID = "6a8e84ce9ec391c39ae7a996";

const required = [
  "STAGING_DEPLOYMENT_ID",
  "PRODUCTION_FALLBACK_SERVICE_ID",
  "PRODUCTION_OPENCLAW_SERVICE_ID",
  "STAGING_DATA_NAMESPACE",
  "WEB_EDGE_IMAGE",
  "TUTOR_BACKEND_IMAGE",
  "VOICE_BACKEND_IMAGE",
  "OPENCLAW_LEARNING_IMAGE",
  "OPENCLAW_RUNTIME_VERSION",
  "MENTORNEST_GATEWAY_SESSION_SECRET",
  "MENTORNEST_SERVICE_AUTH_KEY",
  "OPENCLAW_SERVICE_AUTH_KEY",
  "STAGING_OPENCLAW_VOLUME_NAME",
  "STAGING_EDGE_NETWORK_NAME",
  "STAGING_PRIVATE_NETWORK_NAME",
];

const errors = [];
if (process.env.MENTORNEST_ENV !== "staging") errors.push("MENTORNEST_ENV 必須明確設為 staging");
for (const name of required) {
  const value = process.env[name] ?? "";
  if (!value || /replace-with|inject-from|registry\.example/.test(value)) errors.push(`${name} 尚未安全設定`);
  if (name.endsWith("IMAGE") && !/^[^\s]+@sha256:[a-f0-9]{64}$/i.test(value)) errors.push(`${name} 必須鎖定完整 immutable sha256 digest`);
}
for (const name of ["MENTORNEST_GATEWAY_SESSION_SECRET", "MENTORNEST_SERVICE_AUTH_KEY", "OPENCLAW_SERVICE_AUTH_KEY"]) {
  if ((process.env[name] ?? "").length < 32) errors.push(`${name} 至少需要 32 個字元`);
}
if ([process.env.PRODUCTION_FALLBACK_SERVICE_ID, process.env.PRODUCTION_OPENCLAW_SERVICE_ID].includes(process.env.STAGING_DEPLOYMENT_ID)) {
  errors.push("staging deployment 不得指向 production fallback service 或 production OpenClaw service");
}
if (process.env.PRODUCTION_FALLBACK_SERVICE_ID !== RETAINED_PRODUCTION_FALLBACK_ID) {
  errors.push("production fallback service ID 與 architecture registry 不一致");
}
if (process.env.PRODUCTION_OPENCLAW_SERVICE_ID !== RETAINED_PRODUCTION_OPENCLAW_ID) {
  errors.push("production OpenClaw service ID 與 architecture registry 不一致");
}
if (/prod/i.test(process.env.STAGING_DATA_NAMESPACE ?? "")) errors.push("staging data namespace 不得指向 production");
if (!/staging/i.test(process.env.STAGING_DATA_NAMESPACE ?? "")) errors.push("staging data namespace 必須明確標示為 staging 隔離空間");
for (const name of ["STAGING_OPENCLAW_VOLUME_NAME", "STAGING_EDGE_NETWORK_NAME", "STAGING_PRIVATE_NETWORK_NAME"]) {
  const value = process.env[name] ?? "";
  if (!/staging/i.test(value)) errors.push(`${name} 必須明確標示為 staging 專用資源`);
  if (/prod/i.test(value)) errors.push(`${name} 不得引用 production 資源`);
}
if (process.env.STAGING_EDGE_NETWORK_NAME === process.env.STAGING_PRIVATE_NETWORK_NAME) {
  errors.push("staging edge 與 private network 必須分離");
}
for (const name of Object.keys(process.env)) {
  if (name.startsWith("VITE_") && /(TOKEN|SECRET|KEY|ORIGIN)/.test(name)) errors.push(`${name} 不得暴露內部位址或 credential 到 browser bundle`);
}

if (errors.length) {
  console.error(errors.map((error) => `STAGING_GUARD: ${error}`).join("\n"));
  process.exit(1);
}
console.log("STAGING_GUARD_OK");
