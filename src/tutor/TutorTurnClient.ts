import type { TutorTurnRequest, TutorTurnResponse } from "./TutorTurnContract";
import { browserCsrfToken } from "../foundation/browser_security";
import type { SpecialistRepresentationData, TutorSubject } from "./SpecialistRepresentation";

export type TutorTurnEvaluator = (request: TutorTurnRequest) => Promise<TutorTurnResponse>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

const NEXT_STEP_FIELDS = ["id", "step_id", "knowledge_point", "subject", "type", "question_type", "representation_type", "stem", "choices", "difficulty", "source", "license", "instruction_text", "display_text", "spoken_text", "language"] as const;

export function parsePublicNextStep(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const raw = record(value);
  for (const forbidden of ["expected_answer", "answer", "answer_key", "rubric"]) {
    if (forbidden in raw) throw new Error("Tutor next_step 含有非公開答案欄位");
  }
  const result: Record<string, unknown> = {};
  for (const field of NEXT_STEP_FIELDS) if (field in raw) result[field] = raw[field];
  const id = result.step_id ?? result.id;
  const type = result.question_type ?? result.type;
  if (typeof id !== "string" || typeof type !== "string" || typeof result.stem !== "string") {
    throw new Error("Tutor next_step 公開欄位不完整");
  }
  if (result.choices !== undefined && (!Array.isArray(result.choices) || result.choices.some((choice) => typeof choice !== "string"))) {
    throw new Error("Tutor next_step choices 格式錯誤");
  }
  if (type === "voice_response" && ([result.instruction_text, result.display_text, result.spoken_text]
    .some((field) => typeof field !== "string" || field.trim() === "") || result.language !== "en-US")) {
    throw new Error("Tutor next_step 英文朗讀欄位不完整");
  }
  return result;
}

const SUBJECTS = new Set<TutorSubject>(["math", "english", "chinese", "science", "social_studies"]);

export function parseSpecialistRepresentation(subjectValue: unknown, value: unknown): SpecialistRepresentationData | null {
  if (typeof subjectValue !== "string" || !SUBJECTS.has(subjectValue as TutorSubject)) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = record(value);
  for (const forbidden of ["expected_answer", "answer_key", "rubric", "judgement"]) {
    if (forbidden in raw) throw new Error("Specialist representation 含非呈現欄位");
  }
  if (typeof raw.kind !== "string" || typeof raw.content !== "string" || raw.content.trim() === "") return null;
  const items = raw.items === undefined ? [] : raw.items;
  if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) return null;
  return {
    subject: subjectValue as TutorSubject,
    kind: raw.kind,
    title: typeof raw.title === "string" ? raw.title : null,
    content: raw.content,
    items: items.slice(0, 6) as string[],
    aria_label: typeof raw.aria_label === "string" ? raw.aria_label : null,
  };
}

export function parseTutorTurnResponse(value: unknown): TutorTurnResponse {
  if (!value || typeof value !== "object") throw new Error("Tutor turn response 格式錯誤");
  const data = value as Record<string, unknown>;
  if (data.ok !== true) throw new Error("Tutor turn 未成功");
  const judgement = record(data.judgement);
  const diagnosis = record(data.diagnosis);
  const teaching = record(data.teaching);
  const assessment = record(data.assessment_evidence);
  const memory = record(data.memory_write);
  const rawVerdict = String(judgement.result);
  const verdict = rawVerdict === "partially_correct" ? "incorrect" : rawVerdict;
  if (!["correct", "incorrect", "unverifiable"].includes(verdict)) throw new Error("Tutor turn verdict 無效");
  const rawAction = String(teaching.action);
  const writerFailed = memory.accepted === false && rawVerdict !== "unverifiable";
  const subjectValue = data.subject ?? teaching.subject;
  const action = writerFailed ? "retry"
    : rawAction === "advance" ? "next"
    : rawAction === "retry_same" ? "retry"
    : rawAction === "practice_similar" ? "review" : "explain";
  return {
    subject: typeof subjectValue === "string" && SUBJECTS.has(subjectValue as TutorSubject) ? subjectValue as TutorSubject : null,
    verdict: verdict as TutorTurnResponse["verdict"],
    summary: writerFailed ? "老師已看完，但學習紀錄還沒有安全存好，請再送一次。" : String(teaching.utterance || "老師已看完你的回答。"),
    diagnosis: typeof diagnosis.error_code === "string" ? diagnosis.error_code : null,
    teaching_point: rawAction === "practice_similar" ? "我們換一種方式，再練習同一個概念。" : null,
    hint: typeof data.hint === "string" && data.hint.trim() !== "" ? data.hint : null,
    recommended_action: action as TutorTurnResponse["recommended_action"],
    assessment_evidence_id: typeof assessment.observation_id === "string" ? assessment.observation_id : null,
    learning_memory_receipt_id: typeof memory.event_id === "string" ? memory.event_id : null,
    next_step: parsePublicNextStep(data.next_step),
    selection_reason: typeof data.child_safe_next_reason === "string" ? data.child_safe_next_reason : null,
    loop_completed: data.loop_completed === true,
    trace_id: typeof data.trace_id === "string" ? data.trace_id : "unavailable",
    representation: parseSpecialistRepresentation(subjectValue, data.representation ?? teaching.representation),
    memory_write_failed: writerFailed,
  };
}

export const evaluateTutorTurn: TutorTurnEvaluator = async (request) => {
  const response = await fetch("/api/tutor/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MentorNest-CSRF": browserCsrfToken() },
    credentials: "same-origin",
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Tutor turn failed: ${response.status}`);
  return parseTutorTurnResponse(await response.json());
};
