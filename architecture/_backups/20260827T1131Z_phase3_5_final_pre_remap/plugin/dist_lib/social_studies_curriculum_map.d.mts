export interface SocialStudiesKPRecord {
  found: boolean;
  id?: string;
  grade?: number;
  description?: string;
  stage?: string;
  curriculum_doc?: string;
  subject?: string;
  reason?: string;
  searched_id?: string;
}
export declare function lookupSocialStudiesKP(input: {
  knowledge_point: string;
}): Promise<SocialStudiesKPRecord>;
export interface SocialStudiesGradeList {
  found: boolean;
  grade: number;
  curriculum_doc?: string;
  knowledge_points: Array<{ id: string; description: string; stage: string }>;
}
export declare function listSocialStudiesKPForGrade(input: {
  grade: number;
}): Promise<SocialStudiesGradeList>;
export declare function gradeAppropriateSocialStudiesTopic(input: {
  grade: number;
  knowledge_point?: string;
  description?: string;
}): {
  appropriate: boolean;
  grade: number;
  age_appropriate: boolean;
  topic: string;
  note: string;
};