import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createTestFileLearningMemoryWriter,
  createUnavailableLearningMemoryWriter,
} from "../../server/learning-memory/writer.mjs";

test("未配置正式 writer 時 fail-closed，不自行寫檔", async () => {
  const result = await createUnavailableLearningMemoryWriter().appendObservation({});
  assert.deepEqual(result, { accepted: false, code: "learning_memory_unavailable" });
});

test("測試 writer 拒絕 production ID 與 /tmp 外路徑", async () => {
  assert.throws(
    () => createTestFileLearningMemoryWriter({ root: "/var/lib/mentornest/learning-records" }),
    /必須位於 \/tmp/,
  );
  const root = await mkdtemp("/tmp/mentornest-memory-boundary-");
  const writer = createTestFileLearningMemoryWriter({ root });
  const result = await writer.appendObservation({
    subjectRef: "student_001",
    observation: { kind: "synthetic_english_conversation_session", evidence: { student_id_hash: "1234abcd" } },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "test_student_id_required");
  await rm(root, { recursive: true, force: true });
});

test("測試 writer 只以 hash 建檔，且加入 immutable event metadata", async () => {
  const root = await mkdtemp("/tmp/mentornest-memory-boundary-");
  const writer = createTestFileLearningMemoryWriter({ root });
  const observation = {
    kind: "synthetic_english_conversation_session",
    evidence: { student_id_hash: "1234abcd", turn_count: 2 },
    transcript: undefined,
  };
  const result = await writer.appendObservation({
    subjectRef: "student_test_boundary",
    observation,
  });
  assert.equal(result.accepted, true);
  const row = JSON.parse(await readFile(resolve(root, "1234abcd.jsonl"), "utf8"));
  assert.equal(row.event_id, result.event_id);
  assert.ok(row.ingested_at);
  assert.equal(row.student_id, undefined);
  assert.equal(row.transcript, undefined);
  await rm(root, { recursive: true, force: true });
});

test("同一 idempotency key 同 payload 跨 writer 重啟仍回傳原 receipt", async () => {
  const root = await mkdtemp("/tmp/mentornest-memory-boundary-");
  const observation = { kind: "synthetic_english_conversation_session", evidence: { student_id_hash: "1234abcd", turn_count: 2 } };
  const first = await createTestFileLearningMemoryWriter({ root }).appendObservation({
    subjectRef: "student_test_boundary", observation, idempotencyKey: "response_0001",
  });
  const replay = await createTestFileLearningMemoryWriter({ root }).appendObservation({
    subjectRef: "student_test_boundary", observation, idempotencyKey: "response_0001",
  });
  assert.equal(replay.event_id, first.event_id);
  assert.equal(replay.replayed, true);
  assert.equal((await readFile(resolve(root, "1234abcd.jsonl"), "utf8")).trim().split("\n").length, 1);
  await rm(root, { recursive: true, force: true });
});

test("同一 idempotency key 不同 payload 拒絕，並行重送只 append 一筆", async () => {
  const root = await mkdtemp("/tmp/mentornest-memory-boundary-");
  const writer = createTestFileLearningMemoryWriter({ root });
  const base = { kind: "synthetic_english_conversation_session", evidence: { student_id_hash: "1234abcd", turn_count: 2 } };
  const results = await Promise.all(Array.from({ length: 8 }, () => writer.appendObservation({
    subjectRef: "student_test_boundary", observation: base, idempotencyKey: "response_0002",
  })));
  assert.equal(new Set(results.map((item) => item.event_id)).size, 1);
  const conflict = await writer.appendObservation({
    subjectRef: "student_test_boundary",
    observation: { ...base, evidence: { ...base.evidence, turn_count: 3 } },
    idempotencyKey: "response_0002",
  });
  assert.deepEqual(conflict, { accepted: false, code: "idempotency_conflict" });
  assert.equal((await readFile(resolve(root, "1234abcd.jsonl"), "utf8")).trim().split("\n").length, 1);
  await rm(root, { recursive: true, force: true });
});
