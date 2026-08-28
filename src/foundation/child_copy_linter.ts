// src/foundation/child_copy_linter.ts
// Phase 5A — Child Copy Linter.
//
// Lints child-facing strings for:
//   - age appropriateness (band-dependent vocabulary ceiling)
//   - short instructions (max characters per instruction)
//   - no blame/shame language (forbidden phrases)
//   - consistent terminology (e.g. don't switch between "題目" / "問題" mid-flow)
//   - no unnecessary adult jargon
//   - hint text does NOT reveal the answer prematurely
//
// Returns {ok, issues[]} where issues include 'error' and 'warn' severities.

import { AgeBand } from "./age_profile_engine.js";

export type LintSeverity = "error" | "warn";

export interface LintIssue {
  severity: LintSeverity;
  code: string;
  message: string;
  location?: string;
}

export interface ChildCopyInput {
  band: AgeBand;
  text: string;
  location: string;
  // Optional: register-appropriate terminology the UI is known to use.
  terminology_set?: ReadonlyArray<string>;
  // Optional: if this is a hint, the correct answer must not appear in text.
  is_hint?: boolean;
  correct_answer_text?: string;
}

const FORBIDDEN_BLAME = [
  "你怎麼不會",
  "你應該知道",
  "這麼簡單也不會",
  "笨蛋",
  "真是的",
  "都幾歲了",
  "你再不改",
  "讓我教你",
  "你又錯了",
];

const FORBIDDEN_ADULT_JARGON = [
  "演算法",
  "抽象化",
  "同質化",
  "結構化",
  "最佳化",
  "路徑相依",
  "複雜度",
  "理論框架",
];

const BAND_MAX_CHARS: Record<AgeBand, number> = {
  "G1-G2": 24,
  "G3-G4": 48,
  "G5-G6": 80,
  "G7+": 120,
};

const BAND_VOCAB_CEILING: Record<AgeBand, number> = {
  // crude proxy: max characters in longest single CJK word
  "G1-G2": 4,
  "G3-G4": 6,
  "G5-G6": 8,
  "G7+": 12,
};

function longestCjkRun(text: string): number {
  let max = 0;
  let cur = 0;
  for (const ch of text) {
    if (/[\u3400-\u9fff\uff00-\uffef]/.test(ch)) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function containsAny(haystack: string, needles: ReadonlyArray<string>): string | null {
  for (const n of needles) {
    if (haystack.includes(n)) return n;
  }
  return null;
}

/**
 * Lint a child-facing string.
 *
 * Pure: deterministic, no fetch, no DOM.
 */
export function lintChildCopy(input: ChildCopyInput): {
  ok: boolean;
  issues: ReadonlyArray<LintIssue>;
} {
  const issues: LintIssue[] = [];
  const text = normalize(input.text);
  const location = input.location;

  // Length check
  const maxChars = BAND_MAX_CHARS[input.band];
  if (text.length > maxChars) {
    issues.push({
      severity: "error",
      code: "TOO_LONG",
      message: `instruction ${text.length} chars exceeds band=${input.band} limit ${maxChars}`,
      location,
    });
  }

  // Vocabulary ceiling
  const vocabCeiling = BAND_VOCAB_CEILING[input.band];
  const longestRun = longestCjkRun(text);
  if (longestRun > vocabCeiling) {
    issues.push({
      severity: "warn",
      code: "VOCAB_CEILING",
      message: `longest CJK run ${longestRun} chars exceeds band=${input.band} ceiling ${vocabCeiling}; consider simpler phrasing`,
      location,
    });
  }

  // Blame / shame
  const blameHit = containsAny(text, FORBIDDEN_BLAME);
  if (blameHit) {
    issues.push({
      severity: "error",
      code: "BLAME_LANGUAGE",
      message: `forbidden phrase present: "${blameHit}"`,
      location,
    });
  }

  // Adult jargon
  const jargonHit = containsAny(text, FORBIDDEN_ADULT_JARGON);
  if (jargonHit) {
    issues.push({
      severity: "warn",
      code: "ADULT_JARGON",
      message: `adult-jargon term present: "${jargonHit}"`,
      location,
    });
  }

  // Terminology consistency (must include at least one of the register set)
  if (input.terminology_set && input.terminology_set.length > 0) {
    const has = input.terminology_set.some((t) => text.includes(t));
    if (!has) {
      issues.push({
        severity: "warn",
        code: "TERMINOLOGY_DRIFT",
        message: `text uses none of the registered terms ${JSON.stringify([...input.terminology_set])}`,
        location,
      });
    }
  }

  // Hint must not reveal answer
  if (input.is_hint && input.correct_answer_text && input.correct_answer_text.trim().length > 0) {
    const answer = input.correct_answer_text.trim();
    if (text.includes(answer)) {
      issues.push({
        severity: "error",
        code: "HINT_REVEALS_ANSWER",
        message: "hint text contains the correct answer",
        location,
      });
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues: Object.freeze(issues),
  };
}

export const ChildCopyLinter = Object.freeze({
  lintChildCopy,
  FORBIDDEN_BLAME,
  FORBIDDEN_ADULT_JARGON,
  BAND_MAX_CHARS,
});