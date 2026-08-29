export interface KnowledgePoint {
  id: string;
  description: string;
  stage?: string;
  alias?: string;
}

export interface LookupResult {
  found: boolean;
  grade?: number;
  subject?: string;
  knowledge_point?: KnowledgePoint;
  sibling_points?: string[];
  curriculum_doc?: string;
  curriculum_scope?: string;
  reason?: string;
  available?: string[];
}

export interface ListResult {
  found: boolean;
  grade: number;
  subject: string;
  knowledge_points: KnowledgePoint[];
}

export interface CurriculumMeta {
  version: number;
  scope: string;
  curriculum_code: string;
  source_documents: string[];
}

export function lookupKnowledgePoint(input: {
  grade: number;
  subject: string;
  knowledge_point: string;
}): Promise<LookupResult>;

export function listKnowledgePoints(input: {
  grade: number;
  subject: string;
}): Promise<ListResult>;

export function listSubjects(): Promise<string[]>;

export function curriculumMeta(): Promise<CurriculumMeta>;

export function buildMergedIndex(): Promise<{
  version: number;
  scope: string;
  curriculum_code: string;
  source_documents: string[];
  subjects: Record<string, { name: string; file: string; knowledge_points: KnowledgePoint[] }>;
}>;
