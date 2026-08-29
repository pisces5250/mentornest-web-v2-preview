export declare const SOCIAL_STUDIES_HINT_LEVELS: string[];
export interface SocialStudiesHint {
  level: number;
  level_name: string;
  hint_text_zh: string;
  representation_suggestion: "text" | "timeline" | "map" | "source" | "chart";
  primary_error_code: string | null;
  primary_subskill: string;
  reason: string;
}
export declare function nextSocialStudiesHint(input: {
  knowledge_point?: string;
  attempts?: number;
  error_codes?: string[];
  representation?: "text" | "timeline" | "map" | "source" | "chart";
}): SocialStudiesHint;