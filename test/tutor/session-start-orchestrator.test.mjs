import test from "node:test";
import assert from "node:assert/strict";
import { createTutorSessionStartOrchestrator, TutorSessionStartError } from "../../server/tutor/session-start-orchestrator.mjs";

function gateway() {
  const calls = [];
  return {
    calls,
    async invoke(capability, request) {
      calls.push({ capability, request });
      if (capability === "learning_director.recommend") return {
        recommendations: [{ subject: "science", knowledge_point: "science.G5.EXPERIMENT.variables", reason: "session_request_no_mastery" }],
        evidence_basis: "no_mastery_session_request", authority: "learning_director_read_only",
      };
      return { questions: [{
        id: "q.synthetic.science.001", subject: "science", grade: 5,
        knowledge_point: "science.G5.EXPERIMENT.variables", type: "multiple_choice",
        representation_type: "experiment_setup", stem: "題目", choices: ["A", "B"], difficulty: "easy",
        expected_answer: "A", answer_key_version: "private-v1", rubric: { private: true },
        specialist: { private: true }, verification_status: "verified", student_id: "forbidden",
      }] };
    },
  };
}

test("session start 只用 server identity 呼叫 Director 與 Verified Bank，回 public question allowlist", async () => {
  const backend = gateway();
  const result = await createTutorSessionStartOrchestrator({ gateway: backend }).start({
    subject: "science", grade: 5,
  }, { subjectRef: "student_test_phase62" });
  assert.equal(result.ok, true);
  assert.equal(result.director_decision.authority, "learning_director_read_only");
  assert.equal(result.questions[0].id, "q.synthetic.science.001");
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /expected_answer|answer_key|rubric|specialist|student_id/);
  assert.deepEqual(backend.calls.map((call) => call.capability), ["learning_director.recommend", "verified_bank.read"]);
  assert.deepEqual(backend.calls[0].request.input.confirmed_mastery, []);
});

test("session start 拒絕無效 subject 與 grade", async () => {
  const orchestrator = createTutorSessionStartOrchestrator({ gateway: gateway() });
  await assert.rejects(
    orchestrator.start({ subject: "unknown", grade: 5 }, { subjectRef: "student_test_phase62" }),
    (error) => error instanceof TutorSessionStartError && error.code === "invalid_session_request",
  );
});

test("session start 接受 age_band，Director指定KP無題時只降級到同科同年級 verified 題", async () => {
  const calls = [];
  const backend = {
    calls,
    async invoke(capability, request) {
      calls.push({ capability, request });
      if (capability === "learning_director.recommend") return {
        recommendations: [{ subject: "chinese", knowledge_point: "chinese.G5.legacy", reason: "session_request_no_mastery" }],
        evidence_basis: "no_mastery_session_request", authority: "learning_director_read_only",
      };
      if (request.input.knowledge_point) return { questions: [] };
      return { questions: [{ id: "q.synthetic.chinese.001", subject: "chinese", grade: 5, knowledge_point: "chinese.G5.READING.main-idea", type: "multiple_choice", stem: "題目", choices: ["甲", "乙"] }] };
    },
  };
  const result = await createTutorSessionStartOrchestrator({ gateway: backend }).start({
    subject: "chinese", age_band: "G5-G6", knowledge_point: "chinese.G5.legacy", target_steps: 4,
  }, { subjectRef: "student_test_phase62" });
  assert.equal(result.selection_basis, "director_subject_verified_fallback");
  assert.equal(result.questions[0].subject, "chinese");
  assert.equal(calls[2].request.input.grade, 5);
  assert.equal("knowledge_point" in calls[2].request.input, false);
});
