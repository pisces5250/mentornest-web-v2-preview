// Tests: english_specialist
// Run with: node --test test/english_specialist.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  diagnoseEnglishResponse,
  analyzeReadingComprehensionEnglish,
  transcribeAndGradeOralResponse,
  evaluateConversationTurn,
  englishSpecialistDecide,
  englishToPhonicsMap,
  emitEvidence,
} from "../lib/english_specialist.mjs";

const WORKSPACE = "/home/node/.openclaw/workspace";
const TEST_STUDENT = "student_t_eng";
const EVIDENCE_FILE = path.join(WORKSPACE, "data/mastery-evidence", `${TEST_STUDENT}.jsonl`);
const MASTERY_FILE = path.join(WORKSPACE, "data/mastery", `${TEST_STUDENT}.json`);
// ─────────────────────────────────────
// diagnoseEnglishResponse
// ─────────────────────────────────────

test("diagnoseEnglishResponse: correct exact match", () => {
  const r = diagnoseEnglishResponse({
    stem: "What color is the sky?",
    student_answer: "blue",
    expected_answer: "blue",
    knowledge_point: "english.G2.VOC.basic-vocab",
    grade: 2,
    student_id: 'student_t_eng',
  });
  assert.equal(r.correct, true);
  assert.equal(r.hint_level, 0);
  assert.deepEqual(r.error_codes, []);
});

test("diagnoseEnglishResponse: tolerant article match (a vs the)", () => {
  const r = diagnoseEnglishResponse({
    stem: "What is on the table?",
    student_answer: "a book",
    expected_answer: "the book",
    knowledge_point: "english.G2.VOC.basic-vocab",
    grade: 2,
  });
  // Should be considered correct (tolerant article matching).
  assert.equal(r.correct, true);
  assert.equal(r.hint_level, 0);
});

test("diagnoseEnglishResponse: wrong vocab → EN-VOC-* family", () => {
  const r = diagnoseEnglishResponse({
    stem: "I ___ happy.",
    student_answer: "am",
    expected_answer: "is",
    knowledge_point: "english.G4.GRAMMAR.present-simple",
    grade: 4,
  });
  assert.equal(r.correct, false);
  assert.equal(r.hint_level, 1);
  assert.ok(r.error_codes.length > 0);
});

test("diagnoseEnglishResponse: explicit error_code is preserved", () => {
  const r = diagnoseEnglishResponse({
    stem: "spell: knife",
    student_answer: "nife",
    expected_answer: "knife",
    knowledge_point: "english.G3.SPELL.silent-letters",
    grade: 3,
    error_code: "EN-PHON-SILENT",
  });
  assert.equal(r.correct, false);
  assert.ok(r.error_codes.includes("EN-PHON-SILENT"));
  assert.match(r.hint_text_zh, /不發音/);
});

test("diagnoseEnglishResponse: emits evidence_payload with english subject", () => {
  const r = diagnoseEnglishResponse({
    stem: "Question?",
    student_answer: "yes",
    expected_answer: "yes",
    knowledge_point: "english.G2.VOC.basic-vocab",
    student_id: 'student_t_eng',
  });
  assert.equal(r.evidence_payload.subject, "english");
  assert.equal(r.evidence_payload.schema_version, "english-specialist-evidence-v1");
});

test("diagnoseEnglishResponse: oral mode adds ambiguity flag", () => {
  const r = diagnoseEnglishResponse({
    stem: "Question?",
    student_answer: "no",
    expected_answer: "yes",
    knowledge_point: "english.G2.VOC.basic-vocab",
    mode: "oral",
    transcript_metadata: { ambiguity_flag: true },
  });
  assert.equal(r.correct, false);
  assert.ok(r.error_codes.includes("EN-STT-AMBIG"));
});

// ─────────────────────────────────────
// analyzeReadingComprehensionEnglish
// ─────────────────────────────────────

test("analyzeReadingComprehensionEnglish: explicit correct", () => {
  const r = analyzeReadingComprehensionEnglish({
    stem: "Tom went to the park on Monday. Where did Tom go?",
    student_answer: "the park",
    expected_answer: "the park",
    kind: "explicit",
  });
  assert.equal(r.kind, "explicit");
  assert.equal(r.correct, true);
});

test("analyzeReadingComprehensionEnglish: explicit wrong", () => {
  const r = analyzeReadingComprehensionEnglish({
    stem: "Tom went to the park on Monday. Where did Tom go?",
    student_answer: "school",
    expected_answer: "the park",
    kind: "explicit",
  });
  assert.equal(r.correct, false);
  assert.match(r.error_code, /^EN-RD-/);
});

test("analyzeReadingComprehensionEnglish: inference overgeneralization", () => {
  const r = analyzeReadingComprehensionEnglish({
    stem: "The author mentions one bad experience.",
    student_answer: "The author always fails at everything.",
    expected_answer: "The author felt disappointed that one time.",
    kind: "inference",
  });
  assert.equal(r.correct, false);
  assert.equal(r.error_code, "EN-RD-INF-OVER");
});

test("analyzeReadingComprehensionEnglish: main_idea correct via keyword match", () => {
  const r = analyzeReadingComprehensionEnglish({
    stem: "Reading is important for children.",
    student_answer: "the importance of reading",
    expected_answer: "the importance of reading",
    kind: "main_idea",
  });
  assert.equal(r.correct, true);
  assert.ok(r.matched_keywords.includes("importance") || r.matched_keywords.includes("reading"));
});

test("analyzeReadingComprehensionEnglish: vocab_in_context wrong → EN-VOC-*", () => {
  const r = analyzeReadingComprehensionEnglish({
    stem: "The dog is large.",
    student_answer: "small",
    expected_answer: "large",
    kind: "vocab_in_context",
  });
  assert.equal(r.correct, false);
  assert.match(r.error_code, /^EN-/);
});

test("analyzeReadingComprehensionEnglish: author_purpose wrong", () => {
  const r = analyzeReadingComprehensionEnglish({
    stem: "Read this article about climate change.",
    student_answer: "to scare people",
    expected_answer: "to inform readers about climate change",
    kind: "author_purpose",
  });
  assert.equal(r.correct, false);
});

test("analyzeReadingComprehensionEnglish: invalid kind rejected", () => {
  assert.throws(() =>
    analyzeReadingComprehensionEnglish({
      stem: "?",
      student_answer: "?",
      expected_answer: "?",
      kind: "bogus",
    })
  );
});

// ─────────────────────────────────────
// transcribeAndGradeOralResponse
// ─────────────────────────────────────

test("transcribeAndGradeOralResponse: produces STT request + grader", () => {
  const r = transcribeAndGradeOralResponse({
    student_id: 'student_t_eng',
    audio_path: null,
    transcript: null,
    knowledge_point: "english.G3.SPEAK.basic-phrase",
    stem: "How are you?",
    expected_answer: "I am fine, thank you.",
    locale: "en-US",
  });
  assert.equal(r.stt_request.provider, "sensevoice_local");
  assert.equal(r.stt_request.expected_format, "zh-en-mixed");
  assert.equal(r.stt_request.auto_invoke, false);
  assert.equal(typeof r.post_transcription_grade, "function");
});

test("transcribeAndGradeOralResponse: post_transcription_grade grades correct", () => {
  const { post_transcription_grade } = transcribeAndGradeOralResponse({
    student_id: 'student_t_eng',
    audio_path: null,
    transcript: null,
    knowledge_point: "english.G2.SPEAK.basic-phrase",
    stem: "How are you?",
    expected_answer: "I am fine, thank you.",
    locale: "en-US",
  });
  const g = post_transcription_grade({ transcript: "I am fine, thank you." });
  assert.equal(g.correct, true);
  assert.equal(g.result, "correct");
});

test("transcribeAndGradeOralResponse: post_transcription_grade flags ambiguous", () => {
  const { post_transcription_grade } = transcribeAndGradeOralResponse({
    student_id: 'student_t_eng',
    audio_path: null,
    transcript: null,
    knowledge_point: "english.G2.SPEAK.basic-phrase",
    stem: "How are you?",
    expected_answer: "I am fine, thank you.",
    locale: "en-US",
  });
  const g = post_transcription_grade({ transcript: "" });
  assert.equal(g.correct, false);
  assert.equal(g.transcript_metadata.ambiguity_flag, true);
  assert.equal(g.result, "ambiguous");
});

test("transcribeAndGradeOralResponse: post_transcription_grade phonetic confusion flag", () => {
  const { post_transcription_grade } = transcribeAndGradeOralResponse({
    student_id: 'student_t_eng',
    audio_path: null,
    transcript: null,
    knowledge_point: "english.G3.SPEAK.basic-phrase",
    stem: "Question?",
    expected_answer: "their house",
    locale: "en-US",
  });
  const g = post_transcription_grade({ transcript: "there house" });
  assert.equal(g.transcript_metadata.phonetic_confusion_flag, true);
});

// ─────────────────────────────────────
// evaluateConversationTurn
// ─────────────────────────────────────

test("evaluateConversationTurn: greeting detected", () => {
  const r = evaluateConversationTurn({
    conversation_history: [],
    student_turn: "Hello!",
    target_features: ["greeting"],
  });
  assert.equal(r.feature_pass.greeting, true);
});

test("evaluateConversationTurn: politeness missing", () => {
  const r = evaluateConversationTurn({
    conversation_history: [],
    student_turn: "Give me that.",
    target_features: ["politeness"],
  });
  assert.equal(r.feature_pass.politeness, false);
  assert.equal(r.feedback_lines.length, 1);
});

test("evaluateConversationTurn: answer_question requires keyword overlap", () => {
  const r = evaluateConversationTurn({
    conversation_history: [
      { role: "assistant", text: "What is your favorite color?" },
    ],
    student_turn: "My favorite color is blue.",
    target_features: ["answer_question"],
  });
  assert.equal(r.feature_pass.answer_question, true);
});

test("evaluateConversationTurn: ask_back detected", () => {
  const r = evaluateConversationTurn({
    conversation_history: [],
    student_turn: "What about you?",
    target_features: ["ask_back"],
  });
  assert.equal(r.feature_pass.ask_back, true);
});

// ─────────────────────────────────────
// englishSpecialistDecide
// ─────────────────────────────────────

test("englishSpecialistDecide: phonics subskill → drill_phonics", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G3.PHONE.letter-sound",
    attempts: 3,
    error_codes: ["EN-PHON-LS"],
  });
  assert.equal(r.action, "drill_phonics");
});

test("englishSpecialistDecide: vocab subskill → vocab_drill", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G4.VOC.basic-vocab",
    attempts: 3,
    error_codes: ["EN-VOC-COLLOC"],
  });
  assert.equal(r.action, "vocab_drill");
});

test("englishSpecialistDecide: reading subskill → reading_scaffold", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G5.READ.passage-inference",
    attempts: 3,
    error_codes: ["EN-RD-EXP-MISSED"],
  });
  assert.equal(r.action, "reading_scaffold");
});

test("englishSpecialistDecide: speaking subskill → oral_practice", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G5.SPEAK.short-dialog",
    attempts: 3,
    error_codes: ["EN-SPK-PRON"],
  });
  assert.equal(r.action, "oral_practice");
});

test("englishSpecialistDecide: conversation subskill → conversation_practice", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G5.CONV.short-dialog",
    attempts: 1,
  });
  assert.equal(r.action, "conversation_practice");
});

test("englishSpecialistDecide: mastery high → mastery_check", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G5.READ.passage-inference",
    attempts: 3,
    mastery: 0.9,
  });
  assert.equal(r.action, "mastery_check");
});

test("englishSpecialistDecide: representation stuck → backtrack", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G3.VOC.basic-vocab",
    attempts: 5,
    representation_history: ["text", "text", "text", "text"],
  });
  assert.equal(r.action, "backtrack_prerequisite");
});

test("englishSpecialistDecide: oral mode → oral_practice", () => {
  const r = englishSpecialistDecide({
    student_id: 'student_t_eng',
    knowledge_point: "english.G3.VOC.basic-vocab",
    attempts: 2,
    mode: "oral",
  });
  assert.equal(r.action, "oral_practice");
});

// ─────────────────────────────────────
// englishToPhonicsMap
// ─────────────────────────────────────

test("englishToPhonicsMap: known word returns phonemes", () => {
  const r = englishToPhonicsMap({ word: "cat" });
  assert.equal(r.found, true);
  assert.deepEqual(r.phonemes, ["k", "æ", "t"]);
});

test("englishToPhonicsMap: unknown word returns gap entry", () => {
  const r = englishToPhonicsMap({ word: "xyzqwerty" });
  assert.equal(r.found, false);
  assert.match(r.gap_note, /gap|unknown|V1|production/i);
});

test("englishToPhonicsMap: empty word returns gap", () => {
  const r = englishToPhonicsMap({ word: "" });
  assert.equal(r.found, false);
  assert.equal(r.gap_note, "empty-word");
});

// ─────────────────────────────────────
// emitEvidence
// ─────────────────────────────────────

test("emitEvidence: factory requires student_id + subject + knowledge_point", () => {
  const e = emitEvidence({
    student_id: 'student_t_eng',
    subject: "english",
    knowledge_point: "english.G3.PHONE.letter-sound",
    subskill: "phonics",
    error_code: ["EN-PHON-LS"],
    result: "incorrect",
    diagnosis: { reason: "test" },
    emitted_by: "test",
  });
  assert.equal(e.schema_version, "english-specialist-evidence-v1");
  assert.equal(e.student_id, 'student_t_eng');
  assert.equal(e.subject, "english");
  assert.deepEqual(e.error_codes, ["EN-PHON-LS"]);
});

test("emitEvidence: factory requires student_id", () => {
  assert.throws(() =>
    emitEvidence({
      student_id: "",
      subject: "english",
      knowledge_point: "english.G3.PHONE.letter-sound",
    })
  );
});

test.after(async () => {
  await fs.unlink(EVIDENCE_FILE).catch(() => {});
  await fs.unlink(MASTERY_FILE).catch(() => {});
  await fs.rm(path.join(WORKSPACE, "data/curriculum-progress", `${TEST_STUDENT}.jsonl`), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(WORKSPACE, "data/mastery-backfill", TEST_STUDENT), { recursive: true, force: true }).catch(() => {});
});
