export const SOURCE_CLASS: {
  STUDENT_PRIVATE: "student_private";
  AI_AUTHORED: "ai_authored";
  OPEN_LICENSE: "open_license";
  TEACHER_AUTHORED: "teacher_authored";
};
export const VALID_SOURCE_CLASSES: string[];
export const LICENSE: {
  AI_ORIGINAL: "AI_ORIGINAL";
  AI_ADAPTED: "AI_ADAPTED";
  CC_BY: "CC-BY";
  CC_BY_SA: "CC-BY-SA";
  CC0: "CC0";
  PRIVATE: "PRIVATE";
};
export const VALID_LICENSES: string[];
export function makeQuestionId(parts: {
  source_class: string;
  source_id: string;
  kp: string;
}): string;
export function parseQuestionId(id: string): {
  source_class: string;
  kp: string;
  nonce: string;
} | null;
