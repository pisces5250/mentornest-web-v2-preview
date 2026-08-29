export const PARENT_SETUP_SCHEMA_VERSION = "profile-v2.1";
export const FIELD_REQUIRED: string[];
export const FIELD_RECOMMENDED: string[];
export const FIELD_OPTIONAL: string[];
export const FIELD_FORBIDDEN_IN_PARENT_PAYLOAD: string[];
export const COPY_ZH_TW: Record<string, any>;
export function validateParentSetupPayload(payload: any):
  | { ok: true; normalized: Record<string, unknown> }
  | { ok: false; reason: string };
