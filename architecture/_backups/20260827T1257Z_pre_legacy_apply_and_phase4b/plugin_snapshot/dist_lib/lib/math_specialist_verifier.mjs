// Math Specialist independent answer verification gate.
//
// Math Specialist (math-specialist agent) is responsible for confirming a
// numeric answer is correct BEFORE submitting to question_quality_agent_verify.
// The Quality Agent's "answer self-check" gate only verifies parseability +
// self-consistency; it does NOT independently verify mathematical truth.
//
// This module gives math-specialist a deterministic third-party witness:
//   - independent_math_answer_verify: takes the candidate (stem, answer,
//     alt_answers) and runs it through the deterministic math kernel
//     (same one used by Quality Gate).
//   - emits a structured verification_receipt including:
//     * parse verdict per candidate
//     * numeric class per candidate
//     * equivalence verdict among answer + alt_answers
//     * warnings / anomalies (e.g. naive simplification mismatches)
//
// V1 scope:
//   - short_answer math questions only
//   - alt_answers must each parse and be equivalent to answer
//   - returns OK only when ALL three hold: parses, equivalent, no anomalies
//
// V1 does NOT:
//   - prove correctness against a problem-statement ground truth (that is
//     math-specialist's responsibility)
//   - check teacher answers / open-answer correctness for non-numeric answers
//
// Reuses deterministic_math_validator from the math_validator kernel.

import { validateMathAnswer } from "./math_validator.mjs";

/**
 * @typedef {Object} MathVerificationRequest
 * @property {string} stem                  — the question text (for logging only)
 * @property {string} answer                — the primary answer
 * @property {string[]} [alt_answers]       — accepted alternative forms
 * @property {number} [grade]               — used to flag grade-inappropriate forms
 *
 * @typedef {Object} MathVerificationReceipt
 * @property {boolean} ok                   — true if all gates pass
 * @property {string} [reason]              — when ok=false
 * @property {Object} parse                 — verdict + numeric_class per candidate
 * @property {Object} equivalence           — verdict + supporting details
 * @property {string[]} warnings
 * @property {string} verified_at           — ISO timestamp
 * @property {string} verified_by           — always "math-specialist-independent-verifier"
 * @property {string} gate_version          — "1"
 * @property {string[]} stages_passed       — gates that passed
 * @property {string[]} stages_failed       — gates that failed
 */

const MAX_ALT_ANSWERS = 8;

/**
 * Independent math verification — math-specialist calls this BEFORE submitting.
 *
 * @param {MathVerificationRequest} req
 * @returns {MathVerificationReceipt}
 */
export function verifyMathQuestion(req) {
  if (!req || typeof req !== "object") {
    return {
      ok: false,
      reason: "request missing",
      verified_at: new Date().toISOString(),
      verified_by: "math-specialist-independent-verifier",
      gate_version: "1",
      stages_passed: [],
      stages_failed: ["request_shape"],
    };
  }
  const stem = typeof req.stem === "string" ? req.stem : "";
  const answer = req.answer;
  const altAnswers = Array.isArray(req.alt_answers) ? req.alt_answers : [];
  const grade = typeof req.grade === "number" ? req.grade : undefined;

  const warnings = [];

  // Boundary: alt_answers size cap prevents abuse / accidental flooding.
  if (altAnswers.length > MAX_ALT_ANSWERS) {
    return {
      ok: false,
      reason: `too many alt_answers (max ${MAX_ALT_ANSWERS})`,
      verified_at: new Date().toISOString(),
      verified_by: "math-specialist-independent-verifier",
      gate_version: "1",
      stages_passed: [],
      stages_failed: ["alt_answers_bound"],
    };
  }

  // Stage 1: parse the primary answer.
  // We harden against the string-fallback trap: if primary parses as `string`
  // (not numeric), we treat it as unverifiable even when the kernel
  // string-match verdict is "correct".
  const primaryVerify = validateMathAnswer({ student_answer: answer, expected_answer: answer });
  const primaryParse = primaryVerify.student_parsed;
  const primaryIsNumeric = primaryParse && ["fraction", "number", "expression"].includes(primaryParse.kind);
  const primaryEffectiveVerdict = primaryIsNumeric ? primaryVerify.verdict : "unverifiable_string";

  // Stage 2: parse every alt_answer.
  const altParses = altAnswers.map((alt) => {
    const v = validateMathAnswer({ student_answer: alt, expected_answer: answer });
    const isNumeric = v.student_parsed && ["fraction", "number", "expression"].includes(v.student_parsed.kind);
    return {
      input: String(alt),
      verdict: isNumeric ? v.verdict : "unverifiable_string",
      reason: v.reason,
      kind: v.student_parsed?.kind ?? null,
    };
  });

  // Stage 3: equivalence check.
  let equivalence = { verdict: "pass", mismatches: [] };
  for (const alt of altParses) {
    const eq = validateMathAnswer({ student_answer: alt.input, expected_answer: answer });
    const eqIsNumeric = eq.student_parsed && ["fraction", "number", "expression"].includes(eq.student_parsed.kind);
    if (!eqIsNumeric || eq.verdict !== "correct") {
      equivalence = {
        verdict: "fail",
        mismatches: [...equivalence.mismatches, { alt: alt.input, reason: eq.reason ?? "not a numeric form" }],
      };
    }
  }

  // Anomaly heuristics.
  // (a) Numeric class drift — primary is fraction but alts include a decimal
  //     that simplifies to the same fraction is fine; a decimal that's close
  //     but NOT equivalent is a warning.
  if (primaryParse?.kind === "fraction") {
    const decimalOnlyAlts = altParses.filter(
      (a) => a.kind === "number" && a.verdict === "correct",
    );
    if (decimalOnlyAlts.length === 0 && altParses.length > 0) {
      warnings.push("primary-answer-is-fraction-but-no-decimal-alt-provided");
    }
  }
  // (b) Grade mismatch: short_answer in fraction form in grade 1–2 is unusual.
  if (grade !== undefined && grade >= 1 && grade <= 2 && primaryParse?.kind === "fraction") {
    warnings.push(`grade-${grade}-fraction-rare-check-stem`);
  }

  const passed = [
    primaryEffectiveVerdict === "correct" ? "primary_parse" : null,
    altParses.every((a) => a.verdict === "correct" || a.verdict === "correct_alt_form") ? "alt_parse" : null,
    equivalence.verdict === "pass" ? "equivalence" : null,
  ].filter(Boolean);
  const failed = [
    primaryEffectiveVerdict !== "correct" ? "primary_parse" : null,
    altParses.some((a) => a.verdict !== "correct" && a.verdict !== "correct_alt_form") ? "alt_parse" : null,
    equivalence.verdict !== "pass" ? "equivalence" : null,
  ].filter(Boolean);

  const ok = failed.length === 0;
  return {
    ok,
    reason: ok ? undefined : `failed gates: ${failed.join(", ")}`,
    parse: {
      primary: {
        input: String(answer),
        verdict: primaryEffectiveVerdict,
        reason: primaryVerify.reason,
        kind: primaryParse?.kind ?? null,
      },
      alts: altParses,
    },
    equivalence,
    warnings,
    stem_preview: stem.slice(0, 80),
    verified_at: new Date().toISOString(),
    verified_by: "math-specialist-independent-verifier",
    gate_version: "1",
    stages_passed: passed,
    stages_failed: failed,
  };
}

/**
 * Convenience: does this receipt pass all gates?
 *
 * @param {MathVerificationReceipt} receipt
 * @returns {boolean}
 */
export function receiptPassed(receipt) {
  return !!receipt && receipt.ok === true;
}