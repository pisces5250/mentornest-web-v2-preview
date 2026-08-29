export declare function diagnoseSocialStudiesResponse(input: any): any;
export declare function analyzeTimeline(input: any): any;
export declare function analyzeMap(input: any): any;
export declare function analyzeCausality(input: any): any;
export declare function compareSources(input: any): any;
export declare function interpretDemographicChart(input: any): any;
export declare function socialStudiesSpecialistDecide(input: any): {
  action: string;
  rationale: string;
  primary_subskill: string;
  attempts: number;
  mastery: number | null;
};
export declare function emitSocialStudiesEvidence(input: any): any;
export declare const SOCIAL_STUDIES_HINT_LEVELS: string[];
export declare function nextSocialStudiesHint(input: any): any;