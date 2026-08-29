import test from "node:test";
import assert from "node:assert/strict";
import {
  validateParentSetupPayload,
  COPY_ZH_TW,
  PARENT_SETUP_SCHEMA_VERSION,
  FIELD_REQUIRED,
  FIELD_RECOMMENDED,
  FIELD_OPTIONAL,
  FIELD_FORBIDDEN_IN_PARENT_PAYLOAD,
} from "../lib/parent_setup_schema.mjs";

test("taxonomy: required vs recommended vs optional vs forbidden", () => {
  // required must include display_name + school_year
  assert.ok(FIELD_REQUIRED.includes("display_name"));
  assert.ok(FIELD_REQUIRED.includes("school_year"));
  // school_name and class_name are explicitly OPTIONAL but advanced-only
  assert.ok(FIELD_OPTIONAL.includes("school_name"));
  assert.ok(FIELD_OPTIONAL.includes("class_name"));
  assert.equal(COPY_ZH_TW.school_name.advanced_only, true);
  assert.equal(COPY_ZH_TW.class_name.advanced_only, true);
  // school_progress is curriculum-agent's job; parent payload must reject it
  assert.ok(FIELD_FORBIDDEN_IN_PARENT_PAYLOAD.includes("school_progress"));
});

test("zh-TW copy: required fields have title/description/hint/required=true", () => {
  assert.equal(typeof COPY_ZH_TW.display_name.title, "string");
  assert.equal(typeof COPY_ZH_TW.display_name.description, "string");
  assert.equal(typeof COPY_ZH_TW.display_name.hint, "string");
  assert.equal(COPY_ZH_TW.display_name.required, true);
});

test("zh-TW copy: optional fields have skip_label", () => {
  assert.equal(typeof COPY_ZH_TW.textbook_version.skip_label, "string");
  assert.equal(typeof COPY_ZH_TW.learning_goals.skip_label, "string");
  assert.equal(typeof COPY_ZH_TW.parent_concerns.skip_label, "string");
});

test("zh-TW copy: school_name and class_name are advanced_only with skip_label", () => {
  assert.equal(COPY_ZH_TW.school_name.advanced_only, true);
  assert.equal(typeof COPY_ZH_TW.school_name.skip_label, "string");
  assert.equal(COPY_ZH_TW.class_name.advanced_only, true);
  assert.equal(typeof COPY_ZH_TW.class_name.skip_label, "string");
});

test("validateParentSetupPayload: minimal valid payload (only required)", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
  });
  assert.equal(r.ok, true);
  assert.equal(r.normalized.display_name, "小宇");
  assert.equal(r.normalized.school_year, "2026");
  assert.equal(r.normalized.schema_version, PARENT_SETUP_SCHEMA_VERSION);
  // Only required + schema_version + setup_completed_at should be present
  assert.ok(!("school_name" in r.normalized));
  assert.ok(!("class_name" in r.normalized));
});

test("validateParentSetupPayload: includes recommended when present", () => {
  const r = validateParentSetupPayload({
    display_name: "彤彤",
    school_year: "2026",
    grade: 5,
    school_curriculum: "教育部 十二年國民基本教育",
  });
  assert.equal(r.ok, true);
  assert.equal(r.normalized.grade, 5);
  assert.equal(r.normalized.school_curriculum, "教育部 十二年國民基本教育");
});

test("validateParentSetupPayload: rejects forbidden field school_progress", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
    school_progress: { foo: "bar" },
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /school_progress/);
});

test("validateParentSetupPayload: rejects forbidden field schema_version in payload", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
    schema_version: "profile-v3",
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /schema_version/);
});

test("validateParentSetupPayload: rejects missing required", () => {
  const r1 = validateParentSetupPayload({ display_name: "小宇" });
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /school_year missing/);
  const r2 = validateParentSetupPayload({ school_year: "2026" });
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /display_name missing/);
});

test("validateParentSetupPayload: rejects out-of-range grade", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
    grade: 13,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /grade must be integer/);
});

test("validateParentSetupPayload: rejects learning_goals too long", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
    learning_goals: "x".repeat(501),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /learning_goals too long/);
});

test("validateParentSetupPayload: school_name + class_name accepted ONLY when explicit", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
    school_name: "台北市中山國小",
    class_name: "五年三班",
  });
  assert.equal(r.ok, true);
  assert.equal(r.normalized.school_name, "台北市中山國小");
  assert.equal(r.normalized.class_name, "五年三班");
});

test("validateParentSetupPayload: school_name absent in normalized output when omitted", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
  });
  assert.equal(r.ok, true);
  assert.ok(!("school_name" in r.normalized));
  assert.ok(!("class_name" in r.normalized));
});

test("validateParentSetupPayload: rejects non-string types", () => {
  const r = validateParentSetupPayload({
    display_name: "小宇",
    school_year: "2026",
    grade: "5", // string, not integer
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /grade must be integer/);
});

test("validateParentSetupPayload: rejects null payload", () => {
  const r = validateParentSetupPayload(null);
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing/);
});

test("zh-TW copy: contains closing button label '開始學習'", () => {
  assert.match(COPY_ZH_TW.closing.button_done, /開始學習/);
});

test("zh-TW copy: welcome describes 'one-shot'", () => {
  // We promise "只需要回答一次" in the welcome
  assert.match(COPY_ZH_TW.welcome.description, /只需要回答一次/);
});

test("zh-TW copy: school_name and class_name strings include explicit warning", () => {
  assert.match(COPY_ZH_TW.school_name.description, /除非家長主動填寫/);
  assert.match(COPY_ZH_TW.class_name.description, /除非家長主動填寫/);
});
