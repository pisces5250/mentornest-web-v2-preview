import process from "node:process";

const RETAINED_PRODUCTION_FALLBACK_ID = "6a8eaa6e7d3d98c91024fb26";

const required = [
  "STAGING_DEPLOYMENT_ID",
  "PRODUCTION_FALLBACK_SERVICE_ID",
  "STAGING_DATA_NAMESPACE",
  "VOICE_BACKEND_IMAGE",
  "OPENCLAW_LEARNING_IMAGE",
  "MENTORNEST_GATEWAY_SESSION_SECRET",
  "MENTORNEST_SERVICE_AUTH_KEY",
  "OPENCLAW_GATEWAY_TOKEN",
];

const errors = [];
if (process.env.MENTORNEST_ENV !== "staging") errors.push("MENTORNEST_ENV 必須明確設為 staging");
for (const name of required) {
  const value = process.env[name] ?? "";
  if (!value || /replace-with|inject-from|registry\.example/.test(value)) errors.push(`${name} 尚未安全設定`);
  if (name.endsWith("IMAGE") && !value.includes("@sha256:")) errors.push(`${name} 必須鎖定 immutable sha256 digest`);
}
for (const name of ["MENTORNEST_GATEWAY_SESSION_SECRET", "MENTORNEST_SERVICE_AUTH_KEY", "OPENCLAW_GATEWAY_TOKEN"]) {
  if ((process.env[name] ?? "").length < 32) errors.push(`${name} 至少需要 32 個字元`);
}
if (process.env.STAGING_DEPLOYMENT_ID && process.env.STAGING_DEPLOYMENT_ID === process.env.PRODUCTION_FALLBACK_SERVICE_ID) {
  errors.push("staging deployment 不得指向 production fallback service");
}
if (process.env.PRODUCTION_FALLBACK_SERVICE_ID !== RETAINED_PRODUCTION_FALLBACK_ID) {
  errors.push("production fallback service ID 與 architecture registry 不一致");
}
if (/prod/i.test(process.env.STAGING_DATA_NAMESPACE ?? "")) errors.push("staging data namespace 不得指向 production");
for (const name of Object.keys(process.env)) {
  if (name.startsWith("VITE_") && /(TOKEN|SECRET|KEY|ORIGIN)/.test(name)) errors.push(`${name} 不得暴露內部位址或 credential 到 browser bundle`);
}

if (errors.length) {
  console.error(errors.map((error) => `STAGING_GUARD: ${error}`).join("\n"));
  process.exit(1);
}
console.log("STAGING_GUARD_OK");
