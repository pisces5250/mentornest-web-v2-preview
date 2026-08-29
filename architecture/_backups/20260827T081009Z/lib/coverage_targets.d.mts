export const DIFFICULTIES: readonly string[];
export const QUESTION_TYPES: readonly string[];
export function defaultTargetFor(subject: string, type: string, difficulty: string): number;
export function computeCoverageTargets(opts?: {
  subject?: string;
  grade?: number;
  knowledgePoint?: string;
  override?: any;
}): Array<{ subject: string; kp: string; type: string; difficulty: string; target: number }>;
