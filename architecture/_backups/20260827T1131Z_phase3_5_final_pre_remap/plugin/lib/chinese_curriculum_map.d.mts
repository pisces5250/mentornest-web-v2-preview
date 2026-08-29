// Type declarations for chinese_curriculum_map.mjs

export interface ChineseKPMatch {
  found: boolean;
  grade: number;
  topic: string;
  subtopic: string;
  vocabulary: string[];
  example_texts?: string[];
  description?: string | null;
  id?: string;
  stage?: string | null;
  curriculum_doc?: string;
  scope?: string;
  reason?: string;
}

export function lookupChineseKP(input: { knowledge_point: string }): Promise<ChineseKPMatch>;
export function listChineseKPForGrade(input: { grade: number }): Promise<{ found: boolean; grade: number; knowledge_points: Array<{id: string; description: string; stage: string | null}>; vocabulary_size: number }>;
export function gradeAppropriateVocabulary(input: { grade: number; word: string }): { appropriate: boolean; grade: number; found_in_ladder: boolean; vocabulary_size: number; gap_note: string };
export function totalLadderSize(): number;
export function listLadderGrades(): number[];