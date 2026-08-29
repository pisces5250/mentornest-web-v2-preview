// TypeScript declarations for english_error_taxonomy.mjs
// Hand-written to mirror the runtime shapes.

export interface EnglishErrorEntry {
  code: string;
  category: string;
  label_zh: string;
  description: string;
  examples: string[];
  hint_template: string;
  mini_lesson_hint: string;
}

export const ENGLISH_ERROR_TAXONOMY: EnglishErrorEntry[];

export function lookupErrorCode(code: string): EnglishErrorEntry | null;
export function listByCategory(category: string): EnglishErrorEntry[];
export function listCategories(): string[];
export function assertValidErrorCode(code: string): string;
export function taxonomySize(): number;
export function validateTaxonomy(): { ok: boolean; errors: string[] };
