// TypeScript declarations for school_progress_ttl.mjs
//
// Phase 3.5 sub-session D — Curriculum inferred `school_progress` TTL.

export const TTL_ENV_VAR: "SCHOOL_PROGRESS_INFERRED_TTL_DAYS";
export const DEFAULT_TTL_DAYS: 30;
export const MS_PER_DAY: 86400000;
export const TTL_STATUSES: readonly ["inferred", "stale", "confirmed"];

export interface TtlConfig {
  ttl_days: number;
  env_var: string;
  source: "env" | "default";
}

export interface StorageIo {
  readStudentRecords(student_id: string): Promise<{ records: any[]; path: string }>;
  writeStudentRecords?(student_id: string, records: any[]): Promise<{ ok: true; written: number; path: string }>;
  listStudentIds?(): Promise<string[]>;
  studentHasRecords?(student_id: string): Promise<boolean>;
}

export interface MarkStaleResult {
  updated_records: any[];
  newly_stale_ids: string[];
}

export interface SweepStudentResult {
  student_id: string;
  newly_stale_ids: string[];
  total_stale_count: number;
  total_inferred: number;
  total_confirmed: number;
  swept_at: string;
}

export interface ExplicitPromotionOpts {
  knowledge_point: string;
  confirmed_by: string;
  new_source_type?: string;
  new_source_reference?: string;
  new_status?: string;
  new_confidence?: number;
  now_ms?: number;
}

export function getTtlConfig(): TtlConfig;
export function computeTtlExpiryMs(
  inferred_at_ms: number | string,
  ttl_days: number,
  now_ms?: number
): number;
export function isStale(record: any, now_ms: number, ttl_days: number): boolean;
export function markStaleRecords(
  records: any[],
  now_ms: number,
  ttl_days: number
): MarkStaleResult;
export function sweepStudent(
  student_id: string,
  now_ms: number,
  ttl_days: number,
  storage_io: StorageIo
): Promise<SweepStudentResult>;
export function buildExplicitPromotion(
  previous_record: any,
  opts: ExplicitPromotionOpts
): any;
