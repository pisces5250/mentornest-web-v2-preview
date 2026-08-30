import { browserCsrfToken } from "../foundation/browser_security";
import type { AgeBand, SessionState } from "./session-types";
import type { SessionStep } from "./QuestionRenderer";

const SUBJECTS = new Set(["math", "english", "chinese", "science", "social_studies"]);
const QUESTION_TYPES = new Set(["multiple_choice", "fraction_input", "integer_input", "decimal_input", "short_answer", "true_false", "open_response", "voice_response", "english_conversation"]);
const REPRESENTATIONS = new Set(["text", "fraction_bar", "number_line", "area_model", "bar_model"]);

function publicQuestion(value: unknown): SessionStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("題目格式不完整");
  const raw = value as Record<string, unknown>;
  for (const forbidden of ["expected_answer", "answer", "answer_key", "rubric"]) {
    if (forbidden in raw) throw new Error("公開題目包含答案欄位");
  }
  const stepId = raw.step_id ?? raw.id;
  const questionType = raw.question_type ?? raw.type;
  if (typeof stepId !== "string" || typeof raw.subject !== "string" || !SUBJECTS.has(raw.subject) ||
      typeof questionType !== "string" || !QUESTION_TYPES.has(questionType) || typeof raw.stem !== "string") {
    throw new Error("題目公開欄位不完整");
  }
  const representation = typeof raw.representation_type === "string" && REPRESENTATIONS.has(raw.representation_type)
    ? raw.representation_type : "text";
  if (raw.choices !== undefined && (!Array.isArray(raw.choices) || raw.choices.some((choice) => typeof choice !== "string"))) {
    throw new Error("題目選項格式錯誤");
  }
  return {
    step_id: stepId,
    knowledge_point: typeof raw.knowledge_point === "string" ? raw.knowledge_point : "unknown",
    subject: raw.subject,
    question_type: questionType as SessionStep["question_type"],
    representation_type: representation as SessionStep["representation_type"],
    stem: raw.stem,
    choices: raw.choices as string[] | undefined,
    difficulty: raw.difficulty === "easy" || raw.difficulty === "hard" ? raw.difficulty : "medium",
    source: "verified",
    license: typeof raw.license === "string" ? raw.license : "verified-bank",
  };
}

export async function startVerifiedSession(input: {
  subject: string;
  ageBand: AgeBand;
  knowledgePoint?: string;
  targetSteps?: number;
  localStudentId: string;
}): Promise<SessionState> {
  if (!SUBJECTS.has(input.subject)) throw new Error("不支援的科目");
  const response = await fetch("/api/tutor/session/start", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-MentorNest-CSRF": browserCsrfToken() },
    body: JSON.stringify({
      subject: input.subject,
      age_band: input.ageBand,
      knowledge_point: input.knowledgePoint || undefined,
      target_steps: Math.max(1, Math.min(5, input.targetSteps ?? 4)),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.ok !== true || typeof body.session_id !== "string" || !Array.isArray(body.questions)) {
    throw new Error("老師暫時無法準備這科的題目，請稍後再試。");
  }
  const steps: SessionStep[] = (body.questions as unknown[]).map(publicQuestion);
  if (steps.length === 0) throw new Error("這科的已驗證題目正在準備中。");
  const now = new Date().toISOString();
  return {
    session_id: body.session_id,
    student_id: input.localStudentId,
    age_band: input.ageBand,
    status: "active",
    current_index: 0,
    steps: steps.map((step) => ({ ...step, attempts: [], hints_used: 0, representation_switches: 0, last_verdict: null, phase: "presenting" })),
    summary: null,
    started_at: now,
    finished_at: null,
    error: null,
  };
}

export const __TEST__ = { publicQuestion };
