// Type declarations for prerequisite_chain.mjs

export interface MathPrereqEntry {
  knowledge_point: string;
  description_zh: string | null;
}

export interface MathPrereqChain {
  knowledge_point: string;
  found: boolean;
  prereqs: MathPrereqEntry[];
}

export interface WeakestPrereqResult {
  knowledge_point: string;
  prereq: any;
  mastery: number | null;
  evidence_count: number | null;
  recommendation_zh: string;
  mastered: boolean;
}

export function getMathPrerequisites(input: { knowledge_point: string }): MathPrereqChain;
export function listAllPrereqPairs(): Array<{ knowledge_point: string; prereqs: string[] }>;
export function weakestPrerequisite(input: { student_id: string; knowledge_point: string }): Promise<WeakestPrereqResult>;
