import { randomUUID } from "node:crypto";

const SUBJECTS = new Set(["math", "english", "chinese", "science", "social_studies"]);

export class TutorSessionStartError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export function createTutorSessionStartOrchestrator({ gateway } = {}) {
  if (!gateway || typeof gateway.invoke !== "function") throw new TypeError("gateway_required");
  return Object.freeze({
    async start(input, { subjectRef } = {}) {
      if (!subjectRef) throw new TutorSessionStartError("subject_context_required", 400);
      const grade = resolveGrade(input?.grade, input?.age_band);
      if (!input || !SUBJECTS.has(input.subject) || !grade) throw new TutorSessionStartError("invalid_session_request", 400);
      if (input.knowledge_point !== undefined && (typeof input.knowledge_point !== "string" || input.knowledge_point.length > 100)) {
        throw new TutorSessionStartError("invalid_session_request", 400);
      }
      const director = await gateway.invoke("learning_director.recommend", {
        subjectRef,
        input: {
          confirmed_mastery: [],
          session_request: {
            subject: input.subject,
            knowledge_point: input.knowledge_point || null,
          },
        },
      });
      const recommendation = director?.recommendations?.[0];
      if (!recommendation) throw new TutorSessionStartError("learning_plan_unavailable", 503);
      const query = {
        subject: recommendation.subject,
        grade,
        ...(recommendation.knowledge_point ? { knowledge_point: recommendation.knowledge_point } : {}),
        limit: Math.max(1, Math.min(5, Number.isInteger(input.target_steps) ? input.target_steps : 4)),
      };
      let bank = await gateway.invoke("verified_bank.read", {
        subjectRef,
        input: query,
      });
      let selectionBasis = "director_exact_kp";
      if ((bank?.questions || []).length === 0 && recommendation.knowledge_point) {
        bank = await gateway.invoke("verified_bank.read", {
          subjectRef,
          input: { subject: recommendation.subject, grade, limit: query.limit },
        });
        selectionBasis = "director_subject_verified_fallback";
      }
      const questions = (bank?.questions || []).map(publicQuestion);
      if (questions.length === 0) throw new TutorSessionStartError("verified_question_unavailable", 503);
      return Object.freeze({
        ok: true,
        contract_version: "phase6.tutor-session.v1",
        session_id: `tsess_${randomUUID()}`,
        director_decision: director,
        selection_basis: selectionBasis,
        questions,
      });
    },
  });
}

function resolveGrade(grade, ageBand) {
  if (Number.isInteger(grade) && grade >= 1 && grade <= 12) return grade;
  return { "G1-G2": 2, "G3-G4": 4, "G5-G6": 5, "G7+": 7 }[ageBand] || null;
}

function publicQuestion(question) {
  const safe = {};
  for (const key of ["id", "subject", "grade", "knowledge_point", "type", "representation_type", "stem", "choices", "difficulty"]) {
    if (question[key] !== undefined) safe[key] = question[key];
  }
  return Object.freeze(safe);
}
