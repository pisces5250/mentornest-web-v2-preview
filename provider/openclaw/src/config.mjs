import path from "node:path";

const PRODUCTION_MARKERS = /(^|[-_/.])(prod|production)([-_/.]|$)/i;
const HISTORICAL_PRODUCTION_ROOT = "/home/node/.openclaw/workspace/data";
const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/;

export function loadConfig(env = process.env) {
  const namespace = required(env.MENTORNEST_DATA_NAMESPACE, "MENTORNEST_DATA_NAMESPACE");
  const serviceAuthKey = required(env.OPENCLAW_SERVICE_AUTH_KEY, "OPENCLAW_SERVICE_AUTH_KEY");
  const imageDigest = required(env.OPENCLAW_IMAGE_DIGEST, "OPENCLAW_IMAGE_DIGEST");
  const dataRoot = path.resolve(required(env.MENTORNEST_DATA_ROOT, "MENTORNEST_DATA_ROOT"));

  if (env.MENTORNEST_ENV !== "staging") throw new Error("provider candidate 僅允許 staging 環境");
  if (!NAMESPACE_PATTERN.test(namespace) || PRODUCTION_MARKERS.test(namespace)) throw new Error("staging namespace 無效");
  if (serviceAuthKey.length < 32) throw new Error("OPENCLAW_SERVICE_AUTH_KEY 未設定或過短");
  if (!/@sha256:[a-f0-9]{64}$/i.test(imageDigest)) throw new Error("OPENCLAW_IMAGE_DIGEST 必須是 immutable digest");
  if (PRODUCTION_MARKERS.test(dataRoot)) throw new Error("MENTORNEST_DATA_ROOT 不得指向 production path");
  if (dataRoot === HISTORICAL_PRODUCTION_ROOT || dataRoot.startsWith(`${HISTORICAL_PRODUCTION_ROOT}/`)) {
    throw new Error("MENTORNEST_DATA_ROOT 不得指向歷史 production workspace");
  }
  if (env.MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA !== "false") {
    throw new Error("MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA 必須明確設為 false");
  }

  return Object.freeze({
    port: parsePort(env.PORT || "18789"),
    namespace,
    serviceAuthKey,
    imageDigest,
    dataRoot,
    verifiedBankRoot: path.join(dataRoot, namespace, "verified-bank"),
    contractVersion: "1",
    runtimeVersion: "mentornest-openclaw-provider-0.2.0",
  });
}

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} 未設定`);
  return value.trim();
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 無效");
  return port;
}
