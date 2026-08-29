// Tests: mastery_backfill classification
// Run with: node --test test/mastery_backfill_classify.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeResult,
  deriveSubject,
  deriveKnowledgePoint,
  deriveAttempts,
  deriveErrorCode,
  classifyEvent,
  buildDryRunReport,
  buildIdempotencyKey,
} from "../lib/mastery_backfill.mjs";

// ─── normalizeResult ──────────────────────────────────────────────────────────

describe("normalizeResult", () => {
  test("correct -> correct", () => assert.equal(normalizeResult("correct"), "correct"));
  test("incorrect -> incorrect", () => assert.equal(normalizeResult("incorrect"), "incorrect"));
  test("partially_correct -> partially_correct", () => assert.equal(normalizeResult("partially_correct"), "partially_correct"));
  test("mastered -> mastered", () => assert.equal(normalizeResult("mastered"), "mastered"));
  test("improved -> improved", () => assert.equal(normalizeResult("improved"), "improved"));
  test("right -> correct", () => assert.equal(normalizeResult("right"), "correct"));
  test("yes -> correct", () => assert.equal(normalizeResult("yes"), "correct"));
  test("ok -> correct", () => assert.equal(normalizeResult("ok"), "correct"));
  test("對 -> correct", () => assert.equal(normalizeResult("對"), "correct"));
  test("✓ -> correct", () => assert.equal(normalizeResult("✓"), "correct"));
  test("正确 -> correct", () => assert.equal(normalizeResult("正确"), "correct"));
  test("wrong -> incorrect", () => assert.equal(normalizeResult("wrong"), "incorrect"));
  test("no -> incorrect", () => assert.equal(normalizeResult("no"), "incorrect"));
  test("錯 -> incorrect", () => assert.equal(normalizeResult("錯"), "incorrect"));
  test("✗ -> incorrect", () => assert.equal(normalizeResult("✗"), "incorrect"));
  test("错误 -> incorrect", () => assert.equal(normalizeResult("错误"), "incorrect"));
  test("partial -> partially_correct", () => assert.equal(normalizeResult("partial"), "partially_correct"));
  test("partly -> partially_correct", () => assert.equal(normalizeResult("partly"), "partially_correct"));
  test("unknown -> incorrect", () => assert.equal(normalizeResult("unknown"), "incorrect"));
  test("null/undefined -> incorrect", () => assert.equal(normalizeResult(null), "incorrect"));
  test("empty string -> incorrect", () => assert.equal(normalizeResult(""), "incorrect"));
  test("whitespace only -> incorrect", () => assert.equal(normalizeResult("   "), "incorrect"));
});

// ─── deriveSubject ─────────────────────────────────────────────────────────────

describe("deriveSubject", () => {
  test("event with subject -> uses it", () => {
    assert.equal(deriveSubject({ subject: "math" }), "math");
    assert.equal(deriveSubject({ subject: "chinese" }), "chinese");
    assert.equal(deriveSubject({ subject: "english" }), "english");
  });

  test("event with subject containing whitespace -> trimmed", () => {
    assert.equal(deriveSubject({ subject: "  math  " }), "math");
  });

  test("no subject, kp prefix math. -> math", () => {
    assert.equal(deriveSubject({ knowledge_point: "math.fractions.add" }), "math");
  });

  test("no subject, kp prefix chinese. -> chinese", () => {
    assert.equal(deriveSubject({ knowledge_point: "chinese.G3.VOC" }), "chinese");
  });

  test("no subject, kp prefix chinese (no dot) -> chinese", () => {
    assert.equal(deriveSubject({ knowledge_point: "chineseReading" }), "chinese");
  });

  test("no subject, kp prefix english. -> english", () => {
    assert.equal(deriveSubject({ knowledge_point: "english.G3.VOC" }), "english");
  });

  test("no subject, kp prefix science. -> science", () => {
    assert.equal(deriveSubject({ knowledge_point: "science.light.optics" }), "science");
  });

  test("no subject, kp prefix social_studies. -> social_studies", () => {
    assert.equal(deriveSubject({ knowledge_point: "social_studies.history.taiwan" }), "social_studies");
  });

  test("no subject, kp with Chinese chars and no math prefix -> chinese", () => {
    assert.equal(deriveSubject({ knowledge_point: "異分母分數加法" }), "chinese");
  });

  test("no subject, no kp -> unknown", () => {
    assert.equal(deriveSubject({}), "unknown");
  });

  test("no subject, empty kp -> unknown", () => {
    assert.equal(deriveSubject({ knowledge_point: "" }), "unknown");
  });

  test("kp with mixed content but no recognized prefix -> unknown", () => {
    assert.equal(deriveSubject({ knowledge_point: "foobar" }), "unknown");
  });
});

// ─── deriveKnowledgePoint ─────────────────────────────────────────────────────

describe("deriveKnowledgePoint", () => {
  test("event with knowledge_point -> returns it", () => {
    assert.equal(deriveKnowledgePoint({ knowledge_point: "分數加法" }), "分數加法");
    assert.equal(deriveKnowledgePoint({ knowledge_point: "math.fractions" }), "math.fractions");
  });

  test("no knowledge_point, has unit -> returns unit", () => {
    assert.equal(deriveKnowledgePoint({ unit: "分數單元" }), "分數單元");
  });

  test("neither knowledge_point nor unit -> null", () => {
    assert.equal(deriveKnowledgePoint({}), null);
    assert.equal(deriveKnowledgePoint({ other: "field" }), null);
  });
});

// ─── deriveAttempts ────────────────────────────────────────────────────────────

describe("deriveAttempts", () => {
  test("numeric attempts >= 1 -> uses it", () => {
    assert.equal(deriveAttempts({ attempts: 1 }), 1);
    assert.equal(deriveAttempts({ attempts: 3 }), 3);
    assert.equal(deriveAttempts({ attempts: 10 }), 10);
  });

  test("non-numeric or < 1 -> defaults to 1", () => {
    assert.equal(deriveAttempts({ attempts: "1" }), 1);
    assert.equal(deriveAttempts({ attempts: 0 }), 1);
    assert.equal(deriveAttempts({ attempts: -1 }), 1);
    assert.equal(deriveAttempts({ attempts: null }), 1);
    assert.equal(deriveAttempts({ attempts: undefined }), 1);
  });

  test("no attempts field -> 1", () => {
    assert.equal(deriveAttempts({}), 1);
  });
});

// ─── deriveErrorCode ──────────────────────────────────────────────────────────

describe("deriveErrorCode", () => {
  test("error_code string -> returns it", () => {
    assert.equal(deriveErrorCode({ error_code: "concept_misunderstanding" }), "concept_misunderstanding");
  });

  test("error_codes array, first element string -> returns first", () => {
    assert.equal(deriveErrorCode({ error_codes: ["vocabulary_gap", "other"] }), "vocabulary_gap");
  });

  test("error_codes array, empty -> null", () => {
    assert.equal(deriveErrorCode({ error_codes: [] }), null);
  });

  test("no error code fields -> null", () => {
    assert.equal(deriveErrorCode({}), null);
  });
});

// ─── classifyEvent ────────────────────────────────────────────────────────────

describe("classifyEvent", () => {
  test("full legacy event -> correct classification", () => {
    const event = {
      timestamp: "2026-08-26T08:37:09Z",
      student_id: "student_001",
      subject: "math",
      knowledge_point: "分數加法",
      result: "correct",
      attempts: 1,
      hints: 0,
      error_type: "",
      review_needed: false,
    };
    const classified = classifyEvent(event);
    assert.equal(classified.subject, "math");
    assert.equal(classified.knowledge_point, "分數加法");
    assert.equal(classified.result, "correct");
    assert.equal(classified.attempts, 1);
    assert.equal(classified.error_code, null);
  });

  test("event with Chinese kp and no subject -> subject derived", () => {
    const event = {
      knowledge_point: "異分母分數加法",
      result: "correct",
      attempts: 2,
    };
    const classified = classifyEvent(event);
    assert.equal(classified.subject, "chinese");
    assert.equal(classified.knowledge_point, "異分母分數加法");
    assert.equal(classified.result, "correct");
    assert.equal(classified.attempts, 2);
  });

  test("event with error_code -> error_code passed through", () => {
    const event = {
      subject: "math",
      knowledge_point: "分數加法",
      result: "incorrect",
      error_code: "concept_misunderstanding",
    };
    const classified = classifyEvent(event);
    assert.equal(classified.error_code, "concept_misunderstanding");
  });

  test("event with wrong result free text -> normalized to incorrect", () => {
    const event = {
      subject: "math",
      knowledge_point: "分數加法",
      result: "wrong",
    };
    const classified = classifyEvent(event);
    assert.equal(classified.result, "incorrect");
  });

  test("event with multiple_choice_wrong error_type -> passes through", () => {
    const event = {
      subject: "math",
      knowledge_point: "分數加法",
      result: "correct",
      error_code: "multiple_choice_wrong",
    };
    const classified = classifyEvent(event);
    assert.equal(classified.error_code, "multiple_choice_wrong");
  });
});

// ─── buildIdempotencyKey ──────────────────────────────────────────────────────

describe("buildIdempotencyKey", () => {
  test("same inputs -> same key", () => {
    const ev1 = { timestamp: "2026-08-26T08:37:09Z", subject: "math", knowledge_point: "分數加法", result: "correct", attempts: 1 };
    const ev2 = { timestamp: "2026-08-26T08:37:09Z", subject: "math", knowledge_point: "分數加法", result: "correct", attempts: 1 };
    assert.equal(buildIdempotencyKey("student_001", ev1), buildIdempotencyKey("student_001", ev2));
  });

  test("different timestamp -> different key", () => {
    const ev1 = { timestamp: "2026-08-26T08:37:09Z", subject: "math", knowledge_point: "分數加法", result: "correct", attempts: 1 };
    const ev2 = { timestamp: "2026-08-26T08:37:10Z", subject: "math", knowledge_point: "分數加法", result: "correct", attempts: 1 };
    assert.notEqual(buildIdempotencyKey("student_001", ev1), buildIdempotencyKey("student_001", ev2));
  });

  test("different attempts -> different key", () => {
    const ev1 = { timestamp: "2026-08-26T08:37:09Z", subject: "math", knowledge_point: "分數加法", result: "correct", attempts: 1 };
    const ev2 = { timestamp: "2026-08-26T08:37:09Z", subject: "math", knowledge_point: "分數加法", result: "correct", attempts: 2 };
    assert.notEqual(buildIdempotencyKey("student_001", ev1), buildIdempotencyKey("student_001", ev2));
  });
});

// ─── buildDryRunReport ────────────────────────────────────────────────────────

describe("buildDryRunReport", () => {
  test("empty events -> empty report", () => {
    const report = buildDryRunReport("student_001", []);
    assert.equal(report.proposed_evidence_count, 0);
    assert.equal(report.would_apply, false);
    assert.deepEqual(report.proposed_records, []);
  });

  test("event with no kp -> skipped", () => {
    const events = [{ student_id: "student_001", result: "correct", attempts: 1 }];
    const report = buildDryRunReport("student_001", events);
    assert.equal(report.proposed_evidence_count, 0);
  });

  test("event with kp -> proposed", () => {
    const events = [{
      timestamp: "2026-08-26T08:37:09Z",
      student_id: "student_001",
      subject: "math",
      knowledge_point: "分數加法",
      result: "correct",
      attempts: 1,
    }];
    const report = buildDryRunReport("student_001", events);
    assert.equal(report.proposed_evidence_count, 1);
    assert.equal(report.would_apply, true);
    assert.equal(report.proposed_records[0].proposed_evidence.student_id, "student_001");
    assert.equal(report.proposed_records[0].proposed_evidence.subject, "math");
    assert.equal(report.proposed_records[0].proposed_evidence.knowledge_point, "分數加法");
    assert.equal(report.proposed_records[0].proposed_evidence.result, "correct");
    assert.equal(report.proposed_records[0].proposed_evidence.source, "legacy_backfill");
  });

  test("since/until filter works", () => {
    const events = [
      { timestamp: "2026-08-26T08:00:00Z", student_id: "student_001", subject: "math", knowledge_point: "kp1", result: "correct" },
      { timestamp: "2026-08-26T10:00:00Z", student_id: "student_001", subject: "math", knowledge_point: "kp2", result: "correct" },
      { timestamp: "2026-08-26T12:00:00Z", student_id: "student_001", subject: "math", knowledge_point: "kp3", result: "correct" },
    ];
    const report = buildDryRunReport("student_001", events, {
      since: "2026-08-26T09:00:00Z",
      until: "2026-08-26T11:00:00Z",
    });
    assert.equal(report.proposed_evidence_count, 1);
    assert.equal(report.proposed_records[0].original_event.timestamp, "2026-08-26T10:00:00Z");
  });
});
