// production_ai_author.mjs
//
// MentorNest Production AI Question Author.
//
// Phase 2 fourth batch (2026-08-27T0809Z) decision:
// - Use OpenClaw local gateway + MiniMax-M3 (already wired in openclaw.json).
// - Use the OpenResponses-compatible `POST /v1/responses` endpoint.
// - NEVER ship raw learning data, display names, school names, parent
//   concerns, or child voice/images into the LLM call.
//
// Privacy contract (enforced by `buildAuthorPrompt` + `runAuthorOnce`):
//   ALLOWED OUT fields from authorFn:
//     subject, grade, knowledge_point, question_type, difficulty,
//     authoring_constraints, optional locale ("zh-TW")
//   FORBIDDEN IN any field:
//     display_name, school_name, class_name, parent_concerns,
//     raw_learning_history, voice, image, transcript, anything from
//     data/learning-records/ or data/students/<id>.json other than
//     course-grade / curriculum_unit / knowledge_point.
//
// Output contract: structured JSON with required keys:
//   stem, answer, alt_answers?, choices?, explanation, confidence (0..1)
// Schema-validated before returning. On parse / schema / network failure
// the orchestrator gets a structured error and can retry.

import { randomUUID } from "node:crypto";

const DEFAULT_GATEWAY = "http://localhost:18789";
const DEFAULT_MODEL = "openclaw"; // routed via gateway → minimax/MiniMax-M3
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

/**
 * Privacy filter. Throws if forbidden keys are present anywhere in payload.
 * Defense-in-depth: even if the caller tries to sneak in a display_name,
 * the author rejects it before the request reaches the gateway.
 */
export function assertAuthorPayloadPrivacy(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("author payload must be an object");
  }
  const FORBIDDEN = [
    "display_name",
    "school_name",
    "class_name",
    "parent_concerns",
    "raw_learning_history",
    "learning_events",
    "transcript",
    "audio",
    "image",
    "photo",
    "child_voice",
    "child_image",
    "school_progress_inferred_from_history",
  ];
  const found = [];
  function walk(o, path) {
    if (Array.isArray(o)) { for (const v of o) walk(v, path); return; }
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        const next = path ? `${path}.${k}` : k;
        if (FORBIDDEN.includes(k)) found.push(next);
        walk(o[k], next);
      }
    }
  }
  walk(payload, "");
  if (found.length > 0) {
    const e = new Error("author payload contains forbidden fields");
    e.code = "PRIVACY_VIOLATION";
    e.forbidden = found;
    throw e;
  }
}

/**
 * Build the structured-output prompt for the LLM.
 *
 * The prompt is the ONLY surface through which the model knows the task.
 * It MUST NOT include any of: display_name, school_name, class_name,
 * parent_concerns, raw_learning_history, voice, image, transcript.
 */
export function buildAuthorPrompt({ subject, grade, knowledge_point, question_type, difficulty, authoring_constraints, locale = "zh-TW" }) {
  if (!subject || typeof subject !== "string") throw new Error("subject required");
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error("grade must be 1..12");
  if (!knowledge_point || typeof knowledge_point !== "string") throw new Error("knowledge_point required");
  if (!question_type) throw new Error("question_type required");
  if (!difficulty) throw new Error("difficulty required");

  const ALLOWED_TYPES = new Set(["short_answer", "multiple_choice", "true_false"]);
  if (!ALLOWED_TYPES.has(question_type)) throw new Error("question_type must be one of short_answer|multiple_choice|true_false");
  const ALLOWED_DIFFS = new Set(["easy", "medium", "hard"]);
  if (!ALLOWED_DIFFS.has(difficulty)) throw new Error("difficulty must be one of easy|medium|hard");

  const constraintsBlock = (authoring_constraints && Object.keys(authoring_constraints).length > 0)
    ? JSON.stringify(authoring_constraints, null, 2)
    : "  (none)";

  const systemPart = [
    "You are a teacher who designs ONE practice question for a child.",
    "Strict rules:",
    "  - Output MUST be a single JSON object, no prose, no markdown fence.",
    "  - Use the locale: " + locale,
    "  - Do not include any personal info (display_name, school_name, class_name,",
    "    parent_concerns, learning history, voice/image references) — they",
    "    are NOT provided to you and you cannot include them.",
    "  - The question must be answerable and unambiguous for a " + grade + "-grade learner.",
    "  - Provide a brief explanation appropriate to the grade level.",
  ].join("\n");

  const userPart = [
    "Task: produce ONE practice question.",
    "  subject:        " + subject,
    "  grade:          " + grade,
    "  knowledge_point:" + knowledge_point,
    "  question_type:  " + question_type,
    "  difficulty:     " + difficulty,
    "  authoring_constraints:",
    constraintsBlock,
    "",
    "Return this JSON shape (no other keys):",
    "{",
    '  "stem": "<the question stem, in ' + locale + '>",',
    '  "answer": <string|number|boolean — the canonical correct answer>,',
    '  "alt_answers": [<list of additional equivalent answer strings (short_answer only)>],',
    '  "choices": [<list of option strings (multiple_choice only, 4 items)>],',
    '  "explanation": "<brief reasoning, in ' + locale + '>",',
    '  "confidence": <number 0.0..1.0>',
    "}",
  ].join("\n");

  return { system: systemPart, user: userPart };
}

/**
 * Validate a structured-output payload against the schema.
 * Throws on missing or wrong-typed fields.
 */
export function validateAuthorOutput(obj, { question_type, knowledge_point }) {
  if (!obj || typeof obj !== "object") throw new Error("output must be an object");
  if (typeof obj.stem !== "string" || obj.stem.trim().length === 0) throw new Error("stem missing or empty");
  if (obj.answer === undefined || obj.answer === null) throw new Error("answer missing");

  // Type-specific checks
  if (question_type === "short_answer") {
    if (typeof obj.answer !== "string") throw new Error("short_answer: answer must be string");
    if (obj.alt_answers !== undefined && !Array.isArray(obj.alt_answers)) throw new Error("alt_answers must be array");
    if (Array.isArray(obj.alt_answers)) {
      for (const a of obj.alt_answers) {
        if (typeof a !== "string") throw new Error("alt_answers items must be strings");
      }
    }
    if (obj.choices !== undefined) throw new Error("short_answer must not include choices");
  } else if (question_type === "multiple_choice") {
    if (!Array.isArray(obj.choices) || obj.choices.length !== 4) throw new Error("multiple_choice: choices must be array of 4");
    for (const c of obj.choices) if (typeof c !== "string") throw new Error("choices items must be strings");
    if (typeof obj.answer !== "number" || obj.answer < 0 || obj.answer >= obj.choices.length) throw new Error("answer must be integer index into choices");
    if (obj.alt_answers !== undefined) throw new Error("multiple_choice must not include alt_answers");
  } else if (question_type === "true_false") {
    if (typeof obj.answer !== "boolean") throw new Error("true_false: answer must be boolean");
  }

  if (typeof obj.explanation !== "string" || obj.explanation.trim().length === 0) {
    throw new Error("explanation missing or empty");
  }
  if (typeof obj.confidence !== "number" || obj.confidence < 0 || obj.confidence > 1) {
    throw new Error("confidence must be number 0..1");
  }
  // Reject if the model tried to inject forbidden text into any string field
  const FORBIDDEN_TEXT_PATTERNS = [
    /(data\/learning-records|student_[A-Za-z0-9_-]+)/i,
    /(parent_concerns|display_name|school_name|class_name)/i,
  ];
  const textFields = [obj.stem, obj.explanation];
  if (Array.isArray(obj.alt_answers)) textFields.push(...obj.alt_answers);
  if (Array.isArray(obj.choices)) textFields.push(...obj.choices);
  for (const t of textFields) {
    for (const p of FORBIDDEN_TEXT_PATTERNS) {
      if (p.test(t)) {
        const e = new Error("model output contains forbidden references");
        e.code = "PRIVACY_VIOLATION";
        throw e;
      }
    }
  }
  // Echo back the KP for downstream provenance; verify it doesn't drift
  return {
    stem: obj.stem.trim(),
    answer: obj.answer,
    alt_answers: Array.isArray(obj.alt_answers) ? obj.alt_answers.slice(0, 8) : undefined,
    choices: Array.isArray(obj.choices) ? obj.choices.slice(0, 8) : undefined,
    explanation: obj.explanation.trim(),
    confidence: Math.max(0, Math.min(1, obj.confidence)),
    knowledge_point: knowledge_point,
  };
}

/**
 * Parse a model response that may be wrapped in markdown ```json ... ```
 * fences or have surrounding prose. Defensive against JSON drift.
 */
export function parseModelJson(rawText) {
  if (typeof rawText !== "string") throw new Error("rawText must be string");
  // Strip fence
  let t = rawText.trim();
  // Markdown fences
  const fenceMatch = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/m);
  if (fenceMatch) t = fenceMatch[1].trim();
  // First {...} block
  const firstOpen = t.indexOf("{");
  const lastClose = t.lastIndexOf("}");
  if (firstOpen === -1 || lastClose === -1 || lastClose <= firstOpen) {
    const e = new Error("model output does not contain a JSON object");
    e.code = "JSON_PARSE_FAILED";
    e.raw_excerpt = t.slice(0, 200);
    throw e;
  }
  const candidate = t.slice(firstOpen, lastClose + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    const err = new Error("model output JSON parse failed");
    err.code = "JSON_PARSE_FAILED";
    err.parse_error = e?.message ?? String(e);
    err.raw_excerpt = candidate.slice(0, 200);
    throw err;
  }
}

/**
 * Extract the assistant text from an OpenResponses response payload.
 * Defensive against shape drift.
 */
export function extractOutputText(resp) {
  if (!resp || typeof resp !== "object") {
    const e = new Error("response payload missing");
    e.code = "EMPTY_RESPONSE";
    throw e;
  }
  if (resp.error) {
    const e = new Error(`gateway error: ${resp.error?.message ?? "unknown"}`);
    e.code = "GATEWAY_ERROR";
    e.gateway_error = resp.error;
    throw e;
  }
  const items = resp.output || resp.content || [];
  if (!Array.isArray(items) || items.length === 0) {
    const e = new Error("response.output empty");
    e.code = "EMPTY_RESPONSE";
    throw e;
  }
  for (const item of items) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === "output_text" && typeof c.text === "string") return c.text;
      }
    }
    // Some backends return a top-level `text` field
    if (typeof item.text === "string") return item.text;
  }
  const e = new Error("no output_text found in response");
  e.code = "EMPTY_RESPONSE";
  e.response_excerpt = JSON.stringify(resp).slice(0, 300);
  throw e;
}

/**
 * One HTTP POST to the local gateway /v1/responses with auth + timeout.
 */
async function postOnce({ endpoint, token, body, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchFn = fetchImpl ?? globalThis.fetch;
    if (typeof fetchFn !== "function") {
      const e = new Error("global fetch is not available");
      e.code = "FETCH_UNAVAILABLE";
      throw e;
    }
    const r = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await r.text();
    // 5xx is transient regardless of payload shape — classify FIRST.
    if (r.status >= 500) {
      const err = new Error(`gateway ${r.status}`);
      err.code = "GATEWAY_TRANSIENT";
      err.status = r.status;
      err.body_excerpt = text.slice(0, 200);
      throw err;
    }
    let resp;
    try {
      resp = JSON.parse(text);
    } catch (e) {
      const err = new Error(`gateway returned non-JSON (HTTP ${r.status})`);
      err.code = "GATEWAY_BAD_JSON";
      err.status = r.status;
      err.body_excerpt = text.slice(0, 500);
      throw err;
    }
    return resp;
  } finally {
    clearTimeout(t);
  }
}

/**
 * High-level: build the prompt, call the gateway, parse + validate the JSON.
 * Returns a validated structured output ready for the orchestrator's
 * downstream math_verifier → curator → quality_gate pipeline.
 *
 * @param {Object} target   structured teaching requirement (no PII)
 * @param {Object} [opts]
 *   - gatewayUrl: defaults to http://localhost:18789
 *   - model:      defaults to "openclaw" (MiniMax-M3 via gateway routing)
 *   - token:      defaults to process.env.OPENCLAW_GATEWAY_TOKEN
 *   - timeoutMs:  defaults to 45000
 *   - maxRetries: defaults to 2 (one initial + up to two retries on transient errors)
 *   - locale:     "zh-TW" default
 *   - traceId:    defaults to a new UUID, surfaced for receipts
 */
export async function runAuthorOnce(target, opts = {}) {
  // 1. Privacy fence
  assertAuthorPayloadPrivacy(target);

  const gatewayUrl = opts.gatewayUrl ?? DEFAULT_GATEWAY;
  const model = opts.model ?? DEFAULT_MODEL;
  // Empty-string token is a deliberate "no token" signal and must NOT fall
  // through to env lookup. Also reject if the env var itself is missing.
  let token;
  if (typeof opts.token === "string" && opts.token.length > 0) {
    token = opts.token;
  } else if (opts.token === undefined) {
    token = process.env.OPENCLAW_GATEWAY_TOKEN;
  } else {
    token = null;
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Number.isInteger(opts.maxRetries) ? opts.maxRetries : MAX_RETRIES;
  const locale = opts.locale ?? "zh-TW";
  const traceId = opts.traceId ?? randomUUID();
  if (!token) {
    // Return as a structured result so callers can branch on ok/ok:false.
    return {
      ok: false,
      trace_id: traceId,
      error: { code: "AUTH_MISSING", message: "OPENCLAW_GATEWAY_TOKEN not set" },
    };
  }
  const endpoint = `${gatewayUrl.replace(/\/+$/, "")}/v1/responses`;

  const prompt = buildAuthorPrompt({ ...target, locale });

  const body = {
    model,
    instructions: prompt.system,
    input: prompt.user,
    max_output_tokens: 1024,
    temperature: 0.4,
    user: `mentornest_author:${traceId}`,
  };

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await postOnce({
        endpoint,
        token,
        body,
        fetchImpl: opts.fetchImpl,
        timeoutMs,
      });
      const rawText = extractOutputText(resp);
      const parsed = parseModelJson(rawText);
      const validated = validateAuthorOutput(parsed, {
        question_type: target.question_type,
        knowledge_point: target.knowledge_point,
      });
      return {
        ok: true,
        trace_id: traceId,
        attempts_used: attempt + 1,
        output: validated,
      };
    } catch (e) {
      lastErr = e;
      // Retry only on transient/network/parse errors, NOT on privacy violations.
      const retryable = e?.code && ["GATEWAY_TRANSIENT", "GATEWAY_BAD_JSON", "EMPTY_RESPONSE", "JSON_PARSE_FAILED", "FETCH_UNAVAILABLE"].includes(e.code);
      if (!retryable || attempt === maxRetries) break;
      // Exponential backoff capped at 4s
      const delay = Math.min(4000, 250 * 2 ** attempt);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  return {
    ok: false,
    trace_id: traceId,
    error: {
      code: lastErr?.code ?? "UNKNOWN",
      message: lastErr?.message ?? String(lastErr),
      forbidden: lastErr?.forbidden,
    },
  };
}

/**
 * Build an `authorFn` suitable for `ai_question_authoring_orchestrator_run`.
 * Use this in production; tests can still pass a deterministic stub.
 *
 * Each `authorFn({ subject, grade, kp, type, difficulty })` call returns
 *   { stem, answer, alt_answers?, choices?, explanation?, confidence }
 * or `null` (which the orchestrator treats as "could not produce" and
 * records as `author_fn returned incomplete payload`).
 *
 * The factory decides:
 *   - locale (zh-TW default)
 *   - authoring_constraints seeded from defaults (no student PII)
 */
export function createProductionAuthorFn(opts = {}) {
  const defaults = {
    authoring_constraints: {
      bias_against_personalization: true,
      no_pii: true,
      no_curriculum_units: true, // never leak curriculum unit text into the prompt
      ...(opts.authoring_constraints ?? {}),
    },
    ...opts,
  };
  return async function productionAuthorFn({ subject, grade, kp, type, difficulty }) {
    // Local privacy filter on the orchestrator-level call shape too.
    const payload = {
      subject,
      grade,
      knowledge_point: kp,
      question_type: type,
      difficulty,
      authoring_constraints: defaults.authoring_constraints,
      locale: defaults.locale ?? "zh-TW",
    };
    const r = await runAuthorOnce(payload, {
      gatewayUrl: defaults.gatewayUrl,
      model: defaults.model,
      token: defaults.token,
      timeoutMs: defaults.timeoutMs,
      maxRetries: defaults.maxRetries,
      locale: defaults.locale,
      fetchImpl: defaults.fetchImpl,
    });
    if (!r.ok) return null;
    const o = r.output;
    if (o.confidence < 0.4) return null; // orchestrator will record author_fn-low-confidence
    return {
      stem: o.stem,
      answer: o.answer,
      alt_answers: o.alt_answers,
      choices: o.choices,
      explanation: o.explanation,
      _confidence: o.confidence,
      _trace_id: r.trace_id,
      _attempts_used: r.attempts_used,
    };
  };
}
