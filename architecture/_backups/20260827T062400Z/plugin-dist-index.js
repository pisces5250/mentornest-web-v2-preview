import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import fs from "node:fs/promises";
import path from "node:path";
const WORKSPACE = "/home/node/.openclaw/workspace";
const STUDENTS_DIR = path.join(WORKSPACE, "data", "students");
const RECORDS_DIR = path.join(WORKSPACE, "data", "learning-records");
async function ensureDirs() {
    await fs.mkdir(STUDENTS_DIR, { recursive: true });
    await fs.mkdir(RECORDS_DIR, { recursive: true });
}
function safeStudentId(id) {
    if (!/^student_[A-Za-z0-9_-]+$/.test(id)) {
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

function normalizeChineseSpacing(value) {
    if (typeof value !== "string") {
        return value;
    }

    const chars = [...value.trim()];
    const output = [];

    function isCJK(ch) {
        if (!ch) return false;

        const code = ch.codePointAt(0);

        return (
            (code >= 0x3400 && code <= 0x4DBF) ||
            (code >= 0x4E00 && code <= 0x9FFF) ||
            (code >= 0xF900 && code <= 0xFAFF)
        );
    }

    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];

        if (
            ch === " " &&
            isCJK(chars[i - 1]) &&
            isCJK(chars[i + 1])
        ) {
            continue;
        }

        output.push(ch);
    }

    return output
        .join("")
        .replace(/\s+([，。！？；：、])/g, "$1")
        .replace(/([，。！？；：、])\s+/g, "$1");
}

function normalizeDeep(value) {
    if (typeof value === "string") {
        return normalizeChineseSpacing(value);
    }

    if (Array.isArray(value)) {
        return value.map(normalizeDeep);
    }

    if (value && typeof value === "object") {
        const result = {};

        for (const [key, item] of Object.entries(value)) {
            result[key] = normalizeDeep(item);
        }

        return result;
    }

    return value;
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


// ---------- Result helpers ----------
function textResult(text, details) {
    return {
        content: [{ type: "text", text }],
        details,
    };
}
// ---------- Plugin entry ----------
export default definePluginEntry({
    id: "mentornest-learning",
    name: "MentorNest Learning",
    description: "Persistent student profiles and learning records",
    register(api) {
        // ---- student_profile_get ----
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
        // ---- student_profile_update ----
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
                    profile = (await readStudent(p.student_id));
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
                    if (p.publisher !== undefined) {
                        profile.curriculum[p.subject].publisher = p.publisher;
                    }
                    if (p.current_unit !== undefined) {
                        profile.curriculum[p.subject].current_unit = p.current_unit;
                    }
                }
                profile.updated_at = new Date().toISOString();
                await writeStudent(p.student_id, profile);
                return textResult(`Student profile updated: ${p.student_id}`, profile);
            },
        };
        api.registerTool(updateProfileTool);
        // ---- learning_record_append ----
        const appendRecordTool = {
            name: "learning_record_append",
            label: "Append learning record",
            description: "Append one meaningful academic learning event to a student's persistent MentorNest learning history. Do not use for casual conversation.",
            parameters: LearningRecordAppendParams,
            async execute(_toolCallId, params) {
                await ensureDirs();
                const p = normalizeDeep(params);
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

        // ---- generate_practice_set ----
        const generatePracticeSetTool = {
            name: "generate_practice_set",
            label: "Generate practice set",
            description: "Generate a structured practice set for a known student, subject, and knowledge point using the MentorNest agent.",
            parameters: GeneratePracticeSetParams,

            async execute(_toolCallId, params) {
                const count = Math.max(
                    1,
                    Math.min(10, Math.floor(params.count ?? 5))
                );

                let profile = null;

                try {
                    profile = await readStudent(params.student_id);
                } catch {
                    profile = null;
                }

                const grade =
                    profile?.grade ?? null;

                const prompt = `
 MentorNest 的出題引擎。



opencalw
student_id: ${params.student_id}
: ${grade ?? "未知"}
: ${params.subject}
: ${params.knowledge_point}
: ${params.difficulty ?? "normal"}
:::::::: ${count}

opencalw
1. 題目必須符合學生年級。
2. 題目要真正測試「${params.knowledge_point}」。
3. 題目由簡單到稍難。
4. 優先使用小學生看得懂的語言。
5. 先全部做成 multiple_choice。
6. 每題必須有 4 個選項。
7. 必須提供正確答案。
8. 不要呼叫任何工具。
9. 不要輸出 Markdown。
10. 只輸出合法 JSON。

JSON 格式必須完全符合：

{
  "student_id": "${params.student_id}",
  "subject": "${params.subject}",
  "knowledge_point": "${params.knowledge_point}",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "prompt": "題目文字",
      "choices": ["選項1","選項2","選項3","選項4"],
      "answer": "正確選項完整文字",
      "difficulty": "easy"
    }
  ]
}
`;

                const gatewayToken =
                    process.env.OPENCLAW_GATEWAY_TOKEN ??
                    process.env.OPENCLAW_GATEWAY_AUTH_TOKEN;

                let token = gatewayToken;

                if (!token) {
                    try {
                        const configRaw =
                            await fs.readFile(
                                "/home/node/.openclaw/openclaw.json",
                                "utf8"
                            );

                        token =
                            JSON.parse(configRaw)
                                ?.gateway
                                ?.auth
                                ?.token;
                    } catch {
                        token = null;
                    }
                }

                if (!token) {
                    throw new Error(
                        "Gateway token unavailable"
                    );
                }

                const response =
                    await fetch(
                        "http://127.0.0.1:18789/v1/responses",
                        {
                            method: "POST",

                            headers: {
                                "Authorization":
                                    "Bearer " + token,

                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                model: "openclaw",
                                input: prompt
                            })
                        }
                    );

                if (!response.ok) {
                    const errorText =
                        await response.text();

                    throw new Error(
                        "OpenClaw responses API failed: " +
                        response.status +
                        " " +
                        errorText
                    );
                }

                const responseJson =
                    await response.json();

                const outputText =
                    responseJson?.output?.[0]
                        ?.content?.find(
                            item =>
                                item.type === "output_text"
                        )
                        ?.text;

                if (!outputText) {
                    throw new Error(
                        "No output_text returned"
                    );
                }

                let result;

                try {
                    result =
                        normalizeDeep(
                            JSON.parse(outputText)
                        );
                } catch {
                    throw new Error(
                        "Model returned invalid JSON: " +
                        outputText
                    );
                }

                if (!Array.isArray(result.questions)) {
                    throw new Error(
                        "Generated result has no questions array"
                    );
                }

                result.questions =
                    result.questions.slice(0, count);

                return textResult(
                    JSON.stringify(result),
                    result
                );
            },
        };

        api.registerTool(generatePracticeSetTool);

        // ---- classify_math_error ----
        const classifyMathErrorTool = {
            name: "classify_math_error",
            label: "Classify math error",
            description: "Classify a student's wrong math answer into a useful learning error type.",
            parameters: ClassifyMathErrorParams,

            async execute(_toolCallId, params) {

                let profile = null;

                try {
                    profile = await readStudent(params.student_id);
                } catch {
                    profile = null;
                }

                const grade =
                    profile?.grade ?? "未知";

                const prompt = `
 MentorNest 的數學錯誤診斷引擎。

opencalw

opencalw${grade}
opencalw${params.knowledge_point}

opencalw
${params.question}

opencalw
${params.student_answer}

#
opencalw
${params.correct_answer}

opencalw

concept_misunderstanding
calculation_error
reading_comprehension
careless_error
unknown

opencalw

concept_misunderstanding
= 對核心概念或方法理解錯誤

calculation_error
= 方法大致正確，但數值計算錯誤

reading_comprehension
= 看錯題意、條件、單位或問題要求

careless_error
= 明顯粗心，例如抄錯、漏看符號、選錯已算出的答案

unknown
= 資訊不足，無法可靠判斷

 JSON，不要 Markdown，不要解釋其他內容。

opencalw

{
  "error_type": "concept_misunderstanding",
  "reason": "簡短中文原因",
  "confidence": 0.85
}
`;

                let token = null;

                try {
                    const configRaw =
                        await fs.readFile(
                            "/home/node/.openclaw/openclaw.json",
                            "utf8"
                        );

                    token =
                        JSON.parse(configRaw)
                            ?.gateway
                            ?.auth
                            ?.token;

                } catch {
                    token = null;
                }

                if (!token) {
                    throw new Error(
                        "Gateway token unavailable"
                    );
                }

                const response =
                    await fetch(
                        "http://127.0.0.1:18789/v1/responses",
                        {
                            method: "POST",

                            headers: {
                                "Authorization":
                                    "Bearer " + token,

                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                model: "openclaw",
                                input: prompt
                            })
                        }
                    );

                if (!response.ok) {
                    const errorText =
                        await response.text();

                    throw new Error(
                        "OpenClaw responses API failed: " +
                        response.status +
                        " " +
                        errorText
                    );
                }

                const responseJson =
                    await response.json();

                const outputText =
                    responseJson?.output?.[0]
                        ?.content?.find(
                            item =>
                                item.type === "output_text"
                        )
                        ?.text;

                if (!outputText) {
                    throw new Error(
                        "No output_text returned"
                    );
                }

                let result;

                try {
                    result =
                        normalizeDeep(
                            JSON.parse(outputText)
                        );
                } catch {
                    throw new Error(
                        "Model returned invalid JSON: " +
                        outputText
                    );
                }

                const allowed = new Set([
                    "concept_misunderstanding",
                    "calculation_error",
                    "reading_comprehension",
                    "careless_error",
                    "unknown"
                ]);

                if (!allowed.has(result.error_type)) {
                    result.error_type = "unknown";
                }

                if (
                    typeof result.confidence !== "number" ||
                    result.confidence < 0 ||
                    result.confidence > 1
                ) {
                    result.confidence = null;
                }

                return textResult(
                    JSON.stringify(result),
                    result
                );
            },
        };

        api.registerTool(classifyMathErrorTool);

    },
});
