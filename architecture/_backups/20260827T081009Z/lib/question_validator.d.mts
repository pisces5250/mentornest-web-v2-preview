export const QUESTION_TYPES: string[];
export const DIFFICULTY: string[];
export function isValidDifficulty(d: string): boolean;
export function validateQuestionStructure(
  q: any,
  ctx: { curriculum_index: any }
):
  | { ok: true; type_validated: string }
  | { ok: false; reason: string };
