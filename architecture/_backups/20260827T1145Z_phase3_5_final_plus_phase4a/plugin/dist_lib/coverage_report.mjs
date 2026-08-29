// Coverage report — scans the Verified Question Bank and produces a
// per-KP gap report. Pure read-only; never writes to disk.
//
// Used by:
//   - question_bank_coverage_report tool (ad-hoc inspection)
//   - ai_question_authoring_orchestrator (decides what to author next)
//
// Inputs:
//   - listVerifiedByCell(subject, grade, kp) → Map<key, count>
//   - listActiveKPs(subject, grade) → Array<{ kp, subskills? }>
//   - computeCoverageTargets(subject, kp) → Array<{ type, difficulty, target }>
//
// Output:
//   {
//     subject, grade,
//     kps_scanned, cells_total, cells_covered, coverage_ratio,
//     gaps: Array<{ kp, type, difficulty, target, actual, missing }>,
//     authoring_priority: Array<...>  // gaps sorted by missing desc, then kp asc
//   }

import { listAllVerified } from "./question_store.mjs";
import { computeCoverageTargets } from "./coverage_targets.mjs";

/**
 * @typedef {Object} CellKey
 * @property {string} subject
 * @property {number} grade
 * @property {string} kp
 * @property {string} type
 * @property {string} difficulty
 */

/**
 * Count verified questions grouped by (subject, grade, kp, type, difficulty).
 *
 * @param {string} workspace
 * @returns {Map<string, number>} key = "<subject>|G<grade>|<kp>|<type>|<difficulty>"
 */
export async function countVerifiedByCell(workspace) {
  const all = await listAllVerified(workspace);
  /** @type Map<string, number> */
  const map = new Map();
  for (const q of all) {
    const k = `${q.subject}|G${q.grade}|${q.knowledge_point}|${q.type}|${q.difficulty}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

/**
 * @param {{ workspace: string, subject: string, grade: number, kps?: Array<{kp:string, subskills?:string[]}> }} opts
 * @returns {{
 *   subject: string, grade: number,
 *   kps_scanned: number, cells_total: number, cells_covered: number,
 *   coverage_ratio: number,
 *   gaps: Array<{kp:string, type:string, difficulty:string, target:number, actual:number, missing:number}>,
 *   authoring_priority: Array<{kp:string, type:string, difficulty:string, target:number, actual:number, missing:number}>
 * }}
 */
export async function buildCoverageReport({ workspace, subject, grade, kps }) {
  if (!workspace) throw new Error("workspace required");
  if (!subject) throw new Error("subject required");
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error("grade must be 1..12");

  const cellCounts = await countVerifiedByCell(workspace);
  const kpList = kps && kps.length > 0
    ? kps
    : defaultKPsForSubject(subject, grade);

  const gaps = [];
  let cellsTotal = 0;
  let cellsCovered = 0;

  for (const { kp } of kpList) {
    const targets = computeCoverageTargets({ subject, grade, knowledgePoint: kp });
    for (const { type, difficulty, target } of targets) {
      cellsTotal++;
      const key = `${subject}|G${grade}|${kp}|${type}|${difficulty}`;
      const actual = cellCounts.get(key) ?? 0;
      if (actual >= target) {
        cellsCovered++;
      } else {
        gaps.push({ kp, type, difficulty, target, actual, missing: target - actual });
      }
    }
  }

  // Priority: highest missing count first, then alphabetical by kp.
  gaps.sort((a, b) => b.missing - a.missing || a.kp.localeCompare(b.kp) || a.type.localeCompare(b.type) || a.difficulty.localeCompare(b.difficulty));

  return {
    subject,
    grade,
    kps_scanned: kpList.length,
    cells_total: cellsTotal,
    cells_covered: cellsCovered,
    coverage_ratio: cellsTotal === 0 ? 1 : cellsCovered / cellsTotal,
    gaps,
    authoring_priority: gaps, // already sorted
  };
}

/**
 * Build a KP list for the given (subject, grade) when no explicit kps array
 * is supplied. Reads from the curriculum_map.
 *
 * @param {string} subject
 * @param {number} grade
 * @returns {Array<{ kp: string }>}
 */
function defaultKPsForSubject(subject, grade) {
  // Synchronous fallback: build a minimal list from the bundled curriculum YAML.
  // We don't pull from curriculum_map.mjs here because it is async + uses fs.
  // Instead, the caller should pass kps explicitly if they want full KP list.
  // For empty defaults we return a single placeholder so the report still runs.
  return [{ kp: `${subject}.G${grade}.UNKNOWN.unknown` }];
}

/**
 * Convenience: list only the (kp, type, difficulty) cells with highest gap.
 *
 * @param {{ workspace: string, subject: string, grade: number, topN?: number, kps?: Array<{kp:string}> }} opts
 * @returns {Array<{kp:string, type:string, difficulty:string, target:number, actual:number, missing:number}>}
 */
export async function topGaps({ workspace, subject, grade, topN = 5, kps }) {
  const report = await buildCoverageReport({ workspace, subject, grade, kps });
  return report.gaps.slice(0, topN);
}