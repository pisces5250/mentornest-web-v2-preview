export interface SocialStudiesErrorEntry {
  code: string;
  category: string;
  label_zh: string;
  description: string;
  examples: string[];
  hint_template: string;
  mini_lesson_hint: string;
}
export declare const SOCIAL_STUDIES_ERROR_TAXONOMY: SocialStudiesErrorEntry[];
export declare function lookupSocialStudiesErrorCode(code: string): SocialStudiesErrorEntry | null;
export declare function listSocialStudiesErrorsByCategory(category: string): SocialStudiesErrorEntry[];
export declare function listSocialStudiesErrorCategories(): string[];
export declare function socialStudiesErrorTaxonomySize(): number;
export declare function validateSocialStudiesErrorTaxonomy(): {
  valid: boolean;
  code_count: number;
  categories: string[];
  errors: string[];
};