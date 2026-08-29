// Type declaration shim for mastery_engine_v2.mjs

export interface EvidenceInput {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill?: string;
  result: "correct" | "incorrect" | "partially_correct" | "improved" | "mastered";
  error_type?: string | null;
  hints?: number;
  first_attempt?: boolean;
  source?: "learning_record_append" | "question_bank_assessment" | string;
  source_event_id?: string | null;
  evidence_kind?: "response" | "rubric" | "manual_flag";
  school_alignment?: "aligned" | "lagging" | "ahead" | "completed_in_class";
  timestamp?: string;
}

export interface MasteryRecordV2 {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill: string;
  mastery: number;
  confidence: number;
  evidence_count: number;
  last_seen: string | null;
  retention: number;
  review_due: string | null;
  school_alignment: "aligned" | "lagging" | "ahead" | "completed_in_class" | null;
  error_patterns: Record<string, number>;
  subskills: Array<{ subskill: string; mastery: number; evidence_count: number }>;
}

export function rateEvidenceQuality(input: {
  result: string;
  error_type?: string | null;
  hints?: number;
  first_attempt?: boolean;
}): 1 | 2 | 3 | 4 | 5;

export function retentionScore(last_seen: string, now?: string, halfLifeDays?: number): number;
export function fsrsIntervalDays(input: { quality_rating: number; mastery: number }): number;
export function aggregateParentMastery(subskills: Array<{ mastery: number; evidence_count?: number }>): number | null;
export function assertNotDirectMasteryAssignment(tool_call: { tool?: string; params?: { mastery?: number; set_mastery?: number } }): void;

export function updateMasteryFromEvidence(input: EvidenceInput): Promise<{ record: MasteryRecordV2; evidence_event_id: string }>;
export function updateSubskillMasteryFromEvidence(input: EvidenceInput & { subskill: string }): Promise<{ record: MasteryRecordV2; evidence_event_id: string }>;
export function annotateMasteryWithSchoolAlignment(input: { student_id: string; subject: string; knowledge_point: string; school_alignment: "aligned" | "lagging" | "ahead" | "completed_in_class" }): Promise<MasteryRecordV2>;
export function getMasteryV2(student_id: string, subject: string, knowledge_point: string, subskill?: string): Promise<MasteryRecordV2 | null>;
export function listMasteryV2(student_id: string, opts?: { subject?: string; min_mastery?: number; max_mastery?: number; review_due_before?: string }): Promise<MasteryRecordV2[]>;
export function aggregateErrorPatterns(student_id: string, opts?: { subject?: string }): Promise<{ ok: true; by_type: Record<string, number>; student_id: string }>;
export function getRetentionSignal(student_id: string, now?: string): Promise<{ ok: true; student_id: string; record_count: number; average_retention: number | null; stale_count: number }>;
export function listEvidence(student_id: string, opts?: { subject?: string; knowledge_point?: string; since?: string }): Promise<{ ok: true; count: number; events: any[] }>;
export function appendEvidence(student_id: string, evt: {
  event_id?: string;
  subject: string;
  knowledge_point: string;
  subskill?: string;
  source?: string;
  quality_rating?: number | null;
  correct?: boolean;
  result?: string | null;
  error_type?: string | null;
  evidence_kind?: string;
}): Promise<{ event_id: string; schema_version: string; ingested_at: string; student_id: string; subject: string; knowledge_point: string; subskill: string; source: string; source_event_id: string | null; quality_rating: number | null; correct: boolean; result: string | null; error_type: string | null; evidence_kind: string }>;
