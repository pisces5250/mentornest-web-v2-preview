// Persistent question store.
//
// Filesystem layout:
//   data/questions/<bucket>/<subject>/<grade>/<id>.json
//   data/question-bank/index.jsonl  (verified-only index, append-only)
//
// Atomic write: temp file + rename. Concurrent reads never see partial files.

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DEFAULT = "/home/node/.openclaw/workspace/data";

export const BUCKETS = Object.freeze(["raw", "curated", "verified", "rejected"]);

function safeSegment(s) {
  if (typeof s !== "string") throw new Error("safeSegment: string required");
  // Question IDs look like q.ai_authored.math.G5.FRAC.add-unlike-denom.<uuid>.
  // Allow alphanumerics, underscore, dash, and dot.
  if (!/^[a-z0-9_.-]+$/i.test(s)) throw new Error(`safeSegment: invalid ${s}`);
  return s;
}

/**
 * Build the file path for a question.
 * @param {object} opts
 * @param {"raw"|"curated"|"verified"|"rejected"} opts.bucket
 * @param {string} opts.subject
 * @param {number} opts.grade
 * @param {string} opts.id
 * @param {string} [opts.root] - data root; defaults to /home/node/.openclaw/workspace/data
 */
export function questionPath({ bucket, subject, grade, id, root = ROOT_DEFAULT }) {
  if (!BUCKETS.includes(bucket)) throw new Error(`invalid bucket ${bucket}`);
  safeSegment(subject);
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
    throw new Error(`invalid grade ${grade}`);
  }
  safeSegment(id);
  return path.join(root, "questions", bucket, subject, `G${grade}`, `${id}.json`);
}

export async function atomicWriteJson(filepath, obj) {
  const tmp = filepath + ".tmp." + process.pid + "." + Date.now();
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fs.rename(tmp, filepath);
}

export async function readQuestion(filepath) {
  const raw = await fs.readFile(filepath, "utf8");
  return JSON.parse(raw);
}

export async function listQuestions({ bucket, subject, grade, root = ROOT_DEFAULT }) {
  if (!BUCKETS.includes(bucket)) throw new Error(`invalid bucket ${bucket}`);
  const dir = path.join(root, "questions", bucket, subject, `G${grade}`);
  try {
    const files = await fs.readdir(dir);
    const out = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const full = path.join(dir, f);
      try {
        const j = JSON.parse(await fs.readFile(full, "utf8"));
        out.push(j);
      } catch (e) {
        // Skip malformed
      }
    }
    return out;
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

export async function listAllVerified(root = ROOT_DEFAULT) {
  const dir = path.join(root, "questions", "verified");
  const out = [];
  async function walk(p) {
    let entries;
    try {
      entries = await fs.readdir(p, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    for (const ent of entries) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.name.endsWith(".json")) {
        try {
          out.push(JSON.parse(await fs.readFile(full, "utf8")));
        } catch (e) {
          // skip
        }
      }
    }
  }
  await walk(dir);
  return out;
}

export async function removeQuestion(filepath) {
  await fs.unlink(filepath);
}
