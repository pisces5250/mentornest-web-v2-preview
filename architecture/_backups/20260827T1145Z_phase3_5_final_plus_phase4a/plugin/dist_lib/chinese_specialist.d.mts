// Type declarations for chinese_specialist.mjs

export interface ChineseDiagnosisResult {
  valid: boolean;
  correct: boolean;
  error_code?: string;
  error_subtype?: string;
  hint_level: number;
  hint_text_zh: string;
  mini_lesson_suggested: boolean;
  mastery_check_suggested: boolean;
  evidence_payload: Record<string, unknown>;
  diagnosis_payload: Record<string, unknown>;
}

export interface ReadingAnalysisResult {
  kind: "explicit" | "inference" | "main_idea" | "structure";
  correct: boolean;
  evidence_span?: string | null;
  rationales: {
    matched_keywords: string[];
    missed_keywords: string[];
    overgeneralization_flag: boolean;
    off_topic_flag: boolean;
  };
  error_code?: string;
  hint_text_zh: string;
  mini_lesson_suggested: boolean;
}

export interface CompositionScaffoldResult {
  structure_score: number;
  vocabulary_score: number;
  content_score: number;
  organization_score: number;
  feedback_lines: Array<{ category: string; line_zh: string; severity: "info" | "warn" | "block" }>;
  evidence_payload: Record<string, unknown>;
  diagnosis_payload: Record<string, unknown>;
}

export interface WritingFeedbackResult {
  feature_pass: Record<string, boolean>;
  prioritized_feedback: Array<{ feature: string; message_zh: string; severity: "info" | "warn" | "block" }>;
  evidence_payload: Record<string, unknown>;
  diagnosis_payload: Record<string, unknown>;
}

export interface SpecialistDecisionResult {
  action: "text_prompt" | "vocabulary_drill" | "reading_scaffold" | "writing_scaffold" | "mastery_check" | "backtrack_prerequisite";
  rationale: string;
  confidence: number;
  subskill: string;
  context: Record<string, unknown>;
}

export interface VocabularyMatchResult {
  matches: Array<{ kp_segment: string; score: number }>;
  canonical_word?: string;
}

export interface EvidencePayload {
  schema_version: string;
  emitted_at: string;
  emitted_by: string;
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill: string;
  error_code: string | null;
  result: string | null;
  diagnosis: unknown;
}

export function emitEvidence(input: {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill?: string;
  error_code?: string;
  result?: string;
  diagnosis?: unknown;
  emitted_by?: string;
}): EvidencePayload;

export function diagnoseChineseResponse(input: {
  stem: string;
  student_answer: string;
  expected_answer: string;
  knowledge_point: string;
  error_taxonomy_code?: string;
  grade?: number;
  student_id?: string;
}): ChineseDiagnosisResult;

export function analyzeReadingComprehension(input: {
  stem: string;
  choices?: string[];
  student_answer: string;
  expected_answer: string;
  kind: "explicit" | "inference" | "main_idea" | "structure";
}): ReadingAnalysisResult;

export function evaluateCompositionScaffolding(input: {
  prompt: string;
  student_text: string;
  grade: number;
  target_word_count?: number;
  student_id?: string;
}): CompositionScaffoldResult;

export function buildWritingFeedback(input: {
  student_text: string;
  grade: number;
  target_features: Array<"paragraph" | "thesis" | "evidence" | "transition" | "conclusion">;
  student_id?: string;
}): WritingFeedbackResult;

export function chineseSpecialistDecide(input: {
  student_id: string;
  knowledge_point: string;
  attempts: number;
  mastery?: number;
  error_code?: string;
  representation_history?: string[];
}): SpecialistDecisionResult;

export function matchVocabularyToKnowledgePoint(input: {
  word: string;
  knowledge_point: string;
}): VocabularyMatchResult;