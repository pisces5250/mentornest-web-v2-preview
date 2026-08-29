// src/tutor/readingComparison.ts
//
// Phase 6A — Layer A: deterministic reading comparison.
//
// Pure function. No I/O, no React, no fetch. Compares an expected
// reading text against a child-confirmed STT transcript and produces
// a stable `ReadingComparison`.
//
// What this module is:
//   - Tokeniser (whitespace + punctuation)
//   - Light normaliser (lowercase, whitespace collapse, contraction
//     expansion, punctuation strip)
//   - Aligner (LCS-based substitution detector that is more forgiving
//     than raw Levenshtein on word boundaries)
//   - Reliability scorer (combines coverage with STT-reported
//     confidence when present)
//
// What this module is NOT:
//   - A teaching evaluator. It does NOT pick teaching points, does NOT
//     write overall_result, does NOT speak to the child. Those are
//     the (server-side) English Specialist's job. This is layer A.
//
// Hard rules:
//   - Pure: given the same input, output is byte-stable (modulo
//     timestamp-shaped fields that don't exist here).
//   - No state, no module-level cache.
//   - Returns the contract shape verbatim (ReadingComparison).
//   - When STT confidence is missing, reliability is computed from
//     coverage alone (still bounded).
//   - All omitted/extra/substituted positions are 0-based indexes
//     into `expected_tokens` (omitted/substituted) or
//     `transcript_tokens` (extra).

import {
  type ReadingComparison,
  type TutorWordDiff,
  clampConfidence,
} from "./TutorEvaluationContract";

// ---- Normalisation helpers ---------------------------------------------

/**
 * Map of English contractions → expanded form. We only expand the
 * most common ones a 5th-grade reader might encounter; we do NOT
 * try to be exhaustive. Keep the map small and predictable so that
 * behaviour is auditable.
 */
const CONTRACTIONS: Record<string, string> = {
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "won't": "will not",
  "can't": "cannot",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "i'm": "i am",
  "i've": "i have",
  "i'll": "i will",
  "i'd": "i would",
  "you're": "you are",
  "you've": "you have",
  "you'll": "you will",
  "you'd": "you would",
  "we're": "we are",
  "we've": "we have",
  "we'll": "we will",
  "we'd": "we would",
  "they're": "they are",
  "they've": "they have",
  "they'll": "they will",
  "they'd": "they would",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "there's": "there is",
  "what's": "what is",
  "let's": "let us",
};

function expandContractions(token: string): string {
  if (!token) return token;
  // Normalise curly apostrophe (U+2019) to straight (U+0027) so
  // don’t (curly) and don't (straight) both resolve to the same key.
  const normalised = token.replace(/\u2019/g, "'");
  return CONTRACTIONS[normalised] ?? token;
}

/**
 * Tokenise by Unicode word boundaries. Strips punctuation but keeps
 * letters (any script), digits, and apostrophes inside words.
 * Whitespace separators only.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  // Split on any non-word/non-apostrophe character. The regex is
  // deliberately conservative: [\p{L}\p{N}'\u2019] covers Unicode
  // letters, digits, ASCII straight apostrophe (U+0027) AND curly
  // apostrophe (U+2019).  We don't split on hyphens because a
  // 5th-grader saying "well-known" should not become two tokens.
  return text
    .split(/[^\p{L}\p{N}'\u2019]+/u)
    .filter((t) => t.length > 0);
}

export interface NormalizeOptions {
  lowercase?: boolean;
  collapseWhitespace?: boolean;
  stripPunctuation?: boolean;
  expandContractions?: boolean;
}

const DEFAULT_NORMALIZE: Required<NormalizeOptions> = {
  lowercase: true,
  collapseWhitespace: true,
  stripPunctuation: true,
  expandContractions: true,
};

export function normalize(text: string, opts: NormalizeOptions = {}): string[] {
  const o = { ...DEFAULT_NORMALIZE, ...opts };
  let s = String(text ?? "");
  if (o.collapseWhitespace) s = s.replace(/\s+/g, " ").trim();
  if (o.lowercase) s = s.toLowerCase();
  if (o.stripPunctuation) {
    // Strip ASCII punctuation around tokens but keep apostrophes.
    s = s.replace(/[.,!?;:"()\[\]{}<>\\/]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
  }
  let tokens = tokenize(s);
  if (o.expandContractions) {
    // Expand contractions that survived tokenisation (apostrophes
    // are preserved by the tokeniser). We map token-by-token so
    // "i'm" → ["i", "am"].
    const out: string[] = [];
    for (const t of tokens) {
      const expanded = expandContractions(t);
      if (expanded.includes(" ")) {
        for (const piece of expanded.split(/\s+/)) {
          if (piece) out.push(piece);
        }
      } else {
        out.push(expanded);
      }
    }
    tokens = out;
  }
  return tokens;
}

// ---- Alignment (LCS-based) ---------------------------------------------

/**
 * Compute Longest Common Subsequence table for two arrays of tokens.
 * Pure, O(n*m) time/space, n/m small (passage-sized).
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Walk back through the LCS table to produce:
 *   - edit_distance (number of insertions + deletions + substitutions)
 *   - omitted: expected tokens not in LCS
 *   - extra:   transcript tokens not in LCS
 *   - substituted: aligned mismatches (substitution = expected token
 *     aligned to a different transcript token in the same row).
 *
 * Position indexes are 0-based into the original arrays.
 */
function alignFromLcs(
  expected: string[],
  transcript: string[],
): {
  edit_distance: number;
  omitted: TutorWordDiff[];
  extra: TutorWordDiff[];
  substituted: TutorWordDiff[];
} {
  const dp = lcsTable(expected, transcript);
  let i = expected.length;
  let j = transcript.length;
  const ops: Array<
    | { kind: "match"; ei: number; ti: number }
    | { kind: "sub"; ei: number; ti: number }
    | { kind: "del"; ei: number }
    | { kind: "ins"; ti: number }
  > = [];

  while (i > 0 && j > 0) {
    if (expected[i - 1] === transcript[j - 1]) {
      ops.push({ kind: "match", ei: i - 1, ti: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: "del", ei: i - 1 });
      i--;
    } else {
      ops.push({ kind: "ins", ti: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ kind: "del", ei: i - 1 });
    i--;
  }
  while (j > 0) {
    ops.push({ kind: "ins", ti: j - 1 });
    j--;
  }

  ops.reverse();

  const omitted: TutorWordDiff[] = [];
  const extra: TutorWordDiff[] = [];
  const substituted: TutorWordDiff[] = [];
  let edit_distance = 0;

  for (const op of ops) {
    if (op.kind === "match") continue;
    edit_distance++;
    if (op.kind === "del") {
      omitted.push({ expected: expected[op.ei], actual: null, position: op.ei });
    } else if (op.kind === "ins") {
      // For an "extra", `expected` is null and `position` is the
      // nearest preceding expected-token index (or -1 if at start).
      // Walk ops[] to find the position. For simplicity we use the
      // transcript-token index here and resolve position lazily in the
      // final pass.
      extra.push({
        expected: "",
        actual: transcript[op.ti],
        position: op.ti,
      });
    } else {
      substituted.push({
        expected: expected[op.ei],
        actual: transcript[op.ti],
        position: op.ei,
      });
    }
  }

  // Normalise extra positions: each extra is reported with its
  // transcript-token index in `position` (negative-prefixed would
  // confuse UI). Convert to "expected side" by anchoring against the
  // last matched expected-token index.
  let lastExpectedIndex = -1;
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.kind === "match") {
      lastExpectedIndex = op.ei;
    } else if (op.kind === "ins") {
      // Find the extra entry we pushed for this op.
      const idx = extra.findIndex((e) => e.position === op.ti);
      if (idx >= 0) {
        extra[idx] = { ...extra[idx], position: lastExpectedIndex };
      }
    }
  }

  return { edit_distance, omitted, extra, substituted };
}

// ---- Reliability -------------------------------------------------------

function computeReliability(
  expected: string[],
  transcript: string[],
  editDistance: number,
  sttConfidence: number | null,
): number {
  const expLen = Math.max(1, expected.length);
  const traLen = Math.max(1, transcript.length);
  // Coverage is 1 - edit_distance / max(expected, transcript).
  // Empty-both gives coverage 1.
  const coverage =
    expected.length === 0 && transcript.length === 0
      ? 1
      : 1 - editDistance / Math.max(expLen, traLen);

  // Length sanity: STT transcripts that are wildly shorter than
  // expected often indicate a partial capture (child only said a few
  // words before stopping). Penalise that.
  const lengthRatio = transcript.length / expLen;
  let lengthPenalty = 0;
  if (lengthRatio < 0.4) lengthPenalty = 0.4;
  else if (lengthRatio < 0.6) lengthPenalty = 0.2;
  else if (lengthRatio > 2.5) lengthPenalty = 0.2;

  let reliability = clampConfidence(coverage - lengthPenalty);

  if (sttConfidence != null && Number.isFinite(sttConfidence)) {
    // Blend in STT confidence: take the min so a low STT confidence
    // never boosts the score.
    reliability = clampConfidence(Math.min(reliability, sttConfidence));
  }

  return reliability;
}

// ---- Public API --------------------------------------------------------

export interface ReadingComparisonInput {
  expected: string;
  transcript: string;
  /** Optional STT-reported confidence in [0, 1]. */
  sttConfidence?: number | null;
  /** Override defaults if needed for tests. */
  normalize?: NormalizeOptions;
}

export function compareReading(
  input: ReadingComparisonInput,
): ReadingComparison {
  const opts = input.normalize ?? {};
  const norm = {
    lowercase: opts.lowercase ?? true,
    collapseWhitespace: opts.collapseWhitespace ?? true,
    stripPunctuation: opts.stripPunctuation ?? true,
    expandContractions: opts.expandContractions ?? true,
  };
  const expected_tokens = normalize(input.expected, norm);
  const transcript_tokens = normalize(input.transcript, norm);

  const { edit_distance, omitted, extra, substituted } = alignFromLcs(
    expected_tokens,
    transcript_tokens,
  );

  const expLen = expected_tokens.length;
  const traLen = transcript_tokens.length;
  const coverage =
    expLen === 0 && traLen === 0
      ? 1
      : 1 -
        edit_distance / Math.max(expLen, traLen);

  const reliability = computeReliability(
    expected_tokens,
    transcript_tokens,
    edit_distance,
    input.sttConfidence ?? null,
  );

  return {
    expected_tokens,
    transcript_tokens,
    edit_distance,
    coverage: clampConfidence(coverage),
    omitted,
    extra,
    substituted,
    reliability: clampConfidence(reliability),
    normalisation: {
      lowercase: norm.lowercase,
      collapse_whitespace: norm.collapseWhitespace,
      strip_punctuation: norm.stripPunctuation,
      expand_contractions: norm.expandContractions,
    },
  };
}

// ---- Convenience: convert to the contract's TutorWordDiff shape --------
//
// The contract uses `omitted_words / extra_words / substituted_words`.
// We keep them in the ReadingComparison for now as `omitted / extra /
// substituted` (shorter names). Helpers below normalise.

export function toOmittedWords(c: ReadingComparison): TutorWordDiff[] {
  return c.omitted.map((d) => ({
    expected: d.expected,
    actual: null,
    position: d.position,
  }));
}

export function toExtraWords(c: ReadingComparison): TutorWordDiff[] {
  return c.extra.map((d) => ({
    expected: "",
    actual: d.actual,
    position: d.position,
  }));
}

export function toSubstitutedWords(c: ReadingComparison): TutorWordDiff[] {
  return c.substituted.map((d) => ({
    expected: d.expected,
    actual: d.actual,
    position: d.position,
  }));
}