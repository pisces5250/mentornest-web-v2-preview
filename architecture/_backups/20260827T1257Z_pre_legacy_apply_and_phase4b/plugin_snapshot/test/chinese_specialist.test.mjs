// Tests: chinese_specialist
// Run with: node --test test/chinese_specialist.test.mjs
//
// Covers:
//   - diagnoseChineseResponse (字詞 errors)
//   - analyzeReadingComprehension (閱讀理解 kinds)
//   - evaluateCompositionScaffolding (作文 scaffolding)
//   - buildWritingFeedback
//   - chineseSpecialistDecide
//   - emitEvidence factory
//   - matchVocabularyToKnowledgePoint

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  diagnoseChineseResponse,
  analyzeReadingComprehension,
  evaluateCompositionScaffolding,
  buildWritingFeedback,
  chineseSpecialistDecide,
  emitEvidence,
  matchVocabularyToKnowledgePoint,
} from "../lib/chinese_specialist.mjs";

const WORKSPACE = "/home/node/.openclaw/workspace";
const TEST_STUDENT = "student_t_chs";
const EVIDENCE_FILE = path.join(WORKSPACE, "data/mastery-evidence", `${TEST_STUDENT}.jsonl`);
const MASTERY_FILE = path.join(WORKSPACE, "data/mastery", `${TEST_STUDENT}.json`);

test.after(async () => {
  // Clean up any per-student evidence ledger, mastery file, or curriculum-progress/backfill
  // artifacts the suite may have created. Safe even if the file never existed (ENOENT ignored).
  await fs.unlink(EVIDENCE_FILE).catch(() => {});
  await fs.unlink(MASTERY_FILE).catch(() => {});
  await fs.rm(path.join(WORKSPACE, "data/curriculum-progress", `${TEST_STUDENT}.jsonl`), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(WORKSPACE, "data/mastery-backfill", TEST_STUDENT), { recursive: true, force: true }).catch(() => {});
});

// ─────────────────────────────────────
// 字詞 (vocabulary / character) errors
// ─────────────────────────────────────

test("diagnoseChineseResponse: correct answer has hint_level 0", () => {
  const r = diagnoseChineseResponse({
    stem: "下面哪一個字和「做」讀音相同？",
    student_answer: "作",
    expected_answer: "作",
    knowledge_point: "chinese.G3.VOC.common-vocab",
    grade: 3,
    student_id: 'student_t_chs',
  });
  assert.equal(r.correct, true);
  assert.equal(r.hint_level, 0);
  assert.equal(r.error_code, null);
  assert.ok(r.evidence_payload);
  assert.ok(r.diagnosis_payload);
});

test("diagnoseChineseResponse: wrong same-shape char → infer ZH-ZI-HOMO", () => {
  const r = diagnoseChineseResponse({
    stem: "選出正確的字",
    student_answer: "在",
    expected_answer: "再",
    knowledge_point: "chinese.G3.VOC.common-vocab",
    grade: 3,
  });
  assert.equal(r.correct, false);
  assert.ok(["ZH-ZI-HOMO", "ZH-WR-WRONG-CHAR"].includes(r.error_code), `got ${r.error_code}`);
});

test("diagnoseChineseResponse: explicit error_taxonomy_code is preserved", () => {
  const r = diagnoseChineseResponse({
    stem: "選出正確的成語",
    student_answer: "畫龍點睛",
    expected_answer: "畫蛇添足",
    knowledge_point: "chinese.G5.IDIOM.basic-idiom",
    grade: 5,
    error_taxonomy_code: "ZH-IDM-VALENCE",
  });
  assert.equal(r.correct, false);
  assert.equal(r.error_code, "ZH-IDM-VALENCE");
  assert.equal(r.error_subtype, "成語");
});

test("diagnoseChineseResponse: missing char → ZH-WR-MISSING-CHAR", () => {
  const r = diagnoseChineseResponse({
    stem: "寫出完整句子",
    student_answer: "他高興",
    expected_answer: "他很高興",
    knowledge_point: "chinese.G2.WRITE.simple-sentence",
    grade: 2,
  });
  assert.equal(r.correct, false);
  assert.equal(r.error_code, "ZH-WR-MISSING-CHAR");
});

test("emitEvidence: factory requires student_id + subject + knowledge_point", () => {
  const e = emitEvidence({
    student_id: 'student_t_chs',
    subject: "chinese",
    knowledge_point: "chinese.G3.VOC.common-vocab",
    subskill: "詞",
    error_code: "ZH-ZI-HOMO",
    result: "incorrect",
    diagnosis: { reason: "test" },
    emitted_by: "test",
  });
  assert.equal(e.schema_version, "chinese-specialist-evidence-v1");
  assert.equal(e.student_id, 'student_t_chs');
  assert.equal(e.subject, "chinese");
  assert.equal(e.error_code, "ZH-ZI-HOMO");
});

// ─────────────────────────────────────
// 閱讀理解 (reading comprehension)
// ─────────────────────────────────────

test("analyzeReadingComprehension: explicit-info correct match", () => {
  const r = analyzeReadingComprehension({
    stem: "小明在2020年5月10日到台北參加比賽。請問比賽日期？",
    student_answer: "5月10日",
    expected_answer: "5月10日",
    kind: "explicit",
  });
  assert.equal(r.kind, "explicit");
  assert.equal(r.correct, true);
});

test("analyzeReadingComprehension: explicit-info wrong → ZH-RD-EXP-*", () => {
  const r = analyzeReadingComprehension({
    stem: "小明在2020年5月10日到台北參加比賽。請問比賽日期？",
    student_answer: "六月",
    expected_answer: "5月10日",
    kind: "explicit",
  });
  assert.equal(r.correct, false);
  assert.match(r.error_code, /^ZH-RD-EXP-/);
});

test("analyzeReadingComprehension: inference overgeneralization → ZH-RD-INF-OVER", () => {
  const r = analyzeReadingComprehension({
    stem: "作者只提了一次失敗的經驗。",
    student_answer: "作者一定覺得所有事情都很失敗",
    expected_answer: "作者對那次失敗感到失望",
    kind: "inference",
  });
  assert.equal(r.correct, false);
  assert.equal(r.error_code, "ZH-RD-INF-OVER");
  assert.equal(r.rationales.overgeneralization_flag, true);
});

test("analyzeReadingComprehension: main_idea off-topic → ZH-RD-MI-OFF", () => {
  const r = analyzeReadingComprehension({
    stem: "本文談論閱讀的重要。",
    student_answer: "運動的好處",
    expected_answer: "閱讀的重要",
    kind: "main_idea",
  });
  assert.equal(r.correct, false);
  assert.equal(r.error_code, "ZH-RD-MI-OFF");
});

test("analyzeReadingComprehension: structure error → ZH-STR-TRANSITION", () => {
  const r = analyzeReadingComprehension({
    stem: "段落A。段落B。",
    student_answer: "段落斷裂",
    expected_answer: "過渡順暢",
    kind: "structure",
  });
  assert.equal(r.correct, false);
  assert.equal(r.error_code, "ZH-STR-TRANSITION");
});

test("analyzeReadingComprehension: invalid kind rejected", () => {
  assert.throws(() =>
    analyzeReadingComprehension({
      stem: "?",
      student_answer: "?",
      expected_answer: "?",
      kind: "bogus",
    })
  );
});

// ─────────────────────────────────────
// 作文 scaffolding
// ─────────────────────────────────────

test("evaluateCompositionScaffolding: well-structured essay scores high", () => {
  const r = evaluateCompositionScaffolding({
    prompt: "我的家庭",
    student_text:
      "今天我想介紹我的家庭。首先，我有爸爸媽媽和我。爸爸喜歡運動。媽媽喜歡讀書。我也喜歡讀書和運動。總之，我們家是一個幸福的家庭。\n\n" +
      "我們經常一起吃飯。例如週末會去公園。每個人都有自己的興趣。這讓我們家更熱鬧。\n\n" +
      "總之，我很愛我的家。希望未來我們能一起完成更多的事。",
    grade: 5,
    target_word_count: 100,
  });
  assert.ok(r.structure_score >= 0.5, `structure_score=${r.structure_score}`);
  assert.ok(r.organization_score >= 0.5, `organization_score=${r.organization_score}`);
  assert.ok(Array.isArray(r.feedback_lines));
  assert.ok(r.evidence_payload);
});

test("evaluateCompositionScaffolding: weak essay gets feedback", () => {
  const r = evaluateCompositionScaffolding({
    prompt: "我的朋友",
    student_text: "我有一個朋友。他叫小華。",
    grade: 5,
    target_word_count: 100,
  });
  assert.ok(r.feedback_lines.length >= 2);
  const cats = r.feedback_lines.map((l) => l.category);
  assert.ok(cats.includes("structure") || cats.includes("content"), `got ${cats.join(",")}`);
});

test("buildWritingFeedback: feature_pass map covers all targets", () => {
  const r = buildWritingFeedback({
    student_text: "這是一個故事。它很短。",
    grade: 4,
    target_features: ["paragraph", "thesis", "evidence", "transition", "conclusion"],
  });
  assert.equal(Object.keys(r.feature_pass).length, 5);
  // Empty essay should fail most features.
  assert.equal(r.feature_pass.paragraph, false);
});

test("buildWritingFeedback: prioritized_feedback sorted by severity", () => {
  const r = buildWritingFeedback({
    student_text: "短文",
    grade: 5,
    target_features: ["paragraph", "thesis", "transition"],
  });
  // thesis is "block" severity — should be first.
  assert.equal(r.prioritized_feedback[0].feature, "thesis");
});

// ─────────────────────────────────────
// chineseSpecialistDecide
// ─────────────────────────────────────

test("chineseSpecialistDecide: 字 subskill → vocabulary_drill after retries", () => {
  const r = chineseSpecialistDecide({
    student_id: 'student_t_chs',
    knowledge_point: "chinese.G3.VOC.common-vocab",
    attempts: 3,
    error_code: "ZH-ZI-FORM",
  });
  assert.equal(r.action, "vocabulary_drill");
});

test("chineseSpecialistDecide: 應用 subskill → reading_scaffold", () => {
  const r = chineseSpecialistDecide({
    student_id: 'student_t_chs',
    knowledge_point: "chinese.G5.READ.inference-implicit",
    attempts: 3,
    error_code: "ZH-RD-EXP-MISSED",
  });
  assert.equal(r.action, "reading_scaffold");
});

test("chineseSpecialistDecide: 段/篇 → writing_scaffold", () => {
  const r = chineseSpecialistDecide({
    student_id: 'student_t_chs',
    knowledge_point: "chinese.G5.WRITE.paragraph",
    attempts: 3,
    error_code: "ZH-STR-TIME",
  });
  assert.equal(r.action, "writing_scaffold");
});

test("chineseSpecialistDecide: high mastery → mastery_check", () => {
  const r = chineseSpecialistDecide({
    student_id: 'student_t_chs',
    knowledge_point: "chinese.G5.READ.inference-implicit",
    attempts: 3,
    mastery: 0.9,
  });
  assert.equal(r.action, "mastery_check");
});

test("chineseSpecialistDecide: representation stuck → backtrack", () => {
  const r = chineseSpecialistDecide({
    student_id: 'student_t_chs',
    knowledge_point: "chinese.G3.VOC.common-vocab",
    attempts: 5,
    representation_history: ["text", "text", "text", "text"],
  });
  assert.equal(r.action, "backtrack_prerequisite");
});

// ─────────────────────────────────────
// matchVocabularyToKnowledgePoint
// ─────────────────────────────────────

test("matchVocabularyToKnowledgePoint: returns matches + canonical word", () => {
  const r = matchVocabularyToKnowledgePoint({
    word: "topic",
    knowledge_point: "chinese.G3.VOC.common-vocab",
  });
  assert.equal(r.canonical_word, "topic");
  assert.ok(r.matches.length > 0, "expected at least one match");
});

test("matchVocabularyToKnowledgePoint: empty word returns empty matches", () => {
  const r = matchVocabularyToKnowledgePoint({ word: "", knowledge_point: "chinese.G3.VOC.x" });
  assert.deepEqual(r.matches, []);
});

test("matchVocabularyToKnowledgePoint: matches sorted by score desc", () => {
  const r = matchVocabularyToKnowledgePoint({
    word: "common",
    knowledge_point: "chinese.G4.READ.main-idea-multi",
  });
  assert.ok(r.matches.length >= 2);
  for (let i = 1; i < r.matches.length; i++) {
    assert.ok(r.matches[i - 1].score >= r.matches[i].score);
  }
});