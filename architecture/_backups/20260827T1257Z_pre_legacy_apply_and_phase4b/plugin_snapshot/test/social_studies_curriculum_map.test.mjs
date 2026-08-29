// test/social_studies_curriculum_map.test.mjs — read-only YAML wrapper tests

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupSocialStudiesKP,
  listSocialStudiesKPForGrade,
  gradeAppropriateSocialStudiesTopic,
} from "../lib/social_studies_curriculum_map.mjs";

test("lookupSocialStudiesKP: returns KP record for G3", async () => {
  const r = await lookupSocialStudiesKP({
    knowledge_point: "social.G3.COMMUNITY.family-and-neighborhood",
  });
  assert.equal(r.found, true);
  assert.equal(r.grade, 3);
  assert.equal(r.curriculum_doc, "tw-12yrc-social-v1");
});

test("lookupSocialStudiesKP: returns KP record for G4 timeline", async () => {
  const r = await lookupSocialStudiesKP({ knowledge_point: "social.G4.TIME.timeline" });
  assert.equal(r.found, true);
  assert.equal(r.grade, 4);
  assert.equal(r.stage, "四上");
});

test("lookupSocialStudiesKP: returns KP record for G5 history", async () => {
  const r = await lookupSocialStudiesKP({
    knowledge_point: "social.G5.HISTORY.taiwan-early",
  });
  assert.equal(r.found, true);
  assert.equal(r.grade, 5);
});

test("lookupSocialStudiesKP: returns KP record for G6 history", async () => {
  const r = await lookupSocialStudiesKP({
    knowledge_point: "social.G6.HISTORY.taiwan-modern",
  });
  assert.equal(r.found, true);
  assert.equal(r.grade, 6);
});

test("lookupSocialStudiesKP: unknown KP returns found=false", async () => {
  const r = await lookupSocialStudiesKP({
    knowledge_point: "social.G99.NOT-A-KP",
  });
  assert.equal(r.found, false);
});

test("lookupSocialStudiesKP: empty KP returns found=false", async () => {
  const r = await lookupSocialStudiesKP({ knowledge_point: "" });
  assert.equal(r.found, false);
});

test("listSocialStudiesKPForGrade: G3 returns ≥1 KP", async () => {
  const r = await listSocialStudiesKPForGrade({ grade: 3 });
  assert.equal(r.found, true);
  assert.ok(r.knowledge_points.length >= 1);
});

test("listSocialStudiesKPForGrade: G4 returns ≥1 KP", async () => {
  const r = await listSocialStudiesKPForGrade({ grade: 4 });
  assert.equal(r.found, true);
  assert.ok(r.knowledge_points.length >= 1);
});

test("listSocialStudiesKPForGrade: G99 returns found=false", async () => {
  const r = await listSocialStudiesKPForGrade({ grade: 99 });
  assert.equal(r.found, false);
});

test("gradeAppropriateSocialStudiesTopic: G3 is appropriate", () => {
  const r = gradeAppropriateSocialStudiesTopic({
    grade: 3,
    knowledge_point: "social.G3.COMMUNITY.family-and-neighborhood",
    description: "家庭與社區",
  });
  assert.equal(r.appropriate, true);
  assert.equal(r.age_appropriate, true);
});

test("gradeAppropriateSocialStudiesTopic: out-of-range grade flagged", () => {
  const r = gradeAppropriateSocialStudiesTopic({
    grade: 99,
    knowledge_point: "x",
    description: "y",
  });
  assert.equal(r.appropriate, false);
  assert.match(r.note, /G1-G6/);
});