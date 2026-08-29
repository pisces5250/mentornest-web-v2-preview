// Question ID generation + source-class enumeration.
//
// IDs are deterministic from (source_class, source_id, kp, nonce) so that
// re-running the same authoring pipeline does not double-insert.
//
// Source-class is restricted by policies.yaml §4 to:
//   - student_private (Phase 4+, NOT active in V1 first source)
//   - ai_authored (MentorNest AI original/adapted) ← V1 first source
//   - open_license (V1 third source)
//   - teacher_authored (V1 fourth source)
//
// We do NOT include any commercial publisher class.

import { randomUUID } from "node:crypto";

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
 * Make a question ID.
 *
 * @param {object} parts
 * @param {string} parts.source_class - one of VALID_SOURCE_CLASSES
 * @param {string} parts.source_id - opaque source identifier (e.g. AI generation batch id)
 * @param {string} parts.kp - knowledge_point id (e.g. "math.G5.FRAC.add-unlike-denom")
 * @returns {string} id like "q.mentornest_ai.<kp_short>.<uuid>"
 */
export function makeQuestionId(parts) {
  if (!parts || typeof parts !== "object") {
    throw new Error("makeQuestionId: parts is required");
  }
  const { source_class, source_id, kp } = parts;
  if (!VALID_SOURCE_CLASSES.includes(source_class)) {
    throw new Error(`makeQuestionId: invalid source_class ${source_class}`);
  }
  if (typeof source_id !== "string" || !source_id.trim()) {
    throw new Error("makeQuestionId: source_id is required");
  }
  if (typeof kp !== "string" || !/^[a-z]+\.G\d+\.[A-Z]+\.[a-z0-9-]+$/.test(kp)) {
    throw new Error(`makeQuestionId: invalid kp ${kp}`);
  }
  const uuid = randomUUID();
  return `q.${source_class}.${kp}.${uuid}`;
}

/**
 * Parse an id back into its components. Useful for path generation.
 */
export function parseQuestionId(id) {
  if (typeof id !== "string") return null;
  const m = id.match(/^q\.([a-z_]+)\.([a-z]+\.G\d+\.[A-Z]+\.[a-z0-9-]+)\.([0-9a-f-]+)$/);
  if (!m) return null;
  return { source_class: m[1], kp: m[2], nonce: m[3] };
}
