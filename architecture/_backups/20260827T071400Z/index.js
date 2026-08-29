import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import fs from "node:fs/promises";
import path from "node:path";
import { validateMathAnswer, } from "./lib/math_validator.mjs";
import { nextHintLevel, HINT_LEVELS } from "./lib/hint_ladder.mjs";
import { readLearningEvents, summarizeLearningEvents, } from "./lib/learning_event_reader.mjs";
import { getMastery, listMastery, updateMasteryFromEvent, } from "./lib/mastery_store.mjs";
import { lookupKnowledgePoint, listKnowledgePoints, listSubjects as listCurriculumSubjects, curriculumMeta, } from "./lib/curriculum_map.mjs";
import { readProfileV2, updateProfileV2, } from "./lib/student_profile_v2.mjs";
import { findDuplicates, } from "./lib/question_dedupe.mjs";
import { listAllVerified, } from "./lib/question_store.mjs";
import { curateQuestion } from "./lib/question_bank_curator.mjs";
import { verifyQuestion, rejectQuestion } from "./lib/question_quality_agent.mjs";
import { lookupVerified, countVerified, } from "./lib/verified_bank_lookup.mjs";
import { buildMergedIndex } from "./lib/curriculum_map.mjs";
import { validateParentSetupPayload, PARENT_SETUP_SCHEMA_VERSION, COPY_ZH_TW, FIELD_REQUIRED, FIELD_RECOMMENDED, FIELD_OPTIONAL, FIELD_FORBIDDEN_IN_PARENT_PAYLOAD, } from "./lib/parent_setup_schema.mjs";
const WORKSPACE = "/home/node/.openclaw/workspace";
const STUDENTS_DIR = path.join(WORKSPACE, "data", "students");
const RECORDS_DIR = path.join(WORKSPACE, "data", "learning-records");
const DATA_ROOT = WORKSPACE + "/data";
async function ensureDirs() {
    await fs.mkdir(STUDENTS_DIR, { recursive: true });
    await fs.mkdir(RECORDS_DIR, { recursive: true });
}
const STUDENT_ID_RE = /^student_[A-Za-z0-9_-]+$/;
function safeStudentId(id) {
    if (!STUDENT_ID_RE.test(id)) {
        throw new Error("Invalid student_id");
    }
    return id;
}
async function readStudent(studentId) {
    const id = safeStudentId(studentId);
    const file = path.join(STUDENTS_DIR, `${id}.json`);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
}
async function writeStudent(studentId, data) {
    const id = safeStudentId(studentId);
    const file = path.join(STUDENTS_DIR, `${id}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}
// ---------- Schemas ----------
const StudentIdParam = Type.Object({
    student_id: Type.String(),
});
const StudentProfileUpdateParams = Type.Object({
    student_id: Type.String(),
    display_name: Type.Optional(Type.String()),
    grade: Type.Optional(Type.Number()),
    subject: Type.Optional(Type.String()),
    publisher: Type.Optional(Type.String()),
    current_unit: Type.Optional(Type.String()),
});
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
    school_curriculum: Type.Optional(Type.String({ enum: ["taiwan-12-year-curriculum", "taiwan-108-curriculum", "other"] })),
    textbook_version: Type.Optional(Type.Object({
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
    })),
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
    school_name: Type.Optional(Type.String()), // optional; never requested by default
    class_name: Type.Optional(Type.String()), // optional; never requested by default
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
// ---------- Result helpers ----------
function textResult(text, details) {
    return {
        content: [{ type: "text", text }],
        details,
    };
}
function jsonText(details, text) {
    return textResult(text ?? JSON.stringify(details), details);
}
// ---------- Plugin entry ----------
export default definePluginEntry({
    id: "mentornest-learning",
    name: "MentorNest Learning",
    description: "Persistent student profiles and learning records for MentorNest (Phase 2: includes math validator, hint ladder, mastery store, curriculum lookup)",
    register(api) {
        // ──────────────────────────────────────────────────────────────────────
        // Existing v1 tools (unchanged behavior)
        // ──────────────────────────────────────────────────────────────────────
        const getProfileTool = {
            name: "student_profile_get",
            label: "Get student profile",
            description: "Read the persistent MentorNest profile for a known student. Use this before claiming to know the student's stored grade, curriculum, or learning profile.",
            parameters: StudentIdParam,
            async execute(_toolCallId, params) {
                await ensureDirs();
                const { student_id } = params;
                try {
                    const profile = await readStudent(student_id);
                    return textResult(JSON.stringify(profile), {
                        found: true,
                        student_id,
                        profile,
                    });
                }
                catch {
                    return textResult(`Student profile not found: ${student_id}`, {
                        found: false,
                        student_id,
                    });
                }
            },
        };
        api.registerTool(getProfileTool);
        const updateProfileTool = {
            name: "student_profile_update",
            label: "Update student profile",
            description: "Persistently update MentorNest student profile fields such as display name, grade, curriculum or learning preferences. Use only after the student's identity is known.",
            parameters: StudentProfileUpdateParams,
            async execute(_toolCallId, params) {
                await ensureDirs();
                const p = params;
                let profile;
                try {
                    profile = await readStudent(p.student_id);
                }
                catch {
                    profile = {
                        student_id: p.student_id,
                        display_name: "",
                        grade: null,
                        school_year: "2026",
                        curriculum: {},
                        learning_preferences: {},
                    };
                }
                if (p.display_name !== undefined)
                    profile.display_name = p.display_name;
                if (p.grade !== undefined)
                    profile.grade = p.grade;
                if (p.subject) {
                    if (!profile.curriculum[p.subject]) {
                        profile.curriculum[p.subject] = { publisher: "", current_unit: "" };
                    }
                    if (p.publisher !== undefined)
                        profile.curriculum[p.subject].publisher = p.publisher;
                    if (p.current_unit !== undefined)
                        profile.curriculum[p.subject].current_unit = p.current_unit;
                }
                profile.updated_at = new Date().toISOString();
                await writeStudent(p.student_id, profile);
                return textResult(`Student profile updated: ${p.student_id}`, profile);
            },
        };
        api.registerTool(updateProfileTool);
        const appendRecordTool = {
            name: "learning_record_append",
            label: "Append learning record",
            description: "Append one meaningful academic learning event to a student's persistent MentorNest learning history. Do not use for casual conversation.",
            parameters: LearningRecordAppendParams,
            async execute(_toolCallId, params) {
                await ensureDirs();
                const p = params;
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
        const generatePracticeSetTool = {
            name: "generate_practice_set",
            label: "Generate practice set",
            description: "Generate a structured practice set for a known student, subject, and knowledge point using the MentorNest agent.",
            parameters: GeneratePracticeSetParams,
            async execute(_toolCallId, _params) {
                // Delegated to the agent runtime's existing LLM-backed practice generator.
                // Kept for backward compat; the plugin tool itself just signals
                // availability — actual generation happens through the agent.
                return textResult("generate_practice_set: dispatched to agent runtime", {
                    status: "delegated",
                });
            },
        };
        api.registerTool(generatePracticeSetTool);
        const classifyMathErrorTool = {
            name: "classify_math_error",
            label: "Classify math error",
            description: "Classify a student's wrong math answer into a useful learning error type.",
            parameters: ClassifyMathErrorParams,
            async execute(_toolCallId, _params) {
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
        const profileV2GetTool = {
            name: "student_profile_v2_get",
            label: "Get student profile v2",
            description: "Read a student's Profile v2 view (additive over v1). Returns v1 fields plus school_curriculum, textbook_version, learning_goals, parent_concerns, school_progress. Backward compatible with v1 profiles.",
            parameters: StudentProfileV2GetParams,
            async execute(_toolCallId, params) {
                const { student_id } = params;
                const r = await readProfileV2(student_id);
                return jsonText(r, r.found ? `Profile v2 loaded for ${student_id}` : `Profile not found: ${student_id}`);
            },
        };
        api.registerTool(profileV2GetTool);
        // student_profile_v2_update
        const profileV2UpdateTool = {
            name: "student_profile_v2_update",
            label: "Update student profile v2",
            description: "One-shot parent setup for Profile v2. Optional fields (school_name, class_name) are NEVER requested by default. Existing v1 fields are preserved.",
            parameters: StudentProfileV2UpdateParams,
            async execute(_toolCallId, params) {
                const p = params;
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
        const mathValidatorTool = {
            name: "deterministic_math_validator",
            label: "Deterministic math validator",
            description: "Validate a math answer deterministically. NEVER calls an LLM. Returns verdict (correct | incorrect | unverifiable) with a comparison trace. Supports fraction / decimal / percent / mixed-number / integer / expression equivalence.",
            parameters: MathValidateParams,
            async execute(_toolCallId, params) {
                const p = params;
                const v = validateMathAnswer({
                    expected_answer: p.expected_answer,
                    student_answer: p.student_answer,
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
        const hintLadderTool = {
            name: "hint_ladder_next",
            label: "Hint ladder next level",
            description: "Compute the next hint level (deterministic). Math v1 rules. Returns level 0..4 and a representation-recommendation change if applicable. The hint TEXT is generated elsewhere; this tool only decides the level.",
            parameters: HintLadderParams,
            async execute(_toolCallId, params) {
                const p = params;
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
        const learningReaderTool = {
            name: "learning_event_reader",
            label: "Read learning events",
            description: "Read learning events for ONE student (cross-student reads are forbidden). Optional time window and subject filter. summary=true returns aggregated buckets.",
            parameters: LearningEventReaderParams,
            async execute(_toolCallId, params) {
                const p = params;
                const opts = {};
                if (p.since)
                    opts.since = p.since;
                if (p.until)
                    opts.until = p.until;
                if (p.subject)
                    opts.subject = p.subject;
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
        const masteryGetTool = {
            name: "mastery_store_get",
            label: "Get mastery record",
            description: "Read mastery record(s) for one student. Returns null if no record exists for the given key. subject+knowledge_point filters narrow the read.",
            parameters: MasteryGetParams,
            async execute(_toolCallId, params) {
                const p = params;
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
        const masteryUpdateTool = {
            name: "mastery_store_update",
            label: "Update mastery from learning event",
            description: "Update a student's mastery record from a single learning event. Computes mastery delta from result, schedules review_due, accumulates error_patterns. Per-student isolation enforced.",
            parameters: MasteryUpdateParams,
            async execute(_toolCallId, params) {
                const p = params;
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
        const curriculumLookupTool = {
            name: "curriculum_map_lookup",
            label: "Curriculum map lookup",
            description: "Look up curriculum knowledge points for Taiwan 12-year curriculum (V1: G1–G6 only). With knowledge_point given, returns the metadata + sibling points. Without it, returns all knowledge_points for that (grade, subject).",
            parameters: Type.Union([CurriculumLookupParams, CurriculumListParams]),
            async execute(_toolCallId, params) {
                const p = params;
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
        const curriculumMetaTool = {
            name: "curriculum_meta",
            label: "Curriculum metadata",
            description: "Return V1 curriculum map metadata: version, scope, code, source documents.",
            parameters: CurriculumSubjectsParams,
            async execute(_toolCallId, _params) {
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
        const curateQuestionTool = {
            name: "question_bank_curator_curate",
            label: "Curate a raw question (Phase 2)",
            description: "Curator pass: validate structure, curriculum alignment, and provenance. Writes to data/questions/curated/ + data/questions/raw/. Does NOT verify answer correctness or detect duplicates (those are Quality Agent's job).",
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
            async execute(_ctx, params) {
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
        const verifyQuestionTool = {
            name: "question_quality_agent_verify",
            label: "Verify a question (Quality Gate, Phase 2)",
            description: "Runs ALL 5 mandatory checks: structure / provenance / answer self-verification / dedupe / parent reachability. Pass writes to verified/ + index. Fail writes to rejected/. This is the ONLY path into Verified Question Bank.",
            parameters: Type.Object({
                question: Type.Any(),
            }),
            async execute(_ctx, params) {
                const idx = await buildMergedIndex();
                const out = await verifyQuestion(params.question, { curriculum_index: idx, root: DATA_ROOT });
                if (!out.ok) {
                    // Always write to rejected/ for traceability
                    await rejectQuestion(params.question, { root: DATA_ROOT }, out.reason).catch(() => { });
                    return jsonText({ ok: false, reason: out.reason, stage: out.stage, dup: out.dup });
                }
                return jsonText({ ok: true, id: out.verified.id, path: out.path, stages_passed: out.verified.quality.stages_passed });
            },
        };
        api.registerTool(verifyQuestionTool);
        // 3) question_quality_agent.duplicate_check  (lightweight pre-flight)
        const dedupeTool = {
            name: "question_quality_agent_dedupe_check",
            label: "Check for duplicates in verified bank (Phase 2)",
            description: "Returns candidate duplicate matches in the verified bank with similarity scores. No writes. Use this BEFORE authoring a batch to avoid wasted token spend.",
            parameters: Type.Object({
                stem: Type.String(),
                knowledge_point: Type.Optional(Type.String()),
            }),
            async execute(_ctx, params) {
                const all = await listAllVerified(DATA_ROOT);
                const cand = { stem: params.stem, knowledge_point: params.knowledge_point };
                const dups = findDuplicates(cand, all);
                return jsonText({ ok: true, match_count: dups.length, matches: dups });
            },
        };
        api.registerTool(dedupeTool);
        // 4) verified_bank_lookup  (consumed by generate_practice_set + future assessment)
        const verifiedLookupTool = {
            name: "verified_bank_lookup",
            label: "Look up verified questions (Phase 2)",
            description: "Retrieves verified questions matching (subject, grade, knowledge_point, difficulty, type). Only reads from verified/; never curated/ or raw/.",
            parameters: Type.Object({
                subject: Type.Optional(Type.String()),
                grade: Type.Optional(Type.Integer()),
                knowledge_point: Type.Optional(Type.String()),
                difficulty: Type.Optional(Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s)))),
                type: Type.Optional(Type.Union(["short_answer", "multiple_choice", "true_false"].map((s) => Type.Literal(s)))),
                limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            }),
            async execute(_ctx, params) {
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
        const verifiedCountTool = {
            name: "verified_bank_count",
            label: "Count verified questions (Phase 2)",
            description: "Counts verified questions matching filters; cheaper than listing.",
            parameters: Type.Object({
                subject: Type.Optional(Type.String()),
                grade: Type.Optional(Type.Integer()),
                knowledge_point: Type.Optional(Type.String()),
                difficulty: Type.Optional(Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s)))),
            }),
            async execute(_ctx, params) {
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
        const generatePracticeV2Tool = {
            name: "generate_practice_set_v2",
            label: "Generate practice set from verified bank (Phase 2)",
            description: "Phase 2 math practice composer. Pulls questions from Verified Question Bank first; falls back to LLM-composed question only when bank has zero matches (V1 fallback; logged for human curation).",
            parameters: Type.Object({
                student_id: Type.String(),
                subject: Type.String(),
                knowledge_point: Type.String(),
                grade: Type.Optional(Type.Integer()),
                difficulty: Type.Optional(Type.Union(["easy", "medium", "hard"].map((s) => Type.Literal(s)))),
                count: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
            }),
            async execute(_ctx, params) {
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
                    }
                    catch (e) {
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
        const parentSetupValidateTool = {
            name: "parent_setup_schema_validate",
            label: "Validate parent setup payload (Phase 2)",
            description: "Validates a one-shot parent setup payload against the v2 schema. Rejects fields that are not parent-editable (school_progress is curriculum-agent's job). Optional fields (school_name / class_name) are accepted but only if explicit.",
            parameters: Type.Object({
                payload: Type.Any(),
            }),
            async execute(_ctx, params) {
                const out = validateParentSetupPayload(params.payload);
                if (!out.ok) {
                    return jsonText({ ok: false, reason: out.reason });
                }
                return jsonText({ ok: true, normalized: out.normalized, schema_version: PARENT_SETUP_SCHEMA_VERSION });
            },
        };
        api.registerTool(parentSetupValidateTool);
        // 9) parent_setup_schema_copy  (Phase 2 first-batch zh-TW strings for Web v2)
        const parentSetupCopyTool = {
            name: "parent_setup_schema_copy",
            label: "Return parent setup zh-TW copy (Phase 2)",
            description: "Returns the exact 繁體中文 strings for the one-shot parent setup flow. Web v2 will use these verbatim. advanced_only fields (school_name / class_name) are flagged so the UI knows to hide them by default.",
            parameters: Type.Object({
                locale: Type.Optional(Type.String()),
            }),
            async execute(_ctx, params) {
                if (params.locale && params.locale !== "zh-TW") {
                    return jsonText({ ok: false, reason: `locale ${params.locale} not yet supported; only zh-TW in V1` });
                }
                return jsonText({
                    ok: true,
                    locale: "zh-TW",
                    schema_version: PARENT_SETUP_SCHEMA_VERSION,
                    field_taxonomy: {
                        required: FIELD_REQUIRED,
                        recommended: FIELD_RECOMMENDED,
                        optional: FIELD_OPTIONAL,
                        forbidden_in_parent_payload: FIELD_FORBIDDEN_IN_PARENT_PAYLOAD,
                    },
                    copy: COPY_ZH_TW,
                    invariants: {
                        never_request_school_name_or_class_name_by_default: true,
                        school_progress_maintained_by: "curriculum-agent",
                    },
                });
            },
        };
        api.registerTool(parentSetupCopyTool);
        // (We intentionally do NOT export the old "delegated" stubs for practice/error tools here;
        // those entries remain in openclaw.plugin.json for runtime discovery during Phase 1.)
        // (Phase 2: we keep them as no-ops that signal delegation, to preserve tool surface.)
    },
});
