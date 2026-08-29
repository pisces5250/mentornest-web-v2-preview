// Type declarations for math_error_taxonomy.mjs

export interface MathErrorCategory {
  code: string;
  label_zh: string;
  description: string;
  hint_template: string;
  representation_hint: "concrete" | "visual" | "symbolic";
  children?: MathErrorSubEntry[];
}

export interface MathErrorSubEntry {
  code: string;
  label_zh: string;
  description: string;
}

export const MATH_ERROR_TAXONOMY: MathErrorCategory[];

export function lookupMathErrorCode(code: string): (MathErrorCategory & { parent?: string }) | MathErrorSubEntry | null;
export function listMathErrorsByCategory(category: string): any[];
export function listMathErrorCategories(): Array<{ code: string; label_zh: string }>;
export function mathErrorTaxonomySize(): number;
export function validateMathErrorTaxonomy(): { ok: boolean; duplicates: string[]; total_codes: number; category_count: number };
