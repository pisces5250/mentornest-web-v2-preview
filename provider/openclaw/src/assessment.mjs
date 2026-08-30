import { createHash } from "node:crypto";

const ASSESSMENT_KINDS = new Set(["diagnostic", "mastery_check", "retention_check"]);
const RESULTS = new Set(["correct", "incorrect", "partially_correct"]);
const SAFE_ID = /^[a-z0-9_.-]{3,100}$/i;
const FORBIDDEN_KEY = /(mastery|mastered|score|verdict|transcript|audio|recording|raw_turns|tutor|browser|heuristic|answer_text|student_answer)/i;

export function assessObservation(input) {
  assertObject(input, "assessment_input_required");
  assertAllowedKeys(input, new Set([
    "assessment_kind", "subject", "knowledge_point", "subskill", "instrument", "attempt", "error_code",
  ]));
  if (!ASSESSMENT_KINDS.has(input.assessment_kind)) fail("invalid_assessment_kind");
  if (!safeId(input.subject) || !safeId(input.knowledge_point)) fail("invalid_assessment_target");
  if (input.subskill !== undefined && !safeId(input.subskill)) fail("invalid_assessment_target");
  if (input.error_code !== undefined && input.error_code !== null && !safeId(input.error_code)) fail("invalid_error_code");
  assertObject(input.instrument, "verified_instrument_required");
  assertAllowedKeys(input.instrument, new Set(["question_id", "verification_status", "answer_key_version"]));
  if (!safeId(input.instrument.question_id) || input.instrument.verification_status !== "verified"
    || !safeId(input.instrument.answer_key_version)) fail("verified_instrument_required");
  assertObject(input.attempt, "assessment_attempt_required");
  assertAllowedKeys(input.attempt, new Set(["response_id", "result", "hints_used", "first_attempt", "occurred_at"]));
  if (!safeId(input.attempt.response_id) || !RESULTS.has(input.attempt.result)) fail("invalid_assessment_attempt");
  if (!Number.isInteger(input.attempt.hints_used) || input.attempt.hints_used < 0 || input.attempt.hints_used > 5) fail("invalid_assessment_attempt");
  if (typeof input.attempt.first_attempt !== "boolean" || !validIsoDate(input.attempt.occurred_at)) fail("invalid_assessment_attempt");
  rejectForbiddenNested(input);
  const normalized = {
    assessment_kind: input.assessment_kind,
    subject: input.subject,
    knowledge_point: input.knowledge_point,
    subskill: input.subskill ?? null,
    instrument: { ...input.instrument },
    attempt: { ...input.attempt },
    error_code: input.error_code ?? null,
  };
  const observationId = `aobs_${createHash("sha256").update(stableJson(normalized)).digest("hex").slice(0, 24)}`;
  return Object.freeze({
    schema_version: "assessment-observation-v1",
    observation_id: observationId,
    ...normalized,
    evidence_status: "observed",
    mastery_effect: "none",
    authority: "assessment_observation_only",
  });
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
}

function assertAllowedKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key) || !allowed.has(key)) fail("assessment_field_not_allowed");
  }
}

function rejectForbiddenNested(value, depth = 0) {
  if (depth > 4) fail("assessment_input_too_deep");
  if (Array.isArray(value)) fail("assessment_array_not_allowed");
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) fail("assessment_field_not_allowed");
    if (typeof item === "string" && item.length > 200) fail("assessment_value_too_large");
    rejectForbiddenNested(item, depth + 1);
  }
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validIsoDate(value) {
  return typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value));
}

function stableJson(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
  return `{${entries.join(",")}}`;
}

function fail(code) {
  throw Object.assign(new Error(code), { code, status: 400 });
}
