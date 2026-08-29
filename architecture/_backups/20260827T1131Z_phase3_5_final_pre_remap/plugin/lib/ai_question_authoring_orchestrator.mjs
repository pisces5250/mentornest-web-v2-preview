// AI Question Authoring Orchestrator.
//
// Per 2026-08-27 product decision: authoring is COVERAGE-DRIVEN, not
// cadence-driven. Per active (subject, grade), the orchestrator:
//   1. computes coverage gaps using coverage_report
//   2. ranks gaps by missing count
//   3. produces an "authoring_plan" — ordered list of (kp, type, difficulty)
//      that the orchestrator intends to fill
//   4. drives the authoring loop via a pluggable `authorFn` hook
//   5. hands each authored raw question through:
//      question_bank_curator_curate  →  question_quality_agent_verify
//   6. captures receipts (math-specialist independent verifier receipt +
//      curator receipt + quality receipt)
//   7. returns a final authoring_run_report
//
// IMPORTANT: this module NEVER calls an external LLM. The `authorFn` is
// provided by the caller. The default `authorFn` is a deterministic stub
// that returns a known-good synthetic question for math (used for tests).
// In production, authorFn is supplied by the AI authoring skill (e.g. via
// sherpa-onnx-local-llm or any in-house generator). All generated content
// still must pass the same Quality Gate as human-authored questions.
//
// File-system side-effects:
//   - Reads `data/questions/verified/` (read-only)
//   - May write to `data/questions/curated/` + `data/questions/verified/` via
//     curator + quality-agent (passed in as `curator` and `qualityAgent` fns).
//   - Never writes to `data/questions/rejected/` directly — quality agent owns that.

import { buildCoverageReport, topGaps } from "./coverage_report.mjs";
import { curateQuestion } from "./question_bank_curator.mjs";
import { verifyQuestion } from "./question_quality_agent.mjs";
import { verifyMathQuestion, receiptPassed } from "./math_specialist_verifier.mjs";
import { makeQuestionId } from "./question_id.mjs";
import { buildProvenance } from "./question_provenance.mjs";
import { buildMergedIndex } from "./curriculum_map.mjs";
import path from "node:path";

/**
 * Default deterministic stub author. Used by tests + as a safe no-op default.
 * In production, callers inject a real authorFn via opts.
 *
 * V1 stub supports ONLY:
 *   - math short_answer  (returns fraction 5/6 with three equivalent alts)
 *   - math multiple_choice  (returns fraction 5/6 with 4 choices)
 *   - math true_false  (returns T/F)
 *   - non-math  (returns placeholder string for non-numeric subjects)
 * Other combinations return null (orchestrator will reject with author_fn-empty).
 *
 * @param {{ subject, grade, kp, type, difficulty }} target
 * @returns {{ stem, answer, alt_answers?, choices?, explanation? } | null}
 */
export function defaultStubAuthor({ subject, grade, kp, type, difficulty }) {
  if (subject !== "math") {
    return {
      stem: `(${difficulty}) 請以一句話說明 ${kp} 的核心概念。`,
      answer: "(stub) 待真人或 AI 模型填入",
      explanation: "stub author — replace with real generator.",
    };
  }
  if (type === "short_answer") {
    const stem = `(${difficulty}) 計算 1/2 + 1/3 的結果`;
    return {
      stem,
      answer: "5/6",
      alt_answers: ["5/6", "10/12", "15/18"], // all reduce to 5/6
      explanation: "通分後 3/6 + 2/6 = 5/6。",
    };
  }
  if (type === "multiple_choice") {
    const stem = `(${difficulty}) 計算 1/2 + 1/3 的結果`;
    return {
      stem,
      answer: 1, // index of "5/6" in choices
      choices: ["1/5", "5/6", "2/5", "3/4"],
      explanation: "選項中最小的公分母為 6，1/2 + 1/3 = 3/6 + 2/6 = 5/6。",
    };
  }
  if (type === "true_false") {
    const stem = `(${difficulty}) 1/2 + 1/3 = 5/6`;
    return {
      stem,
      answer: true,
      choices: [true, false],
      explanation: "通分後為 3/6 + 2/6 = 5/6。",
    };
  }
  return null;
}

/**
 * Run a coverage-driven authoring cycle.
 *
 * @param {Object} opts
 * @param {string} opts.workspace
 * @param {string} opts.subject
 * @param {number} opts.grade
 * @param {Array<{kp:string, subskills?:string[]}>} [opts.kps]
 * @param {number} [opts.batch_size=5]   — max cells to attempt in this run
 * @param {(target: {subject,grade,kp,type,difficulty}) => {stem,answer,alt_answers?,choices?,explanation?}} [opts.authorFn]
 * @param {string} [opts.prompt_hash_prefix="orchestrator"]
 * @returns {{
 *   ok: true,
 *   report: { subject, grade, kps_scanned, cells_total, cells_covered, coverage_ratio, gaps, authoring_priority },
 *   plan: Array<{kp,type,difficulty,target,actual,missing}>,
 *   run: Array<{
 *     target: {kp,type,difficulty},
 *     receipt: { math_verifier, curator, quality },
 *     written_to?: string,
 *     rejected?: { reason: string, stage: string },
 *   }>,
 *   summary: { attempted, accepted, rejected, ratio_accepted },
 * }}
 */
export async function runAuthoringCycle(opts) {
  const {
    workspace,
    subject,
    grade,
    kps,
    batch_size = 5,
    authorFn = defaultStubAuthor,
    prompt_hash_prefix = "orchestrator",
  } = opts;

  if (!workspace) throw new Error("workspace required");
  if (!subject) throw new Error("subject required");
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error("grade must be 1..12");

  const report = await buildCoverageReport({ workspace, subject, grade, kps });
  const plan = report.authoring_priority.slice(0, batch_size);

  const run = [];
  for (const target of plan) {
    const receipt = { math_verifier: null, curator: null, quality: null };

    // Step 1: caller-provided author produces raw stem + answer.
    // The authorFn may be sync (test stub) or async (production LLM-backed).
    let raw;
    try {
      const authorResult = authorFn({ subject, grade, kp: target.kp, type: target.type, difficulty: target.difficulty });
      raw = (authorResult && typeof authorResult.then === "function") ? await authorResult : authorResult;
    } catch (e) {
      run.push({
        target,
        receipt,
        rejected: { reason: `author_fn threw: ${e?.message ?? e}`, stage: "author_fn" },
      });
      continue;
    }
    if (!raw || !raw.stem || raw.answer === undefined || raw.answer === null) {
      run.push({
        target,
        receipt,
        rejected: { reason: "author_fn returned incomplete payload", stage: "author_fn" },
      });
      continue;
    }

    // Step 2: math-specialist independent verification (math only, short_answer only).
    if (subject === "math" && target.type === "short_answer") {
      const mathReceipt = verifyMathQuestion({
        stem: raw.stem,
        answer: raw.answer,
        alt_answers: raw.alt_answers,
        grade,
      });
      receipt.math_verifier = mathReceipt;
      if (!receiptPassed(mathReceipt)) {
        run.push({
          target,
          receipt,
          rejected: { reason: mathReceipt.reason ?? "math verifier failed", stage: "math_verifier" },
        });
        continue;
      }
    }

    // Step 3: build canonical question object with id + provenance.
    let id;
    try {
      id = makeQuestionId({
        source_class: "ai_authored",
        source_id: `${prompt_hash_prefix}-${Date.now()}`,
        kp: target.kp,
      });
    } catch (e) {
      run.push({
        target,
        receipt,
        rejected: { reason: `makeQuestionId threw: ${e?.message ?? e}`, stage: "id" },
      });
      continue;
    }

    const provenance = buildProvenance({
      source_class: "ai_authored",
      source_id: `${prompt_hash_prefix}-${Date.now()}`,
      license: "AI_ORIGINAL",
      generated_by: "mentornest_ai",
      prompt: `${prompt_hash_prefix}|${target.kp}|${target.type}|${target.difficulty}|${raw.stem}`,
    });

    const fullQuestion = {
      id,
      type: target.type,
      subject,
      grade,
      knowledge_point: target.kp,
      difficulty: target.difficulty,
      stem: raw.stem,
      answer: raw.answer,
      alt_answers: raw.alt_answers,
      choices: raw.choices,
      explanation: raw.explanation,
      provenance,
    };

    // Step 4: curator.
    let ctx;
    try {
      const ci = await buildMergedIndex();
      // The curator / quality agent / store modules expect root = data root
      // (e.g. /home/node/.openclaw/workspace/data). The orchestrator accepts
      // a workspace path and normalizes to <workspace>/data.
      const dataRoot = workspace.endsWith("/data") ? workspace : path.join(workspace, "data");
      ctx = { root: dataRoot, curriculum_index: ci };
    } catch (e) {
      run.push({
        target,
        receipt,
        rejected: { reason: `curriculum_index load failed: ${e?.message ?? e}`, stage: "curator" },
      });
      continue;
    }
    let curatorResult;
    try {
      curatorResult = await curateQuestion(fullQuestion, ctx);
    } catch (e) {
      run.push({
        target,
        receipt,
        rejected: { reason: `curator threw: ${e?.message ?? e}`, stage: "curator" },
      });
      continue;
    }
    receipt.curator = curatorResult;
    if (!curatorResult.ok) {
      run.push({
        target,
        receipt,
        rejected: { reason: curatorResult.reason ?? "curator failed", stage: "curator" },
      });
      continue;
    }

    // Step 5: quality agent verification.
    let qualityResult;
    try {
      qualityResult = await verifyQuestion(fullQuestion, ctx);
    } catch (e) {
      run.push({
        target,
        receipt,
        rejected: { reason: `quality_agent threw: ${e?.message ?? e}`, stage: "quality_agent" },
      });
      continue;
    }
    receipt.quality = qualityResult;
    if (!qualityResult.ok) {
      run.push({
        target,
        receipt,
        rejected: { reason: qualityResult.reason ?? "quality gate failed", stage: "quality_agent" },
      });
      continue;
    }

    run.push({
      target,
      receipt,
      written_to: qualityResult.path,
    });
  }

  const attempted = run.length;
  const accepted = run.filter((r) => r.written_to).length;
  const rejected = run.filter((r) => r.rejected).length;

  return {
    ok: true,
    report,
    plan,
    run,
    summary: {
      attempted,
      accepted,
      rejected,
      ratio_accepted: attempted === 0 ? 0 : accepted / attempted,
    },
  };
}

/**
 * Determine what gaps exist right now without running the loop.
 * (Useful for dashboards: "what would the orchestrator do next?" without
 * consuming budget.)
 */
export async function planAuthoringCycle(opts) {
  const { workspace, subject, grade, kps, batch_size = 5 } = opts;
  const report = await buildCoverageReport({ workspace, subject, grade, kps });
  return {
    subject,
    grade,
    cells_total: report.cells_total,
    cells_covered: report.cells_covered,
    coverage_ratio: report.coverage_ratio,
    next_batch: report.authoring_priority.slice(0, batch_size),
  };
}

/**
 * Top N gaps for one (subject, grade) — convenience wrapper.
 */
export async function planTopGaps(opts) {
  const { workspace, subject, grade, topN = 5 } = opts;
  return await topGaps({ workspace, subject, grade, topN });
}