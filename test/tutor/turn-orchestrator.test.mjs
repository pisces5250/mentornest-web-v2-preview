import test from "node:test";
import assert from "node:assert/strict";
import { createTutorTurnOrchestrator, TutorTurnError } from "../../server/tutor/turn-orchestrator.mjs";

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
          ? { accepted: true, authority: "learning_memory_writer", event_id: "evt_1" }
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
  assert.equal(result.memory_write.accepted, true);
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
