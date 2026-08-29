import type {
  SubjectSpecialistRequest,
  SubjectSpecialistResponse,
} from "./subject_v1_contract.d.mjs";
import type { SUBJECT_SPECIALIST_CONTRACT_VERSION } from "./subject_v1_contract.d.mjs";

export declare const SUBJECT_CAPABILITY_GAPS: Readonly<{
  math: readonly string[];
  chinese: readonly string[];
  english: readonly string[];
  science: readonly string[];
  social_studies: readonly string[];
}>;

export declare const SUPPORTED_SUBJECTS: ReadonlyArray<
  "math" | "chinese" | "english" | "science" | "social_studies"
>;
export declare const SUBJECT_SPECIALIST_CONTRACT_VERSION: "subject-v1";

export function dispatchSubjectSpecialist(
  req: SubjectSpecialistRequest
): SubjectSpecialistResponse;

export function subjectCapabilityReport(subject?: string): {
  contract_version: typeof SUBJECT_SPECIALIST_CONTRACT_VERSION;
  subject?: string;
  known?: boolean;
  capability_gaps?: string[];
  contract_supported?: boolean;
  error?: string;
  subjects?: Record<
    string,
    { capability_gaps: string[]; contract_supported: boolean }
  >;
};
