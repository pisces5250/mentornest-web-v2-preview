const SUBJECTS = Object.freeze({
  math: { schema: "math-specialist-evidence-v1", prefix: "MATH-" },
  english: { schema: "english-specialist-evidence-v1", prefix: "EN-" },
  chinese: { schema: "chinese-specialist-evidence-v1", prefix: "ZH-" },
  science: { schema: "science-specialist-evidence-v1", prefix: "SCI-" },
  social_studies: { schema: "social-studies-specialist-evidence-v1", prefix: "SS-" },
});

/** 五科最小正式 evaluator：只評量經 Question Quality 驗證的單選題。 */
export function evaluateSubjectChoice({ question, response, attemptIndex }) {
  const policy = SUBJECTS[question?.subject];
  if (!policy || question?.type !== "multiple_choice") return unavailable();
  const specialist = question.specialist;
  if (!specialist || specialist.schema_version !== `${question.subject}-choice-specialist-v1`
    || specialist.evidence_schema !== policy.schema || typeof specialist.subskill !== "string") {
    return unavailable();
  }
  const selected = String(response).normalize("NFKC").trim();
  if (!question.choices.map(String).includes(selected)) return unavailable();
  const correct = selected === String(question.expected_answer);
  const diagnostic = correct ? null : specialist.distractors?.[selected];
  if (!correct && !validDiagnostic(diagnostic, policy.prefix)) return unavailable();

  const errorCodes = correct ? [] : diagnostic.error_codes.slice();
  const representation = correct ? null : diagnostic.representation;
  const feedback = correct ? specialist.correct_feedback : diagnostic.feedback;
  const hint = correct ? null : diagnostic.hint;
  const action = correct ? "advance" : attemptIndex > 1 ? "practice_similar" : "retry_same";
  return Object.freeze({
    available: true,
    judgement: {
      result: correct ? "correct" : "incorrect",
      authority: `${question.subject}_specialist_verified_choice_evaluator`,
      evaluator_version: "subject-choice-v1",
    },
    diagnosis: {
      error_code: errorCodes[0] ?? null,
      error_codes: errorCodes,
      subskill: specialist.subskill,
      confidence: correct ? 1 : 0.65,
      evidence_status: correct ? "observed" : "inferred",
      schema_version: `${question.subject}-specialist-diagnosis-v1`,
    },
    teaching: {
      action,
      utterance: feedback,
      hint,
      representation,
    },
    evidence_payload: {
      schema_version: policy.schema,
      subject: question.subject,
      knowledge_point: question.knowledge_point,
      subskill: specialist.subskill,
      result: correct ? "correct" : "incorrect",
      error_codes: errorCodes,
      evaluator_version: "subject-choice-v1",
    },
  });
}

/** Tutor 只呈現目前有正式 deterministic evaluator 的 verified instrument。 */
export function canEvaluateVerifiedQuestion(question) {
  if (!question || question.verification_status !== "verified") return false;
  if (question.subject === "math" && ["fraction_input", "integer_input", "decimal_input"].includes(question.type)) {
    return question.expected_answer !== undefined && typeof question.answer_key_version === "string";
  }
  if (question.subject === "english" && question.type === "voice_response") {
    const specialist = question.specialist;
    return specialist?.schema_version === "english-read-aloud-specialist-v1"
      && specialist?.evidence_schema === SUBJECTS.english.schema
      && specialist?.mode === "read_aloud"
      && specialist?.rubric?.evaluator === "deterministic_transcript_match"
      && specialist?.rubric?.local_stt_only === true
      && specialist?.rubric?.transcript_retention === "none"
      && question.language === "en-US"
      && typeof question.instruction_text === "string"
      && typeof question.display_text === "string"
      && typeof question.spoken_text === "string"
      && question.display_text.normalize("NFKC").trim() === question.spoken_text.normalize("NFKC").trim();
  }
  const policy = SUBJECTS[question.subject];
  if (!policy || question.type !== "multiple_choice") return false;
  const specialist = question.specialist;
  if (specialist?.schema_version !== `${question.subject}-choice-specialist-v1`
    || specialist?.evidence_schema !== policy.schema
    || typeof specialist?.subskill !== "string"
    || typeof specialist?.correct_feedback !== "string"
    || !Array.isArray(question.choices)
    || !question.choices.map(String).includes(String(question.expected_answer))) return false;
  return question.choices.map(String)
    .filter((choice) => choice !== String(question.expected_answer))
    .every((choice) => validDiagnostic(specialist.distractors?.[choice], policy.prefix));
}

function validDiagnostic(value, prefix) {
  return !!value && Array.isArray(value.error_codes) && value.error_codes.length > 0
    && value.error_codes.every((code) => typeof code === "string" && code.startsWith(prefix))
    && typeof value.feedback === "string" && value.feedback.length > 0
    && typeof value.hint === "string" && value.hint.length > 0
    && value.representation && typeof value.representation.kind === "string";
}

function unavailable() {
  return Object.freeze({ available: false, judgement: { result: "unverifiable", authority: "specialist_evaluator_required" } });
}

export const __TEST__ = Object.freeze({ SUBJECTS });
