import { Type, type Static } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool } from "openclaw/plugin-sdk/agent-harness";
import type { AgentToolResult } from "openclaw/plugin-sdk/agent-sessions";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE = "/home/node/.openclaw/workspace";
const STUDENTS_DIR = path.join(WORKSPACE, "data", "students");
const RECORDS_DIR = path.join(WORKSPACE, "data", "learning-records");

async function ensureDirs() {
  await fs.mkdir(STUDENTS_DIR, { recursive: true });
  await fs.mkdir(RECORDS_DIR, { recursive: true });
}

function safeStudentId(id: string) {
  if (!/^student_[A-Za-z0-9_-]+$/.test(id)) {
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

// ---------- Result helpers ----------

function textResult<T>(text: string, details: T): AgentToolResult<T> {
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

    // ---- student_profile_update ----
    const updateProfileTool: AnyAgentTool = {
      name: "student_profile_update",
      label: "Update student profile",
      description:
        "Persistently update MentorNest student profile fields such as display name, grade, curriculum or learning preferences. Use only after the student's identity is known.",
      parameters: StudentProfileUpdateParams,
      async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
        await ensureDirs();
        const p = params as StudentProfileUpdateInput;

        type ProfileShape = {
          student_id: string;
          display_name: string;
          grade: number | null;
          school_year: string;
          curriculum: Record<
            string,
            { publisher: string; current_unit: string }
          >;
          learning_preferences: Record<string, unknown>;
          updated_at?: string;
        };

        let profile: ProfileShape;
        try {
          profile = (await readStudent(p.student_id)) as ProfileShape;
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
  },
});
