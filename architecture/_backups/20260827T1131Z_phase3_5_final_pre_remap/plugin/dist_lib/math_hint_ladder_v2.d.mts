// Type declarations for math_hint_ladder_v2.mjs

export interface NextMathHintResult {
  level: number;
  hint_text_zh: string;
  representation_suggestion: "symbolic" | "concrete" | "visual";
  mini_lesson_suggested: boolean;
  mastery_check_suggested: boolean;
  reason: string;
}

export interface RepresentationEffectivenessResult {
  effective: boolean;
  switch_to: "symbolic" | "concrete" | "visual" | null;
  reason: string;
}

export function nextMathHint(input: {
  student_id: string;
  subject: "math";
  knowledge_point: string;
  attempts: number;
  hints_given: number;
  representation_used?: "symbolic" | "concrete" | "visual";
  error_type?: string | null;
  mastery_context?: { mastery: number; confidence?: number } | null;
  school_progress_context?: { teacher_confirmed?: boolean; inferred?: boolean } | null;
}): NextMathHintResult;

export function representationEffectiveness(input: {
  representation: "symbolic" | "concrete" | "visual";
  attempts: number;
  hints: number;
}): RepresentationEffectivenessResult;

export const MATH_HINT_LEVELS_V2: readonly string[];
