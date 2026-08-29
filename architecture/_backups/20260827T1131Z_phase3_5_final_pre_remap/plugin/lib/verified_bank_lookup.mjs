// Verified Question Bank lookup / retrieval interface.
//
// This is the only interface `generate_practice_set` (and later assessment
// agents) consume. The lookup does NOT touch curated/ or raw/ — only
// verified/ — guaranteeing the Quality Gate guarantee.

import { listAllVerified } from "./question_store.mjs";

/**
 * Look up verified questions matching filters.
 *
 * @param {object} query
 * @param {string} [query.subject]
 * @param {number} [query.grade]
 * @param {string} [query.knowledge_point]
 * @param {"easy"|"medium"|"hard"} [query.difficulty]
 * @param {"short_answer"|"multiple_choice"|"true_false"} [query.type]
 * @param {number} [query.limit=20]
 * @param {string} [query.root]
 * @returns {Promise<Array<object>>} matching verified questions (capped by limit)
 */
export async function lookupVerified(query = {}) {
  const all = await listAllVerified(query.root);
  let out = all;
  if (query.subject) out = out.filter((q) => q.subject === query.subject);
  if (typeof query.grade === "number") out = out.filter((q) => q.grade === query.grade);
  if (query.knowledge_point) out = out.filter((q) => q.knowledge_point === query.knowledge_point);
  if (query.difficulty) out = out.filter((q) => q.difficulty === query.difficulty);
  if (query.type) out = out.filter((q) => q.type === query.type);
  if (out.length > query.limit) out = out.slice(0, query.limit);
  return out;
}

/**
 * Count verified questions matching filters.
 *
 * @param {object} query (same as lookupVerified)
 * @returns {Promise<number>}
 */
export async function countVerified(query = {}) {
  const all = await listAllVerified(query.root);
  let out = all;
  if (query.subject) out = out.filter((q) => q.subject === query.subject);
  if (typeof query.grade === "number") out = out.filter((q) => q.grade === query.grade);
  if (query.knowledge_point) out = out.filter((q) => q.knowledge_point === query.knowledge_point);
  if (query.difficulty) out = out.filter((q) => q.difficulty === query.difficulty);
  if (query.type) out = out.filter((q) => q.type === query.type);
  return out.length;
}
