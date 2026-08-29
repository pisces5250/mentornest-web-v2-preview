export interface MasteryRecord {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill: string;
  mastery: number;
  confidence: number;
  last_seen: string;
  review_due: string | null;
  school_alignment: string | null;
  error_patterns: Record<string, number>;
  key?: string;
}

export function getMastery(
  student_id: string,
  subject: string,
  knowledge_point: string,
  subskill?: string
): Promise<MasteryRecord | null>;

export function listMastery(
  student_id: string,
  opts?: { subject?: string }
): Promise<MasteryRecord[]>;

export function updateMasteryFromEvent(input: {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill?: string;
  result: string;
  error_type?: string;
  timestamp?: string;
}): Promise<MasteryRecord>;

export function setMastery(
  student_id: string,
  record: Partial<MasteryRecord> & { subject: string; knowledge_point: string }
): Promise<MasteryRecord>;
