export interface ProfileV2 {
  student_id: string;
  display_name?: string;
  grade?: number | null;
  school_year?: string;
  curriculum?: Record<string, unknown>;
  learning_preferences?: Record<string, unknown>;
  school_curriculum?: string | null;
  textbook_version?: Record<string, unknown>;
  learning_goals?: unknown[];
  parent_concerns?: unknown[];
  school_progress?: Record<string, unknown>;
  schema_version?: number;
  profile_minimal_onboarding?: boolean;
  updated_at?: string;
  [key: string]: unknown;
}

export function readProfileV2(student_id: string): Promise<{
  found: boolean;
  student_id: string;
  profile: ProfileV2 | null;
}>;

export function updateProfileV2(
  student_id: string,
  patch: Record<string, unknown>
): Promise<ProfileV2>;
