// mastery_backfill.mjs
//
// Pure classification and report-builder for legacy learning-record events.
// NO file I/O in this module; I/O lives in mastery_backfill_engine.mjs.
//
// Classification rules (deterministic, no LLM):
//   subject  — from event.subject if present, else from knowledge_point prefix
//   knowledge_point — from event.knowledge_point if present, else event.unit
//   result   — normalized from event.result: "right/yes/ok/對/✓" → correct etc.
//   attempts — from event.attempts if numeric, else default 1
//   error_code — pass through event.error_code / event.error_codes[0]

import { randomUUID } from "node:crypto";

// Result normalization map
const RESULT_NORMALIZE = {
  correct: "correct",
  incorrect: "incorrect",
  partially_correct: "partially_correct",
  mastered: "mastered",
  improved: "improved",
  // Free-text aliases
  right: "correct",
  yes: "correct",
  ok: "correct",
  "對": "correct",
  "✓": "correct",
  "正确": "correct",
  "對了": "correct",
  wrong: "incorrect",
  no: "incorrect",
  "錯": "incorrect",
  "✗": "incorrect",
  "错误": "incorrect",
  "錯了": "incorrect",
  partial: "partially_correct",
  partly: "partially_correct",
  "部分正確": "partially_correct",
};

/**
 * Normalize a raw result value into a canonical result string.
 * @param {string|undefined} raw
 * @returns {"correct"|"incorrect"|"partially_correct"|"improved"|"mastered"}
 */
export function normalizeResult(raw) {
  if (!raw || typeof raw !== "string") return "incorrect";
  const trimmed = raw.trim().toLowerCase();
  return RESULT_NORMALIZE[trimmed] ?? RESULT_NORMALIZE[raw] ?? "incorrect";
}

/**
 * Derive subject from event. Falls back to knowledge_point prefix if missing.
 * Prefixes: math. / chinese. / english. / science. / social_studies.
 * @param {object} event
 * @returns {string}
 */
export function deriveSubject(event) {
  if (event.subject && typeof event.subject === "string" && event.subject.trim()) {
    return event.subject.trim();
  }
  const kp = event.knowledge_point ?? event.unit ?? "";
  if (typeof kp !== "string") return "unknown";
  const lower = kp.toLowerCase();
  if (lower.startsWith("math.")) return "math";
  if (lower.startsWith("chinese.")) return "chinese";
  if (lower.startsWith("chinese")) return "chinese";
  if (lower.startsWith("english.")) return "english";
  if (lower.startsWith("english")) return "english";
  if (lower.startsWith("science.")) return "science";
  if (lower.startsWith("science")) return "science";
  if (lower.startsWith("social_studies.")) return "social_studies";
  if (lower.startsWith("socialstudies.")) return "social_studies";
  if (lower.startsWith("social_studies")) return "social_studies";
  // Chinese subject keywords
  if (/[\u4e00-\u9fff]/.test(kp) && !lower.startsWith("math")) return "chinese";
  return "unknown";
}

/**
 * Derive knowledge_point from event.
 * @param {object} event
 * @returns {string|null}
 */
export function deriveKnowledgePoint(event) {
  if (event.knowledge_point && typeof event.knowledge_point === "string") {
    return event.knowledge_point;
  }
  if (event.unit && typeof event.unit === "string") return event.unit;
  return null;
}

/**
 * Derive attempts from event (numeric or default 1).
 * @param {object} event
 * @returns {number}
 */
export function deriveAttempts(event) {
  if (typeof event.attempts === "number" && event.attempts >= 1) {
    return event.attempts;
  }
  return 1;
}

/**
 * Derive error_code from event (pass-through of error_code or error_codes[0]).
 * @param {object} event
 * @returns {string|null}
 */
export function deriveErrorCode(event) {
  if (event.error_code && typeof event.error_code === "string") return event.error_code;
  if (Array.isArray(event.error_codes) && event.error_codes.length > 0) {
    const first = event.error_codes[0];
    if (typeof first === "string") return first;
  }
  return null;
}

/**
 * Classify a single legacy learning-record event into mastery evidence fields.
 * Deterministic, no LLM, no I/O.
 *
 * @param {object} event — raw learning-record line
 * @returns {{ subject: string, knowledge_point: string|null, result: string, attempts: number, error_code: string|null }}
 */
export function classifyEvent(event) {
  return {
    subject: deriveSubject(event),
    knowledge_point: deriveKnowledgePoint(event),
    result: normalizeResult(event.result),
    attempts: deriveAttempts(event),
    error_code: deriveErrorCode(event),
  };
}

/**
 * Build a dry-run report from an array of classified events.
 *
 * @param {string} student_id
 * @param {Array<object>} events — raw events from learning-records
 * @param {object} [opts]
 * @param {string} [opts.since] — ISO timestamp lower bound
 * @param {string} [opts.until] — ISO timestamp upper bound
 * @returns {{ proposed_evidence_count: number, would_apply: boolean, proposed_records: Array<object> }}
 */
export function buildDryRunReport(student_id, events, opts = {}) {
  const sinceT = opts.since ? Date.parse(opts.since) : -Infinity;
  const untilT = opts.until ? Date.parse(opts.until) : Infinity;

  const proposed_records = [];

  for (const event of events) {
    // Filter by time window
    const t = Date.parse(event.timestamp || "");
    if (Number.isNaN(t) || t < sinceT || t > untilT) continue;

    const classified = classifyEvent(event);
    if (!classified.knowledge_point) continue; // skip events with no KP

    const record = {
      event_index: proposed_records.length,
      original_event: {
        timestamp: event.timestamp,
        student_id: event.student_id,
        note: event.note ?? null,
      },
      proposed_evidence: {
        student_id,
        subject: classified.subject,
        knowledge_point: classified.knowledge_point,
        subskill: event.subskill ?? "",
        result: classified.result,
        error_type: classified.error_code,
        hints: event.hints ?? 0,
        attempts: classified.attempts,
        first_attempt: (classified.attempts === 1 && (event.hints ?? 0) === 0),
        source: "legacy_backfill",
        source_event_id: event.event_id ?? null,
        evidence_kind: "response",
        quality_rating: null, // computed by mastery_engine_v2
      },
    };
    proposed_records.push(record);
  }

  return {
    proposed_evidence_count: proposed_records.length,
    would_apply: proposed_records.length > 0,
    proposed_records,
  };
}

/**
 * Build a unique idempotency key for a legacy event.
 * Uses student_id + timestamp + subject + knowledge_point + result + attempts.
 *
 * @param {string} student_id
 * @param {object} event
 * @returns {string}
 */
export function buildIdempotencyKey(student_id, event) {
  const parts = [
    student_id,
    event.timestamp ?? "",
    event.subject ?? "",
    event.knowledge_point ?? "",
    normalizeResult(event.result),
    String(deriveAttempts(event)),
  ];
  return parts.join("|");
}

/**
 * Proposed evidence record shape (what gets emitted after dry-run review).
 * This shape mirrors the evidence ledger row but WITHOUT event_id / ingested_at
 * (those are assigned by mastery_engine_v2.appendEvidence).
 */
export const PROPOSED_EVIDENCE_SHAPE = {
  student_id: "string",
  subject: "string",
  knowledge_point: "string",
  subskill: "string",
  result: "string",
  error_type: "string|null",
  hints: "number",
  attempts: "number",
  first_attempt: "boolean",
  source: "legacy_backfill",
  source_event_id: "string|null",
  evidence_kind: "response",
  dry_run_report_id: "string",
  quality_rating: "number|null",
};
