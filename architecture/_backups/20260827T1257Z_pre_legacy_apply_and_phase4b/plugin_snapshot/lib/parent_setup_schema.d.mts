export const PARENT_SETUP_SCHEMA_VERSION = "profile-v2.1";
export const FIELD_REQUIRED: string[];
export const FIELD_RECOMMENDED: string[];
export const FIELD_OPTIONAL: string[];
export const FIELD_FORBIDDEN_IN_PARENT_PAYLOAD: string[];
export const COPY_ZH_TW: Record<string, any>;
export function validateParentSetupPayload(payload: any):
  | { ok: true; normalized: Record<string, unknown> }
  | { ok: false; reason: string };

export function getParentSetupCopy(opts?: { locale?: string }): {
  ok: true;
  locale: string;
  copy: typeof COPY_ZH_TW;
  invariants: {
    never_request_school_name_or_class_name_by_default: boolean;
    school_progress_maintained_by: string;
    audio_retention: string;
    learning_memory_audio: string;
    privacy_copy_present: boolean;
    privacy_lines: readonly string[];
  };
} | {
  ok: false;
  reason: string;
};
