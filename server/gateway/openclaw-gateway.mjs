import { randomUUID } from "node:crypto";
import { createServiceToken } from "../auth/session-auth.mjs";

const CAPABILITIES = new Set([
  "learning_director.recommend",
  "assessment.submit_observation",
  "learning_memory.append_observation",
  "verified_bank.read",
]);

export class GatewayError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function createOpenClawGateway({
  baseUrl,
  serviceAuthKey,
  fetchImpl = fetch,
  timeoutMs = 8000,
  requiredCapabilities = [...CAPABILITIES],
  contractVersion = "1",
  expectedRuntimeVersion,
  expectedImageDigest,
  expectedDataNamespace,
  requireProductionDataIsolation = false,
}) {
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new Error("MENTORNEST_GATEWAY_URL 無效");
  if (!serviceAuthKey || serviceAuthKey.length < 32) throw new Error("OPENCLAW_SERVICE_AUTH_KEY 未設定或過短");

  function credential(subjectRef, capability) {
    const scopes = ["service:invoke", `capability:${capability || "readiness"}`];
    return createServiceToken({ subjectRef, audience: "openclaw-learning", ttlSeconds: 60, scopes }, serviceAuthKey);
  }

  async function invoke(capability, { subjectRef, input = {}, requestId } = {}) {
    if (!CAPABILITIES.has(capability)) throw new GatewayError("capability_not_allowed", 403);
    if (typeof subjectRef !== "string" || !subjectRef) throw new GatewayError("subject_context_required", 400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL("/v1/capabilities/invoke", baseUrl), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credential(subjectRef, capability)}`,
          "Content-Type": "application/json",
          "X-Request-Id": requestId || randomUUID(),
        },
        body: JSON.stringify({ contract_version: contractVersion, capability, subject_ref: subjectRef, input }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new GatewayError("gateway_rejected", response.status || 502);
      return data.result;
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(error?.name === "AbortError" ? "gateway_timeout" : "gateway_unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  async function ready() {
    try {
      const response = await fetchImpl(new URL("/readyz", baseUrl), {
        headers: { "Authorization": `Bearer ${credential("service_readiness")}` },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 3000)),
      });
      const body = await response.json().catch(() => null);
      const advertised = new Set(body?.capabilities || []);
      const missing = requiredCapabilities.filter((name) => !advertised.has(name));
      const mismatches = [];
      if (String(body?.contract_version) !== String(contractVersion)) mismatches.push("contract_version");
      if (expectedRuntimeVersion && body?.runtime_version !== expectedRuntimeVersion) mismatches.push("runtime_version");
      if (expectedImageDigest && body?.image_digest !== expectedImageDigest) mismatches.push("image_digest");
      if (expectedDataNamespace && body?.data_namespace !== expectedDataNamespace) mismatches.push("data_namespace");
      if (requireProductionDataIsolation && body?.production_data_allowed !== false) mismatches.push("production_data_isolation");
      const ok = response.ok && body?.ok === true && missing.length === 0 && mismatches.length === 0;
      return {
        ok,
        contract_version: body?.contract_version ?? null,
        runtime_version: body?.runtime_version ?? null,
        image_digest: body?.image_digest ?? null,
        data_namespace: body?.data_namespace ?? null,
        production_data_allowed: body?.production_data_allowed ?? null,
        missing_capabilities: missing,
        mismatches,
      };
    } catch {
      return {
        ok: false,
        contract_version: null,
        runtime_version: null,
        image_digest: null,
        data_namespace: null,
        production_data_allowed: null,
        missing_capabilities: [...requiredCapabilities],
        mismatches: ["runtime_unavailable"],
      };
    }
  }

  return Object.freeze({ invoke, ready });
}

export function createUnavailableGateway() {
  return Object.freeze({
    async invoke() { throw new GatewayError("gateway_unavailable", 503); },
    async ready() {
      return {
        ok: false,
        contract_version: null,
        runtime_version: null,
        image_digest: null,
        data_namespace: null,
        production_data_allowed: null,
        missing_capabilities: [...CAPABILITIES],
        mismatches: ["runtime_unavailable"],
      };
    },
  });
}

export function createGatewayLearningMemoryWriter(gateway) {
  return Object.freeze({
    async appendObservation({ subjectRef, observation }) {
      return gateway.invoke("learning_memory.append_observation", {
        subjectRef,
        input: { observation },
      });
    },
  });
}
