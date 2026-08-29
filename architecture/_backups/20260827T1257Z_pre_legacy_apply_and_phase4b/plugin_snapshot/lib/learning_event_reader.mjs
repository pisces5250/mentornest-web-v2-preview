// Learning event reader.
//
// Pure reader over per-student JSONL learning-records files.
// NEVER reads across students. Cross-student reads are explicitly rejected.

import fs from "node:fs/promises";
import path from "node:path";

const RECORDS_DIR = "/home/node/.openclaw/workspace/data/learning-records";

const STUDENT_ID_RE = /^student_[A-Za-z0-9_-]+$/;

export function assertStudentId(id) {
  if (!STUDENT_ID_RE.test(id)) {
    throw new Error(`Invalid student_id: ${id}`);
  }
  return id;
}

/**
 * Read raw events for a single student.
 *
 * @param {string} student_id
 * @param {object} [opts]
 * @param {string} [opts.since]   ISO date — only events >= this time
 * @param {string} [opts.until]   ISO date — only events <= this time
 * @param {string} [opts.subject] filter by subject
 * @returns {Promise<Array<object>>}
 */
export async function readLearningEvents(student_id, opts = {}) {
  assertStudentId(student_id);
  const file = path.join(RECORDS_DIR, `${student_id}.jsonl`);
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed line; never crash on a single bad record
    }
  }
  const sinceT = opts.since ? Date.parse(opts.since) : -Infinity;
  const untilT = opts.until ? Date.parse(opts.until) : Infinity;
  return events.filter((e) => {
    const t = Date.parse(e.timestamp || "");
    if (Number.isNaN(t)) return false;
    if (t < sinceT || t > untilT) return false;
    if (opts.subject && e.subject !== opts.subject) return false;
    return true;
  });
}

/**
 * Aggregate events into per-subject, per-knowledge_point buckets with stats.
 * @param {string} student_id
 * @param {object} [opts]  same as readLearningEvents
 */
export async function summarizeLearningEvents(student_id, opts = {}) {
  const events = await readLearningEvents(student_id, opts);

  const buckets = new Map();
  for (const e of events) {
    const key = `${e.subject}::${e.knowledge_point}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        subject: e.subject,
        knowledge_point: e.knowledge_point,
        total: 0,
        correct: 0,
        incorrect: 0,
        partial: 0,
        attempts_total: 0,
        hints_total: 0,
        review_needed_count: 0,
        error_types: {},
        first_seen: e.timestamp,
        last_seen: e.timestamp,
      });
    }
    const b = buckets.get(key);
    b.total += 1;
    b.attempts_total += e.attempts || 1;
    b.hints_total += e.hints || 0;
    if (e.result === "correct" || e.result === "mastered" || e.result === "improved") b.correct += 1;
    else if (e.result === "partially_correct") b.partial += 1;
    else if (e.result === "incorrect") b.incorrect += 1;
    if (e.review_needed) b.review_needed_count += 1;
    if (e.error_type) b.error_types[e.error_type] = (b.error_types[e.error_type] || 0) + 1;
    if (e.timestamp < b.first_seen) b.first_seen = e.timestamp;
    if (e.timestamp > b.last_seen) b.last_seen = e.timestamp;
  }

  const summaries = [];
  for (const b of buckets.values()) {
    b.accuracy = b.total > 0 ? b.correct / b.total : 0;
    summaries.push(b);
  }
  summaries.sort((a, b) => a.last_seen < b.last_seen ? 1 : -1);

  return {
    student_id,
    window: { since: opts.since || null, until: opts.until || null, subject: opts.subject || null },
    event_count: events.length,
    bucket_count: summaries.length,
    buckets: summaries,
  };
}
