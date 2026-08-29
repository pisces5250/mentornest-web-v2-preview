// Curriculum map lookup.
//
// Reads the Taiwan 12-year curriculum YAML skeleton (G1–G6 only in V1).
// Knowledge-point id format: `<subject>.<grade>.<topic>.<subtopic>`
//
// V1 scope:
//   - 5 subjects × 6 grades × ~3–6 knowledge_points per grade
//   - source = "教育部 十二年國民基本教育課程綱要"
//   - NO publisher content copied; only knowledge-point ids + brief descriptions
//
// Storage: /home/node/.openclaw/workspace/architecture/curriculum/*.yaml

/**
 * Build a merged in-memory index that bundles subjects.* with their knowledge_points.
 * This is what question_validator expects. Returns:
 *   { version, scope, source_documents, subjects: { math: { name, file, knowledge_points: [...] }, ... } }
 */
export async function buildMergedIndex() {
  const index = await loadIndex();
  const subjects = {};
  for (const [id, entry] of Object.entries(index.subjects || {})) {
    const file = path.join(CURRICULUM_DIR, entry.file);
    let doc;
    try {
      doc = yaml.load(await fs.readFile(file, "utf8"));
    } catch (e) {
      throw new Error(`curriculum: cannot load subject ${id}: ${e.message}`);
    }
    const merged = [];
    for (const [gradeStr, gradeDoc] of Object.entries(doc.grades || {})) {
      for (const kp of gradeDoc.knowledge_points || []) {
        merged.push({ ...kp, grade: Number(gradeStr), subject: id });
      }
    }
    subjects[id] = { name: entry.name, file: entry.file, knowledge_points: merged };
  }
  return {
    version: index.version,
    scope: index.scope,
    curriculum_code: index.curriculum_code,
    source_documents: index.source_documents || [],
    subjects,
  };
}

import fs from "node:fs/promises";
import path from "node:path";
import * as yaml from "js-yaml";

const CURRICULUM_DIR = "/home/node/.openclaw/workspace/architecture/curriculum";
const INDEX_FILE = path.join(CURRICULUM_DIR, "index.yaml");

let _indexCache = null;

async function loadIndex() {
  if (_indexCache) return _indexCache;
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    _indexCache = yaml.load(raw);
  } catch (e) {
    if (e.code === "ENOENT") _indexCache = {};
    else throw e;
  }
  return _indexCache;
}

async function loadSubject(subject) {
  const index = await loadIndex();
  // Subject entry may live either at `subjects[id]` or in a top-level list under `entries`.
  let entry = null;
  if (index.subjects && typeof index.subjects === "object" && !Array.isArray(index.subjects)) {
    entry = index.subjects[subject];
  }
  if (!entry && Array.isArray(index.entries)) {
    entry = index.entries.find((e) => e && e.id === subject);
  }
  if (!entry) {
    throw new Error(`curriculum: subject "${subject}" not in index`);
  }
  const file = path.join(CURRICULUM_DIR, entry.file);
  const raw = await fs.readFile(file, "utf8");
  return yaml.load(raw);
}

/**
 * Look up curriculum info for a (grade, subject, knowledge_point) tuple.
 * Returns {found, knowledge_point_meta, sibling_points} or {found: false}.
 */
export async function lookupKnowledgePoint({ grade, subject, knowledge_point }) {
  const doc = await loadSubject(subject);
  const gradeKey = String(grade);
  const gradeDoc = doc && doc.grades && doc.grades[gradeKey];
  if (!gradeDoc) {
    return {
      found: false,
      reason: Number(grade) >= 7 ? "grade-not-in-curriculum-v1" : "grade-not-in-curriculum",
      grade: Number(grade),
      subject,
    };
  }

  const kps = gradeDoc.knowledge_points || [];
  const match = kps.find((k) => k.id === knowledge_point || k.alias === knowledge_point);
  if (!match) {
    return {
      found: false,
      reason: "knowledge-point-not-found-in-grade",
      grade: Number(grade),
      subject,
      knowledge_point,
      available: kps.map((k) => k.id),
    };
  }

  return {
    found: true,
    grade: Number(gradeKey),
    subject,
    knowledge_point: match,
    sibling_points: kps.filter((k) => k.id !== match.id).map((k) => k.id),
    curriculum_doc: doc.curriculum_doc || "tw-12yrc-v1",
    curriculum_scope: doc.scope || "G1-G6",
  };
}

/**
 * List all knowledge points for a (grade, subject).
 */
export async function listKnowledgePoints({ grade, subject }) {
  const doc = await loadSubject(subject);
  const gradeKey = String(grade);
  const gradeDoc = doc && doc.grades && doc.grades[gradeKey];
  if (!gradeDoc) {
    return { found: false, grade: Number(grade), subject, knowledge_points: [] };
  }
  return {
    found: true,
    grade: Number(gradeKey),
    subject,
    knowledge_points: gradeDoc.knowledge_points || [],
  };
}

/**
 * List supported subjects in V1.
 */
export async function listSubjects() {
  const index = await loadIndex();
  if (index.subjects && typeof index.subjects === "object" && !Array.isArray(index.subjects)) {
    return Object.keys(index.subjects);
  }
  if (Array.isArray(index.entries)) {
    return index.entries.map((e) => e.id);
  }
  return [];
}

/**
 * V1 metadata summary.
 */
export async function curriculumMeta() {
  const index = await loadIndex();
  return {
    version: index.version || 1,
    scope: index.scope || "G1-G6",
    curriculum_code: index.curriculum_code || "taiwan-12-year-curriculum",
    source_documents: index.source_documents || [],
  };
}

export const _internal = { loadIndex, loadSubject, INDEX_FILE, CURRICULUM_DIR };
