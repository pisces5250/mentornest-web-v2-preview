import type { SessionStep } from "./QuestionRenderer";

export type AgeBand = "G1-G2" | "G3-G4" | "G5-G6" | "G7+";
export type StepVerdict = "correct" | "incorrect" | "unverifiable";

export interface SessionAttempt {
  verdict: StepVerdict;
  error_type: string | null;
  submitted_at: string;
}

export interface SessionRuntimeStep extends SessionStep {
  attempts: SessionAttempt[];
  hints_used: number;
  representation_switches: number;
  last_verdict: StepVerdict | null;
  phase: "presenting" | "hint_level_1" | "hint_level_2" | "hint_level_3" | "feedback" | "completed";
}

export interface SessionSummary {
  total_steps: number;
  completed_steps: number;
  first_attempt_correct: number;
  hints_used_total: number;
  representation_switches_total: number;
  weak_kps: string[];
  mastery_candidate_kps?: string[];
  /** @deprecated 僅供舊快照相容，不代表正式 mastery。 */
  mastered_kps?: string[];
  duration_seconds: number;
}

export interface SessionState {
  session_id: string;
  student_id: string;
  age_band: AgeBand;
  status: "active" | "completed" | "error";
  current_index: number;
  steps: SessionRuntimeStep[];
  summary: SessionSummary | null;
  started_at: string;
  finished_at: string | null;
  error: { reason: string; at?: string } | null;
}
