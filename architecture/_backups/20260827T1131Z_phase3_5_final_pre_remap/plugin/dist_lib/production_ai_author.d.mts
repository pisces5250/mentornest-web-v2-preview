// Type declaration shim for production_ai_author.mjs

export interface AuthorTarget {
  subject: string;
  grade: number;
  knowledge_point: string;
  question_type: "short_answer" | "multiple_choice" | "true_false";
  difficulty: "easy" | "medium" | "hard";
  authoring_constraints?: Record<string, unknown>;
  locale?: string;
}

export interface AuthorValidatedOutput {
  stem: string;
  answer: string | number | boolean;
  alt_answers?: string[];
  choices?: string[];
  explanation: string;
  confidence: number;
  knowledge_point: string;
}

export interface AuthorRunResultOk {
  ok: true;
  trace_id: string;
  attempts_used: number;
  output: AuthorValidatedOutput;
}
export interface AuthorRunResultErr {
  ok: false;
  trace_id: string;
  error: { code: string; message: string; forbidden?: string[] };
}
export type AuthorRunResult = AuthorRunResultOk | AuthorRunResultErr;

export interface AuthorFnOptions {
  gatewayUrl?: string;
  model?: string;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  locale?: string;
  authoring_constraints?: Record<string, unknown>;
}

export interface ProductionAuthorFn {
  (target: {
    subject: string;
    grade: number;
    kp: string;
    type: "short_answer" | "multiple_choice" | "true_false";
    difficulty: "easy" | "medium" | "hard";
  }): Promise<{
    stem: string;
    answer: string | number | boolean;
    alt_answers?: string[];
    choices?: string[];
    explanation: string;
    _confidence?: number;
    _trace_id?: string;
    _attempts_used?: number;
  } | null>;
}

export function assertAuthorPayloadPrivacy(payload: unknown): void;
export function buildAuthorPrompt(input: AuthorTarget): { system: string; user: string };
export function validateAuthorOutput(obj: unknown, opts: { question_type: string; knowledge_point: string }): AuthorValidatedOutput;
export function parseModelJson(rawText: string): unknown;
export function extractOutputText(resp: unknown): string;
export function runAuthorOnce(target: AuthorTarget, opts?: AuthorFnOptions): Promise<AuthorRunResult>;
export function createProductionAuthorFn(opts?: AuthorFnOptions): ProductionAuthorFn;
