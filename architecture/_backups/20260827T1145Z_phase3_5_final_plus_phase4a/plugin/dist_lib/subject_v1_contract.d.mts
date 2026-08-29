/**
 * Unified Subject Contract (subject-v1) — interface-only validators.
 *
 * Subject expertise stays in per-subject specialists. This module
 * declares shapes and pure validators; it MUST NOT import any
 * per-subject specialist library.
 */

export const SUBJECT_SPECIALIST_CONTRACT_VERSION: "subject-v1";
export const SUPPORTED_SUBJECTS: ReadonlyArray<
  "math" | "chinese" | "english" | "science" | "social_studies"
>;

export interface SubjectSpecialistRequest {
  subject: string;
  student_id: string;
  learning_goal?: string;
  knowledge_point: string;
  school_progress?: unknown;
  mastery_context?: { mastery?: number; confidence?: number } | null;
  teaching_plan?: unknown;
  question_request?: {
    stem?: string;
    expected_answer?: string;
    hints_used?: number;
  } | null;
  diagnosis?: unknown;
  next_action?: string | null;
  contract_version: typeof SUBJECT_SPECIALIST_CONTRACT_VERSION;
}

export interface SubjectSpecialistResponse {
  subject: string;
  student_id: string;
  knowledge_point: string;
  evidence_payload: unknown;
  diagnosis_payload: unknown;
  next_action: string;
  teaching_plan?: unknown;
  capability_gaps: string[];
  contract_version: typeof SUBJECT_SPECIALIST_CONTRACT_VERSION;
}

export function emptySubjectSpecialistRequest(): SubjectSpecialistRequest;
export function emptySubjectSpecialistResponse(): SubjectSpecialistResponse;

export function validateRequest(
  req: unknown
): { valid: boolean; errors: string[] };

export function validateResponse(
  res: unknown
): { valid: boolean; errors: string[] };

export function describeContractShape(): {
  contract_version: typeof SUBJECT_SPECIALIST_CONTRACT_VERSION;
  supported_subjects: string[];
  request_fields: string[];
  response_fields: string[];
};

export function dispatchExamples(): Array<{
  label: string;
  subject: string;
  request: SubjectSpecialistRequest;
}>;
