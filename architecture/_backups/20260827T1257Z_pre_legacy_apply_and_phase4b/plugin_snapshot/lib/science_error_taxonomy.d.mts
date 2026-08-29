export interface ScienceErrorEntry {code:string;category:string;label_zh:string;description:string;examples:string[];hint_template:string;mini_lesson_hint:string}
export declare const SCIENCE_ERROR_TAXONOMY: ScienceErrorEntry[];
export declare function lookupScienceErrorCode(code:string): ScienceErrorEntry|null;
export declare function listScienceErrorsByCategory(category:string): ScienceErrorEntry[];
export declare function listScienceErrorCategories(): string[];
export declare function scienceErrorTaxonomySize(): number;
export declare function validateScienceErrorTaxonomy(): {valid:boolean;code_count:number;categories:string[];errors:string[]};
