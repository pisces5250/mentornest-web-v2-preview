// Profile v2 — one-shot parent setup payload schema + 繁體中文文案.
//
// Phase 2 V1: NO web UI. We deliver a JSON Schema-equivalent validator and
// the exact copy strings (zh-TW) that Phase 5 Web v2 will surface.
//
// Hard rules:
//   - Optional fields (school_name / class_name) MUST NOT be requested by
//     default; if they appear in the payload they must be explicit.
//   - school_progress is maintained by curriculum-agent (continuous), not by
//     parent. It is therefore rejected if present in parent payload.
//   - Required fields are minimal: display_name, school_year.
//     Highly recommended: grade, school_curriculum.
//     Optional (parent may skip entirely): textbook_version, learning_goals,
//       parent_concerns, school_name, class_name.

export const PARENT_SETUP_SCHEMA_VERSION = "profile-v2.1";

export const FIELD_REQUIRED = ["display_name", "school_year"];
export const FIELD_RECOMMENDED = ["grade", "school_curriculum"];
export const FIELD_OPTIONAL = [
  "textbook_version",
  "learning_goals",
  "parent_concerns",
  "school_name", // explicit only; never requested by default
  "class_name",  // explicit only; never requested by default
];
export const FIELD_FORBIDDEN_IN_PARENT_PAYLOAD = ["school_progress", "schema_version", "updated_at", "student_id"];

/**
 * zh-TW copy strings. Web v2 will use these verbatim.
 *
 * Each entry is { title, description, hint } where:
 *   - title: short field label
 *   - description: 1-sentence explanation of why we ask
 *   - hint: example value or guidance
 *   - skip_label: button text on the optional skip affordance
 */
export const COPY_ZH_TW = Object.freeze({
  // Welcome
  welcome: {
    title: "歡迎使用 MentorNest",
    description: "為了讓 AI 老師更貼近孩子的學習，這份設定只需要回答一次。之後隨時都可以再調整。",
    button_start: "開始設定",
    button_skip_optional: "略過可選欄位",
  },

  // Required
  display_name: {
    title: "孩子的暱稱",
    description: "AI 老師會用這個名字稱呼孩子。建議使用孩子平常被稱呼的小名。",
    hint: "例如：小宇、彤彤",
    required: true,
  },
  school_year: {
    title: "目前學年",
    description: "例如「2026」代表 2026 學年度（西元）。",
    hint: "例如：2026",
    required: true,
  },

  // Recommended
  grade: {
    title: "目前年級",
    description: "用來對齊教育部課程綱要與知識點路徑。",
    hint: "例如：5（國小五年級）",
    required_recommended: true,
  },
  school_curriculum: {
    title: "主要使用的課程",
    description: "我們只記錄這個資訊以對應教育部課綱；不會拿來評量或比較。",
    hint: "例如：教育部 十二年國民基本教育、IB PYP、自學",
    required_recommended: true,
  },

  // Optional
  textbook_version: {
    title: "課本版本（選填）",
    description: "若孩子學校採用特定課本，告訴我們可以更貼近學校進度。",
    hint: "例如：南一、康軒、翰林",
    required: false,
    skip_label: "我不指定課本",
  },
  learning_goals: {
    title: "這個學期希望加強的方向（選填）",
    description: "可以用一兩句話描述，例如「想打好分數計算」或「練習閱讀理解」。",
    hint: "例如：分數四則運算、應用題列式",
    required: false,
    skip_label: "目前沒有特別方向",
  },
  parent_concerns: {
    title: "家長的擔心或觀察（選填）",
    description: "例如「容易粗心」、「對應用題沒信心」。AI 老師會在回饋時參考，但不會在孩子面前提到。",
    hint: "例如：粗心、寫字慢、不敢舉手",
    required: false,
    skip_label: "先不填",
  },

  // Optional but EXPLICITLY NEVER requested by default — only shown if the
  // parent proactively opens an "advanced settings" section. UI must hide
  // these by default.
  school_name: {
    title: "學校名稱（進階，預設不顯示）",
    description: "除非家長主動填寫，否則我們不會記錄或詢問學校名稱。",
    hint: "例如：台北市中山國小",
    required: false,
    advanced_only: true,
    skip_label: "不填",
  },
  class_name: {
    title: "班級（進階，預設不顯示）",
    description: "除非家長主動填寫，否則我們不會記錄或詢問班級。",
    hint: "例如：五年三班",
    required: false,
    advanced_only: true,
    skip_label: "不填",
  },

  // Closing
  closing: {
    title: "設定完成",
    description: "孩子的學習設定已經保存。AI 老師會根據這些資訊調整回饋方式。",
    button_done: "開始學習",
    editable_note: "隨時可以從家長模式再次編輯。",
  },
});

/**
 * Validate a parent setup payload.
 *
 * @param {object} payload
 * @returns {{ ok: true, normalized: object } | { ok: false, reason: string }}
 */
export function validateParentSetupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "payload missing" };
  }
  if (payload.schema_version && payload.schema_version !== PARENT_SETUP_SCHEMA_VERSION) {
    return { ok: false, reason: `unknown schema_version ${payload.schema_version}` };
  }
  // Forbidden fields: must not appear
  for (const f of FIELD_FORBIDDEN_IN_PARENT_PAYLOAD) {
    if (f in payload) {
      return { ok: false, reason: `field ${f} is not allowed in parent setup payload` };
    }
  }
  // Required fields
  for (const f of FIELD_REQUIRED) {
    if (typeof payload[f] !== "string" || !payload[f].trim()) {
      return { ok: false, reason: `required field ${f} missing` };
    }
  }
  // Recommended: if present must be valid type; absence OK
  if (payload.grade !== undefined && (!Number.isInteger(payload.grade) || payload.grade < 1 || payload.grade > 12)) {
    return { ok: false, reason: `grade must be integer 1..12` };
  }
  if (payload.school_curriculum !== undefined && typeof payload.school_curriculum !== "string") {
    return { ok: false, reason: "school_curriculum must be string" };
  }
  // Optional: validate types when present
  if (payload.textbook_version !== undefined && typeof payload.textbook_version !== "string") {
    return { ok: false, reason: "textbook_version must be string" };
  }
  if (payload.learning_goals !== undefined) {
    if (typeof payload.learning_goals !== "string") return { ok: false, reason: "learning_goals must be string" };
    if (payload.learning_goals.length > 500) return { ok: false, reason: "learning_goals too long (>500)" };
  }
  if (payload.parent_concerns !== undefined) {
    if (typeof payload.parent_concerns !== "string") return { ok: false, reason: "parent_concerns must be string" };
    if (payload.parent_concerns.length > 1000) return { ok: false, reason: "parent_concerns too long (>1000)" };
  }
  if (payload.school_name !== undefined && typeof payload.school_name !== "string") {
    return { ok: false, reason: "school_name must be string" };
  }
  if (payload.class_name !== undefined && typeof payload.class_name !== "string") {
    return { ok: false, reason: "class_name must be string" };
  }

  // Build normalized payload (whitelist fields)
  const normalized = {
    schema_version: PARENT_SETUP_SCHEMA_VERSION,
    display_name: payload.display_name.trim(),
    school_year: payload.school_year.trim(),
  };
  if (payload.grade !== undefined) normalized.grade = payload.grade;
  if (payload.school_curriculum !== undefined) normalized.school_curriculum = payload.school_curriculum.trim();
  if (payload.textbook_version !== undefined) normalized.textbook_version = payload.textbook_version.trim();
  if (payload.learning_goals !== undefined) normalized.learning_goals = payload.learning_goals.trim();
  if (payload.parent_concerns !== undefined) normalized.parent_concerns = payload.parent_concerns.trim();
  // Only copy school_name / class_name if parent EXPLICITLY put them in.
  if (payload.school_name !== undefined) normalized.school_name = payload.school_name.trim();
  if (payload.class_name !== undefined) normalized.class_name = payload.class_name.trim();
  normalized.setup_completed_at = new Date().toISOString();
  return { ok: true, normalized };
}
