export function buildProvenance(p: {
  source_class: string;
  source_id: string;
  license: string;
  generated_at?: string;
  generated_by: string;
  prompt?: string;
  parent_question_id?: string;
}): Record<string, unknown>;
export function hashPrompt(prompt: string): string;
export function validateProvenance(prov: any):
  | { ok: true }
  | { ok: false; reason: string };
