// mastery_backfill.d.mts

export type ResultValue = "correct" | "incorrect" | "partially_correct" | "improved" | "mastered";

export interface ClassifiedEvent {
  subject: string;
  knowledge_point: string | null;
  result: ResultValue;
  attempts: number;
  error_code: string | null;
}

export interface ProposedEvidence {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill: string;
  result: ResultValue;
  error_type: string | null;
  hints: number;
  attempts: number;
  first_attempt: boolean;
  source: "legacy_backfill";
  source_event_id: string | null;
  evidence_kind: "response";
  quality_rating: number | null;
}

export interface DryRunRecord {
  event_index: number;
  original_event: {
    timestamp: string | null;
    student_id: string | null;
    note: string | null;
  };
  proposed_evidence: ProposedEvidence;
}

export interface DryRunReport {
  proposed_evidence_count: number;
  would_apply: boolean;
  proposed_records: DryRunRecord[];
}

export interface BackfillStatus {
  student_id: string;
  last_dry_run_at: string | null;
  last_apply_at: string | null;
  total_events_in_raw: number;
  total_legacy_backfill_emitted: number;
  pending_count: number;
}

export interface ApplyResult {
  emitted_count: number;
  ledger_path: string;
  evidence_ids: string[];
  dry_run_report_id: string;
}

export interface RollbackResult {
  invalidated_count: number;
  dry_run_report_id: string;
  invalidated_evidence_ids: string[];
}

// Pure functions (no I/O)
export function normalizeResult(raw: string | undefined): ResultValue;
export function deriveSubject(event: Record<string, unknown>): string;
export function deriveKnowledgePoint(event: Record<string, unknown>): string | null;
export function deriveAttempts(event: Record<string, unknown>): number;
export function deriveErrorCode(event: Record<string, unknown>): string | null;
export function classifyEvent(event: Record<string, unknown>): ClassifiedEvent;
export function buildDryRunReport(student_id: string, events: Record<string, unknown>[], opts?: { since?: string; until?: string }): DryRunReport;
export function buildIdempotencyKey(student_id: string, event: Record<string, unknown>): string;
