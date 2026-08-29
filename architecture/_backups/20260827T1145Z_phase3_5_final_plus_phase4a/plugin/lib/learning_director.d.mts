export function crossSubjectWeaknessAggregator(opts: {
  student_id: string;
  workspace: string;
  topN?: number;
}): Promise<{
  student_id: string;
  cells: Array<{
    subject: string;
    kp: string;
    subskill: string | null;
    mastery: number;
    error_count_recent: number;
    incorrect_attempts: number;
    score: number;
  }>;
  cross_subject_weak_subjects: string[];
  recommended_focus_order: Array<{ subject: string; kp: string; subskill: string | null; score: number }>;
}>;

export function prerequisiteGapDetector(opts: {
  subject: string;
  grade: number;
  knowledge_point: string;
  student_id: string;
  workspace: string;
}): Promise<{
  target: { subject: string; grade: number; kp: string };
  chain: Array<{ subject: string; grade: number; kp: string; mastery: number; status: "missing" | "weak" | "mastered" }>;
  blocking_gaps: Array<{ subject: string; grade: number; kp: string; mastery: number }>;
  recommendation: string;
}>;

export function weeklyStrategyEmitter(opts: {
  student_id: string;
  workspace: string;
  week_of?: string;
  max_focus?: number;
  max_review?: number;
  max_practice?: number;
}): Promise<{
  student_id: string;
  week_of: string;
  focus_areas: Array<{ subject: string; kp: string; why: string }>;
  review_due: Array<{ subject: string; kp: string; mastery: number; reason: string }>;
  suggested_practice: Array<{ subject: string; kp: string; count: number; difficulty: string }>;
  parent_summary_for_week: string;
}>;
