export function verifyQuestion(
  q: any,
  ctx: { curriculum_index: any; root?: string; verified_index_path?: string }
): Promise<
  | { ok: true; verified: any; path: string; indexEntry: any }
  | { ok: false; reason: string; stage: string; dup?: any }
>;
export function rejectQuestion(
  q: any,
  ctx: { root?: string },
  reason: string
): Promise<{ ok: true; path: string; reason: string }>;
