// Learning Director v1 — orchestrator of the per-student learning trajectory.
//
// Three modules:
//   - cross_subject_weakness_aggregator
//       Takes a per-student learning_event stream + mastery records and
//       surfaces a ranked list of "weak cells" (subject × KP × subskill),
//       prioritized by:
//         1. Low mastery first
//         2. Then more recent incorrect attempts
//         3. Then larger mastery gap
//       Cross-subject view (e.g. weak in math + weak in chinese reading).
//
//   - prerequisite_gap_detector
//       Given a target KP, walks the curriculum_map prerequisite chain
//       (declared in curriculum YAML) and reports which prerequisite KPs
//       have low mastery. Used by hint_ladder / AI Authoring to suggest
//       "before tackling F6, you need to revisit F4".
//
//   - weekly_strategy_emitter
//       Combines aggregator + gap-detector + recent mastery to emit a
//       per-student WeeklyPlan:
//         {
//           student_id,
//           week_of: ISO date (Monday),
//           focus_areas: [{ subject, kp, why }],
//           review_due: [{ subject, kp, mastery, reason }],
//           suggested_practice: [{ subject, kp, count, difficulty }],
//           parent_summary_for_week: string (// zh-TW)
//         }
//
// V1 constraints:
//   - Single student only (cross-student reads are forbidden per security policy).
//   - All inputs are read-only; output is a plan object, never written to
//     student records without explicit user approval.

import { listMastery } from "./mastery_store.mjs";
import { lookupKnowledgePoint } from "./curriculum_map.mjs";

const MAX_WEEKLY_FOCUS = 3;
const MAX_WEEKLY_REVIEW = 3;
const MAX_WEEKLY_PRACTICE = 5;
const MASTERY_WEAK_THRESHOLD = 0.6;
const REVIEW_DUE_THRESHOLD = 0.8;

/**
 * Aggregate weakness across all subjects for a single student.
 *
 * @param {{ student_id: string, workspace: string, topN?: number }} opts
 * @returns {{
 *   student_id: string,
 *   cells: Array<{ subject, kp, subskill?, mastery, error_count_recent, incorrect_attempts, score }>,
 *   cross_subject_weak_subjects: Array<string>,
 *   recommended_focus_order: Array<{ subject, kp, subskill?, score }>
 * }}
 */
export async function crossSubjectWeaknessAggregator({ student_id, workspace, topN = 10 }) {
  if (!student_id || !/^student_[a-z0-9_]+$/.test(student_id)) {
    throw new Error(`invalid student_id ${student_id}`);
  }
  if (!workspace) throw new Error("workspace required");

  const mastery = await listMastery(student_id);

  const cells = [];
  for (const m of mastery) {
    const ep = m.error_patterns ?? {};
    const errorCount = Object.values(ep).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
    cells.push({
      subject: m.subject,
      kp: m.knowledge_point,
      subskill: m.subskill ?? null,
      mastery: m.mastery,
      error_count_recent: errorCount,
      incorrect_attempts: ep.incorrect ?? errorCount,
      score: weaknessScore({ mastery: m.mastery, error_patterns: ep }),
    });
  }

  // Sort by weakness score desc (lower mastery = higher weakness priority).
  cells.sort((a, b) => b.score - a.score || a.subject.localeCompare(b.subject) || a.kp.localeCompare(b.kp));

  const recommended = cells.slice(0, topN);

  // Subjects with multiple weak cells flagged for cross-subject concern.
  const subjectWeakCounts = {};
  for (const c of cells) {
    if (c.mastery < MASTERY_WEAK_THRESHOLD) {
      subjectWeakCounts[c.subject] = (subjectWeakCounts[c.subject] ?? 0) + 1;
    }
  }
  const cross_subject_weak_subjects = Object.entries(subjectWeakCounts)
    .filter(([, count]) => count >= 2)
    .map(([s]) => s)
    .sort();

  return {
    student_id,
    cells,
    cross_subject_weak_subjects,
    recommended_focus_order: recommended.map(({ subject, kp, subskill, score }) => ({ subject, kp, subskill, score })),
  };
}

function weaknessScore(m) {
  // Composite score 0..1 (higher = weaker).
  const masteryGap = Math.max(0, 1 - (m.mastery ?? 0));
  const ep = m.error_patterns ?? {};
  const totalErrors = Object.values(ep).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
  const errorWeight = Math.min(0.5, totalErrors * 0.05);
  return Math.min(1, masteryGap + errorWeight);
}

/**
 * Detect prerequisite gaps for a target KP.
 *
 * @param {{ subject: string, grade: number, knowledge_point: string, student_id: string, workspace: string }} opts
 * @returns {Promise<{
 *   target: { subject, grade, kp },
 *   chain: Array<{ subject, grade, kp, mastery, status: "missing" | "weak" | "mastered" }>,
 *   blocking_gaps: Array<{ subject, grade, kp, mastery }>,
 *   recommendation: string
 * }>}
 */
export async function prerequisiteGapDetector({ subject, grade, knowledge_point, student_id, workspace }) {
  if (!subject || !Number.isInteger(grade) || !knowledge_point) {
    throw new Error("subject, grade, knowledge_point required");
  }
  if (!student_id || !/^student_[a-z0-9_]+$/.test(student_id)) {
    throw new Error(`invalid student_id ${student_id}`);
  }
  if (!workspace) throw new Error("workspace required");

  // Walk prerequisites recursively. The curriculum YAML may declare
  // `prerequisites: [kp_id, kp_id]` on a KP; we walk upward.
  const chain = [];
  const visited = new Set();

  async function walk(kpId, gradeHint, subjectHint) {
    if (visited.has(kpId)) return;
    visited.add(kpId);
    const kp = await lookupKnowledgePoint({ subject: subjectHint, grade: gradeHint, knowledge_point: kpId });
    if (!kp || kp.found === false) return;
    const kpMeta = kp.knowledge_point_meta;
    const mastery = await listMastery(student_id, { subject: subjectHint });
    const filtered = mastery.filter((r) => r.knowledge_point === kpId);
    const m = filtered[0]?.mastery ?? 0;
    const status = m >= REVIEW_DUE_THRESHOLD ? "mastered" : m >= MASTERY_WEAK_THRESHOLD ? "weak" : "missing";
    chain.push({ subject: subjectHint, grade: kpMeta?.grade ?? gradeHint, kp: kpId, mastery: m, status });
    const prereqs = kpMeta?.prerequisites ?? [];
    for (const p of prereqs) {
      await walk(p, kpMeta?.grade ?? gradeHint, subjectHint);
    }
  }

  await walk(knowledge_point, grade, subject);

  // Order chain: weakest first (most blocking).
  chain.sort((a, b) => a.mastery - b.mastery);

  const blocking_gaps = chain.filter((c) => c.status !== "mastered");

  let recommendation;
  if (blocking_gaps.length === 0) {
    recommendation = `已具備所有先備知識點，可以挑戰 ${knowledge_point}。`;
  } else {
    const first = blocking_gaps[0];
    recommendation = `建議先複習 ${first.subject} G${first.grade} ${first.kp}（目前掌握度 ${first.mastery.toFixed(2)}），再進入 ${knowledge_point}。`;
  }

  return {
    target: { subject, grade, kp: knowledge_point },
    chain,
    blocking_gaps,
    recommendation,
  };
}

/**
 * Emit a weekly learning strategy for a single student.
 *
 * @param {{ student_id: string, workspace: string, week_of?: string, max_focus?: number, max_review?: number, max_practice?: number }} opts
 * @returns {{
 *   student_id: string,
 *   week_of: string,
 *   focus_areas: Array<{ subject, kp, why }>,
 *   review_due: Array<{ subject, kp, mastery, reason }>,
 *   suggested_practice: Array<{ subject, kp, count, difficulty }>,
 *   parent_summary_for_week: string
 * }}
 */
export async function weeklyStrategyEmitter({
  student_id,
  workspace,
  week_of,
  max_focus = MAX_WEEKLY_FOCUS,
  max_review = MAX_WEEKLY_REVIEW,
  max_practice = MAX_WEEKLY_PRACTICE,
}) {
  if (!student_id || !/^student_[a-z0-9_]+$/.test(student_id)) {
    throw new Error(`invalid student_id ${student_id}`);
  }
  if (!workspace) throw new Error("workspace required");

  const mastery = await listMastery(student_id);
  const weekOfIso = week_of ?? currentMondayISO();

  // Review: mastery in (MASTERY_WEAK_THRESHOLD, REVIEW_DUE_THRESHOLD] — not yet weak, due for revisit
  const review_due = mastery
    .filter((m) => m.mastery > MASTERY_WEAK_THRESHOLD && m.mastery <= REVIEW_DUE_THRESHOLD)
    .sort((a, b) => (b.review_due ? 1 : 0) - (a.review_due ? 1 : 0) || a.mastery - b.mastery)
    .slice(0, max_review)
    .map((m) => ({
      subject: m.subject,
      kp: m.knowledge_point,
      mastery: m.mastery,
      reason: `掌握度 ${m.mastery.toFixed(2)}，建議本週再練 2–3 題鞏固。`,
    }));

  // Focus: cells below weak threshold
  const focus_pool = mastery
    .filter((m) => m.mastery <= MASTERY_WEAK_THRESHOLD)
    .sort((a, b) => a.mastery - b.mastery || a.subject.localeCompare(b.subject));
  const focus_areas = focus_pool.slice(0, max_focus).map((m) => {
    const ep = m.error_patterns ?? {};
    const errCount = Object.values(ep).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
    return {
      subject: m.subject,
      kp: m.knowledge_point,
      why: `目前掌握度 ${m.mastery.toFixed(2)}，近 ${errCount} 次相關錯誤。`,
    };
  });

  // Suggested practice: same as focus but with count + difficulty.
  const suggested_practice = focus_areas.slice(0, max_practice).map((f) => {
    const m = mastery.find((x) => x.subject === f.subject && x.knowledge_point === f.kp);
    const diff = m && m.mastery < 0.4 ? "easy" : m && m.mastery < 0.6 ? "medium" : "hard";
    return {
      subject: f.subject,
      kp: f.kp,
      count: 5,
      difficulty: diff,
    };
  });

  // Parent summary (zh-TW) — short, factual, no exaggeration.
  const parts = [];
  parts.push(`本週（${weekOfIso}）的學習重點：`);
  if (focus_areas.length === 0) {
    parts.push(`整體穩定，目前沒有特別弱點。`);
  } else {
    for (const f of focus_areas) {
      parts.push(`- ${f.subject} 的 ${f.kp}（${f.why}）`);
    }
  }
  if (review_due.length > 0) {
    parts.push(``);
    parts.push(`複習建議：`);
    for (const r of review_due) {
      parts.push(`- ${r.subject} 的 ${r.kp}（${r.reason}）`);
    }
  }
  parts.push(``);
  parts.push(`資料只用於孩子個人化學習，不自動分享給其他學生或外部服務。`);
  const parent_summary_for_week = parts.join("\n");

  return {
    student_id,
    week_of: weekOfIso,
    focus_areas,
    review_due,
    suggested_practice,
    parent_summary_for_week,
  };
}

/**
 * @returns {string} ISO date (YYYY-MM-DD) of the Monday of this week (UTC).
 */
function currentMondayISO() {
  const now = new Date();
  const day = now.getUTCDay(); // 0..6, Sunday = 0
  const offset = day === 0 ? -6 : 1 - day; // back to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + offset);
  return monday.toISOString().slice(0, 10);
}