// Provenance integrity for AI-authored or AI-adapted questions.
//
// Every question carries `provenance` with:
//   - source_class       enum
//   - source_id          opaque, must be unique per authoring run
//   - license            enum
//   - generated_at       ISO 8601
//   - generated_by       "mentornest_ai" | "<human>" | "<system>"
//   - prompt_hash        sha256 of the authoring prompt (truncated 16 chars)
//   - parent_question_id optional: only present when license=AI_ADAPTED
//
// AI_ADAPTED questions MUST carry a parent_question_id AND the parent must be
// reachable in the same store (otherwise the question is rejected at the gate).

import { createHash } from "node:crypto";
import { LICENSE } from "./question_id.mjs";

/**
 * Build a provenance object.
 *
 * @param {object} p
 * @param {string} p.source_class
 * @param {string} p.source_id
 * @param {string} p.license
 * @param {string} [p.generated_at] - ISO timestamp; defaults to now
 * @param {string} p.generated_by
 * @param {string} [p.prompt] - the authoring prompt; will be hashed
 * @param {string} [p.parent_question_id]
 */
export function buildProvenance(p) {
  if (!p || typeof p !== "object") throw new Error("buildProvenance: input required");
  const out = {
    source_class: p.source_class,
    source_id: p.source_id,
    license: p.license,
    generated_at: p.generated_at || new Date().toISOString(),
    generated_by: p.generated_by,
    prompt_hash: hashPrompt(p.prompt || ""),
  };
  if (p.license === LICENSE.AI_ADAPTED) {
    if (!p.parent_question_id) {
      throw new Error("buildProvenance: AI_ADAPTED requires parent_question_id");
    }
    out.parent_question_id = p.parent_question_id;
  }
  return out;
}

export function hashPrompt(prompt) {
  if (typeof prompt !== "string") return "";
  return createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
}

/**
 * Validate that a provenance object is complete and internally consistent.
 * Returns { ok: true } | { ok: false, reason: string }
 */
export function validateProvenance(prov) {
  if (!prov || typeof prov !== "object") {
    return { ok: false, reason: "provenance missing" };
  }
  const required = ["source_class", "source_id", "license", "generated_at", "generated_by", "prompt_hash"];
  for (const k of required) {
    if (prov[k] === undefined || prov[k] === null || prov[k] === "") {
      return { ok: false, reason: `provenance.${k} missing` };
    }
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(prov.generated_at)) {
    return { ok: false, reason: "provenance.generated_at not ISO 8601" };
  }
  if (typeof prov.prompt_hash !== "string" || !/^[0-9a-f]{16}$/.test(prov.prompt_hash)) {
    return { ok: false, reason: "provenance.prompt_hash must be 16 hex chars" };
  }
  if (prov.license === LICENSE.AI_ADAPTED) {
    if (!prov.parent_question_id) {
      return { ok: false, reason: "AI_ADAPTED requires parent_question_id" };
    }
    if (!/^q\./.test(prov.parent_question_id)) {
      return { ok: false, reason: "provenance.parent_question_id malformed" };
    }
  }
  return { ok: true };
}
