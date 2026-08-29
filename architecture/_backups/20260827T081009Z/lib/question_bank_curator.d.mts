export function curateQuestion(
  rawQuestion: any,
  ctx: { curriculum_index: any; root?: string }
): Promise<
  | { ok: true; curated: any; path: string }
  | { ok: false; reason: string; stage: string }
>;
