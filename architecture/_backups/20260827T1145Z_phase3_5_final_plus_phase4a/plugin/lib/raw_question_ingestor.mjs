// lib/raw_question_ingestor.mjs
//
// Phase 4A — Raw Question Ingestor.
//
// Pure (no disk writes) ingestion of raw content from four input kinds:
//   1. plain text         (multi-line string, may contain multiple questions)
//   2. structured JSON    (already-typed questions, partial schema)
//   3. PDF binary         (Uint8Array or base64 — throws unsupported_in_round_4a)
//   4. image binary       (Uint8Array — throws unsupported_in_round_4a)
//
// Output: a RawIngestionReport containing RawCandidate[] with source_kind,
// byte_offset (where known), detection_signals, and source_provenance.
//
// This module does NOT promote anything to the verified question bank.
// The curator / quality gate will handle that in a later phase.
//
// Cloud OCR and pdf-parse are NOT used; PDFs and images throw a clean
// `unsupported_in_round_4a` error.

import { randomUUID, randomBytes } from "node:crypto";

export const INGESTION_KIND = Object.freeze({
  TEXT: "text",
  STRUCTURED: "structured",
  PDF: "pdf",
  IMAGE: "image",
});

export const VALID_KINDS = Object.freeze([
  INGESTION_KIND.TEXT,
  INGESTION_KIND.STRUCTURED,
  INGESTION_KIND.PDF,
  INGESTION_KIND.IMAGE,
]);

export const SOURCE_CLASS = Object.freeze({
  STUDENT_PRIVATE: "student_private",
  AI_AUTHORED: "ai_authored",
  OPEN_LICENSE: "open_license",
  TEACHER_AUTHORED: "teacher_authored",
});

export const VALID_SOURCE_CLASSES = Object.freeze([
  SOURCE_CLASS.STUDENT_PRIVATE,
  SOURCE_CLASS.AI_AUTHORED,
  SOURCE_CLASS.OPEN_LICENSE,
  SOURCE_CLASS.TEACHER_AUTHORED,
]);

export const LICENSE = Object.freeze({
  AI_ORIGINAL: "AI_ORIGINAL",
  AI_ADAPTED: "AI_ADAPTED",
  CC_BY: "CC-BY",
  CC_BY_SA: "CC-BY-SA",
  CC0: "CC0",
  PRIVATE: "PRIVATE",
});

export const VALID_LICENSES = Object.freeze([
  LICENSE.AI_ORIGINAL,
  LICENSE.AI_ADAPTED,
  LICENSE.CC_BY,
  LICENSE.CC_BY_SA,
  LICENSE.CC0,
  LICENSE.PRIVATE,
]);

/**
 * Generate a ULID-ish id: 10-char Crockford-base32 timestamp prefix
 * (ms since epoch) + 16-char random suffix. Monotonic-ish and sortable.
 */
export function makeCandidateId(now = Date.now()) {
  const ts = now.toString(36).padStart(10, "0").slice(-10).toUpperCase();
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
  let rand = "";
  const buf = randomBytes(10);
  for (let i = 0; i < buf.length; i++) {
    rand += ALPHABET[buf[i] % ALPHABET.length];
  }
  return `cand_${ts}${rand}`;
}

export function makeIngestionId() {
  return `ing_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

export function isValidKind(kind) {
  return VALID_KINDS.includes(kind);
}

export function isValidSourceClass(sc) {
  return VALID_SOURCE_CLASSES.includes(sc);
}

export function isValidLicense(lc) {
  return VALID_LICENSES.includes(lc);
}

/**
 * Compute detection_signals for a text block.
 */
export function computeSignals(text) {
  const t = typeof text === "string" ? text : "";
  const has_question_mark = /[?？]/.test(t);
  // Choice patterns:
  //   A) foo   B) bar   C) baz   D) qux
  //   (A) (B) (C) (D)
  //   A. foo   B. bar
  const has_choice_pattern =
    /(^|\s)\(?[A-D]\)?\s*[\.\)]/.test(t) ||
    /[A-D]\)\s+\S+.*[A-D]\)\s+\S+/.test(t);
  // Answer-key pattern:
  //   Answer: 42
  //   答案： 3
  //   Ans: foo
  const has_answer_key =
    /(^|\n)\s*(answer|ans|答案|解答|參考答案)\s*[:：]/i.test(t);
  return {
    has_question_mark,
    has_choice_pattern,
    has_answer_key,
    stem_length: t.length,
  };
}

/**
 * Split a multi-line text into raw candidate blocks. We split on
 *   - blank-line boundaries, or
 *   - numbered-question prefixes (1. 2. 3.) at the start of a line.
 * Each non-empty block becomes one RawCandidate.
 */
export function splitTextIntoBlocks(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  // Normalize line endings.
  const norm = text.replace(/\r\n?/g, "\n");
  const lines = norm.split("\n");
  const blocks = [];
  let current = [];
  let currentStart = 0;
  let cursor = 0;
  const NUMBERED = /^\s*\d{1,3}\s*[\.\)、]\s+\S/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = cursor;
    cursor += line.length + 1;
    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push({ text: current.join("\n").trim(), byte_offset: currentStart });
        current = [];
      }
      continue;
    }
    if (NUMBERED.test(line) && current.length > 0) {
      blocks.push({ text: current.join("\n").trim(), byte_offset: currentStart });
      current = [];
    }
    if (current.length === 0) currentStart = lineStart;
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push({ text: current.join("\n").trim(), byte_offset: currentStart });
  }
  return blocks;
}

/**
 * Normalize structured-JSON input. Accepts:
 *   - { questions: [{...}, ...] }
 *   - [...]  (array)
 *   - { ... }  (single question)
 * Returns an array of question objects.
 */
export function normalizeStructuredQuestions(content) {
  if (Array.isArray(content)) return content;
  if (content && typeof content === "object") {
    if (Array.isArray(content.questions)) return content.questions;
    if (Array.isArray(content.items)) return content.items;
    if (typeof content.stem === "string") return [content];
  }
  return [];
}

function asUint8Array(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (buf && typeof buf === "object" && buf.type === "Buffer" && Array.isArray(buf.data)) {
    return Uint8Array.from(buf.data);
  }
  if (typeof buf === "string") {
    // base64
    try {
      return Uint8Array.from(Buffer.from(buf, "base64"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Build a single RawCandidate from a raw text block + metadata.
 */
export function buildCandidate({
  source_kind,
  raw_text,
  byte_offset = null,
  ingestion_id,
  source_class,
  source_id,
  license,
}) {
  return {
    candidate_id: makeCandidateId(),
    source_kind,
    raw_text,
    byte_offset,
    detection_signals: computeSignals(raw_text),
    ingestion_id,
    ingested_at: new Date().toISOString(),
    source_provenance: {
      source_class,
      source_id,
      license,
    },
  };
}

/**
 * Main ingest entry point. Dispatches on `kind`.
 *
 * @param {object} input
 * @param {"text"|"structured"|"pdf"|"image"} input.kind
 * @param {string|object|Uint8Array} input.content
 * @param {string} input.source_class
 * @param {string} input.source_id
 * @param {string} input.license
 * @returns {RawIngestionReport}
 */
export function ingestRawQuestion(input) {
  input = input || {};
  const errors = [];
  const kind = input.kind;
  if (!isValidKind(kind)) {
    return {
      ok: false,
      kind: kind || null,
      raw_question_count: 0,
      candidates: [],
      errors: [
        {
          code: "invalid_kind",
          message: `ingestRawQuestion: invalid kind "${kind}". Allowed: ${VALID_KINDS.join(", ")}`,
        },
      ],
      warning: null,
    };
  }

  const { source_class, source_id, license } = input;
  if (!isValidSourceClass(source_class)) {
    errors.push({
      code: "invalid_source_class",
      message: `ingestRawQuestion: invalid source_class "${source_class}". Allowed: ${VALID_SOURCE_CLASSES.join(", ")}`,
    });
  }
  if (typeof source_id !== "string" || !source_id.trim()) {
    errors.push({ code: "missing_source_id", message: "ingestRawQuestion: source_id is required" });
  }
  if (!isValidLicense(license)) {
    errors.push({
      code: "invalid_license",
      message: `ingestRawQuestion: invalid license "${license}". Allowed: ${VALID_LICENSES.join(", ")}`,
    });
  }

  // Short-circuit on validation errors before attempting to parse.
  if (errors.length > 0) {
    return {
      ok: false,
      kind,
      raw_question_count: 0,
      candidates: [],
      errors,
      warning: null,
    };
  }

  const ingestion_id = makeIngestionId();

  if (kind === INGESTION_KIND.TEXT) {
    return ingestText(input.content, { ingestion_id, source_class, source_id, license });
  }
  if (kind === INGESTION_KIND.STRUCTURED) {
    return ingestStructured(input.content, { ingestion_id, source_class, source_id, license });
  }
  if (kind === INGESTION_KIND.PDF) {
    return ingestPdf(input.content, { ingestion_id, source_class, source_id, license });
  }
  if (kind === INGESTION_KIND.IMAGE) {
    return ingestImage(input.content, { ingestion_id, source_class, source_id, license });
  }
  // Should be unreachable given isValidKind check above.
  return {
    ok: false,
    kind,
    raw_question_count: 0,
    candidates: [],
    errors: [{ code: "unreachable_kind", message: `ingestRawQuestion: unreachable kind "${kind}"` }],
    warning: null,
  };
}

function ingestText(content, meta) {
  const errors = [];
  let warning = null;
  if (typeof content !== "string") {
    return {
      ok: false,
      kind: INGESTION_KIND.TEXT,
      raw_question_count: 0,
      candidates: [],
      errors: [{ code: "invalid_content_type", message: "ingestText: content must be a string" }],
      warning: null,
    };
  }
  const blocks = splitTextIntoBlocks(content);
  if (blocks.length === 0) {
    warning = "No non-empty text blocks detected";
    return {
      ok: true,
      kind: INGESTION_KIND.TEXT,
      raw_question_count: 0,
      candidates: [],
      errors: [],
      warning,
    };
  }
  const candidates = blocks.map((b) =>
    buildCandidate({
      source_kind: INGESTION_KIND.TEXT,
      raw_text: b.text,
      byte_offset: b.byte_offset,
      ingestion_id: meta.ingestion_id,
      source_class: meta.source_class,
      source_id: meta.source_id,
      license: meta.license,
    })
  );
  return {
    ok: true,
    kind: INGESTION_KIND.TEXT,
    raw_question_count: candidates.length,
    candidates,
    errors,
    warning,
  };
}

function ingestStructured(content, meta) {
  const errors = [];
  if (content === null || content === undefined || typeof content !== "object") {
    return {
      ok: false,
      kind: INGESTION_KIND.STRUCTURED,
      raw_question_count: 0,
      candidates: [],
      errors: [
        { code: "invalid_content_type", message: "ingestStructured: content must be an object or array" },
      ],
      warning: null,
    };
  }
  const items = normalizeStructuredQuestions(content);
  if (items.length === 0) {
    return {
      ok: false,
      kind: INGESTION_KIND.STRUCTURED,
      raw_question_count: 0,
      candidates: [],
      errors: [{ code: "no_questions_in_payload", message: "ingestStructured: no question objects found" }],
      warning: null,
    };
  }
  const candidates = items.map((it, idx) => {
    const stem = typeof it?.stem === "string" ? it.stem : "";
    const raw_text = stem || JSON.stringify(it);
    return buildCandidate({
      source_kind: INGESTION_KIND.STRUCTURED,
      raw_text,
      byte_offset: idx,
      ingestion_id: meta.ingestion_id,
      source_class: meta.source_class,
      source_id: meta.source_id,
      license: meta.license,
    });
  });
  return {
    ok: true,
    kind: INGESTION_KIND.STRUCTURED,
    raw_question_count: candidates.length,
    candidates,
    errors,
    warning: null,
  };
}

function ingestPdf(content, meta) {
  // Validate content is binary-looking (Uint8Array or base64). Still we throw
  // the unsupported error.
  const buf = asUint8Array(content);
  if (!buf && content !== null && content !== undefined) {
    return {
      ok: false,
      kind: INGESTION_KIND.PDF,
      raw_question_count: 0,
      candidates: [],
      errors: [
        {
          code: "invalid_content_type",
          message: "ingestPdf: content must be a Uint8Array or base64 string",
        },
      ],
      warning: null,
    };
  }
  return {
    ok: false,
    kind: INGESTION_KIND.PDF,
    raw_question_count: 0,
    candidates: [],
    candidates_intended_count: undefined,
    errors: [
      {
        code: "unsupported_in_round_4a",
        message:
          "ingestPdf: PDF parsing is not supported in Phase 4A round. " +
          "No cloud OCR or pdf-parse dependency was installed. " +
          "Provide text or structured input instead, or upgrade to a later round.",
      },
    ],
    warning: null,
  };
}

function ingestImage(content, meta) {
  const buf = asUint8Array(content);
  if (!buf && content !== null && content !== undefined) {
    return {
      ok: false,
      kind: INGESTION_KIND.IMAGE,
      raw_question_count: 0,
      candidates: [],
      errors: [
        {
          code: "invalid_content_type",
          message: "ingestImage: content must be a Uint8Array or base64 string",
        },
      ],
      warning: null,
    };
  }
  return {
    ok: false,
    kind: INGESTION_KIND.IMAGE,
    raw_question_count: 0,
    candidates: [],
    errors: [
      {
        code: "unsupported_in_round_4a",
        message:
          "ingestImage: image OCR is not supported in Phase 4A round. " +
          "No cloud OCR or local OCR dependency was installed. " +
          "Provide text or structured input instead, or upgrade to a later round.",
      },
    ],
    warning: null,
  };
}

export const __TEST__ = Object.freeze({
  splitTextIntoBlocks,
  normalizeStructuredQuestions,
  computeSignals,
  asUint8Array,
});