// Type declarations for chinese_subskill_map.mjs

export interface ChineseSubskillClassification {
  primary_subskill: string;
  secondary_subskills: string[];
  matched_segment: string;
  matched_keywords: string[];
}

export function classifyChineseSubskill(input: { knowledge_point: string }): ChineseSubskillClassification;
export function listSubskills(): string[];