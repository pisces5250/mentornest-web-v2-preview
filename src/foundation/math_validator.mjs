// src/foundation/math_validator.mjs
//
// ════════════════════════════════════════════════════════════════════════════
// PREVIEW COMPATIBILITY IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════
//
// This file is a standalone, deterministic re-implementation of the math
// answer-equivalence contract used by the production mentornest-learning
// plugin (plugins/mentornest-learning/lib/math_validator.mjs).
//
// SCOPE — what this file DOES cover:
//   - validateMathAnswer(expected, student, opts)  — deterministic verdict
//   - parseAnswer(input)                            — canonicalize student answer
//   - equivalents for: integers, decimals, fractions (with reduction),
//     mixed numbers (e.g. "1 1/2"), percent, plain arithmetic.
//
// SCOPE — what this file does NOT cover (left to production):
//   - learning record writes (mastery, evidence)
//   - any LLM / policy / hint ladder logic
//   - knowledge-point routing
//
// DESIGN INVARIANT: the production math_validator.mjs remains authoritative
// for production runtime. This module exists only to make mentornest-web-v2
// independently buildable as a standalone frontend preview / fixture demo.
// If the production contract changes, this module MUST be updated to match
// before any preview is shipped against updated KP material.
//
// LICENSE/OWNERSHIP NOTE: re-implemented from scratch based on the public
// contract documented in the production mentornest-learning plugin
// (outside this repository). No production source was copied verbatim.
// Kept here so the standalone GitHub/Docker preview can build without
// depending on the OpenClaw workspace layout.

/**
 * Greatest common divisor (Euclidean).
 */
function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

/**
 * Parse a value into a canonical numeric form.
 *
 * Accepts:
 *   - integers:  "42", 42, "  42 "
 *   - decimals:  "0.75", ".5", "1.25"
 *   - fractions: "5/6", " 10 / 12 "
 *   - mixed:     "1 1/2", "2 3/4"
 *   - percent:   "50%"
 *   - empty:     ""  → null
 *
 * Returns one of:
 *   { kind: "integer",  n }
 *   { kind: "decimal",  n }
 *   { kind: "fraction", n, d }
 *   { kind: "percent",  p }
 *   { kind: "empty" }
 *   null  (unparseable)
 */
export function parseAnswer(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (raw === "") return { kind: "empty" };

  // percent
  if (/^-?\d+(\.\d+)?%$/.test(raw)) {
    const p = Number(raw.slice(0, -1));
    if (Number.isFinite(p)) return { kind: "percent", p };
    return null;
  }

  // mixed number "a b/c"
  const mixedMatch = raw.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const a = Number(mixedMatch[1]);
    const b = Number(mixedMatch[2]);
    const c = Number(mixedMatch[3]);
    if (c === 0) return null;
    const sign = a < 0 ? -1 : 1;
    const absA = Math.abs(a);
    const n = sign * (absA * c + b);
    return { kind: "fraction", n, d: c };
  }

  // fraction "n/d"
  const fracMatch = raw.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const n = Number(fracMatch[1]);
    const d = Number(fracMatch[2]);
    if (d === 0) return null;
    return { kind: "fraction", n, d };
  }

  // decimal / integer (leading dot ok)
  const numMatch = raw.match(/^-?(\d+(\.\d+)?|\.\d+)$/);
  if (numMatch) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (raw.includes(".")) return { kind: "decimal", n };
    return { kind: "integer", n };
  }

  return null;
}

/**
 * Reduce a fraction to lowest terms. Sign is folded into numerator.
 */
function reduceFraction(n, d) {
  if (d === 0) return { n: NaN, d: 0 };
  const sign = d < 0 ? -1 : 1;
  let nn = n * sign;
  let dd = Math.abs(d);
  const g = gcd(nn, dd);
  nn = Math.round(nn / g);
  dd = Math.round(dd / g);
  return { n: nn, d: dd };
}

/**
 * Compare two canonical answers with equivalence semantics.
 * Returns { equivalent: boolean, reason: string }.
 */
function canonicalEquivalent(a, b, opts) {
  const tol = opts.numeric_tolerance ?? 0;

  // direct numeric compare after canonicalization
  const aVal = toNumber(a);
  const bVal = toNumber(b);
  if (aVal !== null && bVal !== null) {
    if (tol > 0) {
      return {
        equivalent: Math.abs(aVal - bVal) <= tol,
        reason: `numeric-diff=${Math.abs(aVal - bVal)}`,
      };
    }
    return {
      equivalent: aVal === bVal,
      reason: `numeric-eq=${aVal === bVal}`,
    };
  }

  // fraction-to-fraction compare (after reduction)
  if (a.kind === "fraction" && b.kind === "fraction") {
    const ra = reduceFraction(a.n, a.d);
    const rb = reduceFraction(b.n, b.d);
    return {
      equivalent: ra.n === rb.n && ra.d === rb.d,
      reason: `frac(${ra.n}/${ra.d}) vs frac(${rb.n}/${rb.d})`,
    };
  }

  // percent compare as decimal
  if (a.kind === "percent" && b.kind === "percent") {
    return { equivalent: a.p === b.p, reason: `pct=${a.p}=${b.p}` };
  }

  return { equivalent: false, reason: "different-kinds-or-unparseable" };
}

function toNumber(c) {
  switch (c.kind) {
    case "integer": return c.n;
    case "decimal": return c.n;
    case "percent": return c.p / 100;
    case "fraction": return c.d === 0 ? null : c.n / c.d;
    case "empty":   return null;
    default:        return null;
  }
}

/**
 * Validate a student answer against the canonical expected answer.
 *
 * @param {object} input
 * @param {string|number} input.expected_answer   — canonical expected
 * @param {string|number} input.student_answer    — student-provided
 * @param {object} [input.opts]
 * @param {number} [input.opts.numeric_tolerance=0]
 * @param {boolean} [input.opts.allow_string_match=true]
 * @returns {object}  { verdict, reason, compare_steps }
 *
 * verdict ∈ { "correct", "incorrect", "unverifiable" }
 */
export function validateMathAnswer(input) {
  const expected = input?.expected_answer;
  const student  = input?.student_answer;
  const opts = input?.opts ?? {};
  const allowStringMatch = opts.allow_string_match !== false;

  const steps = [];

  const eParsed = parseAnswer(expected);
  const sParsed = parseAnswer(student);

  steps.push({ stage: "parse", expected: eParsed, student: sParsed });

  if (!eParsed || !sParsed) {
    return {
      verdict: "unverifiable",
      reason: "unparseable-input",
      compare_steps: steps,
      expected_parsed: eParsed,
      student_parsed: sParsed,
    };
  }

  if (eParsed.kind === "empty") {
    // No canonical expected answer — nothing to verify against.
    return {
      verdict: "unverifiable",
      reason: "empty-expected",
      compare_steps: steps,
      expected_parsed: eParsed,
      student_parsed: sParsed,
    };
  }
  if (sParsed.kind === "empty") {
    // Expected is real but student gave nothing.  Per Phase 5B contract,
    // this counts as incorrect (student submitted without answering),
    // NOT unverifiable.
    return {
      verdict: "incorrect",
      reason: "empty-student-answer",
      compare_steps: steps,
      expected_parsed: eParsed,
      student_parsed: sParsed,
    };
  }

  // string equality shortcut (canonical strings match)
  if (allowStringMatch) {
    const eStr = String(expected).trim();
    const sStr = String(student).trim();
    if (eStr === sStr) {
      steps.push({ stage: "string-eq", match: true });
      return {
        verdict: "correct",
        reason: "string-equality",
        compare_steps: steps,
        expected_parsed: eParsed,
        student_parsed: sParsed,
      };
    }
  }

  const cmp = canonicalEquivalent(eParsed, sParsed, opts);
  steps.push({ stage: "canonical-equivalent", ...cmp });

  // Production reason strings (kept in sync with the production plugin):
  //   - "fraction-equal"  : reduced-numerator/denominator match
  //   - "canonical-equivalent" : string equality or numeric equality path
  //   - "string-equality" : exact string match (handled above)
  let reason;
  if (cmp.equivalent) {
    if (eParsed.kind === "fraction" && sParsed.kind === "fraction") {
      reason = "fraction-equal";
    } else {
      reason = "canonical-equivalent";
    }
  } else {
    reason = `not-equivalent (${cmp.reason})`;
  }

  return {
    verdict: cmp.equivalent ? "correct" : "incorrect",
    reason,
    compare_steps: steps,
    expected_parsed: eParsed,
    student_parsed: sParsed,
  };
}

export const __TEST__ = { parseAnswer, validateMathAnswer, gcd, reduceFraction };
