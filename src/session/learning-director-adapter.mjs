// src/session/learning-director-adapter.mjs
//
// Phase 5C-1 — Adapter between Web v2 session UI and the LearningBackendAdapter.
//
// This adapter:
//   1. Asks the backend (fixture or production) for the next learning action.
//   2. Pulls matching verified questions from the same backend.
//   3. Shapes each question into the canonical `step` shape that
//      session-state.mjs expects.
//
// PREVIEW COMPATIBILITY — backend selection:
//   - Set VITE_USE_FIXTURES=true to use FixtureBackendAdapter (in-memory).
//   - For production, wire a real backend adapter outside this repo.
//
// IMPORTANT:
//   - Tests must use student IDs prefixed with `student_t_phase5c_`.  The
//     adapter refuses to load production student IDs (`student_001`,
//     `student_002`) so accidental data writes are impossible at the adapter
//     boundary.
//   - When using FixtureBackendAdapter, NO production student JSONL files
//     are touched. Submit-learning-event is recorded in-memory only.

import { createBackendAdapter } from "./learning_backend_adapter.mjs";
import { sessionInitial } from "./session-state.mjs";

const PRODUCTION_STUDENT_IDS = new Set([
  "student_001",
  "student_002",
]);

function assertSafeStudentId(student_id) {
  if (!student_id || typeof student_id !== "string") {
    throw new Error("learning_director_adapter: student_id required");
  }
  if (PRODUCTION_STUDENT_IDS.has(student_id)) {
    throw new Error(
      `learning_director_adapter: REFUSING to use production student_id "${student_id}". ` +
      `Tests must use student_t_phase5c_* IDs to keep production data untouched.`
    );
  }
  if (!/^student_[A-Za-z0-9_-]+$/.test(student_id)) {
    throw new Error(`learning_director_adapter: invalid student_id format "${student_id}"`);
  }
}

/**
 * Shape a backend question into a session step.
 *
 * Accepts both `q.type` (production verified-bank shape) and
 * `q.question_type` (session-step internal shape) for the question type
 * field — they are the same value.
 */
export function toStep(q, index) {
  if (!q || typeof q !== "object") throw new Error("toStep: question required");
  const step = {
    step_id: q.step_id ?? q.id ?? `step_${index + 1}`,
    knowledge_point: q.knowledge_point ?? "unknown",
    subject: q.subject ?? "math",
    question_type: q.question_type ?? q.type ?? "short_answer",
    representation_type: q.representation_type ?? "text",
    stem: q.stem ?? "",
    choices: q.choices ?? undefined,
    difficulty: q.difficulty ?? "medium",
    source: q.source ?? "verified",
    license: q.license ?? "preview-fixture",
  };
  // Phase 6B: conversation fixture passes extra metadata through to
  // ConversationTutor (greeting, suggested topics, target turn count).
  // We deliberately do NOT touch conversation when the question type
  // is anything other than english_conversation — keep shape stable.
  if (q.question_type === "english_conversation" && q.conversation) {
    step.conversation = q.conversation;
  }
  return step;
}

/**
 * Map a presentation age band to a numeric grade.
 *   G1-G2  -> 2
 *   G3-G4  -> 4
 *   G5-G6  -> 6
 *   G7+    -> 8 (treated as junior-high approximation for question lookup)
 */
export function ageBandToGrade(age_band) {
  switch (age_band) {
    case "G1-G2": return 2;
    case "G3-G4": return 4;
    case "G5-G6": return 6;
    case "G7+":   return 8;
    default:      return undefined;
  }
}

/**
 * Build a session by asking the LearningBackendAdapter what to study next,
 * then pulling matching verified questions.
 *
 * @param {object} input
 * @param {string} input.student_id           — MUST be a fake/automation ID
 * @param {string} input.age_band             — e.g. "G5-G6"
 * @param {string} input.subject              — starting subject
 * @param {string} [input.knowledge_point]    — KP to start from
 * @param {number} [input.target_steps=4]     — how many steps in this session
 * @param {LearningBackendAdapter} [input.backend] — override backend (testing)
 * @returns {Promise<{ session, dispatch_decision, looked_up: object[] }>}
 */
export async function buildSessionFromLearningDirector({
  student_id,
  age_band,
  subject,
  knowledge_point = "",
  target_steps = 4,
  backend = undefined,
  fixtureSteps = undefined,
} = {}) {
  assertSafeStudentId(student_id);
  if (!subject) throw new Error("buildSessionFromLearningDirector: subject required");

  // Resolve backend last so callers can pass either an explicit backend
  // OR a fixtureSteps array (App / ChildHome wires the merged preview
  // pool here so subject switcher reaches the correct question type).
  if (!backend) {
    backend = createBackendAdapter(
      Array.isArray(fixtureSteps) && fixtureSteps.length > 0
        ? { steps: fixtureSteps }
        : {},
    );
  }

  // 1. Ask the backend what the next learning action should be.
  const dispatch = backend.getNextStep({
    student_id,
    current_subject: subject,
    knowledge_point,
    student_input: {},
  });

  const action_kp =
    dispatch?.action?.knowledge_point ??
    knowledge_point ??
    dispatch?.knowledge_point ??
    `${subject}.G${age_band?.startsWith("G") ? age_band.slice(1, 3) : "5"}.placeholder`;

  // 2. Pull matching questions from the backend.
  const looked_up = await backend.getQuestion({
    subject,
    grade: ageBandToGrade(age_band),
    knowledge_point: action_kp,
    limit: target_steps,
  });

  // 3. Shape into steps.
  let steps;
  if (Array.isArray(looked_up) && looked_up.length > 0) {
    steps = looked_up.map((q, i) => toStep(q, i));
  } else {
    // No matches — diagnostic placeholder so absence is visible, not hidden.
    steps = [
      {
        step_id: "diag_1",
        knowledge_point: action_kp,
        subject,
        question_type: "short_answer",
        representation_type: "text",
        stem: "(尚無對應題目，請等候練習題準備。)",
        difficulty: "easy",
        source: "generated",
        license: "diagnostic_placeholder",
      },
    ];
  }

  // 4. Defer session construction to the pure state machine (testable).
  const session = sessionInitial({ student_id, age_band, steps });

  return {
    session,
    dispatch_decision: dispatch,
    looked_up,
  };
}

/**
 * Forward a learning event to the backend. Preview-only when using the
 * fixture adapter (in-memory); production adapters (not in this repo)
 * would persist to the real learning record store.
 */
export async function submitLearningEvent(backend, { student_id, event }) {
  assertSafeStudentId(student_id);
  if (!backend || typeof backend.submitLearningEvent !== "function") {
    throw new Error("submitLearningEvent: backend adapter required");
  }
  return backend.submitLearningEvent({ student_id, event });
}

export const __TEST__ = Object.freeze({
  toStep,
  ageBandToGrade,
  assertSafeStudentId,
  PRODUCTION_STUDENT_IDS,
});
