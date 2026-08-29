export interface ParsedAnswer {
  kind: "fraction" | "number" | "expression" | "string" | "invalid";
  value?: unknown;
  original_form?: string;
  form?: string;
  reason?: string;
}

export interface MathValidationResult {
  verdict: "correct" | "incorrect" | "unverifiable";
  reason: string;
  expected_parsed: ParsedAnswer;
  student_parsed: ParsedAnswer;
  compare_steps: Array<{ step: string; result: unknown }>;
}

export function validateMathAnswer(input: {
  expected_answer: string | number;
  student_answer: string | number;
  opts?: {
    numeric_tolerance?: number;
    allow_string_match?: boolean;
  };
}): MathValidationResult;

export function parseAnswer(s: string): ParsedAnswer;

export function compareNumeric(
  expectedFrac: { n: number; d: number },
  candidateFrac: { n: number; d: number },
  opts?: { numeric_tolerance?: number }
): { equal: boolean; reason: string };
