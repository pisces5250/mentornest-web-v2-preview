// TypeScript declarations for lib/raw_question_ingestor.mjs

export const INGESTION_KIND: {
  readonly TEXT: "text";
  readonly STRUCTURED: "structured";
  readonly PDF: "pdf";
  readonly IMAGE: "image";
};

export const VALID_KINDS: readonly string[];

export const SOURCE_CLASS: {
  readonly STUDENT_PRIVATE: "student_private";
  readonly AI_AUTHORED: "ai_authored";
  readonly OPEN_LICENSE: "open_license";
  readonly TEACHER_AUTHORED: "teacher_authored";
};

export const VALID_SOURCE_CLASSES: readonly string[];

export const LICENSE: {
  readonly AI_ORIGINAL: "AI_ORIGINAL";
  readonly AI_ADAPTED: "AI_ADAPTED";
  readonly CC_BY: "CC-BY";
  readonly CC_BY_SA: "CC-BY-SA";
  readonly CC0: "CC0";
  readonly PRIVATE: "PRIVATE";
};

export const VALID_LICENSES: readonly string[];

export interface DetectionSignals {
  has_question_mark: boolean;
  has_choice_pattern: boolean;
  has_answer_key: boolean;
  stem_length: number;
}

export interface SourceProvenance {
  source_class: "student_private" | "ai_authored" | "open_license" | "teacher_authored";
  source_id: string;
  license: "AI_ORIGINAL" | "AI_ADAPTED" | "CC-BY" | "CC-BY-SA" | "CC0" | "PRIVATE";
}

export interface RawCandidate {
  candidate_id: string;
  source_kind: "text" | "structured" | "pdf" | "image";
  raw_text: string;
  byte_offset: number | null;
  detection_signals: DetectionSignals;
  ingestion_id: string;
  ingested_at: string;
  source_provenance: SourceProvenance;
}

export interface IngestionError {
  code: string;
  message: string;
}

export interface RawIngestionReport {
  ok: boolean;
  kind: "text" | "structured" | "pdf" | "image" | null;
  raw_question_count: number;
  candidates: RawCandidate[];
  errors: IngestionError[];
  warning: string | null;
}

export interface IngestInput {
  kind: "text" | "structured" | "pdf" | "image";
  content: string | object | Uint8Array | null;
  source_class: "student_private" | "ai_authored" | "open_license" | "teacher_authored";
  source_id: string;
  license: "AI_ORIGINAL" | "AI_ADAPTED" | "CC-BY" | "CC-BY-SA" | "CC0" | "PRIVATE";
}

export function makeCandidateId(now?: number): string;
export function makeIngestionId(): string;
export function isValidKind(kind: string): boolean;
export function isValidSourceClass(sc: string): boolean;
export function isValidLicense(lc: string): boolean;
export function computeSignals(text: string): DetectionSignals;
export function splitTextIntoBlocks(text: string): { text: string; byte_offset: number }[];
export function normalizeStructuredQuestions(content: unknown): unknown[];
export function buildCandidate(input: {
  source_kind: "text" | "structured" | "pdf" | "image";
  raw_text: string;
  byte_offset?: number | null;
  ingestion_id: string;
  source_class: string;
  source_id: string;
  license: string;
}): RawCandidate;
export function ingestRawQuestion(input: IngestInput): RawIngestionReport;

export const __TEST__: {
  splitTextIntoBlocks: typeof splitTextIntoBlocks;
  normalizeStructuredQuestions: typeof normalizeStructuredQuestions;
  computeSignals: typeof computeSignals;
  asUint8Array: (buf: unknown) => Uint8Array | null;
};