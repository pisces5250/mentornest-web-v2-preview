export interface MathVerificationRequest {
  stem?: string;
  answer: string | number;
  alt_answers?: Array<string | number>;
  grade?: number;
}

export interface MathVerificationReceipt {
  ok: boolean;
  reason?: string;
  parse: {
    primary: {
      input: string;
      verdict: string;
      reason?: string;
      kind: string | null;
    };
    alts: Array<{
      input: string;
      verdict: string;
      reason?: string;
      kind: string | null;
    }>;
  };
  equivalence: {
    verdict: "pass" | "fail";
    mismatches: Array<{ alt: string; reason?: string }>;
  };
  warnings: string[];
  stem_preview?: string;
  verified_at: string;
  verified_by: string;
  gate_version: string;
  stages_passed: string[];
  stages_failed: string[];
}

export function verifyMathQuestion(req: MathVerificationRequest): MathVerificationReceipt;
export function receiptPassed(receipt: MathVerificationReceipt): boolean;
