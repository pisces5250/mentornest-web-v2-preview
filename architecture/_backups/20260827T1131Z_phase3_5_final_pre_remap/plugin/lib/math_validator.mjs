// Deterministic math answer validator.
//
// Goal: NEVER call an LLM. Every verdict is reproducible, side-effect free,
// and explainable by the structured `steps` trace.
//
// Supports (v1):
//   - fraction equivalence  ("1/2", "0.5", "2/4", "3/6")
//   - integer / decimal arithmetic ("5", "5.0", "+5")
//   - percentage             ("50%")
//   - simple arithmetic on fractions / decimals
//   - exact string match (normalized whitespace / punctuation)
//   - multi-answer with the same representation
//
// Does NOT yet support (deferred):
//   - geometric proof / construction
//   - algebraic manipulation / simplification equivalence
//   - word-problem structural bar-model checks
//
// The validator returns a verdict and a trace. The trace is intended to be
// shown to a parent or used by the hint ladder — never to "explain" correctness
// to the student without human oversight.

import assert from "node:assert/strict";

// ---------------- Fraction arithmetic (pure integer math) ----------------

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function fraction(n, d) {
  assert.ok(Number.isFinite(n), "fraction: numerator not finite");
  assert.ok(Number.isFinite(d) && d !== 0, "fraction: denominator zero");
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function fractionEqual(a, b) {
  return a.n === b.n && a.d === b.d;
}

// ---------------- Parsing ----------------

function stripWhitespace(s) {
  return String(s).replace(/\s+/g, "").trim();
}

function parseAsFraction(s) {
  // Returns {ok: true, value: fraction} or {ok: false, reason}
  const raw = stripWhitespace(s);
  if (raw === "" || raw === "-") return { ok: false, reason: "empty" };

  // Percentage form: "50%"
  const pct = raw.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) {
    const v = parseFloat(pct[1]);
    // 50% = 50/100 = 1/2
    return { ok: true, value: fraction(Math.round(v * 100), 10000), form: "percent" };
  }

  // Decimal form: "0.5", "-1.25"
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const v = parseFloat(raw);
    if (Number.isNaN(v)) return { ok: false, reason: "NaN-decimal" };
    // express as fraction with denominator 10^k
    const sign = v < 0 ? -1 : 1;
    const abs = Math.abs(v);
    const parts = raw.replace(/^-/, "").split(".");
    const k = (parts[1] || "").length;
    const denom = k === 0 ? 1 : 10 ** k;
    const numer = abs * denom;
    return { ok: true, value: fraction(sign * Math.round(numer), denom), form: "decimal" };
  }

  // Fraction form: "1/2", "-3/4", "10/5"
  const frac = raw.match(/^(-?\d+)\/(-?\d+)$/);
  if (frac) {
    const n = parseInt(frac[1], 10);
    const d = parseInt(frac[2], 10);
    if (d === 0) return { ok: false, reason: "zero-denominator" };
    return { ok: true, value: fraction(n, d), form: "fraction" };
  }

  // Integer form (already covered above), but allow leading +
  if (/^[+-]?\d+$/.test(raw)) {
    return { ok: true, value: fraction(parseInt(raw, 10), 1), form: "integer" };
  }

  return { ok: false, reason: "unrecognized-format" };
}

function parseAsExpression(s) {
  // Try to evaluate "+/-/×/÷" expressions on numbers.
  // Replace × -> *, ÷ -> /, and strip whitespace.
  // We only allow digits, dot, sign, parens, and operators.
  // Returns {ok, value} where value is a number (float).
  const raw = stripWhitespace(s);
  if (!/^[-+*/().,\d\s]+$/.test(raw)) {
    return { ok: false, reason: "disallowed-char-in-expression" };
  }
  const normalized = raw.replace(/×/g, "*").replace(/÷/g, "/").replace(/，/g, ",");
  // Reject things that look like multiple expressions
  // (just a sanity check — we eval directly)
  // eslint-disable-next-line no-new-func
  let value;
  try {
    value = Function(`"use strict"; return (${normalized});`)();
  } catch (e) {
    return { ok: false, reason: "expression-eval-failed" };
  }
  if (!Number.isFinite(value)) return { ok: false, reason: "non-finite" };
  return { ok: true, value };
}

// ---------------- Public API ----------------

export function parseAnswer(s) {
  // Returns one of:
  //   {kind: 'fraction', value: {n,d}, original_form: string}
  //   {kind: 'number', value: number, original_form: string}
  //   {kind: 'expression', value: number, original_form: string}
  //   {kind: 'string', value: string}     // fallback exact-match
  //   {kind: 'invalid', reason: string}
  const original = String(s);
  const raw = stripWhitespace(s);

  // 0) Mixed number MUST be parsed BEFORE the whitespace strip, otherwise
  //    "1 1/2" becomes "112" → wrong answer. We try mixed on the original.
  const mixedOriginal = original.trim().match(/^(-?\d+)[ \u3000-](\d+)\/(\d+)$/);
  if (mixedOriginal) {
    const whole = parseInt(mixedOriginal[1], 10);
    const n = parseInt(mixedOriginal[2], 10);
    const d = parseInt(mixedOriginal[3], 10);
    if (d !== 0) {
      const sign = whole < 0 ? -1 : 1;
      const absWhole = Math.abs(whole);
      const total = sign * (absWhole * d + n);
      return { kind: "fraction", value: fraction(total, d), original_form: original.trim(), form: "mixed" };
    }
  }

  // 1) Try arithmetic expression first — but only if it has an operator and is not just a fraction.
  if (/[+\-*/×÷]/.test(raw) && !/^[+-]?\d+(?:\.\d+)?(?:\/[+-]?\d+)?$/.test(raw)) {
    const expr = parseAsExpression(raw);
    if (expr.ok) return { kind: "expression", value: expr.value, original_form: original.trim() };
    // fall through — could still be a fraction
  }

  const frac = parseAsFraction(raw);
  if (frac.ok) return { kind: "fraction", value: frac.value, original_form: original.trim(), form: frac.form };

  // exact string fallback
  return { kind: "string", value: original.trim() };
}

export function compareNumeric(expectedFrac, candidateFrac, opts = {}) {
  // Compare two fractions. If both reduce to integers, allow numeric comparison too.
  // opts.numeric_tolerance: number; if both are integers, allow this absolute diff.
  const eq = fractionEqual(expectedFrac, candidateFrac);
  if (eq) return { equal: true, reason: "fraction-equal" };

  // If both are integers (denominator === 1), allow small absolute diff
  if (expectedFrac.d === 1 && candidateFrac.d === 1) {
    const tol = opts.numeric_tolerance ?? 0;
    if (Math.abs(expectedFrac.n - candidateFrac.n) <= tol) {
      return { equal: true, reason: "integer-within-tolerance" };
    }
  }
  return { equal: false, reason: "fraction-not-equal" };
}

/**
 * Validate a student answer against an expected answer.
 * Pure function. Deterministic. No LLM.
 *
 * @param {object} input
 * @param {string|number} input.expected_answer  Expected answer (canonical form)
 * @param {string|number} input.student_answer   Student's submitted answer
 * @param {object} [input.opts]
 * @param {number} [input.opts.numeric_tolerance=0]  For integer comparisons
 * @param {boolean} [input.opts.allow_string_match=true]  Fallback to normalized exact match
 * @returns {{
 *   verdict: 'correct'|'incorrect'|'unverifiable',
 *   expected_parsed: object,
 *   student_parsed: object,
 *   compare_steps: Array<{step:string,result:object}>,
 *   reason: string
 * }}
 */
export function validateMathAnswer(input) {
  assert.ok(input && typeof input === "object", "validateMathAnswer: input required");
  const expected = input.expected_answer;
  const student = input.student_answer;
  const opts = input.opts || {};
  const allowString = opts.allow_string_match !== false;

  const exp = parseAnswer(expected);
  const stu = parseAnswer(student);

  const steps = [];

  if (exp.kind === "invalid") {
    return {
      verdict: "unverifiable",
      reason: "expected-answer-unparseable",
      expected_parsed: exp,
      student_parsed: stu,
      compare_steps: steps,
    };
  }

  if (stu.kind === "invalid" || stu.kind === "string" && stu.value === "") {
    return {
      verdict: "incorrect",
      reason: stu.kind === "invalid" ? "student-answer-unparseable" : "empty-student-answer",
      expected_parsed: exp,
      student_parsed: stu,
      compare_steps: steps,
    };
  }

  // Case 1: both numeric (fraction / number / expression)
  if (
    (exp.kind === "fraction" || exp.kind === "number" || exp.kind === "expression") &&
    (stu.kind === "fraction" || stu.kind === "number" || stu.kind === "expression")
  ) {
    // Reduce both to fractions
    let expFrac, stuFrac;
    if (exp.kind === "fraction") expFrac = exp.value;
    else expFrac = numberToFraction(exp.value);
    if (stu.kind === "fraction") stuFrac = stu.value;
    else stuFrac = numberToFraction(stu.value);

    const cmp = compareNumeric(expFrac, stuFrac, { numeric_tolerance: opts.numeric_tolerance ?? 0 });
    steps.push({ step: "fraction-compare", result: cmp });

    if (cmp.equal) {
      return {
        verdict: "correct",
        reason: cmp.reason,
        expected_parsed: exp,
        student_parsed: stu,
        compare_steps: steps,
      };
    }

    return {
      verdict: "incorrect",
      reason: cmp.reason,
      expected_parsed: exp,
      student_parsed: stu,
      compare_steps: steps,
    };
  }

  // Case 2: string fallback
  if (allowString && exp.kind === "string" || stu.kind === "string") {
    const expStr = exp.kind === "string" ? exp.value : stringifyAnswer(exp);
    const stuStr = stu.kind === "string" ? stu.value : stringifyAnswer(stu);
    const eq = normalizeForStringCompare(expStr) === normalizeForStringCompare(stuStr);
    steps.push({ step: "string-compare", result: { equal: eq } });
    if (eq) {
      return {
        verdict: "correct",
        reason: "string-exact-match",
        expected_parsed: exp,
        student_parsed: stu,
        compare_steps: steps,
      };
    }
  }

  return {
    verdict: "incorrect",
    reason: "no-matching-representation",
    expected_parsed: exp,
    student_parsed: stu,
    compare_steps: steps,
  };
}

function normalizeForStringCompare(s) {
  return String(s).replace(/\s+/g, "").replace(/[，]/g, ",").toLowerCase();
}

function numberToFraction(x) {
  if (Number.isInteger(x)) return fraction(x, 1);
  // Use a small denominator heuristic; sufficient for elementary arithmetic.
  // Find k such that round(x * 10^k) / 10^k approximates x to < 1e-9.
  for (let k = 0; k <= 9; k++) {
    const denom = 10 ** k;
    const numer = Math.round(x * denom);
    if (Math.abs(numer / denom - x) < 1e-9) {
      return fraction(numer, denom);
    }
  }
  // Fallback: best-effort 1e-9 precision
  return fraction(Math.round(x * 1e9), 1e9);
}

function stringifyAnswer(parsed) {
  if (parsed.kind === "fraction") {
    if (parsed.value.d === 1) return String(parsed.value.n);
    return `${parsed.value.n}/${parsed.value.d}`;
  }
  if (parsed.kind === "number") return String(parsed.value);
  if (parsed.kind === "expression") return String(parsed.value);
  return parsed.value;
}
