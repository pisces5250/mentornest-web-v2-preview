// src/foundation/child_copy_linter.mjs
// Phase 5A — Child Copy Linter.

const FORBIDDEN_BLAME = Object.freeze([
  "你怎麼不會", "你應該知道", "這麼簡單也不會",
  "笨蛋", "真是的", "都幾歲了",
  "你再不改", "讓我教你", "你又錯了",
]);

const FORBIDDEN_ADULT_JARGON = Object.freeze([
  "演算法", "抽象化", "同質化",
  "結構化", "最佳化", "路徑相依",
  "複雜度", "理論框架",
]);

const BAND_MAX_CHARS = Object.freeze({
  "G1-G2": 24,
  "G3-G4": 48,
  "G5-G6": 80,
  "G7+": 120,
});

const BAND_VOCAB_CEILING = Object.freeze({
  "G1-G2": 4,
  "G3-G4": 6,
  "G5-G6": 8,
  "G7+": 12,
});

function longestCjkRun(text) {
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

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function containsAny(haystack, needles) {
  for (const n of needles) {
    if (haystack.includes(n)) return n;
  }
  return null;
}

export function lintChildCopy(input) {
  const issues = [];
  const text = normalize(input.text);
  const location = input.location;

  const maxChars = BAND_MAX_CHARS[input.band];
  if (text.length > maxChars) {
    issues.push({
      severity: "error",
      code: "TOO_LONG",
      message: `instruction ${text.length} chars exceeds band=${input.band} limit ${maxChars}`,
      location,
    });
  }

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

  const blameHit = containsAny(text, FORBIDDEN_BLAME);
  if (blameHit) {
    issues.push({
      severity: "error",
      code: "BLAME_LANGUAGE",
      message: `forbidden phrase present: "${blameHit}"`,
      location,
    });
  }

  const jargonHit = containsAny(text, FORBIDDEN_ADULT_JARGON);
  if (jargonHit) {
    issues.push({
      severity: "warn",
      code: "ADULT_JARGON",
      message: `adult-jargon term present: "${jargonHit}"`,
      location,
    });
  }

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