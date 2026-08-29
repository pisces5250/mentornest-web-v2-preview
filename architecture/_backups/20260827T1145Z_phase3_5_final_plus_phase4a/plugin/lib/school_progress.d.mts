// Type declaration shim for school_progress.mjs

export type SourceType = "official_curriculum" | "parent_confirmed" | "teacher_material_confirmed" | "textbook_mapping" | "inferred_from_learning";
export type ProgressStatus = "not_started" | "in_progress" | "completed";

export interface SchoolProgressRecord {
  schema_version: "school-progress-v1";
  record_id: string;
  student_id: string;
  subject: string;
  grade: number;
  curriculum_unit: string;
  knowledge_points: string[];
  status: ProgressStatus;
  source_type: SourceType;
  source_reference: string;
  confidence: number;
  confirmed_at?: string;
  inferred_at?: string;
  inferred_from_event?: string;
  replaces_record_id?: string;
}

export const SOURCE_TYPES: readonly SourceType[];

export function assertRecordInvariants(rec: SchoolProgressRecord): void;
export function buildConfirmedRecord(input: {
  student_id: string;
  subject: string;
  grade: number;
  curriculum_unit: string;
  knowledge_points: string[];
  status: ProgressStatus;
  source_type: "official_curriculum" | "parent_confirmed" | "teacher_material_confirmed" | "textbook_mapping";
  source_reference: string;
  confidence?: number;
  replaces_record_id?: string;
  record_id?: string;
  confirmed_at?: string;
}): SchoolProgressRecord;
export function buildInferredRecord(input: {
  student_id: string;
  subject: string;
  grade: number;
  curriculum_unit: string;
  knowledge_points: string[];
  status?: ProgressStatus;
  confidence: number;
  inferred_from_event: string;
  replaces_record_id?: string;
  record_id?: string;
  inferred_at?: string;
}): SchoolProgressRecord;
export function appendProgressRecord(workspace: string, rec: SchoolProgressRecord): Promise<{ ok: true; path: string; record_id: string }>;
export function readProgress(workspace: string, student_id: string): Promise<{ ok: true; records: SchoolProgressRecord[]; count: number; latest_by_subject: Record<string, SchoolProgressRecord>; path: string }>;
export function inferProgressFromEvidence(input: {
  student_id: string;
  subject: string;
  grade: number;
  unit_label: string;
  evidence: Record<string, unknown>;
  unit_knowledge_points?: string[];
  known_mastery_for_kp?: Record<string, number>;
}): { candidate: SchoolProgressRecord; reason: string; confidence: number; status: ProgressStatus };
export function buildPromotionToConfirmed(previous: SchoolProgressRecord, opts: {
  new_status?: ProgressStatus;
  new_confidence?: number;
  new_curriculum_unit?: string;
  new_knowledge_points?: string[];
  new_source_type?: "official_curriculum" | "parent_confirmed" | "teacher_material_confirmed" | "textbook_mapping";
  new_source_reference?: string;
}): SchoolProgressRecord;
export function buildTextbookMapping(input: {
  curriculum_index: any;
  publisher_map: any;
}): { ok: true; mappings: any; stats: { publishers: number; units: number; knowledge_points: number } };
export function suggestCurriculumUnit(input: {
  publisher: string;
  edition?: string;
  volume: string;
  unit_label: string;
  grade: number;
  publisher_map: any;
  curriculum_index: any;
}): { ok: boolean; reason?: string; candidate_publisher_unit?: any; stage_matches?: any[]; note?: string };
export function computeSchoolAlignment(input: {
  mastery: Array<{ subject?: string; knowledge_point?: string; mastery?: number }>;
  progress_records: SchoolProgressRecord[];
}): { ok: true; count: number; items: Array<{ subject: string; knowledge_point: string; mastery: number; school_status: string; recommendation_zh_tw: string }> };
export function trackConfirmedVsInferred(progress_records: SchoolProgressRecord[], opts?: { student_id?: string }): {
  ok: true;
  student_id?: string;
  confirmed: Array<{ subject: string; grade: number; latest_unit: string; knowledge_points: string[]; status: ProgressStatus; source_type: SourceType; recorded_at?: string }>;
  inferred: Array<{ subject: string; grade: number; latest_unit: string; knowledge_points: string[]; status: ProgressStatus; confidence: number; inferred_at?: string }>;
  conflicts: Array<{ key: string }>;
};
