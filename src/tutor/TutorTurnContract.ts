export type TutorVerdict = "correct" | "incorrect" | "unverifiable";
export type TutorRecommendedAction = "retry" | "hint" | "explain" | "next" | "review";
import type { SpecialistRepresentationData, TutorSubject } from "./SpecialistRepresentation";

export interface TutorTurnRequest {
  question_id: string;
  response_id: string;
  response: string | number;
  attempt_index: number;
  hints_used: number;
  occurred_at: string;
}

export interface TutorTurnResponse {
  subject: TutorSubject | null;
  verdict: TutorVerdict;
  summary: string;
  diagnosis: string | null;
  teaching_point: string | null;
  hint: string | null;
  recommended_action: TutorRecommendedAction;
  assessment_evidence_id: string | null;
  learning_memory_receipt_id: string | null;
  next_step: Record<string, unknown> | null;
  selection_reason: string | null;
  loop_completed: boolean;
  trace_id: string;
  representation: SpecialistRepresentationData | null;
}
