export interface SocialStudiesSubskillClassification {
  primary_subskill: string;
  secondary_subskills: string[];
}
export declare function classifySocialStudiesSubskill(input: {
  knowledge_point: string;
}): SocialStudiesSubskillClassification;
export declare function listSocialStudiesSubskills(): string[];