import type {
  SubjectSpecialistRequest,
  SubjectSpecialistResponse,
} from "./subject_v1_contract.d.mjs";
import type {
  SUBJECT_SPECIALIST_CONTRACT_VERSION,
} from "./subject_v1_contract.d.mjs";

export declare const KP_PREFIX_TO_SUBJECT: Readonly<Record<string, string>>;

export declare const PER_SUBJECT_TOOL_NAMES: Readonly<Record<string, readonly string[]>>;

export function chooseSubjectFromKnowledgePoint(
  knowledge_point: string
): string | null;

export function chooseSubject(input: {
  current_subject?: string;
  knowledge_point?: string;
}): string;

export function extractKnowledgePointFromInput(input: unknown): string;

export interface DispatchNextStepResult {
  chosen_subject: string;
  knowledge_point: string;
  response: SubjectSpecialistResponse;
  merge?: unknown;
  contract_version: typeof SUBJECT_SPECIALIST_CONTRACT_VERSION;
}

export function dispatchNextStep(input: {
  student_id: string;
  student_input: Record<string, unknown>;
  current_subject?: string;
  knowledge_point?: string;
}): DispatchNextStepResult;

export function learningDirectorV2CapabilityReport(): {
  contract_version: typeof SUBJECT_SPECIALIST_CONTRACT_VERSION;
  supported_subjects: string[];
  action_priority: string[];
  subject_capabilities: Record<
    string,
    { capability_gaps: string[]; contract_supported: boolean }
  >;
  capability_gaps_by_subject: Record<string, string[]>;
  tools: Record<string, readonly string[]>;
};
