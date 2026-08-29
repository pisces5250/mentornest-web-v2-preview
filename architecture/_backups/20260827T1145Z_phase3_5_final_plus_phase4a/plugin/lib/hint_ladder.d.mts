export interface HintLevelResult {
  level: number;
  level_name: string;
  reason: string;
  error_type?: string;
  representation_recommendation: string | null;
  representation_change: boolean;
  is_partial?: boolean;
}

export function nextHintLevel(input: {
  result?: string;
  error_type?: string;
  attempts?: number;
  hints_already?: number;
  representation_used?: string;
}): HintLevelResult;

export const HINT_LEVELS: ReadonlyArray<string>;
