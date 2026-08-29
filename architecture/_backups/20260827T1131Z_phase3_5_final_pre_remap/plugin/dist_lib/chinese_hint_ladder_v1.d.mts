// Type declarations for chinese_hint_ladder_v1.mjs

export interface ChineseHintResult {
  level: 0 | 1 | 2 | 3 | 4;
  level_name: string;
  hint_text_zh: string;
  mini_lesson_suggested: boolean;
  mastery_check_suggested: boolean;
  reason: string;
  subskill: string;
}

export function nextChineseHint(input: {
  knowledge_point?: string;
  attempts?: number;
  error_code?: string;
  student_partial?: string;
  hint_history?: Array<{ level: number; text: string }>;
}): ChineseHintResult;

export const CHINESE_HINT_LEVELS: string[];