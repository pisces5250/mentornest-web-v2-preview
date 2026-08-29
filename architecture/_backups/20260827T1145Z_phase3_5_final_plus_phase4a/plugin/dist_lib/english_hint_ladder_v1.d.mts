// TypeScript declarations for english_hint_ladder_v1.mjs

export type EnglishHintLevelName =
  | "none"
  | "concept_prompt"
  | "scaffolded_question"
  | "worked_example_partial"
  | "full_model_answer";

export type EnglishRepresentation = "text" | "phonics" | "oral" | "visual";

export const ENGLISH_HINT_LEVELS: EnglishHintLevelName[];
export const ENGLISH_REPRESENTATIONS: EnglishRepresentation[];

export function nextEnglishHint(input: {
  knowledge_point?: string;
  attempts?: number;
  error_codes?: string[];
  error_code?: string;
  student_partial?: string;
  mode?: string;
  hint_history?: Array<{ level: number; text: string }>;
}): {
  level: number;
  level_name: EnglishHintLevelName;
  hint_text_zh: string;
  hint_text_en: string;
  representation_suggestion: EnglishRepresentation;
  mini_lesson_suggested: boolean;
  mastery_check_suggested: boolean;
  reason: string;
  subskill: string;
  primary_error_code: string | null;
};
