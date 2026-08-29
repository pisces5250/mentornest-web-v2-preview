// Tests: student_profile_v2 + backward compat
// Run with: node --test test/student_profile_v2.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readProfileV2, updateProfileV2 } from "../lib/student_profile_v2.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const STUDENT_FILE = "/home/node/.openclaw/workspace/data/students/student_001.json";
const BACKUP_FILE = "/tmp/student_001.v2-test-backup.json";

before(async () => {
  await fs.copyFile(STUDENT_FILE, BACKUP_FILE);
});

after(async () => {
  await fs.copyFile(BACKUP_FILE, STUDENT_FILE);
  await fs.unlink(BACKUP_FILE);
});

test("readProfileV2 returns v1 fields plus v2 defaults", async () => {
  const r = await readProfileV2("student_001");
  assert.equal(r.found, true);
  assert.equal(r.profile.student_id, "student_001");
  assert.equal(r.profile.display_name, "奐奐");
  assert.equal(r.profile.grade, 5);
  assert.equal(r.profile.schema_version, 2);
  assert.equal(r.profile.school_curriculum, null);
  assert.deepEqual(r.profile.textbook_version, {});
  assert.deepEqual(r.profile.learning_goals, []);
});

test("does not mutate the existing v1 file", async () => {
  const r = await readProfileV2("student_001");
  // We should NOT have written to disk just by reading
  const raw = await fs.readFile(STUDENT_FILE, "utf8");
  const onDisk = JSON.parse(raw);
  assert.equal(onDisk.schema_version, undefined, "v1 file should not have schema_version written");
  assert.equal(r.profile.schema_version, 2, "but the merged view should report v2");
});

test("updateProfileV2: adds v2 fields and preserves v1", async () => {
  const before = JSON.parse(await fs.readFile(STUDENT_FILE, "utf8"));
  const updated = await updateProfileV2("student_001", {
    school_curriculum: "taiwan-12-year-curriculum",
    textbook_version: {
      math: { publisher: "康軒", edition: "2024", volume: "5上" },
    },
    learning_goals: [
      {
        goal_id: "g1",
        subject: "math",
        description: "熟練異分母分數加減",
        status: "active",
        created_by: "parent",
      },
    ],
  });
  assert.equal(updated.display_name, "奐奐", "v1 field preserved");
  assert.equal(updated.grade, 5, "v1 field preserved");
  assert.equal(updated.school_curriculum, "taiwan-12-year-curriculum");
  assert.equal(updated.textbook_version.math.publisher, "康軒");
  assert.equal(updated.learning_goals.length, 1);
  assert.equal(updated.schema_version, 2);
  // And the on-disk file is now v2-augmented
  const onDisk = JSON.parse(await fs.readFile(STUDENT_FILE, "utf8"));
  assert.equal(onDisk.schema_version, 2);
  assert.equal(onDisk.school_curriculum, "taiwan-12-year-curriculum");
});

test("updateProfileV2: rejects invalid student_id", async () => {
  await assert.rejects(() => updateProfileV2("BAD", { grade: 3 }));
});

test("updateProfileV2: does NOT silently add school_name (it must be explicit)", async () => {
  // After previous test, the file has v2 fields. Now patch with no school_name.
  const updated = await updateProfileV2("student_001", { grade: 5 });
  assert.equal(updated.school_name, undefined, "school_name must not be auto-collected");
});

test("readProfileV2 for non-existent student returns found=false", async () => {
  const r = await readProfileV2("student_does_not_exist");
  assert.equal(r.found, false);
});
