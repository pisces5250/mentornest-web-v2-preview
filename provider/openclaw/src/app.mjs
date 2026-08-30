import { createServer } from "node:http";
import { CAPABILITY_NAMES, createCapabilityRegistry } from "./capabilities.mjs";
import { verifyServiceCredential } from "./auth.mjs";

const MAX_BODY_BYTES = 256 * 1024;

export function createProviderServer(config, dependencies = {}) {
  const registry = dependencies.registry || createCapabilityRegistry(config, dependencies.filesystem);

  return createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const claims = authenticate(req.headers.authorization, config.serviceAuthKey);
    if (!claims) return respond(res, 401, { ok: false, error: "unauthorized" });

    if (req.method === "GET" && req.url === "/healthz") return respond(res, 200, { ok: true });
    if (req.method === "GET" && req.url === "/v1/capabilities") {
      return respond(res, 200, { contract_version: config.contractVersion, capabilities: registry.discovery() });
    }
    if (req.method === "GET" && req.url === "/readyz") {
      const available = registry.availableNames();
      const missing = CAPABILITY_NAMES.filter((name) => !available.includes(name));
      const dependencies = await registry.dependencies();
      const dependenciesReady = dependencies.every((item) => item.ready);
      return respond(res, missing.length === 0 && dependenciesReady ? 200 : 503, {
        ok: missing.length === 0 && dependenciesReady,
        contract_version: config.contractVersion,
        runtime_version: config.runtimeVersion,
        image_digest: config.imageDigest,
        data_namespace: config.namespace,
        production_data_allowed: false,
        capabilities: available,
        capability_status: registry.discovery(),
        missing_capabilities: missing,
        dependencies,
      });
    }
    if (req.method === "POST" && req.url === "/v1/capabilities/invoke") {
      try {
        const body = await readJson(req);
        if (body?.contract_version !== config.contractVersion) throw requestError("contract_version_mismatch", 409);
        if (typeof body?.subject_ref !== "string") throw requestError("subject_context_required", 400);
        if (body.subject_ref !== claims.subject_ref) throw requestError("subject_context_mismatch", 403);
        const result = await registry.invoke(body.capability, { subjectRef: body.subject_ref, input: body.input, claims });
        return respond(res, 200, { ok: true, contract_version: config.contractVersion, result });
      } catch (error) {
        return respond(res, error.status || 400, { ok: false, error: error.code || "invalid_request" });
      }
    }
    return respond(res, 404, { ok: false, error: "not_found" });
  });
}

function authenticate(header, secret) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return verifyServiceCredential(header.slice(7), secret);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw requestError("request_too_large", 413);
  }
  try { return JSON.parse(raw); } catch { throw requestError("invalid_json", 400); }
}

function requestError(code, status) {
  return Object.assign(new Error(code), { code, status });
}

function respond(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
