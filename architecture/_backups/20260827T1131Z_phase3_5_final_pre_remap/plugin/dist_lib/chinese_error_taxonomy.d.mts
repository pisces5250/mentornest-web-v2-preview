// Type declarations for chinese_error_taxonomy.mjs

export interface ChineseErrorEntry {
  code: string;
  category: string;
  label_zh: string;
  description: string;
  examples: string[];
  hint_template: string;
  mini_lesson_hint: string;
}

export const CHINESE_ERROR_TAXONOMY: ChineseErrorEntry[];

export function lookupErrorCode(code: string): ChineseErrorEntry | null;
export function listByCategory(category: string): ChineseErrorEntry[];
export function listCategories(): string[];
export function assertValidErrorCode(code: string): string;
export function taxonomySize(): number;
export function validateTaxonomy(): { ok: boolean; errors: string[] };