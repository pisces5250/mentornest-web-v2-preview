// TypeScript declarations for english_specialist.mjs

export interface EnglishEvidencePayload {
  schema_version: string;
  emitted_at: string;
  emitted_by: string;
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill: string;
  error_codes: string[];
  result: string | null;
  diagnosis: any;
}

export interface EnglishDiagnosisPayload {
  schema_version: string;
  emitted_at: string;
  student_id: string;
  knowledge_point: string;
  error_codes: string[];
  error_subtype: string | null;
  recommendation_zh: string | null;
  subskill: string;
}

export interface EnglishDiagnosisResult {
  valid: boolean;
  correct: boolean;
  error_codes: string[];
  hint_level: number;
  hint_text_zh: string;
  mini_lesson_suggested: boolean;
  mastery_check_suggested: boolean;
  evidence_payload: EnglishEvidencePayload;
  diagnosis_payload: EnglishDiagnosisPayload;
}

export function diagnoseEnglishResponse(input: {
  stem: string;
  student_answer: string;
  expected_answer: string;
  knowledge_point: string;
  mode?: string;
  transcript_metadata?: any;
  grade?: number;
  error_code?: string;
  student_id?: string;
}): EnglishDiagnosisResult;

export interface EnglishReadingAnalysisResult {
  kind: string;
  correct: boolean;
  evidence_span?: string;
  matched_keywords: string[];
  missed_keywords: string[];
  error_code?: string;
  hint_text_zh: string;
  mini_lesson_suggested: boolean;
}

export function analyzeReadingComprehensionEnglish(input: {
  stem: string;
  choices?: string[];
  student_answer: string;
  expected_answer: string;
  kind: "explicit" | "inference" | "main_idea" | "vocab_in_context" | "author_purpose";
}): EnglishReadingAnalysisResult;

export interface EnglishOralRequest {
  request_id: string;
  provider: "sensevoice_local";
  audio_path: string | null;
  locale: string;
  expected_format: "zh-en-mixed";
  knowledge_point: string;
  stem_preview: string;
  expected_answer_preview: string;
  transcript_passthrough: string | null;
  auto_invoke: false;
}

export type EnglishOralGrader = (input: {
  transcript: string;
  expected_answer?: string;
  knowledge_point?: string;
}) => any;

export function transcribeAndGradeOralResponse(input: {
  student_id: string;
  audio_path?: string;
  transcript?: string;
  knowledge_point: string;
  stem: string;
  expected_answer: string;
  locale?: string;
}): { stt_request: EnglishOralRequest; post_transcription_grade: EnglishOralGrader };

export interface EnglishConversationTurnResult {
  feature_pass: Record<string, boolean>;
  feedback_lines: Array<{
    feature: string;
    message_zh: string;
    severity: "info" | "warn" | "block";
  }>;
  evidence_payload: EnglishEvidencePayload;
  diagnosis_payload: EnglishDiagnosisPayload;
}

export function evaluateConversationTurn(input: {
  student_id?: string;
  conversation_history: Array<{ role: "assistant" | "user"; text: string }>;
  student_turn: string;
  target_features: string[];
}): EnglishConversationTurnResult;

export interface EnglishDecideResult {
  action:
    | "text_prompt"
    | "drill_phonics"
    | "vocab_drill"
    | "reading_scaffold"
    | "oral_practice"
    | "conversation_practice"
    | "mastery_check"
    | "backtrack_prerequisite";
  rationale: string;
  confidence: number;
  subskill: string;
  mode: string;
  context: {
    attempts: number;
    mastery: number | null;
    error_codes: string[] | null;
    representation_history: string[];
    matched_segment: string;
  };
}

export function englishSpecialistDecide(input: {
  student_id: string;
  knowledge_point: string;
  attempts: number;
  mastery?: number;
  error_codes?: string[] | string;
  error_code?: string;
  representation_history?: string[];
  mode?: string;
}): EnglishDecideResult;

export interface EnglishPhonicsEntry {
  word: string;
  found: boolean;
  phonemes: string[];
  stress_pattern: string;
  common_confusions: string[];
  gap_note?: string;
}

export function englishToPhonicsMap(input: { word: string }): EnglishPhonicsEntry;

export function emitEvidence(input: {
  student_id: string;
  subject: string;
  knowledge_point: string;
  subskill?: string;
  error_code?: string | string[];
  result?: string;
  diagnosis?: any;
  emitted_by?: string;
}): EnglishEvidencePayload;
