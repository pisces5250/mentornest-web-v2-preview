// Type declarations for word_problem_decomposer.mjs

export interface WPDecompositionResult {
  ok: boolean;
  reason?: string;
  stem_summary?: string;
  quantities: any[];
  unknowns: any[];
  operations_hint: string[];
  constraints: string[];
  question_type:
    | "part-part-whole"
    | "comparison"
    | "ratio"
    | "change"
    | "rate"
    | "proportion"
    | "measurement"
    | "fraction-mix"
    | "unknown";
  vocabulary_clues: any[];
  answer_unit_hint: string | null;
  ambiguity_flags: string[];
  answer_kind_hint: "number" | "unit-expression" | "expression" | "string";
}

export interface WPTemplateMatch {
  template_id: string | null;
  confidence: number;
  rationale: string;
  decomposition?: WPDecompositionResult;
}

export function decomposeWordProblem(input: { stem: string; grade?: number; knowledge_point?: string }): WPDecompositionResult;
export function matchWordProblemTemplate(input: { stem: string; knowledge_point?: string }): WPTemplateMatch;
export function listWordProblemTemplates(): Array<{ template_id: string; applies_to: string[]; description: string }>;
