export function countVerifiedByCell(workspace: string): Promise<Map<string, number>>;
export function buildCoverageReport(opts: {
  workspace: string;
  subject: string;
  grade: number;
  kps?: Array<{ kp: string; subskills?: string[] }>;
}): Promise<{
  subject: string;
  grade: number;
  kps_scanned: number;
  cells_total: number;
  cells_covered: number;
  coverage_ratio: number;
  gaps: Array<{ kp: string; type: string; difficulty: string; target: number; actual: number; missing: number }>;
  authoring_priority: Array<{ kp: string; type: string; difficulty: string; target: number; actual: number; missing: number }>;
}>;
export function topGaps(opts: {
  workspace: string;
  subject: string;
  grade: number;
  topN?: number;
  kps?: Array<{ kp: string }>;
}): Promise<Array<{ kp: string; type: string; difficulty: string; target: number; actual: number; missing: number }>>;
