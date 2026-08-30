import fs from "node:fs/promises";
import path from "node:path";
import { assessObservation } from "./assessment.mjs";

const SUBJECT_PATTERN = /^student_test_[a-z0-9_]{1,80}$/;

export const CAPABILITY_NAMES = Object.freeze([
  "learning_director.recommend",
  "assessment.submit_observation",
  "learning_memory.append_observation",
  "verified_bank.read",
]);

export function createCapabilityRegistry(config, {
  appendFile = fs.appendFile,
  mkdir = fs.mkdir,
  readdir = fs.readdir,
  readFile = fs.readFile,
  access = fs.access,
  realpath = fs.realpath,
} = {}) {
  const statuses = new Map([
    ["learning_director.recommend", {
      status: "available",
      implementation: "adapter",
      authority: "learning_director_read_only",
      invoke: async ({ input }) => recommendFromConfirmedMastery(input),
    }],
    ["assessment.submit_observation", {
      status: "available",
      implementation: "native",
      authority: "assessment_observer",
      invoke: async ({ input, claims }) => {
        if (!claims.scopes.includes("assessment:submit_observation")) throw capabilityError("insufficient_scope", 403);
        return assessObservation(input);
      },
    }],
    ["learning_memory.append_observation", {
      status: "available",
      implementation: "adapter",
      authority: "learning_memory_writer",
      invoke: async ({ subjectRef, input }) => {
        if (!SUBJECT_PATTERN.test(subjectRef)) throw capabilityError("synthetic_subject_required", 400);
        const observation = validateObservation(input?.observation);
        const directory = path.join(config.dataRoot, config.namespace, "learning-memory");
        await mkdir(directory, { recursive: true });
        await assertContainedDirectory(config.dataRoot, directory, realpath);
        const record = {
          schema_version: "1",
          subject_ref: subjectRef,
          observation,
          recorded_at: new Date().toISOString(),
        };
        await appendFile(path.join(directory, `${subjectRef}.jsonl`), `${JSON.stringify(record)}\n`, {
          encoding: "utf8",
          flag: "a",
          mode: 0o600,
        });
        return { accepted: true, authority: "learning_memory_writer" };
      },
    }],
    ["verified_bank.read", {
      status: "available",
      implementation: "adapter",
      authority: "verified_bank_reader",
      invoke: async ({ input }) => ({
        questions: await readVerifiedQuestions(config.dataRoot, config.verifiedBankRoot, input, { readdir, readFile, realpath }),
        authority: "verified_bank_reader",
      }),
    }],
  ]);

  return Object.freeze({
    discovery() {
      return CAPABILITY_NAMES.map((name) => {
        const item = statuses.get(name);
        return {
          name,
          status: item.status,
          implementation: item.implementation,
          contract_version: config.contractVersion,
          authority: item.authority ?? null,
          reason: item.reason ?? null,
        };
      });
    },
    availableNames() {
      return CAPABILITY_NAMES.filter((name) => statuses.get(name)?.status === "available");
    },
    async invoke(name, request) {
      const item = statuses.get(name);
      if (!item) throw capabilityError("unknown_capability", 404);
      if (item.status !== "available") throw capabilityError("capability_unavailable", 503);
      return item.invoke(request);
    },
    async dependencies() {
      try {
        await access(config.dataRoot);
        const canonicalRoot = await realpath(config.dataRoot);
        if (canonicalRoot === "/home/node/.openclaw/workspace/data"
          || canonicalRoot.startsWith("/home/node/.openclaw/workspace/data/")) {
          throw new Error("production_root_resolved");
        }
        return [{ name: "staging_data_root", ready: true }];
      } catch {
        return [{ name: "staging_data_root", ready: false, error: "staging_data_root_unavailable" }];
      }
    },
  });
}

function recommendFromConfirmedMastery(input) {
  if (!input || !Array.isArray(input.confirmed_mastery)) {
    throw capabilityError("confirmed_mastery_required", 400);
  }
  if (input.confirmed_mastery.length > 100) throw capabilityError("confirmed_mastery_too_large", 413);
  const rows = input.confirmed_mastery.map((row) => {
    if (!row || typeof row !== "object" || row.evidence_status !== "confirmed") {
      throw capabilityError("confirmed_evidence_required", 400);
    }
    if (typeof row.subject !== "string" || typeof row.knowledge_point !== "string"
      || !Number.isFinite(row.mastery) || row.mastery < 0 || row.mastery > 1) {
      throw capabilityError("invalid_mastery_row", 400);
    }
    return { subject: row.subject, knowledge_point: row.knowledge_point, mastery: row.mastery };
  });
  rows.sort((a, b) => a.mastery - b.mastery
    || a.subject.localeCompare(b.subject)
    || a.knowledge_point.localeCompare(b.knowledge_point));
  return {
    recommendations: rows.slice(0, 3).map((row) => ({
      subject: row.subject,
      knowledge_point: row.knowledge_point,
      reason: "confirmed_mastery_priority",
    })),
    evidence_basis: "confirmed_only",
    authority: "learning_director_read_only",
  };
}

async function readVerifiedQuestions(dataRoot, root, input = {}, { readdir, readFile, realpath }) {
  const allowed = new Set(["subject", "grade", "knowledge_point", "difficulty", "type", "limit"]);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw capabilityError("invalid_verified_query", 400);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw capabilityError("verified_query_field_not_allowed", 400);
  const limit = input.limit === undefined ? 20 : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw capabilityError("invalid_verified_query_limit", 400);
  const questions = [];
  try { await assertContainedDirectory(dataRoot, root, realpath); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  async function walk(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        let question;
        try { question = JSON.parse(await readFile(target, "utf8")); } catch { continue; }
        if (matchesVerifiedQuery(question, input)) questions.push(question);
        if (questions.length >= limit) return;
      }
    }
  }
  await walk(root);
  return questions.slice(0, limit);
}

async function assertContainedDirectory(root, directory, realpath) {
  const canonicalRoot = await realpath(root);
  const canonicalDirectory = await realpath(directory);
  if (canonicalDirectory !== canonicalRoot && !canonicalDirectory.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw capabilityError("staging_path_escape_rejected", 500);
  }
}

function matchesVerifiedQuery(question, query) {
  if (!question || question.verification_status !== "verified") return false;
  for (const field of ["subject", "grade", "knowledge_point", "difficulty", "type"]) {
    if (query[field] !== undefined && question[field] !== query[field]) return false;
  }
  return true;
}

const OBSERVATION_FIELDS = new Set(["kind", "knowledge_point", "mastery_candidate_kps", "evidence", "source", "occurred_at"]);
const FORBIDDEN_FIELD = /(transcript|audio|recording|raw_turns|conversation|confirmed|mastered|mastery_score|mastery_verdict)/i;

function validateObservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw capabilityError("observation_required", 400);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 8192) throw capabilityError("observation_too_large", 413);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELD.test(key)) throw capabilityError("authoritative_or_sensitive_field_rejected", 400);
    if (!OBSERVATION_FIELDS.has(key)) throw capabilityError("observation_field_not_allowed", 400);
  }
  if (typeof value.kind !== "string" || !value.kind.startsWith("synthetic_")) {
    throw capabilityError("synthetic_observation_required", 400);
  }
  if (value.mastery_candidate_kps !== undefined && (!Array.isArray(value.mastery_candidate_kps)
    || value.mastery_candidate_kps.some((item) => typeof item !== "string" || item.length > 100))) {
    throw capabilityError("invalid_mastery_candidates", 400);
  }
  assertSafeValue(value, 0);
  return value;
}

function assertSafeValue(value, depth) {
  if (depth > 4) throw capabilityError("observation_too_deep", 400);
  if (typeof value === "string" && value.length > 1000) throw capabilityError("observation_value_too_large", 400);
  if (Array.isArray(value)) {
    if (value.length > 50) throw capabilityError("observation_value_too_large", 400);
    for (const item of value) assertSafeValue(item, depth + 1);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_FIELD.test(key)) throw capabilityError("authoritative_or_sensitive_field_rejected", 400);
      assertSafeValue(item, depth + 1);
    }
  }
}

function unavailable(reason) {
  return { status: "unavailable", implementation: "unavailable", reason };
}

export function capabilityError(code, status) {
  return Object.assign(new Error(code), { code, status });
}
