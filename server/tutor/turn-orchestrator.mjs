import { randomUUID } from "node:crypto";
import { validateMathAnswer } from "../../src/foundation/math_validator.mjs";
import { diagnoseEnglishResponse } from "./english/english_specialist.mjs";

const RESULTS = new Set(["correct", "incorrect", "partially_correct"]);

export class TutorTurnError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/**
 * 建立一次作答的 server-side learning loop。
 * 答案、判斷規則與 authority 呼叫都不會交給 browser。
 */
export function createTutorTurnOrchestrator({ gateway, maxCachedResponses = 1000 } = {}) {
  if (!gateway || typeof gateway.invoke !== "function") throw new TypeError("gateway_required");
  const responseOwners = new Map();
  const responseCache = new Map();
  const inFlightResponses = new Map();

  return Object.freeze({
    async submit(input, { subjectRef } = {}) {
      validateRequest(input, subjectRef);
      const owner = responseOwners.get(input.response_id);
      if (owner && owner !== subjectRef) throw new TutorTurnError("response_owner_mismatch", 403);
      const cacheKey = `${subjectRef}:${input.response_id}`;
      if (responseCache.has(cacheKey)) return { ...responseCache.get(cacheKey), idempotent_replay: true };
      if (inFlightResponses.has(cacheKey)) {
        const replay = await inFlightResponses.get(cacheKey);
        return { ...replay, idempotent_replay: true };
      }
      responseOwners.set(input.response_id, subjectRef);

      const operation = (async () => {

      const bank = await gateway.invoke("verified_bank.read", {
        subjectRef,
        input: { question_id: input.question_id, limit: 1 },
        requestId: input.response_id,
      });
      const question = bank?.questions?.[0];
      if (!question || question.id !== input.question_id || question.verification_status !== "verified") {
        throw new TutorTurnError("verified_question_required", 404);
      }

      const judgement = judgeAnswer(question, input.response);
      if (judgement.result === "unverifiable") {
        const result = Object.freeze({
          ok: true,
          contract_version: "phase6.tutor-turn.v1",
          trace_id: `tturn_${randomUUID()}`,
          loop_completed: false,
          verdict: "unverifiable",
          summary: "老師還不能公平判斷這個答案，請再輸入一次。",
          diagnosis: null,
          teaching_point: null,
          hint: "請再輸入一次，確認答案完整送出。",
          recommended_action: "retry",
          assessment_evidence_id: null,
          learning_memory_receipt_id: null,
          next_step_id: null,
          selection_reason: null,
          judgement,
          teaching: {
            action: "retry_same",
            utterance: "老師還不能公平判斷這個答案，請再輸入一次。",
            representation: null,
          },
          assessment_evidence: null,
          memory_write: { accepted: false, code: "unverifiable_not_recorded" },
          director_decision: null,
          next_step: null,
          idempotent_replay: false,
        });
        remember(responseCache, cacheKey, result, maxCachedResponses);
        return result;
      }
      const diagnosis = diagnose(question, judgement, input.attempt_index, input.response);
      const teaching = teach(question, judgement, diagnosis, input.attempt_index);
      const occurredAt = validIso(input.occurred_at) ? input.occurred_at : new Date().toISOString();
      if (!safeId(question.answer_key_version)) throw new TutorTurnError("answer_key_version_required", 503);
      const assessmentInput = {
        assessment_kind: "diagnostic",
        subject: question.subject,
        knowledge_point: question.knowledge_point,
        instrument: {
          question_id: question.id,
          verification_status: "verified",
          answer_key_version: question.answer_key_version,
        },
        attempt: {
          response_id: input.response_id,
          result: judgement.result,
          hints_used: input.hints_used,
          first_attempt: input.attempt_index === 1,
          occurred_at: occurredAt,
        },
        error_code: diagnosis.error_code,
      };
      const assessment = await gateway.invoke("assessment.submit_observation", {
        subjectRef,
        input: assessmentInput,
        requestId: input.response_id,
      });

      const traceId = `tturn_${randomUUID()}`;
      const observation = {
        kind: "synthetic_tutor_attempt",
        knowledge_point: question.knowledge_point,
        evidence: {
          trace_id: traceId,
          observation_id: assessment.observation_id,
          observed: {
            result: judgement.result,
            attempt_index: input.attempt_index,
            hints_used: input.hints_used,
            question_id: question.id,
          },
          inferred: {
            error_code: diagnosis.error_code,
            error_codes: diagnosis.error_codes,
            confidence: diagnosis.confidence,
            next_action: teaching.action,
          },
          authority: {
            judgement: "objective_validator",
            diagnosis: `${question.subject}-specialist`,
            assessment: "assessment_observer",
          },
        },
        source: "tutor_server",
        occurred_at: occurredAt,
      };

      let memory;
      try {
        memory = await gateway.invoke("learning_memory.append_observation", {
          subjectRef,
          input: { observation },
          requestId: input.response_id,
        });
      } catch {
        memory = { accepted: false, code: "learning_memory_write_failed" };
      }
      if (memory?.accepted !== true) {
        return publicResponse({
          traceId, judgement, diagnosis, teaching, assessment, memory,
          director: null, nextQuestion: null, loopCompleted: false,
        });
      }

      const director = await gateway.invoke("learning_director.recommend", {
        subjectRef,
        input: {
          // 現階段 provider 尚無可信 mastery reader；絕不接受 browser 自報 mastery。
          confirmed_mastery: [],
          recent_observations: [{
            evidence_status: "observed",
            subject: question.subject,
            knowledge_point: question.knowledge_point,
            result: judgement.result,
            error_code: diagnosis.error_code,
            hints_used: input.hints_used,
          }],
        },
        requestId: input.response_id,
      });
      const recommendation = director?.recommendations?.[0] || null;
      let nextQuestion = null;
      if (recommendation) {
        const next = await gateway.invoke("verified_bank.read", {
          subjectRef,
          input: {
            subject: recommendation.subject,
            knowledge_point: recommendation.knowledge_point,
            limit: 5,
          },
          requestId: input.response_id,
        });
        nextQuestion = (next?.questions || []).find((item) => item.id !== question.id) || next?.questions?.[0] || null;
      }
      const result = publicResponse({
        traceId, judgement, diagnosis, teaching, assessment, memory,
        director, nextQuestion, loopCompleted: true,
      });
      remember(responseCache, cacheKey, result, maxCachedResponses);
      return result;
      })();
      inFlightResponses.set(cacheKey, operation);
      try {
        return await operation;
      } finally {
        inFlightResponses.delete(cacheKey);
      }
    },
  });
}

function validateRequest(input, subjectRef) {
  if (!subjectRef || typeof subjectRef !== "string") throw new TutorTurnError("subject_context_required", 400);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TutorTurnError("invalid_payload", 400);
  if (!safeId(input.question_id) || !safeId(input.response_id)) throw new TutorTurnError("invalid_payload", 400);
  if (!Number.isInteger(input.attempt_index) || input.attempt_index < 1 || input.attempt_index > 20) throw new TutorTurnError("invalid_attempt", 400);
  if (!Number.isInteger(input.hints_used) || input.hints_used < 0 || input.hints_used > 5) throw new TutorTurnError("invalid_attempt", 400);
  if (!["string", "number"].includes(typeof input.response)) throw new TutorTurnError("invalid_response", 400);
  if (String(input.response).length > 500) throw new TutorTurnError("invalid_response", 400);
}

function judgeAnswer(question, response) {
  if (!("expected_answer" in question)) throw new TutorTurnError("answer_key_unavailable", 503);
  if (question.subject === "math") {
    const result = validateMathAnswer({
      expected_answer: question.expected_answer,
      student_answer: response,
      opts: { numeric_tolerance: 0, allow_string_match: true },
    });
    return Object.freeze({ result: result.verdict, authority: "objective_math_validator" });
  }
  if (question.subject !== "english") {
    return Object.freeze({ result: "unverifiable", authority: "specialist_evaluator_required" });
  }
  const expected = normalize(question.expected_answer);
  const actual = normalize(response);
  const result = expected === actual ? "correct" : "incorrect";
  if (!RESULTS.has(result)) throw new TutorTurnError("objective_judgement_failed", 500);
  return Object.freeze({ result, authority: "objective_validator" });
}

function diagnose(question, judgement, attemptIndex, studentResponse) {
  if (judgement.result === "correct") return Object.freeze({ error_code: null, error_codes: [], confidence: 1, evidence_status: "observed" });
  if (question.subject === "english") {
    const result = diagnoseEnglishResponse({
      student_id: "student_scoped",
      stem: question.stem || "",
      student_answer: studentResponse,
      expected_answer: question.expected_answer,
      knowledge_point: question.knowledge_point,
      mode: "written",
    });
    return Object.freeze({
      error_code: result.error_codes[0] || "EN-UNKNOWN",
      error_codes: result.error_codes.length > 0 ? result.error_codes : ["EN-UNKNOWN"],
      confidence: attemptIndex > 1 ? 0.75 : 0.55,
      evidence_status: "inferred",
    });
  }
  const suffix = question.type === "multiple_choice" ? "WRONG-CHOICE" : "WRONG-VALUE";
  return Object.freeze({
    error_code: `${String(question.subject).toUpperCase()}-${suffix}`,
    error_codes: [`${String(question.subject).toUpperCase()}-${suffix}`],
    confidence: attemptIndex > 1 ? 0.75 : 0.55,
    evidence_status: "inferred",
  });
}

function teach(question, judgement, diagnosis, attemptIndex) {
  if (judgement.result === "correct") {
    return Object.freeze({ action: "advance", utterance: "答對了，你抓到這題的重點了。", representation: null });
  }
  if (attemptIndex === 1) {
    return Object.freeze({ action: "retry_same", utterance: "差一點。先找出題目真正要問的量，再試一次。", representation: null });
  }
  return Object.freeze({
    action: "practice_similar",
    utterance: "我們換一種方式看，再做一題相同概念的練習。",
    representation: question.representation_type === "text" ? "visual" : "worked_example",
    diagnosis_code: diagnosis.error_code,
  });
}

function publicResponse({ traceId, judgement, diagnosis, teaching, assessment, memory, director, nextQuestion, loopCompleted }) {
  const recommendedAction = teaching.action === "advance"
    ? "next"
    : teaching.action === "practice_similar" ? "review" : "hint";
  return Object.freeze({
    ok: true,
    contract_version: "phase6.tutor-turn.v1",
    trace_id: traceId,
    loop_completed: loopCompleted,
    verdict: judgement.result,
    summary: teaching.utterance,
    teaching_point: teaching.utterance,
    hint: teaching.action === "retry_same" ? teaching.utterance : null,
    recommended_action: recommendedAction,
    assessment_evidence_id: assessment?.observation_id ?? null,
    learning_memory_receipt_id: memory?.accepted === true ? (memory.event_id ?? traceId) : null,
    next_step_id: nextQuestion?.id ?? null,
    selection_reason: director?.recommendations?.[0]?.reason ?? null,
    judgement,
    diagnosis,
    teaching,
    assessment_evidence: assessment,
    memory_write: memory,
    director_decision: director,
    next_step: nextQuestion ? sanitizeQuestion(nextQuestion) : null,
    idempotent_replay: false,
  });
}

function sanitizeQuestion(question) {
  const safe = {};
  for (const key of [
    "id", "subject", "knowledge_point", "type", "representation_type",
    "stem", "choices", "difficulty", "source", "license",
  ]) {
    if (question[key] !== undefined) safe[key] = question[key];
  }
  return Object.freeze(safe);
}

function normalize(value) {
  return String(value).normalize("NFKC").trim().toLocaleLowerCase("zh-TW").replace(/\s+/g, " ");
}

function safeId(value) { return typeof value === "string" && /^[a-z0-9_.-]{3,100}$/i.test(value); }
function validIso(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function remember(cache, key, value, max) {
  cache.set(key, value);
  while (cache.size > max) cache.delete(cache.keys().next().value);
}
