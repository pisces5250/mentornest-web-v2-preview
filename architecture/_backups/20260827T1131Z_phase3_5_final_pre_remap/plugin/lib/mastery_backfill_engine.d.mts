// mastery_backfill_engine.d.mts

import type { DryRunReport, BackfillStatus, ApplyResult, RollbackResult, ClassifiedEvent } from "./mastery_backfill.d.mts";

export interface BackfillDryRunResult extends DryRunReport {
  dry_run_report_id: string;
}

export interface BackfillApplyInput {
  student_id: string;
  since?: string;
  until?: string;
  dry_run_report_id: string;
}

export interface BackfillStatusInput {
  student_id: string;
}

export interface BackfillRollbackInput {
  student_id: string;
  dry_run_report_id: string;
}

export interface BackfillClassifyEventInput {
  event: Record<string, unknown>;
}

export function masteryBackfillDryRun(input: { student_id: string; since?: string; until?: string }): Promise<BackfillDryRunResult>;
export function masteryBackfillApply(input: BackfillApplyInput): Promise<ApplyResult>;
export function masteryBackfillStatus(input: BackfillStatusInput): Promise<BackfillStatus>;
export function masteryBackfillRollback(input: BackfillRollbackInput): Promise<RollbackResult>;
export function masteryBackfillClassifyEvent(input: BackfillClassifyEventInput): ClassifiedEvent;
