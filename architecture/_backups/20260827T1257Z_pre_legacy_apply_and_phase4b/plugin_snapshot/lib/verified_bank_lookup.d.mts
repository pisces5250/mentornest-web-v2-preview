export function lookupVerified(query?: {
  subject?: string;
  grade?: number;
  knowledge_point?: string;
  difficulty?: string;
  type?: string;
  limit?: number;
  root?: string;
}): Promise<any[]>;
export function countVerified(query?: {
  subject?: string;
  grade?: number;
  knowledge_point?: string;
  difficulty?: string;
  type?: string;
  root?: string;
}): Promise<number>;
