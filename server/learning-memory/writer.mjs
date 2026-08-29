// Learning Memory writer 邊界。
// Tutor 只能提交最小化的非權威觀察；實際儲存與 mastery 判定由此邊界後方負責。

import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve, sep } from "node:path";

const TEST_STUDENT_ID = /^student_(?:t_|test_)/;

function assertWriter(writer) {
  if (!writer || typeof writer.appendObservation !== "function") {
    throw new TypeError("Learning Memory writer 必須實作 appendObservation(input)");
  }
  return writer;
}

export function createUnavailableLearningMemoryWriter() {
  return Object.freeze({
    async appendObservation() {
      return { accepted: false, code: "learning_memory_unavailable" };
    },
  });
}

/**
 * 僅供自動化測試的 append-only adapter。
 * root 必須位於 /tmp；subjectRef 必須是假學生 ID；檔名只使用既有 hash。
 */
export function createTestFileLearningMemoryWriter({ root }) {
  const absoluteRoot = resolve(root || "");
  const tmpRoot = resolve("/tmp");
  if (absoluteRoot !== tmpRoot && !absoluteRoot.startsWith(`${tmpRoot}${sep}`)) {
    throw new Error("測試 Learning Memory root 必須位於 /tmp");
  }

  return assertWriter({
    async appendObservation({ subjectRef, observation }) {
      if (typeof subjectRef !== "string" || !TEST_STUDENT_ID.test(subjectRef)) {
        return { accepted: false, code: "test_student_id_required" };
      }
      if (!observation || observation.kind !== "english_conversation_session") {
        return { accepted: false, code: "invalid_observation" };
      }
      if (observation.transcript != null || observation.audio != null) {
        return { accepted: false, code: "sensitive_payload_forbidden" };
      }
      const studentHash = observation.student_id_hash;
      if (!/^[a-f0-9]{8}$/.test(studentHash || "")) {
        return { accepted: false, code: "invalid_student_hash" };
      }
      const event = {
        ...observation,
        event_id: randomUUID(),
        ingested_at: new Date().toISOString(),
      };
      await mkdir(absoluteRoot, { recursive: true });
      const path = resolve(absoluteRoot, `${studentHash}.jsonl`);
      await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
      return { accepted: true, event_id: event.event_id };
    },
  });
}

export function validateLearningMemoryWriter(writer) {
  return assertWriter(writer);
}
