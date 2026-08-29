// Semantic-equality duplicate detector v1.
//
// v1: normalize and compare stems + (kp, type). We do NOT embed the stem
// (Phase 3 will swap in vector dedupe). This catches:
//   - identical stems (after whitespace + casefold)
//   - stems differing only in punctuation / trailing period
//   - same stem on different grade/kp (still flagged — content is duplicate even
//     if the curriculum id mismatches)
//
// Returns the *list* of duplicate matches already in the verified bank with
// their ids and similarity scores (1.0 = identical, 0.0 = unrelated).

function normalizeStem(stem) {
  if (typeof stem !== "string") return "";
  return stem
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s。.!?！？,，、；;：:]+$/u, "")
    .trim();
}

function jaccard(a, b) {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const aw = new Set(a.split(" "));
  const bw = new Set(b.split(" "));
  if (aw.size === 0 || bw.size === 0) return 0.0;
  let inter = 0;
  for (const w of aw) if (bw.has(w)) inter++;
  const union = aw.size + bw.size - inter;
  return inter / union;
}

/**
 * Find duplicates in `existing` array of verified questions.
 *
 * @param {object} candidate
 * @param {Array<object>} existing
 * @returns {Array<{id: string, score: number, reason: string}>}
 */
export function findDuplicates(candidate, existing) {
  if (!candidate || typeof candidate !== "object") return [];
  const normCand = normalizeStem(candidate.stem);
  if (!normCand) return [];
  const out = [];
  for (const e of existing) {
    if (!e || !e.stem) continue;
    const normE = normalizeStem(e.stem);
    let score = 0;
    let reason = "";
    if (normCand === normE) {
      score = 1.0;
      reason = "stem-identical";
    } else {
      score = jaccard(normCand, normE);
      if (score >= 0.85) reason = "stem-near-identical";
    }
    if (score >= 0.85) {
      out.push({ id: e.id, score, reason });
    }
  }
  // Sort highest first
  out.sort((a, b) => b.score - a.score);
  return out;
}

export { normalizeStem, jaccard };
