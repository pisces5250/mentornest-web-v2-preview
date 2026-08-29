// Student Profile v2 read/write helpers.
//
// Backward compatible:
//   - reads v1-shaped JSON files just fine
//   - returns merged v2 view (filled with defaults for missing fields)
//   - writes preserve existing v1 fields, only adding v2 fields that the
//     caller explicitly provided (so existing profile JSON stays valid v1 too).
//
// Storage:
//   /home/node/.openclaw/workspace/data/students/<student_id>.json

import fs from "node:fs/promises";
import path from "node:path";
import { assertStudentId } from "./learning_event_reader.mjs";

const STUDENTS_DIR = "/home/node/.openclaw/workspace/data/students";

const DEFAULT_V1 = () => ({
  student_id: null,
  display_name: "",
  grade: null,
  school_year: "2026",
  curriculum: {},
  learning_preferences: {},
});

const DEFAULT_V2 = {
  school_curriculum: null,         // "taiwan-12-year-curriculum" | other
  textbook_version: {},            // {subject: {publisher, edition, volume, curriculum_alignment, notes}}
  learning_goals: [],              // [{goal_id, subject, knowledge_point, description, target_date, status, created_by, created_at, updated_at}]
  parent_concerns: [],             // [{concern_id, subject, description, severity, created_at, resolved_at}]
  school_progress: {},             // {subject: {confirmed_progress, confirmed_source, confirmed_at, inferred_progress, inference_confidence, updated_at}}
  schema_version: 2,
  profile_minimal_onboarding: true,
};

/**
 * Read a profile and return a v2 view (preserves any v1 fields present).
 */
export async function readProfileV2(student_id) {
  assertStudentId(student_id);
  const file = path.join(STUDENTS_DIR, `${student_id}.json`);
  let v1;
  try {
    const raw = await fs.readFile(file, "utf8");
    v1 = JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        found: false,
        student_id,
        profile: null,
      };
    }
    throw e;
  }

  // Migrate-on-read: produce v2 view
  const v2 = {
    ...v1,
    ...DEFAULT_V2,
    ...(v1.school_curriculum ? { school_curriculum: v1.school_curriculum } : {}),
    ...(v1.textbook_version ? { textbook_version: v1.textbook_version } : {}),
    ...(v1.learning_goals ? { learning_goals: v1.learning_goals } : {}),
    ...(v1.parent_concerns ? { parent_concerns: v1.parent_concerns } : {}),
    ...(v1.school_progress ? { school_progress: v1.school_progress } : {}),
    schema_version: 2,
  };

  return { found: true, student_id, profile: v2 };
}

/**
 * Patch a v2 profile. Reads v1, applies the patch, writes v1 (so the file
 * on disk is always valid v1 + v2 fields). NEVER deletes existing fields
 * the patch didn't touch.
 */
export async function updateProfileV2(student_id, patch) {
  assertStudentId(student_id);
  if (!patch || typeof patch !== "object") {
    throw new Error("updateProfileV2: patch must be an object");
  }

  const file = path.join(STUDENTS_DIR, `${student_id}.json`);
  let v1;
  try {
    const raw = await fs.readFile(file, "utf8");
    v1 = JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") {
      v1 = { ...DEFAULT_V1(), student_id };
    } else {
      throw e;
    }
  }

  // Allowed v2 keys to merge into the profile
  const v2Keys = [
    "school_curriculum",
    "textbook_version",
    "learning_goals",
    "parent_concerns",
    "school_progress",
    "schema_version",
  ];

  for (const k of v2Keys) {
    if (patch[k] !== undefined) {
      v1[k] = patch[k];
    }
  }
  // Also allow v1 fields for convenience
  for (const k of ["display_name", "grade", "school_year", "learning_preferences"]) {
    if (patch[k] !== undefined) v1[k] = patch[k];
  }
  v1.schema_version = 2;
  v1.updated_at = new Date().toISOString();

  await fs.writeFile(file, JSON.stringify(v1, null, 2) + "\n", "utf8");
  return v1;
}
