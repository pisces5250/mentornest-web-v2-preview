// Question Quality Agent v1 — the gate to the Verified Question Bank.
//
// 5 mandatory checks. ALL must pass for a question to enter `verified/`:
//   1. structure (delegated to question_validator.mjs)
//   2. provenance (delegated to question_provenance.mjs)
//   3. deterministic answer verification (delegated to math_validator.mjs for
//      short_answer; multiple_choice and true_false have trivial correctness)
//   4. duplicate detection against verified bank (delegated to dedupe.mjs)
//   5. parent reachability for AI_ADAPTED (provenance.parent_question_id
//      must be a real verified question)
//
// Failures go to `rejected/` with reason. The Quality Agent is the ONLY
// authority that writes to `verified/` — Subject Specialists never write
// directly to verified.

import { promises as fs } from "node:fs";
import path from "node:path";
import { validateQuestionStructure } from "./question_validator.mjs";
import { validateProvenance } from "./question_provenance.mjs";
import { LICENSE } from "./question_id.mjs";
import { findDuplicates } from "./question_dedupe.mjs";
import { validateMathAnswer } from "./math_validator.mjs";
import { atomicWriteJson, questionPath, listAllVerified, BUCKETS } from "./question_store.mjs";

const VERIFIED_INDEX_PATH_DEFAULT = "/home/node/.openclaw/workspace/data/question-bank/index.jsonl";

/**
 * Verify a single question and (if it passes) write to verified + index.
 *
 * @param {object} q - the question (typically already curated)
 * @param {object} ctx
 * @param {object} ctx.curriculum_index
 * @param {string} [ctx.root]
 * @returns {Promise<{ ok: true, verified: object, path: string, indexEntry: object }
 *                  | { ok: false, reason: string, stage: string, dup?: object }>}
 */
export async function verifyQuestion(q, ctx) {
  const root = (ctx && ctx.root) || undefined;

  // Stage 1: structure
  const s = validateQuestionStructure(q, ctx);
  if (!s.ok) return { ok: false, reason: s.reason, stage: "structure" };

  // Stage 2: provenance
  const p = validateProvenance(q.provenance);
  if (!p.ok) return { ok: false, reason: p.reason, stage: "provenance" };

  // Stage 3: deterministic answer verification
  //
  // V1 semantics: this is a *self-consistency + parseability* check.
  //   - The question's own answer is fed to the deterministic math validator;
  //     it must parse into a single canonical form (fraction/decimal/integer/etc.),
  //     NOT fall through to the string-compare fallback. This guards against
  //     answers like "???" or "TBD" sneaking in.
  //   - alt_answers (if present) must each be equivalent to the canonical answer.
  //
  // V1 does NOT verify mathematical correctness against a separate ground truth.
  // Subject Specialist (math-specialist) is responsible for confirming the
  // answer is correct before submission. The Quality Agent rejects only
  // unparseable / multi-form answers.
  if (q.type === "short_answer") {
    const v = validateMathAnswer({ expected_answer: q.answer, student_answer: q.answer });
    // parseable-and-canonical: expected_parsed.kind is one of the numeric kinds
    const numericKinds = new Set(["fraction", "decimal", "integer", "percent", "mixed"]);
    if (!numericKinds.has(v.expected_parsed && v.expected_parsed.kind)) {
      return {
        ok: false,
        reason: `answer "${q.answer}" is not a parseable numeric form (parsed as "${v.expected_parsed && v.expected_parsed.kind}")`,
        stage: "answer-self-check",
      };
    }
    if (Array.isArray(q.alt_answers)) {
      for (const alt of q.alt_answers) {
        const va = validateMathAnswer({ expected_answer: q.answer, student_answer: alt });
        if (va.verdict !== "correct") {
          return { ok: false, reason: `alt_answer "${alt}" not equivalent to "${q.answer}"`, stage: "answer-alt-check" };
        }
      }
    }
  }
  // multiple_choice + true_false: correctness is by construction; no runtime check.

  // Stage 4: duplicate detection against verified bank
  const verifiedAll = await listAllVerified(root);
  const dups = findDuplicates(q, verifiedAll);
  if (dups.length > 0) {
    // We allow only EXACT match (score === 1.0) as a hard reject; near-identical
    // is a soft warning the curator can decide on. For now in V1, we treat
    // score >= 0.95 as duplicate (stricter) so the bank stays clean.
    const hardDup = dups.find((d) => d.score >= 0.95);
    if (hardDup) {
      return { ok: false, reason: `duplicate of ${hardDup.id} (${hardDup.reason})`, stage: "dedupe", dup: hardDup };
    }
    // soft near-match still passes, but we record it in audit
  }

  // Stage 5: parent reachability for AI_ADAPTED
  if (q.provenance.license === LICENSE.AI_ADAPTED) {
    const parentId = q.provenance.parent_question_id;
    const parent = verifiedAll.find((x) => x.id === parentId);
    if (!parent) {
      return { ok: false, reason: `parent_question_id ${parentId} not in verified bank`, stage: "parent-missing" };
    }
  }

  // All 5 passed. Stamp quality metadata and persist.
  const verified = {
    ...q,
    quality: {
      verified_at: new Date().toISOString(),
      gate_version: 1,
      stages_passed: ["structure", "provenance", "answer", "dedupe", "parent"],
      soft_warnings: dups.length > 0 ? dups : undefined,
    },
  };
  const fp = questionPath({
    bucket: BUCKETS[2], // verified
    subject: verified.subject,
    grade: verified.grade,
    id: verified.id,
    root,
  });
  await atomicWriteJson(fp, verified);

  // Append to verified index (one JSON per line) for fast streaming reads.
  const indexEntry = {
    id: verified.id,
    subject: verified.subject,
    grade: verified.grade,
    knowledge_point: verified.knowledge_point,
    difficulty: verified.difficulty,
    type: verified.type,
    license: verified.provenance.license,
    source_class: verified.provenance.source_class,
    generated_at: verified.provenance.generated_at,
    verified_at: verified.quality.verified_at,
  };
  const idx = (ctx && ctx.verified_index_path) || VERIFIED_INDEX_PATH_DEFAULT;
  await fs.mkdir(path.dirname(idx), { recursive: true });
  await fs.appendFile(idx, JSON.stringify(indexEntry) + "\n", "utf8");

  return { ok: true, verified, path: fp, indexEntry };
}

/**
 * Reject a question: write to rejected/ with reason.
 */
export async function rejectQuestion(q, ctx, reason) {
  const root = (ctx && ctx.root) || undefined;
  const fp = questionPath({
    bucket: BUCKETS[3], // rejected
    subject: q.subject,
    grade: q.grade,
    id: q.id,
    root,
  });
  await atomicWriteJson(fp, { question: q, reason, rejected_at: new Date().toISOString() });
  return { ok: true, path: fp, reason };
}
