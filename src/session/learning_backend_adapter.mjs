// src/session/learning_backend_adapter.mjs
//
// ════════════════════════════════════════════════════════════════════════════
// PREVIEW COMPATIBILITY IMPLEMENTATION — Backend Adapter Boundary
// ════════════════════════════════════════════════════════════════════════════
//
// This file defines the LearningBackendAdapter interface and provides a
// fixture-based implementation used by the standalone preview build.
//
// THE INTERFACE IS THE PUBLIC CONTRACT:
//   - LearningBackendAdapter
//       getNextStep({ student_id, subject, knowledge_point?, student_input? })
//         → { action: { kind, knowledge_point?, subject? }, source }
//       getQuestion({ subject, grade, knowledge_point, limit })
//         → Promise<Question[]>          (Question = session step shape)
//       submitLearningEvent({ student_id, event })
//         → Promise<{ accepted: boolean }>
//
// PRODUCTION ADAPTERS (NOT IN THIS FILE):
//   - ProductionMentorNestBackend  (would talk to the real MentorNest
//     gateway / learning director / verified bank / mastery engine)
//   - ReadOnlyAuditAdapter         (for parent summary views)
//
// THIS FILE ONLY:
//   - FixtureBackendAdapter  (returns canned fixture steps for preview)
//
// The preview build wires the FixtureBackendAdapter via VITE_USE_FIXTURES.
// Future production-mode wiring (VITE_USE_FIXTURES=false) must inject a
// real adapter; this file MUST NOT contain a fake production implementation.

import { FIXTURE_G5_FRAC } from "./fixtures.mjs";

/**
 * @typedef {Object} NextStepDecision
 * @property {{ kind: string, knowledge_point?: string, subject?: string }} action
 * @property {string} source
 */

/**
 * @typedef {Object} BackendQuestion
 * @property {string} step_id
 * @property {string} knowledge_point
 * @property {string} subject
 * @property {string} question_type
 * @property {"text"|"fraction_bar"|"number_line"|"area_model"} representation_type
 * @property {string} stem
 * @property {ReadonlyArray<string>} [choices]
 * @property {string|number} expected_answer
 * @property {"easy"|"medium"|"hard"} difficulty
 * @property {"verified"|"generated"} source
 * @property {string} license
 */

/**
 * @typedef {Object} LearningBackendAdapter
 * @property {(input: { student_id: string, subject: string, knowledge_point?: string, student_input?: object }) => NextStepDecision} getNextStep
 * @property {(input: { subject: string, grade: number, knowledge_point: string, limit?: number }) => Promise<BackendQuestion[]>} getQuestion
 * @property {(input: { student_id: string, event: object }) => Promise<{ accepted: boolean }>} submitLearningEvent
 */

function defaultRepresentationType(question_type) {
  switch (question_type) {
    case "fraction_input": return "fraction_bar";
    case "integer_input":
    case "decimal_input":
    case "multiple_choice":
    default:               return "text";
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * FixtureBackendAdapter — preview-only, deterministic, in-memory.
 * ────────────────────────────────────────────────────────────────────────── */

export class FixtureBackendAdapter {
  constructor({ steps = FIXTURE_G5_FRAC } = {}) {
    this._steps = steps.slice();
    this._submitted = [];
    this._cursor = 0;
  }

  /**
   * Cycle through fixture KPs for the next learning action. Pure JS,
   * no async, no LLM, no real mastery.
   */
  getNextStep({ student_id, subject, knowledge_point = "", student_input: _student_input = {} } = {}) {
    if (!student_id) {
      throw new Error("FixtureBackendAdapter.getNextStep: student_id required");
    }
    const kp =
      knowledge_point ||
      this._steps[this._cursor % this._steps.length]?.knowledge_point ||
      `${subject ?? "math"}.placeholder`;
    this._cursor += 1;
    return {
      action: { kind: "drill", knowledge_point: kp, subject: subject ?? "math" },
      knowledge_point: kp,
      source: "fixture",
    };
  }

  /**
   * Return matching fixture questions. If `knowledge_point` matches a
   * fixture step, return that; otherwise cycle.
   */
  async getQuestion({ subject, grade: _grade, knowledge_point, limit = 4 } = {}) {
    let pool = this._steps.filter((s) => s.subject === (subject ?? s.subject));
    if (pool.length === 0) pool = this._steps.slice();

    let picked;
    if (knowledge_point) {
      picked = pool.filter((s) => s.knowledge_point === knowledge_point);
      if (picked.length === 0) picked = pool.slice();
    } else {
      picked = pool.slice();
    }

    const out = picked.slice(0, Math.max(1, limit)).map((s, i) => ({
      ...s,
      representation_type: s.representation_type ?? defaultRepresentationType(s.question_type),
      step_id: s.step_id ?? `fixture_${i + 1}`,
      license: s.license ?? "preview-fixture",
    }));

    return out;
  }

  /**
   * Preview-only: record events in memory. NO disk writes, NO production
   * learning records, NO mastery updates.
   */
  async submitLearningEvent({ student_id, event }) {
    if (!student_id) {
      return { accepted: false, reason: "missing-student_id" };
    }
    this._submitted.push({ student_id, event, at: new Date().toISOString() });
    return { accepted: true, recorded_in: "fixture-in-memory" };
  }

  /** Test/diagnostic helper. */
  getSubmittedEvents() {
    return this._submitted.slice();
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Adapter selection.
 *
 * This repository IS the standalone preview build (mentornest-web-v2-preview
 * → Zeabur). It only ships the FixtureBackendAdapter. There is no production
 * adapter in this repo; production wiring lives in mentornest-web (out of scope
 * here).
 *
 * Default: FixtureBackendAdapter (so the standalone preview always renders
 *         something instead of throwing a confusing adapter error).
 * Opt-out: explicit `opts.useFixtures === false` for test-only paths that want
 *         to exercise the throw branch.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Construct the appropriate backend adapter for the current build.
 *
 * @param {{ useFixtures?: boolean }} [opts]
 * @returns {LearningBackendAdapter}
 */
export function createBackendAdapter(opts = {}) {
  // Default behavior for this preview repo: fixtures. Test paths that want to
  // assert the production-mode throw can pass { useFixtures: false }.
  const useFixtures = opts.useFixtures !== false;

  if (useFixtures) {
    // Allow callers (App / ChildHome) to widen the fixture pool beyond the
    // math-only default.  Without this, the subject switcher in Phase 6B
    // would still pull math questions for every subject.
    const steps = Array.isArray(opts.steps) && opts.steps.length > 0
      ? opts.steps
      : FIXTURE_G5_FRAC;
    return new FixtureBackendAdapter({ steps });
  }

  // Production adapter is intentionally NOT implemented in this preview.
  // Surfacing the missing wiring clearly is safer than silently fabricating
  // fake production behavior.
  throw new Error(
    "createBackendAdapter: production backend adapter is not wired in the standalone " +
    "preview build. Set VITE_USE_FIXTURES=true to use the fixture adapter, or wire " +
    "a production adapter (which lives outside this repository)."
  );
}

export const __TEST__ = { FixtureBackendAdapter, createBackendAdapter, defaultRepresentationType };
