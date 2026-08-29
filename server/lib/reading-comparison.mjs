// server/lib/reading-comparison.mjs
//
// Phase 6A — Layer A (server-side mirror).
//
// This file is a 1:1 port of src/tutor/readingComparison.ts so that
// the Node server can run the same deterministic comparison without
// a TypeScript toolchain. Any change to one MUST be mirrored to the
// other (the contract stays identical, this file stays in lockstep).
//
// The contract shape (ReadingComparison / TutorWordDiff) is defined in
// src/tutor/TutorEvaluationContract.ts; here we just emit the same
// JSON shape directly so we don't need cross-language type imports.

// ---- Contract shape (documented; matches TS file) -----------------------
// ReadingComparison {
//   expected_tokens: string[]
//   transcript_tokens: string[]
//   edit_distance: number
//   coverage: number         // 0..1
//   omitted:  TutorWordDiff[]  // present in expected, missing in transcript
//   extra:    TutorWordDiff[]  // present in transcript, missing in expected
//   substituted: TutorWordDiff[] // aligned mismatches
//   reliability: number      // 0..1
//   normalisation: { lowercase:bool, collapse_whitespace:bool,
//                    strip_punctuation:bool, expand_contractions:bool }
// }
// TutorWordDiff { expected:string, actual:string|null, position:number }

// ---- Normalisation ------------------------------------------------------

const CONTRACTIONS = {
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

function expandContractions(token) {
  return CONTRACTIONS[token] ?? token;
}

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length > 0);
}

const DEFAULT_NORMALIZE = {
  lowercase: true,
  collapseWhitespace: true,
  stripPunctuation: true,
  expandContractions: true,
};

export function normalize(text, opts = {}) {
  const o = { ...DEFAULT_NORMALIZE, ...opts };
  let s = String(text ?? "");
  if (o.collapseWhitespace) s = s.replace(/\s+/g, " ").trim();
  if (o.lowercase) s = s.toLowerCase();
  if (o.stripPunctuation) {
    s = s.replace(/[.,!?;:"()\[\]{}<>\\/]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
  }
  let tokens = tokenize(s);
  if (o.expandContractions) {
    const out = [];
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

// ---- LCS alignment ------------------------------------------------------

function lcsTable(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function alignFromLcs(expected, transcript) {
  const dp = lcsTable(expected, transcript);
  let i = expected.length;
  let j = transcript.length;
  const ops = [];
  while (i > 0 && j > 0) {
    if (expected[i - 1] === transcript[j - 1]) {
      ops.push({ kind: "match", ei: i - 1, ti: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: "del", ei: i - 1 });
      i--;
    } else {
      ops.push({ kind: "ins", ti: j - 1 });
      j--;
    }
  }
  while (i > 0) { ops.push({ kind: "del", ei: i - 1 }); i--; }
  while (j > 0) { ops.push({ kind: "ins", ti: j - 1 }); j--; }
  ops.reverse();

  const omitted = [];
  const extra = [];
  const substituted = [];
  let edit_distance = 0;

  for (const op of ops) {
    if (op.kind === "match") continue;
    edit_distance++;
    if (op.kind === "del") {
      omitted.push({ expected: expected[op.ei], actual: null, position: op.ei });
    } else if (op.kind === "ins") {
      extra.push({ expected: "", actual: transcript[op.ti], position: op.ti });
    } else {
      substituted.push({
        expected: expected[op.ei],
        actual: transcript[op.ti],
        position: op.ei,
      });
    }
  }

  let lastExpectedIndex = -1;
  for (const op of ops) {
    if (op.kind === "match") lastExpectedIndex = op.ei;
    else if (op.kind === "ins") {
      const idx = extra.findIndex((e) => e.position === op.ti);
      if (idx >= 0) extra[idx] = { ...extra[idx], position: lastExpectedIndex };
    }
  }
  return { edit_distance, omitted, extra, substituted };
}

function computeReliability(expected, transcript, editDistance, sttConfidence) {
  const expLen = Math.max(1, expected.length);
  const traLen = Math.max(1, transcript.length);
  const coverage =
    expected.length === 0 && transcript.length === 0
      ? 1
      : 1 - editDistance / Math.max(expLen, traLen);
  const lengthRatio = transcript.length / expLen;
  let lengthPenalty = 0;
  if (lengthRatio < 0.4) lengthPenalty = 0.4;
  else if (lengthRatio < 0.6) lengthPenalty = 0.2;
  else if (lengthRatio > 2.5) lengthPenalty = 0.2;
  let reliability = clamp01(coverage - lengthPenalty);
  if (sttConfidence != null && Number.isFinite(sttConfidence)) {
    reliability = clamp01(Math.min(reliability, sttConfidence));
  }
  return reliability;
}

// ---- Public API ---------------------------------------------------------

/**
 * @param {{ expected: string, transcript: string,
 *           sttConfidence?: number|null, normalize?: object }} input
 * @returns {object} ReadingComparison (contract shape)
 */
export function compareReading(input) {
  const opts = input.normalize ?? {};
  const norm = {
    lowercase: opts.lowercase ?? true,
    collapseWhitespace: opts.collapseWhitespace ?? true,
    stripPunctuation: opts.stripPunctuation ?? true,
    expandContractions: opts.expandContractions ?? true,
  };
  const expected_tokens = normalize(input.expected, norm);
  const transcript_tokens = normalize(input.transcript, norm);
  const { edit_distance, omitted, extra, substituted } =
    alignFromLcs(expected_tokens, transcript_tokens);
  const expLen = expected_tokens.length;
  const traLen = transcript_tokens.length;
  const coverage =
    expLen === 0 && traLen === 0
      ? 1
      : 1 - edit_distance / Math.max(expLen, traLen);
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
    coverage: clamp01(coverage),
    omitted,
    extra,
    substituted,
    reliability: clamp01(reliability),
    normalisation: {
      lowercase: norm.lowercase,
      collapse_whitespace: norm.collapseWhitespace,
      strip_punctuation: norm.stripPunctuation,
      expand_contractions: norm.expandContractions,
    },
  };
}