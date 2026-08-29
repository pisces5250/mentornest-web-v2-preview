// Social Studies Hint Ladder v1 — 5-level deterministic escalation.
//
// Level 0 = no hint needed (correct on first attempt)
// Level 1 = recall the core concept
// Level 2 = break down the judgment steps
// Level 3 = partial worked example
// Level 4 = full model + verification check
//
// Representation suggestion is chosen from the primary subskill and the
// first error code (so the student gets timeline / map / chart / source /
// text as soon as possible, instead of yet more text).

import { classifySocialStudiesSubskill } from "./social_studies_subskill_map.mjs";

export const SOCIAL_STUDIES_HINT_LEVELS = [
  "不需要提示",
  "回憶核心概念",
  "拆解判斷步驟",
  "提供部分示範",
  "完整模型與檢核",
];

function pickRepresentation({ primary, errorCodes, requested }) {
  if (requested === "text" || requested === "timeline" || requested === "map" ||
      requested === "source" || requested === "chart") {
    return requested;
  }
  const code = errorCodes[0] || "";
  if (code.startsWith("SS-TIME")) return "timeline";
  if (code.startsWith("SS-MAP") || code.startsWith("SS-GEO-COMPASS") ||
      code.startsWith("SS-GEO-SCALE") || code.startsWith("SS-GEO-LEGEND") ||
      code.startsWith("SS-GEO-CIVICS-REGION")) {
    return "map";
  }
  if (code.startsWith("SS-DATA")) return "chart";
  if (code.startsWith("SS-SRC")) return "source";
  if (code.startsWith("SS-CAUSAL")) return "timeline";
  // Subskill fallback
  if (primary === "timeline") return "timeline";
  if (primary === "map" || primary === "geography") return "map";
  if (primary === "data_interpretation") return "chart";
  if (primary === "source_comparison") return "source";
  if (primary === "causality") return "timeline";
  return "text";
}

export function nextSocialStudiesHint(input = {}) {
  const attempts = Math.max(1, Number(input.attempts) || 1);
  const codes = Array.isArray(input.error_codes) ? input.error_codes : [];
  const kp = String(input.knowledge_point || "這個社會領域概念");
  const sub = classifySocialStudiesSubskill({ knowledge_point: kp });
  const primary = sub.primary_subskill;

  let level;
  if (attempts <= 0) level = 0;
  else if (attempts === 1) level = 1;
  else if (attempts === 2) level = 2;
  else if (attempts <= 4) level = 3;
  else level = 4;

  const representation = pickRepresentation({
    primary,
    errorCodes: codes,
    requested: input.representation,
  });

  const texts = {
    0: "答對了，繼續保持。",
    1: `先想一想「${kp}」中最核心的概念或人物是什麼。`,
    2: "先拆解題目條件：時間、地點、人物各是什麼？再逐步核對每一個條件是否符合。",
    3: "先用一個你熟悉的相似例子套用相同的判斷步驟，再回到原題依序回答。",
    4: "完整模型：先確認概念與條件 → 套用規則或時間軸／地圖 → 用權利義務或史料分類檢核。",
  };

  return {
    level,
    level_name: SOCIAL_STUDIES_HINT_LEVELS[level],
    hint_text_zh: texts[level],
    representation_suggestion: representation,
    primary_error_code: codes[0] || null,
    primary_subskill: primary,
    reason: `${primary}-attempt-${attempts}`,
  };
}