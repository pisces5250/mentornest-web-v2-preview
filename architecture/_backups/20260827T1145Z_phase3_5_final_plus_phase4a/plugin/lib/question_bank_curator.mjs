// Question Bank Curator v1.
//
// Input : a raw question (passed through authoring).
// Output: a curated question (validated structure, curriculum-aligned, provenance
//         verified) ready to enter the Quality Gate.
//
// Curator does NOT verify answers (that is the Quality Agent's job).
// Curator does NOT detect duplicates (also Quality Agent — so dedupe compares
// only against already-verified questions, which is a stronger guarantee).

import { validateQuestionStructure } from "./question_validator.mjs";
import { validateProvenance } from "./question_provenance.mjs";
import { atomicWriteJson, questionPath, BUCKETS } from "./question_store.mjs";

/**
 * Curate a raw question.
 *
 * @param {object} rawQuestion
 * @param {object} ctx
 * @param {object} ctx.curriculum_index
 * @param {string} [ctx.root]
 * @returns {{ ok: true, curated: object, path: string } | { ok: false, reason: string, stage: string }}
 */
export async function curateQuestion(rawQuestion, ctx) {
  const root = (ctx && ctx.root) || undefined;
  // 1) structural + curriculum alignment
  const struct = validateQuestionStructure(rawQuestion, ctx);
  if (!struct.ok) {
    return { ok: false, reason: struct.reason, stage: "structure" };
  }
  // 2) provenance integrity
  const prov = validateProvenance(rawQuestion.provenance);
  if (!prov.ok) {
    return { ok: false, reason: prov.reason, stage: "provenance" };
  }
  // 3) stamp curator metadata
  const curated = {
    ...rawQuestion,
    curator: {
      curated_at: new Date().toISOString(),
      stage_passed: ["structure", "provenance"],
    },
  };
  // 4) persist into curated/ (idempotent — overwriting allowed since source_id
  //    + nonce makes id unique)
  const fp = questionPath({
    bucket: BUCKETS[1], // curated
    subject: curated.subject,
    grade: curated.grade,
    id: curated.id,
    root,
  });
  await atomicWriteJson(fp, curated);
  // 5) mirror into raw/ for traceability (raw may keep the original payload
  //    including any pre-curator fields we stripped)
  const rawFp = questionPath({
    bucket: BUCKETS[0], // raw
    subject: curated.subject,
    grade: curated.grade,
    id: curated.id,
    root,
  });
  await atomicWriteJson(rawFp, rawQuestion);
  return { ok: true, curated, path: fp };
}
