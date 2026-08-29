export function findDuplicates(
  candidate: { stem?: string; [k: string]: unknown },
  existing: Array<{ id?: string; stem?: string; [k: string]: unknown }>
): Array<{ id: string; score: number; reason: string }>;
export function normalizeStem(stem: string): string;
export function jaccard(a: string, b: string): number;
