import test from "node:test";
import assert from "node:assert/strict";
import { createTutorTurnOrchestrator, TutorTurnError } from "../../server/tutor/turn-orchestrator.mjs";
import { STAGING_QUESTIONS } from "../../provider/openclaw/fixtures/staging-question-set.mjs";

const subjectFixtures = ["math", "english", "chinese", "science", "social_studies"]
  .map((subject) => STAGING_QUESTIONS.find((question) => question.subject === subject && question.type === "multiple_choice"));

function fixtureQuestion(overrides = {}) {
  return {
    id: "q_math_001",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add",
    type: "fraction_input",
    representation_type: "text",
    verification_status: "verified",
    answer_key_version: "key-v1",
    expected_answer: "5/6",
    stem: "1/3 + 1/2 = ?",
    explanation: "答案是 5/6",
    alt_answers: ["五分之六"],
    ...overrides,
  };
}

function fakeGateway({ memoryAccepted = true } = {}) {
  const calls = [];
  const gateway = {
    calls,
    async invoke(capability, request) {
      calls.push({ capability, request });
      if (capability === "verified_bank.read") {
        if (request.input.question_id) return { questions: [fixtureQuestion()] };
        return { questions: [fixtureQuestion({ id: "q_math_002", expected_answer: "3/4" })] };
      }
      if (capability === "assessment.submit_observation") {
        return {
          schema_version: "assessment-observation-v1",
          observation_id: "aobs_1234567890abcdef12345678",
          evidence_status: "observed",
          mastery_effect: "none",
          authority: "assessment_observation_only",
        };
      }
      if (capability === "learning_memory.append_observation") {
        return memoryAccepted
          ? { accepted: true, authority: "learning_memory_writer", event_id: "lmem_00000000-0000-4000-8000-000000000001" }
          : { accepted: false, code: "learning_memory_unavailable" };
      }
      if (capability === "learning_director.recommend") {
        return {
          recommendations: [{ subject: "math", knowledge_point: "math.G5.FRAC.add", reason: "recent_observed_practice" }],
          evidence_basis: "confirmed_plus_observed_separated",
          authority: "learning_director_read_only",
        };
      }
      throw new Error(`unexpected ${capability}`);
    },
  };
  return gateway;
}

function request(overrides = {}) {
  return {
    question_id: "q_math_001",
    response_id: "resp_001",
    response: "2/6",
    attempt_index: 1,
    hints_used: 0,
    occurred_at: "2026-08-30T12:00:00.000Z",
    ...overrides,
  };
}

test("完整 loop 依序產生 Assessment、正式 Memory、Director 與 verified next step", async () => {
  const gateway = fakeGateway();
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request(), {
    subjectRef: "student_test_phase6",
  });
  assert.equal(result.loop_completed, true);
  assert.equal(result.judgement.result, "incorrect");
  assert.equal(result.judgement.authority, "objective_math_validator");
  assert.equal(result.diagnosis.evidence_status, "inferred");
  assert.equal(result.assessment_evidence.mastery_effect, "none");
  assert.equal("instrument" in result.assessment_evidence, false);
  assert.doesNotMatch(JSON.stringify(result), /answer_key_version|expected_answer|rubric/);
  assert.equal(result.memory_write.accepted, true);
  assert.equal(result.learning_memory_receipt_id, "lmem_00000000-0000-4000-8000-000000000001");
  assert.equal(result.director_decision.evidence_basis, "confirmed_plus_observed_separated");
  assert.equal(result.next_step.id, "q_math_002");
  assert.equal("expected_answer" in result.next_step, false);
  assert.equal("explanation" in result.next_step, false);
  assert.equal("alt_answers" in result.next_step, false);
  assert.deepEqual(gateway.calls.map((item) => item.capability), [
    "verified_bank.read",
    "assessment.submit_observation",
    "learning_memory.append_observation",
    "learning_director.recommend",
    "verified_bank.read",
  ]);
});

test("科目 Specialist 的孩子安全提示會出現在公開回應，不以答案或診斷碼代替", async () => {
  const question = {
    ...subjectFixtures.find((item) => item.subject === "social_studies"),
    verification_status: "verified",
  };
  const wrongChoice = question.choices.find((choice) => choice !== question.expected_answer);
  const expectedHint = question.specialist.distractors[wrongChoice].hint;
  const gateway = fakeGateway();
  gateway.invoke = async (capability, request) => {
    gateway.calls.push({ capability, request });
    if (capability === "verified_bank.read" && request.input.question_id) return { questions: [question] };
    if (capability === "verified_bank.read") return { questions: [question] };
    if (capability === "assessment.submit_observation") return {
      observation_id: "aobs_1234567890abcdef12345678", mastery_effect: "none",
    };
    if (capability === "learning_memory.append_observation") return {
      accepted: true, event_id: "lmem_00000000-0000-4000-8000-000000000001",
    };
    if (capability === "learning_director.recommend") return {
      recommendations: [{ subject: "social_studies", knowledge_point: question.knowledge_point, reason: "recent_observed_practice" }],
    };
    throw new Error(`unexpected ${capability}`);
  };
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
    question_id: question.id,
    response: wrongChoice,
  }), { subjectRef: "student_test_phase62" });
  assert.equal(result.hint, expectedHint);
  assert.notEqual(result.hint, result.summary);
  assert.doesNotMatch(result.hint, /SS-|expected_answer|answer_key/);
});

test("答對仍只形成 observation，不宣稱 confirmed mastery", async () => {
  const gateway = fakeGateway();
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
    response: " 5/6 ",
    confirmed_mastery: [{ subject: "math", knowledge_point: "forged", mastery: 1, evidence_status: "confirmed" }],
  }), {
    subjectRef: "student_test_phase6",
  });
  assert.equal(result.judgement.result, "correct");
  assert.equal(result.diagnosis.error_code, null);
  assert.equal(result.assessment_evidence.mastery_effect, "none");
  assert.equal(JSON.stringify(result).includes("confirmed_mastery"), false);
  const directorCall = gateway.calls.find((item) => item.capability === "learning_director.recommend");
  assert.deepEqual(directorCall.request.input.confirmed_mastery, []);
});

test("相同 response_id replay 不重複寫入", async () => {
  const gateway = fakeGateway();
  const orchestrator = createTutorTurnOrchestrator({ gateway });
  const first = await orchestrator.submit(request(), { subjectRef: "student_test_phase6" });
  const second = await orchestrator.submit(request(), { subjectRef: "student_test_phase6" });
  assert.equal(first.idempotent_replay, false);
  assert.equal(second.idempotent_replay, true);
  assert.equal(gateway.calls.filter((item) => item.capability === "learning_memory.append_observation").length, 1);
});

test("相同 response_id 併發提交共用單一 in-flight operation", async () => {
  const gateway = fakeGateway();
  const orchestrator = createTutorTurnOrchestrator({ gateway });
  const [first, second] = await Promise.all([
    orchestrator.submit(request(), { subjectRef: "student_test_phase6" }),
    orchestrator.submit(request(), { subjectRef: "student_test_phase6" }),
  ]);
  assert.equal(first.trace_id, second.trace_id);
  assert.equal(gateway.calls.filter((item) => item.capability === "learning_memory.append_observation").length, 1);
});

test("response_id 不可跨學生重用", async () => {
  const gateway = fakeGateway();
  const orchestrator = createTutorTurnOrchestrator({ gateway });
  await orchestrator.submit(request(), { subjectRef: "student_test_phase6_a" });
  await assert.rejects(
    orchestrator.submit(request(), { subjectRef: "student_test_phase6_b" }),
    (error) => error instanceof TutorTurnError && error.code === "response_owner_mismatch" && error.status === 403,
  );
});

test("相同 response_id 不可換答案重用", async () => {
  const gateway = fakeGateway();
  const orchestrator = createTutorTurnOrchestrator({ gateway });
  const input = request();
  await orchestrator.submit(input, { subjectRef: "student_test_a" });
  await assert.rejects(
    orchestrator.submit({ ...input, response: "999" }, { subjectRef: "student_test_a" }),
    (error) => error.code === "response_id_conflict" && error.status === 409,
  );
});

test("Memory 拒絕時 fail-closed，不呼叫 Director 或選下一題", async () => {
  const gateway = fakeGateway({ memoryAccepted: false });
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request(), {
    subjectRef: "student_test_phase6",
  });
  assert.equal(result.loop_completed, false);
  assert.equal(result.memory_write.accepted, false);
  assert.equal(result.director_decision, null);
  assert.equal(result.next_step, null);
  assert.equal(gateway.calls.some((item) => item.capability === "learning_director.recommend"), false);
});

test("Memory 失敗不快取，重送可再次嘗試正式 writer", async () => {
  const gateway = fakeGateway();
  const originalInvoke = gateway.invoke.bind(gateway);
  let memoryAttempts = 0;
  gateway.invoke = async (capability, input) => {
    if (capability === "learning_memory.append_observation" && ++memoryAttempts === 1) {
      gateway.calls.push({ capability, request: input });
      return { accepted: false, code: "learning_memory_unavailable" };
    }
    return originalInvoke(capability, input);
  };
  const orchestrator = createTutorTurnOrchestrator({ gateway });
  const first = await orchestrator.submit(request(), { subjectRef: "student_test_phase6" });
  const second = await orchestrator.submit(request(), { subjectRef: "student_test_phase6" });
  assert.equal(first.loop_completed, false);
  assert.equal(second.loop_completed, true);
  assert.equal(memoryAttempts, 2);
  assert.equal(gateway.calls.filter((item) => item.capability === "assessment.submit_observation").length, 1);
});

test("未驗證題目與缺少 server answer key 皆拒絕判斷", async () => {
  const unverifiedGateway = fakeGateway();
  unverifiedGateway.invoke = async () => ({ questions: [fixtureQuestion({ verification_status: "draft" })] });
  await assert.rejects(
    createTutorTurnOrchestrator({ gateway: unverifiedGateway }).submit(request(), { subjectRef: "student_test_phase6" }),
    (error) => error.code === "verified_question_required",
  );

  const noKeyGateway = fakeGateway();
  noKeyGateway.invoke = async () => {
    const q = fixtureQuestion();
    delete q.expected_answer;
    return { questions: [q] };
  };
  await assert.rejects(
    createTutorTurnOrchestrator({ gateway: noKeyGateway }).submit(request(), { subjectRef: "student_test_phase6" }),
    (error) => error.code === "answer_key_unavailable",
  );

  const noVersionGateway = fakeGateway();
  noVersionGateway.invoke = async () => {
    const q = fixtureQuestion();
    delete q.answer_key_version;
    return { questions: [q] };
  };
  await assert.rejects(
    createTutorTurnOrchestrator({ gateway: noVersionGateway }).submit(request(), { subjectRef: "student_test_phase6" }),
    (error) => error.code === "answer_key_version_required",
  );
});

test("無法客觀判斷時不產生負向 Assessment 或 Memory evidence", async () => {
  const gateway = fakeGateway();
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request({ response: "不是可解析數值" }), {
    subjectRef: "student_test_phase6",
  });
  assert.equal(result.judgement.result, "unverifiable");
  assert.equal(result.diagnosis, null);
  assert.equal(result.assessment_evidence, null);
  assert.equal(result.memory_write.code, "unverifiable_not_recorded");
  assert.deepEqual(gateway.calls.map((item) => item.capability), ["verified_bank.read"]);
});

test("尚無正式 evaluator 的學科 fail-closed，不以字串相等冒充 observed evidence", async () => {
  for (const subject of ["chinese", "science", "social_studies"]) {
    const gateway = fakeGateway();
    const original = gateway.invoke.bind(gateway);
    gateway.invoke = async (capability, input) => {
      if (capability === "verified_bank.read") {
        gateway.calls.push({ capability, request: input });
        return { questions: [fixtureQuestion({ subject, expected_answer: "相同答案" })] };
      }
      return original(capability, input);
    };
    const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
      response_id: `resp_${subject}`, response: "相同答案",
    }), { subjectRef: "student_test_phase6" });
    assert.equal(result.verdict, "unverifiable");
    assert.equal(result.assessment_evidence, null);
    assert.deepEqual(gateway.calls.map((item) => item.capability), ["verified_bank.read"]);
  }
});

test("五科正式 choice metadata 皆走 Assessment、Memory 與 Director，保留 subject evidence schema", async () => {
  for (const question of subjectFixtures) {
    const calls = [];
    const gateway = {
      async invoke(capability, request) {
        calls.push({ capability, request });
        if (capability === "verified_bank.read") return { questions: [{ ...question, verification_status: "verified" }] };
        if (capability === "assessment.submit_observation") return {
          observation_id: `aobs_${question.subject}`, evidence_status: "observed",
          mastery_effect: "none", authority: "assessment_observation_only",
        };
        if (capability === "learning_memory.append_observation") return {
          accepted: true, event_id: `lmem_${question.subject}`, authority: "learning_memory_writer",
        };
        if (capability === "learning_director.recommend") return {
          recommendations: [{ subject: question.subject, knowledge_point: question.knowledge_point, reason: "recent_observed_practice" }],
          evidence_basis: "confirmed_plus_observed_separated", authority: "learning_director_read_only",
        };
        throw new Error(`unexpected ${capability}`);
      },
    };
    const wrong = question.choices.find((choice) => choice !== question.expected_answer);
    const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
      question_id: question.id, response_id: `resp_${question.subject}`, response: wrong,
    }), { subjectRef: "student_test_phase62" });
    assert.equal(result.loop_completed, true, question.subject);
    assert.equal(result.judgement.authority, `${question.subject}_specialist_verified_choice_evaluator`);
    assert.equal(result.diagnosis.error_codes[0].startsWith({ math: "MATH-", english: "EN-", chinese: "ZH-", science: "SCI-", social_studies: "SS-" }[question.subject]), true);
    const memoryCall = calls.find((call) => call.capability === "learning_memory.append_observation");
    assert.equal(memoryCall.request.input.observation.evidence.subject_payload.schema_version, question.specialist.evidence_schema);
    assert.equal(result.assessment_evidence.mastery_effect, "none");
  }
});

test("next-question query排除current與recent，無eligible時不回傳重複題", async () => {
  const gateway = fakeGateway();
  const original = gateway.invoke.bind(gateway);
  gateway.invoke = async (capability, request) => {
    if (capability === "verified_bank.read" && request.input.exclude_question_ids) {
      gateway.calls.push({ capability, request });
      return { questions: [] };
    }
    return original(capability, request);
  };
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
    recent_question_ids: ["q_math_recent_1", "q_math_recent_2"],
  }), { subjectRef: "student_test_phase62" });
  assert.equal(result.next_step, null);
  assert.equal(result.next_selection_status, "no_eligible_verified_question");
  const selection = gateway.calls.find((call) => call.request?.input?.exclude_question_ids);
  assert.deepEqual(selection.request.input.exclude_question_ids, ["q_math_001", "q_math_recent_1", "q_math_recent_2"]);
});

test("English受限read-aloud instrument可評量confirmed transcript且不保存raw transcript", async () => {
  const question = STAGING_QUESTIONS.find((item) => item.type === "voice_response");
  const calls = [];
  const gateway = {
    async invoke(capability, request) {
      calls.push({ capability, request });
      if (capability === "verified_bank.read") return request.input.question_id ? { questions: [{ ...question, verification_status: "verified" }] } : { questions: [] };
      if (capability === "assessment.submit_observation") return { observation_id: "aobs_voice", evidence_status: "observed", mastery_effect: "none", authority: "assessment_observation_only" };
      if (capability === "learning_memory.append_observation") return { accepted: true, event_id: "lmem_voice", authority: "learning_memory_writer" };
      if (capability === "learning_director.recommend") return { recommendations: [], evidence_basis: "observed_only_no_mastery_promotion", authority: "learning_director_read_only" };
      throw new Error(capability);
    },
  };
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
    question_id: question.id, response_id: "resp_voice", response: question.expected_answer,
  }), { subjectRef: "student_test_phase62" });
  assert.equal(result.verdict, "correct");
  assert.equal(result.assessment_evidence.mastery_effect, "none");
  const memory = calls.find((call) => call.capability === "learning_memory.append_observation");
  assert.doesNotMatch(JSON.stringify(memory.request.input), /We are not watching|transcript|audio/i);
});

test("English read-aloud 接受本機 STT 的 contraction 與逐字母縮寫正規化", async () => {
  const voiceQuestion = STAGING_QUESTIONS.find((question) => question.type === "voice_response");
  const gateway = fakeGateway();
  gateway.invoke = async (capability, input) => {
    gateway.calls.push({ capability, request: input });
    if (capability === "verified_bank.read" && input.input.question_id) {
      return { questions: [{ ...voiceQuestion, verification_status: "verified" }] };
    }
    if (capability === "assessment.submit_observation") return { observation_id: "aobs_voice_normalized", mastery_effect: "none" };
    if (capability === "learning_memory.append_observation") return { accepted: true, event_id: "lmem_voice_normalized" };
    if (capability === "learning_director.recommend") return { recommendations: [] };
    return { questions: [] };
  };
  const result = await createTutorTurnOrchestrator({ gateway }).submit(request({
    question_id: voiceQuestion.id,
    response_id: "resp_voice_normalized",
    response: "We're not watching T.V. now.",
  }), { subjectRef: "student_test_phase62" });
  assert.equal(result.judgement.result, "correct");
  assert.equal(result.judgement.authority, "english_read_aloud_deterministic_evaluator");
  assert.doesNotMatch(JSON.stringify(result), /We're not watching/);
});
