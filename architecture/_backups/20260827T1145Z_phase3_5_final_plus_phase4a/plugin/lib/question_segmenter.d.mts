// TypeScript declarations for lib/question_segmenter.mjs

export const QUESTION_TYPE: {
  readonly SHORT_ANSWER: "short_answer";
  readonly MULTIPLE_CHOICE: "multiple_choice";
  readonly TRUE_FALSE: "true_false";
  readonly FILL_IN_BLANK: "fill_in_blank";
  readonly ESSAY: "essay";
  readonly UNKNOWN: "unknown";
};

export const VALID_QUESTION_TYPES: readonly string[];

export interface RawCandidateLike {
  candidate_id: string;
  raw_text: string;
  detection_signals?: {
    has_question_mark: boolean;
    has_choice_pattern: boolean;
    has_answer_key: boolean;
    stem_length: number;
  };
  byte_offset?: number | null;
}

export interface Choice {
  label: string;
  text: string;
}

export interface SegmentedQuestion {
  seg_id: string;
  candidate_id: string | null;
  type:
    | "short_answer"
    | "multiple_choice"
    | "true_false"
    | "fill_in_blank"
    | "essay"
    | "unknown";
  stem: string;
  choices: Choice[] | null;
  answer_hint: string | null;
  blank_count: number;
  matched_patterns: string[];
  confidence: number;
  source_offset: number | null;
}

export interface SegmentationReport {
  ok: boolean;
  segmented_count: number;
  questions: SegmentedQuestion[];
  warnings: string[];
}

export function makeSegId(now?: number): string;
export function countBlanks(stem: string): number;
export function extractChoices(stem: string): Choice[] | null;
export function extractAnswerHint(text: string): string | null;
export function splitStemAndTrailer(raw_text: string): { stem: string; trailer: string };
export function classifyStem(stem: string): {
  type: "short_answer" | "multiple_choice" | "true_false" | "fill_in_blank" | "essay" | "unknown";
  matched_patterns: string[];
};
export function computeConfidence(
  type: string,
  matched_patterns: string[],
  signals?: { has_question_mark: boolean; has_choice_pattern: boolean; has_answer_key: boolean; stem_length: number }
): number;
export function segmentCandidate(candidate: RawCandidateLike): SegmentedQuestion | null;
export function segmentCandidates(candidates: RawCandidateLike[]): SegmentationReport;

export const __TEST__: {
  classifyStem: typeof classifyStem;
  splitStemAndTrailer: typeof splitStemAndTrailer;
  extractChoices: typeof extractChoices;
  extractAnswerHint: typeof extractAnswerHint;
  countBlanks: typeof countBlanks;
  computeConfidence: typeof computeConfidence;
};