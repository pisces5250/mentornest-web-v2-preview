// src/input/answer-validator.mjs
//
// Phase 5B — Thin wrapper around the local math validator (preview build).
//
// This wrapper imports from src/foundation/math_validator.mjs, which is a
// PREVIEW COMPATIBILITY IMPLEMENTATION of the production math validator
// contract (see plugins/mentornest-learning/lib/math_validator.mjs in the
// main workspace). The production plugin remains authoritative for
// production runtime; this file is the standalone-preview shim.
//
// CONTRACT: This wrapper is pass-through. It does NOT add new validation
// logic. Every verdict is produced by `validateMathAnswer` (deterministic,
// no LLM).
//
// Accepts: a KeypadValue (from NativeMathKeypad) + the expected canonical answer.
// Returns: { verdict, reason, compare_steps, ... }

import { validateMathAnswer, parseAnswer } from "../foundation/math_validator.mjs";

/**
 * Convert a KeypadValue to the canonical string form expected by math_validator.
 */
export function keypadValueToString(value) {
  if (!value) return "";
  switch (value.kind) {
    case "integer":
      return String(value.n);
    case "decimal":
      return String(value.n);
    case "fraction":
      if (value.denominator === 0) return "";
      return `${value.numerator}/${value.denominator}`;
    case "fraction_partial":
      // Incomplete fraction: numerator or denominator missing.
      // Submit guard upstream prevents this from reaching the validator in
      // the happy path, but we still return empty for safety.
      return "";
    case "mixed":
      return `${value.integer_part} ${value.numerator}/${value.denominator}`;
    case "operator_expr":
      return value.raw;
    case "empty":
    default:
      return "";
  }
}

/**
 * Validate a student answer produced by the native keypad.
 *
 * @param {object} input
 * @param {object} input.keypad_value       — value from NativeMathKeypad
 * @param {string|number} input.expected    — canonical expected answer
 * @returns {object}                        — math_validator verdict + steps
 */
export function validateKeypadAnswer(input) {
  const student_answer = keypadValueToString(input.keypad_value);
  return validateMathAnswer({
    expected_answer: input.expected,
    student_answer,
    opts: {
      numeric_tolerance: 0,
      allow_string_match: true,
    },
  });
}

export const __TEST__ = { keypadValueToString, validateKeypadAnswer };
