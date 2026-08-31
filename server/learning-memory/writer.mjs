// Learning Memory writer 邊界。
// Tutor 只能提交最小化的非權威觀察；實際儲存與 mastery 判定由此邊界後方負責。

import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";

const TEST_STUDENT_ID = /^student_(?:t_|test_)/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

async function withFileLock(path, action) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      try { return await action(); } finally { await handle.close(); await unlink(path).catch(() => {}); }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 5));
    }
  }
  return { accepted: false, code: "learning_memory_busy" };
}

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
    async appendObservation({ subjectRef, observation, idempotencyKey }) {
      if (typeof subjectRef !== "string" || !TEST_STUDENT_ID.test(subjectRef)) {
        return { accepted: false, code: "test_student_id_required" };
      }
      if (!observation || observation.kind !== "synthetic_english_conversation_session") {
        return { accepted: false, code: "invalid_observation" };
      }
      if (observation.transcript != null || observation.audio != null) {
        return { accepted: false, code: "sensitive_payload_forbidden" };
      }
      const studentHash = observation.evidence?.student_id_hash;
      if (!/^[a-f0-9]{8}$/.test(studentHash || "")) {
        return { accepted: false, code: "invalid_student_hash" };
      }
      await mkdir(absoluteRoot, { recursive: true });
      const path = resolve(absoluteRoot, `${studentHash}.jsonl`);
      const stableKey = typeof idempotencyKey === "string" && idempotencyKey.length >= 8
        ? idempotencyKey
        : `observation:${digest({ subjectRef, observation })}`;
      const payloadDigest = digest({ subjectRef, observation });
      return withFileLock(`${path}.lock`, async () => {
        const rows = (await readFile(path, "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error)))
          .split("\n").filter(Boolean).map((row) => JSON.parse(row));
        const existing = rows.find((row) => row.idempotency_key === stableKey);
        if (existing) {
          if (existing.payload_digest !== payloadDigest) {
            return { accepted: false, code: "idempotency_conflict" };
          }
          return { accepted: true, event_id: existing.event_id, replayed: true };
        }
        const event = { ...observation, event_id: randomUUID(), ingested_at: new Date().toISOString(), idempotency_key: stableKey, payload_digest: payloadDigest };
        await appendFile(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
        return { accepted: true, event_id: event.event_id, replayed: false };
      });
    },
  });
}

export function validateLearningMemoryWriter(writer) {
  return assertWriter(writer);
}
