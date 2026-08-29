import { randomUUID } from "node:crypto";

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
  token,
  fetchImpl = fetch,
  timeoutMs = 8000,
  requiredCapabilities = [...CAPABILITIES],
  contractVersion = "1",
}) {
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new Error("MENTORNEST_GATEWAY_URL 無效");
  if (!token || token.length < 24) throw new Error("MENTORNEST_GATEWAY_TOKEN 未設定或過短");

  async function invoke(capability, { subjectRef, input = {}, requestId } = {}) {
    if (!CAPABILITIES.has(capability)) throw new GatewayError("capability_not_allowed", 403);
    if (typeof subjectRef !== "string" || !subjectRef) throw new GatewayError("subject_context_required", 400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL("/v1/capabilities/invoke", baseUrl), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Request-Id": requestId || randomUUID(),
        },
        body: JSON.stringify({ capability, subject_ref: subjectRef, input }),
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
        headers: { "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 3000)),
      });
      const body = await response.json().catch(() => null);
      const advertised = new Set(body?.capabilities || []);
      const missing = requiredCapabilities.filter((name) => !advertised.has(name));
      const ok = response.ok && body?.ok === true && String(body.contract_version) === String(contractVersion) && missing.length === 0;
      return { ok, contract_version: body?.contract_version ?? null, missing_capabilities: missing };
    } catch {
      return { ok: false, contract_version: null, missing_capabilities: [...requiredCapabilities] };
    }
  }

  return Object.freeze({ invoke, ready });
}

export function createUnavailableGateway() {
  return Object.freeze({
    async invoke() { throw new GatewayError("gateway_unavailable", 503); },
    async ready() { return { ok: false, contract_version: null, missing_capabilities: [...CAPABILITIES] }; },
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
