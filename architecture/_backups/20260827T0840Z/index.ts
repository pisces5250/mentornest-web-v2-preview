import { Type, type Static } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool } from "openclaw/plugin-sdk/agent-harness";
import type { AgentToolResult } from "openclaw/plugin-sdk/agent-sessions";
import fs from "node:fs/promises";
import path from "node:path";

import {
  validateMathAnswer,
  type MathValidationResult,
} from "./lib/math_validator.mjs";
import { nextHintLevel, HINT_LEVELS } from "./lib/hint_ladder.mjs";
import {
  readLearningEvents,
  summarizeLearningEvents,
} from "./lib/learning_event_reader.mjs";
import {
  getMastery,
  listMastery,
  updateMasteryFromEvent,
  setMastery,
} from "./lib/mastery_store.mjs";
import {
  lookupKnowledgePoint,
  listKnowledgePoints,
  listSubjects as listCurriculumSubjects,
  curriculumMeta,
} from "./lib/curriculum_map.mjs";
import {
  readProfileV2,
  updateProfileV2,
} from "./lib/student_profile_v2.mjs";
import {
  SOURCE_CLASS,
  VALID_SOURCE_CLASSES,
  LICENSE,
  makeQuestionId,
  parseQuestionId,
} from "./lib/question_id.mjs";
import {
  buildProvenance,
  validateProvenance,
  hashPrompt,
} from "./lib/question_provenance.mjs";
import {
  validateQuestionStructure,
  isValidDifficulty,
} from "./lib/question_validator.mjs";
import {
  findDuplicates,
  normalizeStem,
} from "./lib/question_dedupe.mjs";
import {
  atomicWriteJson,
  questionPath,
  listAllVerified,
  listQuestions,
  BUCKETS,
} from "./lib/question_store.mjs";
import { curateQuestion } from "./lib/question_bank_curator.mjs";
import { verifyQuestion, rejectQuestion } from "./lib/question_quality_agent.mjs";
import {
  lookupVerified,
  countVerified,
} from "./lib/verified_bank_lookup.mjs";
import { buildMergedIndex } from "./lib/curriculum_map.mjs";
import {
  validateParentSetupPayload,
  PARENT_SETUP_SCHEMA_VERSION,
  COPY_ZH_TW,
  getParentSetupCopy,
  FIELD_REQUIRED,
  FIELD_RECOMMENDED,
  FIELD_OPTIONAL,
  FIELD_FORBIDDEN_IN_PARENT_PAYLOAD,
} from "./lib/parent_setup_schema.mjs";
import {
  runAuthoringCycle,
  planAuthoringCycle,
  planTopGaps,
  defaultStubAuthor,
} from "./lib/ai_question_authoring_orchestrator.mjs";
import { createProductionAuthorFn } from "./lib/production_ai_author.mjs";
import {
  appendProgressRecord,
  readProgress,
  buildConfirmedRecord,
  buildInferredRecord,
  buildPromotionToConfirmed,
  inferProgressFromEvidence,
  buildTextbookMapping,
  suggestCurriculumUnit,
  computeSchoolAlignment,
  trackConfirmedVsInferred,
} from "./lib/school_progress.mjs";
import {
  updateMasteryFromEvidence as updateMasteryV2FromEvidence,
  annotateMasteryWithSchoolAlignment,
  getMasteryV2,
  listMasteryV2,
  aggregateErrorPatterns,
  getRetentionSignal,
  listEvidence,
  assertNotDirectMasteryAssignment,
  retentionScore,
} from "./lib/mastery_engine_v2.mjs";
import {
  buildCoverageReport,
  topGaps,
} from "./lib/coverage_report.mjs";
import {
  computeCoverageTargets,
  defaultTargetFor,
} from "./lib/coverage_targets.mjs";
import {
  verifyMathQuestion,
  receiptPassed,
} from "./lib/math_specialist_verifier.mjs";
import {
  crossSubjectWeaknessAggregator,
  prerequisiteGapDetector,
  weeklyStrategyEmitter,
} from "./lib/learning_director.mjs";

const WORKSPACE = "/home/node/.openclaw/workspace";
const STUDENTS_DIR = path.join(WORKSPACE, "data", "students");
const RECORDS_DIR = path.join(WORKSPACE, "data", "learning-records");
const DATA_ROOT = WORKSPACE + "/data";

async function ensureDirs() {
  await fs.mkdir(STUDENTS_DIR, { recursive: true });
  await fs.mkdir(RECORDS_DIR, { recursive: true });
}

const STUDENT_ID_RE = /^student_[A-Za-z0-9_-]+$/;

function safeStudentId(id: string) {
  if (!STUDENT_ID_RE.test(id)) {
    throw new Error("Invalid student_id");
  }
  return id;
}

async function readStudent(studentId: string) {
  const id = safeStudentId(studentId);
  const file = path.join(STUDENTS_DIR, `${id}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function writeStudent(studentId: string, data: unknown) {
  const id = safeStudentId(studentId);
  const file = path.join(STUDENTS_DIR, `${id}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

// ---------- Schemas ----------

const StudentIdParam = Type.Object({
  student_id: Type.String(),
});

type StudentIdParams = Static<typeof StudentIdParam>;

const StudentProfileUpdateParams = Type.Object({
  student_id: Type.String(),
  display_name: Type.Optional(Type.String()),
  grade: Type.Optional(Type.Number()),
  subject: Type.Optional(Type.String()),
  publisher: Type.Optional(Type.String()),
  current_unit: Type.Optional(Type.String()),
});

type StudentProfileUpdateInput = Static<typeof StudentProfileUpdateParams>;

const LearningRecordAppendParams = Type.Object({
  student_id: Type.String(),
  subject: Type.String(),
  knowledge_point: Type.String(),
  result: Type.Optional(Type.String()),
  attempts: Type.Optional(Type.Number()),
  hints: Type.Optional(Type.Number()),
  error_type: Type.Optional(Type.String()),
  review_needed: Type.Optional(Type.Boolean()),
  note: Type.Optional(Type.String()),
});

type LearningRecordAppendInput = Static<typeof LearningRecordAppendParams>;

const GeneratePracticeSetParams = Type.Object({
  student_id: Type.String(),
  subject: Type.String(),
  knowledge_point: Type.String(),
  count: Type.Optional(Type.Number()),
  difficulty: Type.Optional(Type.String()),
});

const ClassifyMathErrorParams = Type.Object({
  student_id: Type.String(),
  knowledge_point: Type.String(),
  question: Type.String(),
  correct_answer: Type.String(),
  student_answer: Type.String(),
});

// v2: student_profile_v2_get
const StudentProfileV2GetParams = Type.Object({
  student_id: Type.String(),
});

// v2: student_profile_v2_update (one-shot parent setup; optional fields, caller can skip)
const StudentProfileV2UpdateParams = Type.Object({
  student_id: Type.String(),
  school_curriculum: Type.Optional(
    Type.String({ enum: ["taiwan-12-year-curriculum", "taiwan-108-curriculum", "other"] })
  ),
  textbook_version: Type.Optional(
    Type.Object({
      math: Type.Optional(Type.Object({
        publisher: Type.String(),
        edition: Type.Optional(Type.String()),
        volume: Type.Optional(Type.String()),
        curriculum_alignment: Type.Optional(Type.String({ enum: ["confirmed", "inferred"] })),
        notes: Type.Optional(Type.String()),
      })),
      chinese: Type.Optional(Type.Object({
        publisher: Type.String(),
        edition: Type.Optional(Type.String()),
        volume: Type.Optional(Type.String()),
        curriculum_alignment: Type.Optional(Type.String({ enum: ["confirmed", "inferred"] })),
        notes: Type.Optional(Type.String()),
      })),
      english: Type.Optional(Type.Object({
        publisher: Type.String(),
        edition: Type.Optional(Type.String()),
        volume: Type.Optional(Type.String()),
        curriculum_alignment: Type.Optional(Type.String({ enum: ["confirmed", "inferred"] })),
        notes: Type.Optional(Type.String()),
      })),
      science: Type.Optional(Type.Object({
        publisher: Type.String(),
        edition: Type.Optional(Type.String()),
        volume: Type.Optional(Type.String()),
        curriculum_alignment: Type.Optional(Type.String({ enum: ["confirmed", "inferred"] })),
        notes: Type.Optional(Type.String()),
      })),
      social_studies: Type.Optional(Type.Object({
        publisher: Type.String(),
        edition: Type.Optional(Type.String()),
        volume: Type.Optional(Type.String()),
        curriculum_alignment: Type.Optional(Type.String({ enum: ["confirmed", "inferred"] })),
        notes: Type.Optional(Type.String()),
      })),
    })
  ),
  learning_goals: Type.Optional(Type.Array(Type.Object({
    goal_id: Type.String(),
    subject: Type.String(),
    knowledge_point: Type.Optional(Type.String()),
    description: Type.String(),
    target_date: Type.Optional(Type.String()),
    status: Type.Optional(Type.String({ enum: ["active", "achieved", "paused", "dropped"] })),
    created_by: Type.Optional(Type.String({ enum: ["parent", "student"] })),
  }))),
  parent_concerns: Type.Optional(Type.Array(Type.Object({
    concern_id: Type.String(),
    subject: Type.String(),
    description: Type.String(),
    severity: Type.Optional(Type.String({ enum: ["low", "medium", "high"] })),
  }))),
  school_progress: Type.Optional(Type.Object({})),
  school_name: Type.Optional(Type.String()),  // optional; never requested by default
  class_name: Type.Optional(Type.String()),    // optional; never requested by default
  display_name: Type.Optional(Type.String()),
  grade: Type.Optional(Type.Number()),
  learning_preferences: Type.Optional(Type.Object({})),
});

// deterministic_math_validator
const MathValidateParams = Type.Object({
  expected_answer: Type.Union([Type.String(), Type.Number()]),
  student_answer: Type.Union([Type.String(), Type.Number()]),
  question_type: Type.Optional(Type.String({
    enum: [
      "fraction_equivalent",
      "fraction_compare",
      "fraction_arithmetic",
      "integer_arithmetic",
      "decimal_arithmetic",
      "percent",
      "arithmetic",
      "mixed_number",
      "general",
    ],
  })),
  numeric_tolerance: Type.Optional(Type.Number()),
  allow_string_match: Type.Optional(Type.Boolean()),
});

// hint_ladder_next
const HintLadderParams = Type.Object({
  result: Type.String(),
  error_type: Type.Optional(Type.String()),
  attempts: Type.Optional(Type.Number()),
  hints_already: Type.Optional(Type.Number()),
  representation_used: Type.Optional(Type.String()),
  knowledge_point: Type.Optional(Type.String()),
  student_id: Type.Optional(Type.String()),
});

// learning_event_reader
const LearningEventReaderParams = Type.Object({
  student_id: Type.String(),
  since: Type.Optional(Type.String()),
  until: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  summary: Type.Optional(Type.Boolean()),
});

// mastery_store_get
const MasteryGetParams = Type.Object({
  student_id: Type.String(),
  subject: Type.Optional(Type.String()),
  knowledge_point: Type.Optional(Type.String()),
  subskill: Type.Optional(Type.String()),
});

// mastery_store_update
const MasteryUpdateParams = Type.Object({
  student_id: Type.String(),
  subject: Type.String(),
  knowledge_point: Type.String(),
  subskill: Type.Optional(Type.String()),
  result: Type.String(),
  error_type: Type.Optional(Type.String()),
  timestamp: Type.Optional(Type.String()),
});

// curriculum_map_lookup
const CurriculumLookupParams = Type.Object({
  grade: Type.Number(),
  subject: Type.String(),
  knowledge_point: Type.String(),
});

const CurriculumListParams = Type.Object({
  grade: Type.Number(),
  subject: Type.String(),
});

const CurriculumSubjectsParams = Type.Object({});

type CurriculumSubjectsParamsT = Static<typeof CurriculumSubjectsParams>;

// ---------- Result helpers ----------

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function jsonText<T>(details: T, text?: string): AgentToolResult<T> {
  return textResult(text ?? JSON.stringify(details), details);
}

// ---------- Plugin entry ----------

export default definePluginEntry({
  id: "mentornest-learning",
  name: "MentorNest Learning",
  description:
    "Persistent student profiles and learning records for MentorNest (Phase 2: includes math validator, hint ladder, mastery store, curriculum lookup)",

  register(api) {
    // ──────────────────────────────────────────────────────────────────────
    // Existing v1 tools (unchanged behavior)
    // ──────────────────────────────────────────────────────────────────────

    const getProfileTool: AnyAgentTool = {
      name: "student_profile_get",
      label: "Get student profile",
      description:
        "Read the persistent MentorNest profile for a known student. Use this before claiming to know the student's stored grade, curriculum, or learning profile.",
      parameters: StudentIdParam,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        await ensureDirs();
        const { student_id } = params as StudentIdParams;
        try {
          const profile = await readStudent(student_id);
          return textResult(JSON.stringify(profile), {
            found: true,
            student_id,
            profile,
          });
        } catch {
          return textResult(`Student profile not found: ${student_id}`, {
            found: false,
            student_id,
          });
        }
      },
    };
    api.registerTool(getProfileTool);

    const updateProfileTool: AnyAgentTool = {
      name: "student_profile_update",
      label: "Update student profile",
      description:
        "Persistently update MentorNest student profile fields such as display name, grade, curriculum or learning preferences. Use only after the student's identity is known.",
      parameters: StudentProfileUpdateParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        await ensureDirs();
        const p = params as StudentProfileUpdateInput;
        let profile;
        try {
          profile = await readStudent(p.student_id);
        } catch {
          profile = {
            student_id: p.student_id,
            display_name: "",
            grade: null,
            school_year: "2026",
            curriculum: {},
            learning_preferences: {},
          };
        }
        if (p.display_name !== undefined) profile.display_name = p.display_name;
        if (p.grade !== undefined) profile.grade = p.grade;
        if (p.subject) {
          if (!profile.curriculum[p.subject]) {
            profile.curriculum[p.subject] = { publisher: "", current_unit: "" };
          }
          if (p.publisher !== undefined) profile.curriculum[p.subject].publisher = p.publisher;
          if (p.current_unit !== undefined) profile.curriculum[p.subject].current_unit = p.current_unit;
        }
        profile.updated_at = new Date().toISOString();
        await writeStudent(p.student_id, profile);
        return textResult(`Student profile updated: ${p.student_id}`, profile);
      },
    };
    api.registerTool(updateProfileTool);

    const appendRecordTool: AnyAgentTool = {
      name: "learning_record_append",
      label: "Append learning record",
      description:
        "Append one meaningful academic learning event to a student's persistent MentorNest learning history. Do not use for casual conversation.",
      parameters: LearningRecordAppendParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        await ensureDirs();
        const p = params as LearningRecordAppendInput;
        const studentId = safeStudentId(p.student_id);
        const file = path.join(RECORDS_DIR, `${studentId}.jsonl`);
        const record = {
          timestamp: new Date().toISOString(),
          ...p,
        };
        await fs.appendFile(file, JSON.stringify(record) + "\n", "utf8");
        return textResult(`Learning record saved for ${studentId}`, record);
      },
    };
    api.registerTool(appendRecordTool);

    const generatePracticeSetTool: AnyAgentTool = {
      name: "generate_practice_set",
      label: "Generate practice set",
      description:
        "Generate a structured practice set for a known student, subject, and knowledge point using the MentorNest agent.",
      parameters: GeneratePracticeSetParams,
      async execute(_toolCallId, _params): Promise<AgentToolResult<unknown>> {
        // Delegated to the agent runtime's existing LLM-backed practice generator.
        // Kept for backward compat; the plugin tool itself just signals
        // availability — actual generation happens through the agent.
        return textResult("generate_practice_set: dispatched to agent runtime", {
          status: "delegated",
        });
      },
    };
    api.registerTool(generatePracticeSetTool);

    const classifyMathErrorTool: AnyAgentTool = {
      name: "classify_math_error",
      label: "Classify math error",
      description:
        "Classify a student's wrong math answer into a useful learning error type.",
      parameters: ClassifyMathErrorParams,
      async execute(_toolCallId, _params): Promise<AgentToolResult<unknown>> {
        return textResult("classify_math_error: dispatched to agent runtime", {
          status: "delegated",
        });
      },
    };
    api.registerTool(classifyMathErrorTool);

    // ──────────────────────────────────────────────────────────────────────
    // Phase 2 — new tools
    // ──────────────────────────────────────────────────────────────────────

    // student_profile_v2_get
    const profileV2GetTool: AnyAgentTool = {
      name: "student_profile_v2_get",
      label: "Get student profile v2",
      description:
        "Read a student's Profile v2 view (additive over v1). Returns v1 fields plus school_curriculum, textbook_version, learning_goals, parent_concerns, school_progress. Backward compatible with v1 profiles.",
      parameters: StudentProfileV2GetParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const { student_id } = params as StudentIdParams;
        const r = await readProfileV2(student_id);
        return jsonText(r, r.found ? `Profile v2 loaded for ${student_id}` : `Profile not found: ${student_id}`);
      },
    };
    api.registerTool(profileV2GetTool);

    // student_profile_v2_update
    const profileV2UpdateTool: AnyAgentTool = {
      name: "student_profile_v2_update",
      label: "Update student profile v2",
      description:
        "One-shot parent setup for Profile v2. Optional fields (school_name, class_name) are NEVER requested by default. Existing v1 fields are preserved.",
      parameters: StudentProfileV2UpdateParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof StudentProfileV2UpdateParams>;
        const updated = await updateProfileV2(p.student_id, p);
        return jsonText({
          updated: true,
          student_id: p.student_id,
          profile: updated,
        }, `Profile v2 updated for ${p.student_id}`);
      },
    };
    api.registerTool(profileV2UpdateTool);

    // deterministic_math_validator
    const mathValidatorTool: AnyAgentTool = {
      name: "deterministic_math_validator",
      label: "Deterministic math validator",
      description:
        "Validate a math answer deterministically. NEVER calls an LLM. Returns verdict (correct | incorrect | unverifiable) with a comparison trace. Supports fraction / decimal / percent / mixed-number / integer / expression equivalence.",
      parameters: MathValidateParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof MathValidateParams>;
        const v = validateMathAnswer({
          expected_answer: p.expected_answer as string | number,
          student_answer: p.student_answer as string | number,
          opts: {
            numeric_tolerance: p.numeric_tolerance ?? 0,
            allow_string_match: p.allow_string_match ?? true,
          },
        });
        return jsonText({
          verdict: v.verdict,
          reason: v.reason,
          expected_parsed: v.expected_parsed,
          student_parsed: v.student_parsed,
          compare_steps: v.compare_steps,
          question_type: p.question_type || null,
        });
      },
    };
    api.registerTool(mathValidatorTool);

    // hint_ladder_next
    const hintLadderTool: AnyAgentTool = {
      name: "hint_ladder_next",
      label: "Hint ladder next level",
      description:
        "Compute the next hint level (deterministic). Math v1 rules. Returns level 0..4 and a representation-recommendation change if applicable. The hint TEXT is generated elsewhere; this tool only decides the level.",
      parameters: HintLadderParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof HintLadderParams>;
        const r = nextHintLevel({
          result: p.result,
          error_type: p.error_type,
          attempts: p.attempts ?? 1,
          hints_already: p.hints_already ?? 0,
          representation_used: p.representation_used,
        });
        return jsonText({
          ...r,
          all_levels: HINT_LEVELS,
        });
      },
    };
    api.registerTool(hintLadderTool);

    // learning_event_reader
    const learningReaderTool: AnyAgentTool = {
      name: "learning_event_reader",
      label: "Read learning events",
      description:
        "Read learning events for ONE student (cross-student reads are forbidden). Optional time window and subject filter. summary=true returns aggregated buckets.",
      parameters: LearningEventReaderParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof LearningEventReaderParams>;
        const opts: { since?: string; until?: string; subject?: string; summary?: boolean } = {};
        if (p.since) opts.since = p.since;
        if (p.until) opts.until = p.until;
        if (p.subject) opts.subject = p.subject;
        const wantSummary = p.summary === true;

        if (wantSummary) {
          const summary = await summarizeLearningEvents(p.student_id, opts);
          return jsonText(summary, `Learning event summary for ${p.student_id}`);
        }
        const events = await readLearningEvents(p.student_id, opts);
        return jsonText({
          student_id: p.student_id,
          event_count: events.length,
          events,
        }, `Learning events for ${p.student_id}`);
      },
    };
    api.registerTool(learningReaderTool);

    // mastery_store_get
    const masteryGetTool: AnyAgentTool = {
      name: "mastery_store_get",
      label: "Get mastery record",
      description:
        "Read mastery record(s) for one student. Returns null if no record exists for the given key. subject+knowledge_point filters narrow the read.",
      parameters: MasteryGetParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof MasteryGetParams>;
        if (p.subject && p.knowledge_point) {
          const rec = await getMastery(p.student_id, p.subject, p.knowledge_point, p.subskill || "");
          return jsonText({ student_id: p.student_id, record: rec });
        }
        const all = await listMastery(p.student_id, { subject: p.subject });
        return jsonText({ student_id: p.student_id, record_count: all.length, records: all });
      },
    };
    api.registerTool(masteryGetTool);

    // mastery_store_update
    const masteryUpdateTool: AnyAgentTool = {
      name: "mastery_store_update",
      label: "Update mastery from learning event",
      description:
        "Update a student's mastery record from a single learning event. Computes mastery delta from result, schedules review_due, accumulates error_patterns. Per-student isolation enforced.",
      parameters: MasteryUpdateParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof MasteryUpdateParams>;
        const rec = await updateMasteryFromEvent({
          student_id: p.student_id,
          subject: p.subject,
          knowledge_point: p.knowledge_point,
          subskill: p.subskill,
          result: p.result,
          error_type: p.error_type,
          timestamp: p.timestamp,
        });
        return jsonText({ updated: true, record: rec });
      },
    };
    api.registerTool(masteryUpdateTool);

    // curriculum_map_lookup (also handles list / subjects variants)
    const curriculumLookupTool: AnyAgentTool = {
      name: "curriculum_map_lookup",
      label: "Curriculum map lookup",
      description:
        "Look up curriculum knowledge points for Taiwan 12-year curriculum (V1: G1–G6 only). With knowledge_point given, returns the metadata + sibling points. Without it, returns all knowledge_points for that (grade, subject).",
      parameters: Type.Union([CurriculumLookupParams, CurriculumListParams]),
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        const p = params as Static<typeof CurriculumLookupParams | typeof CurriculumListParams>;
        if ("knowledge_point" in p && p.knowledge_point) {
          const r = await lookupKnowledgePoint({
            grade: p.grade,
            subject: p.subject,
            knowledge_point: p.knowledge_point,
          });
          return jsonText(r);
        }
        const list = await listKnowledgePoints({ grade: p.grade, subject: p.subject });
        return jsonText(list);
      },
    };
    api.registerTool(curriculumLookupTool);

    // curriculum_meta
    const curriculumMetaTool: AnyAgentTool = {
      name: "curriculum_meta",
      label: "Curriculum metadata",
      description:
        "Return V1 curriculum map metadata: version, scope, code, source documents.",
      parameters: CurriculumSubjectsParams,
      async execute(_toolCallId, _params): Promise<AgentToolResult<unknown>> {
        const meta = await curriculumMeta();
        const subjects = await listCurriculumSubjects();
        return jsonText({ ...meta, subjects });
      },
    };
    api.registerTool(curriculumMetaTool);

    // ────────────────────────────────────────────────────────────────────────
    // Phase 2 second-batch: Question Bank + Parent Setup
    // ────────────────────────────────────────────────────────────────────────

    // 1) question_bank_curator.curate_question
    const curateQuestionTool: AnyAgentTool = {
      name: "question_bank_curator_curate",
      label: "Curate a raw question (Phase 2)",
      description:
        "Curator pass: validate structure, curriculum alignment, and provenance. Writes to data/questions/curated/ + data/questions/raw/. Does NOT verify answer correctness or detect duplicates (those are Quality Agent's job).",
      parameters: Type.Object({
        question: Type.Object({
          id: Type.String(),
          type: Type.Union(["short_answer", "multiple_choice", "true_false"].map((s) => Type.Literal(s))),
          subject: Type.String(),
          grade: Type.Integer({ minimum: 1, maximum: 12 }),
          knowledge_point: Type.String(),
          difficulty: Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s))),
          stem: Type.String(),
          answer: Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
          choices: Type.Optional(Type.Array(Type.Union([Type.String(), Type.Number()]))),
          alt_answers: Type.Optional(Type.Array(Type.String())),
          explanation: Type.Optional(Type.String()),
          provenance: Type.Any(),
        }),
      }),
      async execute(_ctx, params: any) {
        const idx = await buildMergedIndex();
        const out = await curateQuestion(params.question, { curriculum_index: idx, root: DATA_ROOT });
        if (!out.ok) {
          return jsonText({ ok: false, reason: out.reason, stage: out.stage });
        }
        return jsonText({ ok: true, id: out.curated.id, path: out.path });
      },
    };
    api.registerTool(curateQuestionTool);

    // 2) question_quality_agent.verify_question  (the gate)
    const verifyQuestionTool: AnyAgentTool = {
      name: "question_quality_agent_verify",
      label: "Verify a question (Quality Gate, Phase 2)",
      description:
        "Runs ALL 5 mandatory checks: structure / provenance / answer self-verification / dedupe / parent reachability. Pass writes to verified/ + index. Fail writes to rejected/. This is the ONLY path into Verified Question Bank.",
      parameters: Type.Object({
        question: Type.Any(),
      }),
      async execute(_ctx, params: any) {
        const idx = await buildMergedIndex();
        const out = await verifyQuestion(params.question, { curriculum_index: idx, root: DATA_ROOT });
        if (!out.ok) {
          // Always write to rejected/ for traceability
          await rejectQuestion(params.question, { root: DATA_ROOT }, out.reason).catch(() => {});
          return jsonText({ ok: false, reason: out.reason, stage: out.stage, dup: out.dup });
        }
        return jsonText({ ok: true, id: out.verified.id, path: out.path, stages_passed: out.verified.quality.stages_passed });
      },
    };
    api.registerTool(verifyQuestionTool);

    // 3) question_quality_agent.duplicate_check  (lightweight pre-flight)
    const dedupeTool: AnyAgentTool = {
      name: "question_quality_agent_dedupe_check",
      label: "Check for duplicates in verified bank (Phase 2)",
      description:
        "Returns candidate duplicate matches in the verified bank with similarity scores. No writes. Use this BEFORE authoring a batch to avoid wasted token spend.",
      parameters: Type.Object({
        stem: Type.String(),
        knowledge_point: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const all = await listAllVerified(DATA_ROOT);
        const cand = { stem: params.stem, knowledge_point: params.knowledge_point };
        const dups = findDuplicates(cand, all);
        return jsonText({ ok: true, match_count: dups.length, matches: dups });
      },
    };
    api.registerTool(dedupeTool);

    // 4) verified_bank_lookup  (consumed by generate_practice_set + future assessment)
    const verifiedLookupTool: AnyAgentTool = {
      name: "verified_bank_lookup",
      label: "Look up verified questions (Phase 2)",
      description:
        "Retrieves verified questions matching (subject, grade, knowledge_point, difficulty, type). Only reads from verified/; never curated/ or raw/.",
      parameters: Type.Object({
        subject: Type.Optional(Type.String()),
        grade: Type.Optional(Type.Integer()),
        knowledge_point: Type.Optional(Type.String()),
        difficulty: Type.Optional(Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s)))),
        type: Type.Optional(Type.Union(["short_answer", "multiple_choice", "true_false"].map((s) => Type.Literal(s)))),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }),
      async execute(_ctx, params: any) {
        const results = await lookupVerified({
          subject: params.subject,
          grade: params.grade,
          knowledge_point: params.knowledge_point,
          difficulty: params.difficulty,
          type: params.type,
          limit: params.limit ?? 20,
          root: DATA_ROOT,
        });
        return jsonText({ ok: true, count: results.length, questions: results });
      },
    };
    api.registerTool(verifiedLookupTool);

    // 5) verified_bank_count
    const verifiedCountTool: AnyAgentTool = {
      name: "verified_bank_count",
      label: "Count verified questions (Phase 2)",
      description: "Counts verified questions matching filters; cheaper than listing.",
      parameters: Type.Object({
        subject: Type.Optional(Type.String()),
        grade: Type.Optional(Type.Integer()),
        knowledge_point: Type.Optional(Type.String()),
        difficulty: Type.Optional(Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s)))),
      }),
      async execute(_ctx, params: any) {
        const count = await countVerified({
          subject: params.subject,
          grade: params.grade,
          knowledge_point: params.knowledge_point,
          difficulty: params.difficulty,
          root: DATA_ROOT,
        });
        return jsonText({ ok: true, count });
      },
    };
    api.registerTool(verifiedCountTool);

    // 6) generate_practice_set — replace Phase 1 delegation stub with verified-bank-backed composer
    //    (Phase 2 second batch; math only.)
    const generatePracticeV2Tool: AnyAgentTool = {
      name: "generate_practice_set_v2",
      label: "Generate practice set from verified bank (Phase 2)",
      description:
        "Phase 2 math practice composer. Pulls questions from Verified Question Bank first; falls back to LLM-composed question only when bank has zero matches (V1 fallback; logged for human curation).",
      parameters: Type.Object({
        student_id: Type.String(),
        subject: Type.String(),
        knowledge_point: Type.String(),
        grade: Type.Optional(Type.Integer()),
        difficulty: Type.Optional(Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s)))),
        count: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      }),
      async execute(_ctx, params: any) {
        if (!STUDENT_ID_RE.test(params.student_id)) {
          return jsonText({ ok: false, reason: "invalid student_id" });
        }
        const limit = params.count ?? 5;
        // Resolve grade from profile if not provided
        let grade = params.grade;
        if (grade === undefined) {
          try {
            const profile = await readProfileV2(params.student_id);
            if (profile.found && profile.profile && typeof profile.profile.grade === "number") {
              grade = profile.profile.grade;
            }
          } catch (e) {
            // ignore
          }
        }
        const fromBank = await lookupVerified({
          subject: params.subject,
          grade,
          knowledge_point: params.knowledge_point,
          difficulty: params.difficulty,
          limit,
          root: DATA_ROOT,
        });
        if (fromBank.length > 0) {
          return jsonText({
            ok: true,
            source: "verified_bank",
            count: fromBank.length,
            questions: fromBank.map((q) => ({
              id: q.id,
              type: q.type,
              stem: q.stem,
              choices: q.choices,
              knowledge_point: q.knowledge_point,
              difficulty: q.difficulty,
            })),
            fallback_used: false,
          });
        }
        // Fallback path: log + signal that LLM authoring is needed (no LLM call here)
        return jsonText({
          ok: true,
          source: "fallback_llm_author_required",
          count: 0,
          questions: [],
          fallback_used: true,
          note: `verified bank empty for ${params.subject}/G${grade}/${params.knowledge_point}/${params.difficulty ?? "any"}; need mentor authoring pipeline to run question_bank_curator + question_quality_agent first`,
        });
      },
    };
    api.registerTool(generatePracticeV2Tool);

    // 7) classify_math_error — keep v1 delegation semantics but expose the new V2 verifier path
    //    (Phase 2 second batch keeps the v1 surface; new verifier is wired through deterministic_math_validator.)
    //    No tool surface change here.

    // 8) parent_setup_schema_validate  (Phase 2 first-batch profile v2 payload validation)
    const parentSetupValidateTool: AnyAgentTool = {
      name: "parent_setup_schema_validate",
      label: "Validate parent setup payload (Phase 2)",
      description:
        "Validates a one-shot parent setup payload against the v2 schema. Rejects fields that are not parent-editable (school_progress is curriculum-agent's job). Optional fields (school_name / class_name) are accepted but only if explicit.",
      parameters: Type.Object({
        payload: Type.Any(),
      }),
      async execute(_ctx, params: any) {
        const out = validateParentSetupPayload(params.payload);
        if (!out.ok) {
          return jsonText({ ok: false, reason: out.reason });
        }
        return jsonText({ ok: true, normalized: out.normalized, schema_version: PARENT_SETUP_SCHEMA_VERSION });
      },
    };
    api.registerTool(parentSetupValidateTool);

    // 9) parent_setup_schema_copy  (Phase 2 first-batch zh-TW strings for Web v2)
    const parentSetupCopyTool: AnyAgentTool = {
      name: "parent_setup_schema_copy",
      label: "Return parent setup zh-TW copy (Phase 2)",
      description:
        "Returns the exact 繁體中文 strings for the one-shot parent setup flow. Web v2 will use these verbatim. advanced_only fields (school_name / class_name) are flagged so the UI knows to hide them by default.",
      parameters: Type.Object({
        locale: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const result = getParentSetupCopy({ locale: params.locale ?? "zh-TW" });
        if (!result.ok) return jsonText(result);
        return jsonText({
          ok: true,
          locale: result.locale,
          schema_version: PARENT_SETUP_SCHEMA_VERSION,
          field_taxonomy: {
            required: FIELD_REQUIRED,
            recommended: FIELD_RECOMMENDED,
            optional: FIELD_OPTIONAL,
            forbidden_in_parent_payload: FIELD_FORBIDDEN_IN_PARENT_PAYLOAD,
          },
          copy: result.copy,
          invariants: result.invariants,
        });
      },
    };
    api.registerTool(parentSetupCopyTool);

    // 10) math_specialist_independent_verify (Phase 2 third-batch)
    const mathSpecialistVerifyTool: AnyAgentTool = {
      name: "math_specialist_independent_verify",
      label: "Independent answer verification for math questions (Phase 2 third-batch)",
      description:
        "Math Specialist calls this BEFORE submitting to question_quality_agent_verify. " +
        "Re-runs the deterministic math kernel as a third-party witness; returns a " +
        "structured receipt (parse / equivalence / warnings). " +
        "V1 is parseability + self-consistency only; truthfulness against the stem is the " +
        "caller's responsibility.",
      parameters: Type.Object({
        stem: Type.Optional(Type.String()),
        answer: Type.Union([Type.String(), Type.Number()]),
        alt_answers: Type.Optional(Type.Array(Type.Union([Type.String(), Type.Number()]))),
        grade: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
      }),
      async execute(_ctx, params: any) {
        const receipt = verifyMathQuestion({
          stem: params.stem,
          answer: params.answer,
          alt_answers: params.alt_answers,
          grade: params.grade,
        });
        return jsonText(receipt);
      },
    };
    api.registerTool(mathSpecialistVerifyTool);

    // 11) question_bank_coverage_report (Phase 2 third-batch)
    const coverageReportTool: AnyAgentTool = {
      name: "question_bank_coverage_report",
      label: "Coverage report for verified question bank (Phase 2 third-batch)",
      description:
        "Computes per-(KP, type, difficulty) cell counts vs. minimum targets. Returns the " +
        "gap list ordered by missing-count desc. Used by dashboards and the AI authoring " +
        "orchestrator to decide what to author next.",
      parameters: Type.Object({
        subject: Type.String(),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        kps: Type.Optional(
          Type.Array(
            Type.Object({
              kp: Type.String(),
              subskills: Type.Optional(Type.Array(Type.String())),
            }),
          ),
        ),
        topN: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      async execute(_ctx, params: any) {
        const report = await buildCoverageReport({
          workspace: WORKSPACE,
          subject: params.subject,
          grade: params.grade,
          kps: params.kps,
        });
        if (params.topN) {
          return jsonText({
            ...report,
            top_gaps: await topGaps({
              workspace: WORKSPACE,
              subject: params.subject,
              grade: params.grade,
              topN: params.topN,
              kps: params.kps,
            }),
          });
        }
        return jsonText(report);
      },
    };
    api.registerTool(coverageReportTool);

    // 12) ai_question_authoring_orchestrator_run (Phase 2 third-batch)
    const aiAuthoringTool: AnyAgentTool = {
      name: "ai_question_authoring_orchestrator_run",
      label: "Coverage-driven AI authoring cycle (Phase 2 third-batch)",
      description:
        "Runs one coverage-driven authoring cycle. Authoring is coverage-driven, NOT " +
        "cadence-driven: every cycle computes the top-N (KP, type, difficulty) gaps and " +
        "attempts to author them. The caller supplies authorFn; we never call an LLM " +
        "from this tool. Each authored question passes math-specialist independent " +
        "verification (math only), curator, and the full Quality Gate.",
      parameters: Type.Object({
        subject: Type.String(),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        kps: Type.Optional(
          Type.Array(
            Type.Object({
              kp: Type.String(),
              subskills: Type.Optional(Type.Array(Type.String())),
            }),
          ),
        ),
        batch_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
        // Phase 2 fourth-batch (production):
        //   use_stub_author=true (default for tests/offline)
        //   use_stub_author=false + production_author=true => use OpenClaw
        //                                       gateway + MiniMax-M3.
        // privacy filter is enforced inside production_ai_author.mjs.
        use_stub_author: Type.Optional(Type.Boolean()),
        production_author: Type.Optional(Type.Boolean()),
        gateway_url: Type.Optional(Type.String()),
        author_timeout_ms: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 120_000 })),
        prompt_hash_prefix: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        // authorFn can be sync (test stub) or async (production LLM); we keep
        // its signature loose and let runAuthoringCycle await as needed.
        let authorFn: any = defaultStubAuthor;
        if (params.use_stub_author === false && params.production_author === true) {
          const productionAuthor = createProductionAuthorFn({
            gatewayUrl: params.gateway_url,
            timeoutMs: params.author_timeout_ms,
          });
          // Wrap so the orchestrator's loose target-shape is accepted:
          authorFn = async (target: any) => {
            return await productionAuthor({
              subject: target.subject,
              grade: target.grade,
              kp: target.kp,
              type: target.type,
              difficulty: target.difficulty,
            });
          };
        }
        const result = await runAuthoringCycle({
          workspace: WORKSPACE,
          subject: params.subject,
          grade: params.grade,
          kps: params.kps,
          batch_size: params.batch_size ?? 5,
          authorFn,
          prompt_hash_prefix: params.prompt_hash_prefix ?? "orchestrator",
        });
        return jsonText(result);
      },
    };
    api.registerTool(aiAuthoringTool);

    // 13) ai_question_authoring_plan (Phase 2 third-batch — read-only preview)
    const aiAuthoringPlanTool: AnyAgentTool = {
      name: "ai_question_authoring_plan",
      label: "Preview next authoring batch (Phase 2 third-batch)",
      description:
        "Read-only preview of what the orchestrator would attempt next, without running " +
        "the loop. Useful for dashboards / 'budget remaining' UX.",
      parameters: Type.Object({
        subject: Type.String(),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        kps: Type.Optional(
          Type.Array(
            Type.Object({
              kp: Type.String(),
              subskills: Type.Optional(Type.Array(Type.String())),
            }),
          ),
        ),
        batch_size: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      async execute(_ctx, params: any) {
        const plan = planAuthoringCycle({
          workspace: WORKSPACE,
          subject: params.subject,
          grade: params.grade,
          kps: params.kps,
          batch_size: params.batch_size ?? 5,
        });
        return jsonText(plan);
      },
    };
    api.registerTool(aiAuthoringPlanTool);

    // 14) learning_director_cross_subject_weakness_aggregator
    const learningDirectorWeaknessTool: AnyAgentTool = {
      name: "learning_director_cross_subject_weakness_aggregator",
      label: "Learning Director: cross-subject weakness aggregator",
      description:
        "Returns a per-student ranked list of weak (subject, KP, subskill) cells. " +
        "Cross-subject view; flags subjects with >=2 weak cells. Pure read of mastery store.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        topN: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      }),
      async execute(_ctx, params: any) {
        if (!STUDENT_ID_RE.test(params.student_id)) {
          return jsonText({ ok: false, reason: "invalid student_id" });
        }
        const result = await crossSubjectWeaknessAggregator({
          student_id: params.student_id,
          workspace: WORKSPACE,
          topN: params.topN ?? 10,
        });
        return jsonText({ ok: true, ...result });
      },
    };
    api.registerTool(learningDirectorWeaknessTool);

    // 15) learning_director_prerequisite_gap_detector
    const learningDirectorPrereqTool: AnyAgentTool = {
      name: "learning_director_prerequisite_gap_detector",
      label: "Learning Director: prerequisite gap detector",
      description:
        "Walks the curriculum_map prerequisite chain for a target KP and surfaces any " +
        "blocking gaps (prerequisites with low mastery). Returns a recommendation string.",
      parameters: Type.Object({
        subject: Type.String(),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        knowledge_point: Type.String(),
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
      }),
      async execute(_ctx, params: any) {
        if (!STUDENT_ID_RE.test(params.student_id)) {
          return jsonText({ ok: false, reason: "invalid student_id" });
        }
        const result = await prerequisiteGapDetector({
          subject: params.subject,
          grade: params.grade,
          knowledge_point: params.knowledge_point,
          student_id: params.student_id,
          workspace: WORKSPACE,
        });
        return jsonText({ ok: true, ...result });
      },
    };
    api.registerTool(learningDirectorPrereqTool);

    // 16) learning_director_weekly_strategy_emitter
    const learningDirectorWeeklyTool: AnyAgentTool = {
      name: "learning_director_weekly_strategy_emitter",
      label: "Learning Director: weekly strategy emitter",
      description:
        "Emits a per-student WeeklyPlan: focus areas (low mastery), review-due cells, " +
        "suggested practice set, and a parent_summary_for_week (zh-TW with privacy copy).",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        week_of: Type.Optional(Type.String()),
        max_focus: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
        max_review: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
        max_practice: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      }),
      async execute(_ctx, params: any) {
        if (!STUDENT_ID_RE.test(params.student_id)) {
          return jsonText({ ok: false, reason: "invalid student_id" });
        }
        const result = await weeklyStrategyEmitter({
          student_id: params.student_id,
          workspace: WORKSPACE,
          week_of: params.week_of,
          max_focus: params.max_focus,
          max_review: params.max_review,
          max_practice: params.max_practice,
        });
        return jsonText({ ok: true, ...result });
      },
    };
    api.registerTool(learningDirectorWeeklyTool);

    // ───────── Phase 2 fourth-batch: Curriculum Agent v1 ─────────
    //
    // Six tools covering the curriculum-agent contract:
    //   - school_progress_get
    //   - school_progress_update_confirmed
    //   - school_progress_infer
    //   - school_progress_promote_to_confirmed
    //   - school_alignment
    //   - confirmed_vs_inferred_progress_tracker

    const schoolProgressGetTool: AnyAgentTool = {
      name: "school_progress_get",
      label: "Curriculum Agent: read school progress (append-only)",
      description:
        "Reads all school progress records for a student from the append-only JSONL. " +
        "Cross-student reads forbidden. Also returns latest_by_subject view.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        include_records: Type.Optional(Type.Boolean()),
      }),
      async execute(_ctx, params: any) {
        const got = await readProgress(WORKSPACE, params.student_id);
        return jsonText({
          ok: true,
          student_id: params.student_id,
          event_count: got.count,
          path: got.path,
          latest_by_subject: Object.fromEntries(
            Object.entries(got.latest_by_subject).map(([k, v]) => [
              k,
              {
                curriculum_unit: v.curriculum_unit,
                status: v.status,
                source_type: v.source_type,
                knowledge_points: v.knowledge_points,
                confidence: v.confidence,
                recorded_at: v.confirmed_at ?? v.inferred_at,
              },
            ])
          ),
          records: params.include_records === true ? got.records : undefined,
        });
      },
    };
    api.registerTool(schoolProgressGetTool);

    const schoolProgressUpdateConfirmedTool: AnyAgentTool = {
      name: "school_progress_update_confirmed",
      label: "Curriculum Agent: append a confirmed school-progress record",
      description:
        "Appends a NEW confirmed school-progress record. Append-only: never rewrites, " +
        "truncates, or deletes existing records. source_type must be one of " +
        "official_curriculum | parent_confirmed | teacher_material_confirmed | " +
        "textbook_mapping.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.Union(["math", "chinese", "english", "science", "social_studies"].map((s) => Type.Literal(s))),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        curriculum_unit: Type.String({ minLength: 1, maxLength: 100 }),
        knowledge_points: Type.Array(Type.String({ minLength: 3 })),
        status: Type.Union(["not_started", "in_progress", "completed"].map((s) => Type.Literal(s))),
        source_type: Type.Union([
          "official_curriculum",
          "parent_confirmed",
          "teacher_material_confirmed",
          "textbook_mapping",
        ].map((s) => Type.Literal(s))),
        source_reference: Type.String({ minLength: 1, maxLength: 500 }),
        confidence: Type.Optional(Type.Number({ minimum: 0.5, maximum: 1 })),
        replaces_record_id: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const rec = buildConfirmedRecord({
          student_id: params.student_id,
          subject: params.subject,
          grade: params.grade,
          curriculum_unit: params.curriculum_unit,
          knowledge_points: params.knowledge_points,
          status: params.status,
          source_type: params.source_type,
          source_reference: params.source_reference,
          confidence: params.confidence ?? 1.0,
          replaces_record_id: params.replaces_record_id,
        });
        const out = await appendProgressRecord(WORKSPACE, rec);
        const { ok: _o, ...rest } = out;
        return jsonText({ ok: true, ...rest, record: rec });
      },
    };
    api.registerTool(schoolProgressUpdateConfirmedTool);

    const schoolProgressInferTool: AnyAgentTool = {
      name: "school_progress_infer",
      label: "Curriculum Agent: append an inferred school-progress record",
      description:
        "Runs an inference using structured evidence (mastery signals, KPs mastered " +
        "recently) and appends the resulting inferred record. NEVER sets confirmed_at. " +
        "Privacy: the evidence payload is validated to reject display_name, " +
        "school_name, parent_concerns, or any raw event data.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.Union(["math", "chinese", "english", "science", "social_studies"].map((s) => Type.Literal(s))),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        unit_label: Type.String({ minLength: 1, maxLength: 100 }),
        unit_knowledge_points: Type.Array(Type.String({ minLength: 3 })),
        evidence: Type.Object({
          mastery_recent: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
          kps_mastered_recent: Type.Optional(Type.Array(Type.String())),
          last_event_at: Type.Optional(Type.String()),
          knowledge_point: Type.Optional(Type.String()),
        }),
      }),
      async execute(_ctx, params: any) {
        const inference = inferProgressFromEvidence({
          student_id: params.student_id,
          subject: params.subject,
          grade: params.grade,
          unit_label: params.unit_label,
          evidence: params.evidence,
          unit_knowledge_points: params.unit_knowledge_points,
        });
        const out = await appendProgressRecord(WORKSPACE, inference.candidate);
        const { ok: _o3, ...rest3 } = out;
        return jsonText({
          ok: true,
          ...rest3,
          reason: inference.reason,
          confidence: inference.confidence,
          status: inference.status,
          record: inference.candidate,
        });
      },
    };
    api.registerTool(schoolProgressInferTool);

    const schoolProgressPromoteTool: AnyAgentTool = {
      name: "school_progress_promote_to_confirmed",
      label: "Curriculum Agent: promote an inferred record to confirmed (supersedes)",
      description:
        "Builds a NEW confirmed record that supersedes a prior inferred record. " +
        "The old record stays in the JSONL (append-only); the new record carries " +
        "replaces_record_id. Confidence is monotonic non-decreasing.",
      parameters: Type.Object({
        previous_record_id: Type.String(),
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        promotion_source_type: Type.Union([
          "official_curriculum",
          "parent_confirmed",
          "teacher_material_confirmed",
          "textbook_mapping",
        ].map((s) => Type.Literal(s))),
        promotion_source_reference: Type.String({ minLength: 1, maxLength: 500 }),
        new_status: Type.Optional(Type.Union(["not_started", "in_progress", "completed"].map((s) => Type.Literal(s)))),
        new_curriculum_unit: Type.Optional(Type.String()),
        new_knowledge_points: Type.Optional(Type.Array(Type.String())),
        new_confidence: Type.Optional(Type.Number({ minimum: 0.5, maximum: 1 })),
      }),
      async execute(_ctx, params: any) {
        const got = await readProgress(WORKSPACE, params.student_id);
        const prev = got.records.find((r) => r.record_id === params.previous_record_id);
        if (!prev) return jsonText({ ok: false, reason: "previous_record_id_not_found" });
        const promoted = buildPromotionToConfirmed(prev, {
          new_status: params.new_status,
          new_curriculum_unit: params.new_curriculum_unit,
          new_knowledge_points: params.new_knowledge_points,
          new_source_type: params.promotion_source_type,
          new_source_reference: params.promotion_source_reference,
          new_confidence: params.new_confidence ?? 1.0,
        });
        const out = await appendProgressRecord(WORKSPACE, promoted);
        const { ok: _o2, ...rest2 } = out;
        return jsonText({ ok: true, ...rest2, record: promoted, superseded_id: prev.record_id });
      },
    };
    api.registerTool(schoolProgressPromoteTool);

    const schoolAlignmentTool: AnyAgentTool = {
      name: "school_alignment",
      label: "Curriculum Agent: align mastery with school progress (read-only)",
      description:
        "Cross-matches a student's mastery records against confirmed school progress " +
        "records. Returns zh-TW recommendations; READ-ONLY (no writes).",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
      }),
      async execute(_ctx, params: any) {
        const prog = await readProgress(WORKSPACE, params.student_id);
        const { listMastery } = await import("./lib/mastery_store.mjs");
        const mastery = await listMastery(params.student_id);
        const result = computeSchoolAlignment({
          mastery: mastery.map((m) => ({
            subject: m.subject,
            knowledge_point: m.knowledge_point,
            mastery: m.mastery,
          })),
          progress_records: prog.records,
        });
        return jsonText({ ok: true, items: result.items, count: result.count, student_id: params.student_id });
      },
    };
    api.registerTool(schoolAlignmentTool);

    const confirmedVsInferredTrackerTool: AnyAgentTool = {
      name: "confirmed_vs_inferred_progress_tracker",
      label: "Curriculum Agent: confirmed vs inferred progress tracker (read-only)",
      description:
        "Returns confirmed (teacher/parent/official) and inferred (mastery-derived) " +
        "progress separately; flags conflicts where both kinds claim the same " +
        "(subject, grade).",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
      }),
      async execute(_ctx, params: any) {
        const prog = await readProgress(WORKSPACE, params.student_id);
        const out = trackConfirmedVsInferred(prog.records, { student_id: params.student_id });
        return jsonText({
          ok: true,
          confirmed: out.confirmed,
          inferred: out.inferred,
          conflicts: out.conflicts,
          event_count: prog.count,
        });
      },
    };
    api.registerTool(confirmedVsInferredTrackerTool);

    const textbookMappingTool: AnyAgentTool = {
      name: "textbook_mapping_engine",
      label: "Curriculum Agent: textbook mapping engine skeleton",
      description:
        "Builds a textbook→curriculum-unit mapping for parent/teacher-supplied " +
        "publisher maps. We do NOT copy publisher content; only KP IDs are emitted. " +
        "Returns stats + a per-publisher map.",
      parameters: Type.Object({
        publisher_map: Type.Any(),
      }),
      async execute(_ctx, params: any) {
        // The publisher_map may be deeply nested; normalize the structure.
        // Caller passes { publisher: { edition: { volume: { units: [...] } } } }
        // OR { publisher: { volume: { units: [...] } } } (legacy).
        const rawMap: any = params.publisher_map ?? {};
        const normalized: any = {};
        for (const publisher of Object.keys(rawMap)) {
          normalized[publisher] = {};
          const pubEntry: any = rawMap[publisher] ?? {};
          for (const editionOrVolume of Object.keys(pubEntry)) {
            const node: any = pubEntry[editionOrVolume];
            // Heuristic: if node has "units", treat as volume.
            if (node && Array.isArray(node.units)) {
              normalized[publisher][editionOrVolume] = { units: node.units };
            } else if (node && typeof node === "object") {
              for (const volume of Object.keys(node)) {
                const v: any = node[volume];
                if (v && Array.isArray(v.units)) {
                  if (!normalized[publisher][editionOrVolume]) normalized[publisher][editionOrVolume] = {};
                  normalized[publisher][editionOrVolume][volume] = { units: v.units };
                }
              }
            }
          }
        }
        const ci = await buildMergedIndex();
        const out = buildTextbookMapping({ curriculum_index: ci, publisher_map: normalized });
        return jsonText({ ok: true, mappings: out.mappings, stats: out.stats });
      },
    };
    api.registerTool(textbookMappingTool);

    // ───────── Phase 2 fourth-batch: Mastery Engine v2 (server-side) ─────────
    //
    // Mastery v2 INVARIANTS:
    //   - Mastery is computed ONLY from objective evidence (events + assessments).
    //   - LLM agents cannot set mastery directly. `set_mastery` is rejected.
    //   - Persistence is server-side: data/mastery/<id>.json (mutable) +
    //     data/mastery-evidence/<id>.jsonl (append-only ledger).
    //   - Browser localStorage is NEVER source-of-truth.

    const masteryV2UpdateTool: AnyAgentTool = {
      name: "mastery_engine_v2_update_from_evidence",
      label: "Mastery v2: update from objective evidence (FORBIDDEN to set mastery directly)",
      description:
        "Updates a mastery record from a single objective evidence event. " +
        "Rejects any `set_mastery` or direct `mastery` value. Computes delta " +
        "from quality rating + FSRS-lite. Appends to append-only evidence ledger.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.String(),
        knowledge_point: Type.String(),
        subskill: Type.Optional(Type.String({ maxLength: 100 })),
        result: Type.Union(["correct", "incorrect", "partially_correct", "improved", "mastered"].map((s) => Type.Literal(s))),
        error_type: Type.Optional(Type.String()),
        hints: Type.Optional(Type.Integer({ minimum: 0, maximum: 5 })),
        first_attempt: Type.Optional(Type.Boolean()),
        source: Type.Optional(Type.String()),
        source_event_id: Type.Optional(Type.String()),
        evidence_kind: Type.Optional(Type.Union(["response", "rubric", "manual_flag"].map((s) => Type.Literal(s)))),
      }),
      async execute(_ctx, params: any) {
        assertNotDirectMasteryAssignment({ tool: "mastery_engine_v2_update_from_evidence", params });
        const out = await updateMasteryV2FromEvidence({
          student_id: params.student_id,
          subject: params.subject,
          knowledge_point: params.knowledge_point,
          subskill: params.subskill,
          result: params.result,
          error_type: params.error_type,
          hints: params.hints,
          first_attempt: params.first_attempt,
          source: params.source,
          source_event_id: params.source_event_id,
          evidence_kind: params.evidence_kind,
        });
        return jsonText({ ok: true, record: out.record, evidence_event_id: out.evidence_event_id });
      },
    };
    api.registerTool(masteryV2UpdateTool);

    const masteryV2AnnotateAlignmentTool: AnyAgentTool = {
      name: "mastery_engine_v2_annotate_school_alignment",
      label: "Mastery v2: annotate school alignment (curriculum-agent only)",
      description:
        "Records a school-alignment signal on an existing mastery record. " +
        "Curriculum-agent writes only — never affects mastery. Safe with no " +
        "existing record (writes a stub); mastery grows from evidence only.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.String(),
        knowledge_point: Type.String(),
        school_alignment: Type.Union(["aligned", "lagging", "ahead", "completed_in_class"].map((s) => Type.Literal(s))),
      }),
      async execute(_ctx, params: any) {
        const out = await annotateMasteryWithSchoolAlignment({
          student_id: params.student_id,
          subject: params.subject,
          knowledge_point: params.knowledge_point,
          school_alignment: params.school_alignment,
        });
        return jsonText({ ok: true, record: out });
      },
    };
    api.registerTool(masteryV2AnnotateAlignmentTool);

    const masteryV2ErrorPatternsTool: AnyAgentTool = {
      name: "mastery_engine_v2_error_pattern_aggregation",
      label: "Mastery v2: aggregate error patterns across KPs",
      description:
        "Aggregates error_patterns across all mastery records for a student. " +
        "Returns { type: count }. Read-only.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const out = await aggregateErrorPatterns(params.student_id, { subject: params.subject });
        return jsonText({ ok: true, by_type: out.by_type, student_id: params.student_id });
      },
    };
    api.registerTool(masteryV2ErrorPatternsTool);

    const masteryV2RetentionTool: AnyAgentTool = {
      name: "mastery_engine_v2_retention_signal",
      label: "Mastery v2: retention signal (stale_count + avg retention)",
      description:
        "Reports the average retention R(t) across all mastery records plus a " +
        "count of 'stale' records (R < 0.5). Read-only.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
      }),
      async execute(_ctx, params: any) {
        const out = await getRetentionSignal(params.student_id);
        const { ok: _o, ...rest } = out;
        return jsonText({ ok: true, ...rest });
      },
    };
    api.registerTool(masteryV2RetentionTool);

    const masteryV2EvidenceListTool: AnyAgentTool = {
      name: "mastery_engine_v2_list_evidence",
      label: "Mastery v2: list append-only evidence ledger",
      description:
        "Lists evidence rows from the append-only ledger. Supports filtering. Read-only.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.Optional(Type.String()),
        knowledge_point: Type.Optional(Type.String()),
        since: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const out = await listEvidence(params.student_id, {
          subject: params.subject,
          knowledge_point: params.knowledge_point,
          since: params.since,
        });
        return jsonText({ ok: true, count: out.count, events: out.events });
      },
    };
    api.registerTool(masteryV2EvidenceListTool);

    const masteryV2GetTool: AnyAgentTool = {
      name: "mastery_engine_v2_get",
      label: "Mastery v2: read a single record (with retention signal)",
      description:
        "Reads a single mastery v2 record (with retention signal derived from last_seen). Read-only.",
      parameters: Type.Object({
        student_id: Type.String({ pattern: "^student_[A-Za-z0-9_-]+$" }),
        subject: Type.String(),
        knowledge_point: Type.String(),
        subskill: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const rec = await getMasteryV2(params.student_id, params.subject, params.knowledge_point, params.subskill || "");
        const now = new Date().toISOString();
        const retention = rec && rec.last_seen ? retentionScore(rec.last_seen, now) : null;
        return jsonText({ ok: true, record: rec, retention_at_now: retention });
      },
    };
    api.registerTool(masteryV2GetTool);

    // ───────── Phase 2 fourth-batch: Production Question Author (top-level) ─────────

    const mentornestAuthorProductionTool: AnyAgentTool = {
      name: "mentornest_question_author_production",
      label: "MentorNest AI Question Author (production)",
      description:
        "Calls the local OpenClaw gateway + MiniMax-M3 to author one practice " +
        "question. PRIVACY: payload is filtered against forbidden fields at " +
        "input AND output layers.",
      parameters: Type.Object({
        subject: Type.String(),
        grade: Type.Integer({ minimum: 1, maximum: 12 }),
        knowledge_point: Type.String({ minLength: 3 }),
        question_type: Type.Union(["short_answer", "multiple_choice", "true_false"].map((s) => Type.Literal(s))),
        difficulty: Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s))),
        authoring_constraints: Type.Optional(Type.Record(Type.String(), Type.Any())),
        gateway_url: Type.Optional(Type.String()),
        author_timeout_ms: Type.Optional(Type.Integer({ minimum: 1000, maximum: 120000 })),
        locale: Type.Optional(Type.String()),
      }),
      async execute(_ctx, params: any) {
        const fn = createProductionAuthorFn({
          gatewayUrl: params.gateway_url,
          timeoutMs: params.author_timeout_ms,
          locale: params.locale,
        });
        const out = await fn({
          subject: params.subject,
          grade: params.grade,
          kp: params.knowledge_point,
          type: params.question_type,
          difficulty: params.difficulty,
        });
        if (!out) return jsonText({ ok: false, reason: "author_fn returned null (low confidence or error)" });
        return jsonText({ ok: true, output: out });
      },
    };
    api.registerTool(mentornestAuthorProductionTool);

    // (We intentionally do NOT export the old "delegated" stubs for practice/error tools here;
    // those entries remain in openclaw.plugin.json for runtime discovery during Phase 1.)
    // (Phase 2: we keep them as no-ops that signal delegation, to preserve tool surface.)
  },
});
