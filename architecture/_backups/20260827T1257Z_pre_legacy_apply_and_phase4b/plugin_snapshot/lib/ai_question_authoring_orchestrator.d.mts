export function defaultStubAuthor(target: {
  subject: string;
  grade: number;
  kp: string;
  type: string;
  difficulty: string;
}): {
  stem: string;
  answer: string | number;
  alt_answers?: Array<string | number>;
  choices?: unknown;
  explanation?: string;
};

export function runAuthoringCycle(opts: {
  workspace: string;
  subject: string;
  grade: number;
  kps?: Array<{ kp: string; subskills?: string[] }>;
  batch_size?: number;
  authorFn?: (target: { subject: string; grade: number; kp: string; type: string; difficulty: string }) => any;
  prompt_hash_prefix?: string;
}): Promise<{
  ok: true;
  report: any;
  plan: Array<{ kp: string; type: string; difficulty: string; target: number; actual: number; missing: number }>;
  run: Array<{
    target: { kp: string; type: string; difficulty: string };
    receipt: { math_verifier: any; curator: any; quality: any };
    written_to?: string;
    rejected?: { reason: string; stage: string };
  }>;
  summary: { attempted: number; accepted: number; rejected: number; ratio_accepted: number };
}>;

export function planAuthoringCycle(opts: {
  workspace: string;
  subject: string;
  grade: number;
  kps?: Array<{ kp: string; subskills?: string[] }>;
  batch_size?: number;
}): Promise<{
  subject: string;
  grade: number;
  cells_total: number;
  cells_covered: number;
  coverage_ratio: number;
  next_batch: Array<{ kp: string; type: string; difficulty: string; target: number; actual: number; missing: number }>;
}>;

export function planTopGaps(opts: {
  workspace: string;
  subject: string;
  grade: number;
  topN?: number;
}): Promise<Array<{ kp: string; type: string; difficulty: string; target: number; actual: number; missing: number }>>;
