export interface LearningEvent {
  timestamp: string;
  student_id: string;
  subject: string;
  knowledge_point: string;
  result?: string;
  attempts?: number;
  hints?: number;
  error_type?: string;
  review_needed?: boolean;
  note?: string;
  [key: string]: unknown;
}

export interface LearningEventSummary {
  subject: string;
  knowledge_point: string;
  total: number;
  correct: number;
  incorrect: number;
  partial: number;
  attempts_total: number;
  hints_total: number;
  review_needed_count: number;
  error_types: Record<string, number>;
  first_seen: string;
  last_seen: string;
  accuracy: number;
}

export function readLearningEvents(
  student_id: string,
  opts?: { since?: string; until?: string; subject?: string }
): Promise<LearningEvent[]>;

export function summarizeLearningEvents(
  student_id: string,
  opts?: { since?: string; until?: string; subject?: string }
): Promise<{
  student_id: string;
  window: { since: string | null; until: string | null; subject: string | null };
  event_count: number;
  bucket_count: number;
  buckets: LearningEventSummary[];
}>;

export function assertStudentId(id: string): string;
