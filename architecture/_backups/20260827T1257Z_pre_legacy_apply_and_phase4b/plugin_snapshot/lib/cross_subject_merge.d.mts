export const ACTION_PRIORITY: ReadonlyArray<string>;

export function bucketizeAction(action: string): string;

export interface DecisionInput {
  subject: string;
  action: string;
  mastery?: number;
  knowledge_point?: string;
  mastery_context?: { mastery?: number };
  kp?: string;
}

export function validateDecisions(
  decisions: unknown
): { valid: boolean; errors: string[] };

export interface MergeResult {
  action: string;
  chosen_subject: string;
  rationale: string;
  ranked: Array<{
    subject: string;
    action: string;
    mastery: number;
    knowledge_point: string;
    bucket: string;
    rank: number;
  }>;
  student_id: string;
  errors?: string[];
}

export function mergeCrossSubjectDecisions(input: {
  decisions: DecisionInput[];
  student_id: string;
}): MergeResult;

export function mergeFromResponses(input: {
  responses: Array<{
    subject: string;
    next_action: string;
    knowledge_point?: string;
    diagnosis_payload?: { mastery?: number } | null;
  }>;
  student_id: string;
}): MergeResult;
