// Social Studies Curriculum Map v1 — read-only wrapper over
// /home/node/.openclaw/workspace/architecture/curriculum/social_studies.yaml.
//
// NEVER writes anything. Caches the YAML in-memory and invalidates on mtime.

import fs from "node:fs/promises";
import * as yaml from "js-yaml";

const FILE = "/home/node/.openclaw/workspace/architecture/curriculum/social_studies.yaml";
let cache = null;
let mtime = 0;

async function load() {
  const raw = await fs.readFile(FILE, "utf8");
  const st = await fs.stat(FILE);
  if (cache && st.mtimeMs === mtime) return cache;
  cache = yaml.load(raw) || {};
  mtime = st.mtimeMs;
  return cache;
}

export async function lookupSocialStudiesKP({ knowledge_point }) {
  const d = await load();
  const wanted = String(knowledge_point || "").trim();
  if (!wanted) return { found: false, reason: "kp-empty" };
  for (const [gk, g] of Object.entries(d.grades || {})) {
    const kp = (g.knowledge_points || []).find((k) => k.id === wanted);
    if (kp) {
      return {
        found: true,
        id: kp.id,
        grade: Number(gk),
        description: kp.description,
        stage: kp.stage,
        curriculum_doc: d.curriculum_doc,
        subject: d.subject,
      };
    }
  }
  return { found: false, reason: "kp-not-found", searched_id: wanted };
}

export async function listSocialStudiesKPForGrade({ grade }) {
  const d = await load();
  const g = String(grade);
  if (!d.grades || !d.grades[g]) {
    return { found: false, grade: Number(grade), knowledge_points: [] };
  }
  return {
    found: true,
    grade: Number(grade),
    curriculum_doc: d.curriculum_doc,
    knowledge_points: d.grades[g].knowledge_points,
  };
}

export function gradeAppropriateSocialStudiesTopic({
  grade,
  knowledge_point,
  description,
}) {
  const g = Number(grade);
  const text = `${knowledge_point || ""} ${description || ""}`;
  return {
    appropriate: Number.isInteger(g) && g >= 1 && g <= 6,
    grade: g,
    age_appropriate: Number.isInteger(g) && g >= 3,
    topic: String(knowledge_point || description || ""),
    note:
      Number.isInteger(g) && g >= 1 && g <= 6
        ? ""
        : "social studies curriculum v1 covers G1-G6",
  };
}