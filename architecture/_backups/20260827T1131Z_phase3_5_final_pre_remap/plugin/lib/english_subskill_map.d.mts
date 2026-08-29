// TypeScript declarations for english_subskill_map.mjs

export interface EnglishSubskillClassification {
  primary_subskill: string;
  secondary_subskills: string[];
  matched_segment: string;
  matched_keywords: string[];
}

export function classifyEnglishSubskill(input: {
  knowledge_point: string;
}): EnglishSubskillClassification;
export function listSubskills(): string[];
