// Type declarations for math_specialist_v2.mjs

export interface MathEvidencePayload {
  schema_version: string;
  emitted_at: string;
  emitted_by: string;
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill: string;
  error_code: string | null;
  result: string | null;
  diagnosis: any;
}

export interface MathDiagnosisPayload {
  schema_version: string;
  student_id: string | null;
  knowledge_point: string | null;
  error_code: string | null;
  error_subtype: string | null;
  recommendation_zh: string | null;
  validator_verdict: any;
  decided_at: string;
}

export interface MathSpecialistDiagnosis {
  valid: boolean;
  math_correct: boolean;
  error_type: string | null;
  error_subtype: string | null;
  hint_ladder_level: number;
  representation_suggestion: "symbolic" | "concrete" | "visual";
  mini_lesson_suggested: boolean;
  mastery_check_suggested: boolean;
  hint_zh: string;
  evidence_payload: MathEvidencePayload;
  diagnosis_payload: MathDiagnosisPayload;
  validator_summary: { verdict: string; reason: string };
}

export interface TeachingPlanPhase {
  phase: "warmup" | "instruction" | "guided_practice" | "mastery_check" | "review";
  focus_kps: string[];
  representation: "concrete" | "visual" | "symbolic";
  target_difficulty: "easy" | "medium" | "hard" | "mixed";
  count: number;
}

export interface TeachingPlan {
  phases: TeachingPlanPhase[];
  rationale_zh: string;
}

export type MathSpecialistAction =
  | "text_prompt"
  | "visual_representation"
  | "mini_lesson"
  | "mastery_check"
  | "switch_representation"
  | "backtrack_prerequisite";

export interface MathSpecialistDecision {
  action: MathSpecialistAction;
  rationale: string;
  hint_payload: { level: number; hint_text_zh: string; representation_suggestion: string };
}

export function evidencePayload(input: any): MathEvidencePayload;
export function diagnosisPayload(input: any): MathDiagnosisPayload;
export function diagnoseMathResponse(input: {
  student_id?: string;
  student_answer: string;
  expected_answer: string | number;
  stem: string;
  knowledge_point: string;
  hint_history?: Array<{ level: number; text: string }>;
  representation_history?: Array<{ representation: "symbolic" | "concrete" | "visual"; attempts: number }>;
  error_type?: string;
  mastery_context?: { mastery: number; confidence?: number };
  school_progress?: { teacher_confirmed?: boolean };
}): MathSpecialistDiagnosis;

export function buildMathTeachingPlan(input: {
  student_id: string;
  knowledge_point: string;
  grade: number;
  mastery_context?: { mastery: number; confidence?: number };
  school_progress?: { teacher_confirmed?: boolean };
  error_history?: Array<{ error_code: string; count: number }>;
}): TeachingPlan;

export function mathSpecialistDecide(input: {
  student_id: string;
  knowledge_point: string;
  attempts: number;
  hints_given: number;
  representation_used: "symbolic" | "concrete" | "visual";
  error_type?: string | null;
  mastery?: number | null;
  school_progress?: { teacher_confirmed?: boolean; inferred?: boolean };
}): MathSpecialistDecision;

export const STUDENT_ID_RE: RegExp;

export {
  validateMathAnswer,
  lookupMathErrorCode,
  listMathErrorsByCategory,
  listMathErrorCategories,
  mathErrorTaxonomySize,
  validateMathErrorTaxonomy,
} from "./math_validator.mjs";
export type { MathValidationResult } from "./math_validator.mjs";
