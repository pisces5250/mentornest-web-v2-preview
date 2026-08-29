export const BUCKETS: readonly string[];
export function questionPath(opts: {
  bucket: string;
  subject: string;
  grade: number;
  id: string;
  root?: string;
}): string;
export function atomicWriteJson(filepath: string, obj: unknown): Promise<void>;
export function readQuestion(filepath: string): Promise<any>;
export function listQuestions(opts: {
  bucket: string;
  subject: string;
  grade: number;
  root?: string;
}): Promise<any[]>;
export function listAllVerified(root?: string): Promise<any[]>;
export function removeQuestion(filepath: string): Promise<void>;
