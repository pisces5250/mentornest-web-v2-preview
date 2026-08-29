// prerequisite_chain.mjs
//
// Phase 3 sub-session A — math-only prerequisite chain.
//
//   - getMathPrerequisites({knowledge_point})   →  ordered prerequisite list
//   - weakestPrerequisite({student_id, knowledge_point})  → lowest-mastery
//                                                         non-mastered prere
//
// We treat prior-grade same-topic as canonical prereqs:
//
//   math.G2.NUM.add-sub-100 ← math.G1.NUM.add-sub-20
//   math.G3.NUM.multiply-1-9 ← math.G2.NUM.multiply-intro
//   math.G3.FRAC.intro-fraction ← (none — first appearance)
//   math.G4.FRAC.proper-fraction-compare ← math.G3.FRAC.intro-fraction
//   math.G4.FRAC.proper-fraction-add-sub ← math.G3.FRAC.intro-fraction
//   math.G4.GEOM.angle-intro ← math.G3.GEOM.perimeter-intro
//   math.G5.FRAC.add-unlike-denom ← math.G4.FRAC.proper-fraction-add-sub
//   math.G5.FRAC.multiply-fraction-by-integer ← math.G4.FRAC.proper-fraction-add-sub
//   math.G5.DECIMAL.intro-and-compare ← math.G4.NUM.big-numbers
//   math.G5.RATIO.intro ← math.G4.FRAC.proper-fraction-compare
//   math.G5.GEOM.area-triangle-quad ← math.G3.GEOM.perimeter-intro
//   math.G5.VOLUME.cubic-cm ← math.G5.GEOM.area-triangle-quad
//   math.G6.FRAC.multiply-fraction-fraction ← math.G5.FRAC.multiply-fraction-by-integer
//   math.G6.FRAC.divide-fraction-by-integer ← math.G5.FRAC.multiply-fraction-by-integer
//   math.G6.RATIO.scale-and-proportion ← math.G5.RATIO.intro
//   math.G6.DECIMAL.add-sub-multiply ← math.G5.DECIMAL.intro-and-compare
//   math.G6.PERCENT.intro ← math.G5.RATIO.intro  (decimal/fraction prior helpful)
//   math.G6.GEOM.surface-area-and-volume ← math.G5.GEOM.area-triangle-quad
//
// Anything not in this hard-coded map returns an empty array (the math
// curriculum is small enough that "everything else" is implicit). The list
// is ordered: earlier = harder prereq to skip.

const PREREQ_MAP = {
  "math.G2.NUM.add-sub-100": ["math.G1.NUM.add-sub-20"],
  "math.G2.NUM.multiply-intro": ["math.G1.NUM.add-sub-20"],
  "math.G2.MEAS.length-cm-m": ["math.G1.GEOM.shape-recognition"],
  "math.G3.NUM.multiply-1-9": ["math.G2.NUM.multiply-intro"],
  "math.G3.FRAC.intro-fraction": [],
  "math.G3.GEOM.perimeter-intro": ["math.G2.MEAS.length-cm-m"],
  "math.G4.NUM.big-numbers": ["math.G3.NUM.multiply-1-9"],
  "math.G4.FRAC.proper-fraction-compare": ["math.G3.FRAC.intro-fraction"],
  "math.G4.FRAC.proper-fraction-add-sub": ["math.G4.FRAC.proper-fraction-compare"],
  "math.G4.GEOM.angle-intro": ["math.G3.GEOM.perimeter-intro"],
  "math.G5.FRAC.add-unlike-denom": ["math.G4.FRAC.proper-fraction-add-sub"],
  "math.G5.FRAC.multiply-fraction-by-integer": ["math.G4.FRAC.proper-fraction-add-sub"],
  "math.G5.DECIMAL.intro-and-compare": ["math.G4.NUM.big-numbers"],
  "math.G5.RATIO.intro": ["math.G4.FRAC.proper-fraction-compare"],
  "math.G5.GEOM.area-triangle-quad": ["math.G3.GEOM.perimeter-intro"],
  "math.G5.VOLUME.cubic-cm": ["math.G5.GEOM.area-triangle-quad"],
  "math.G6.FRAC.multiply-fraction-fraction": ["math.G5.FRAC.multiply-fraction-by-integer"],
  "math.G6.FRAC.divide-fraction-by-integer": ["math.G5.FRAC.multiply-fraction-by-integer"],
  "math.G6.RATIO.scale-and-proportion": ["math.G5.RATIO.intro"],
  "math.G6.DECIMAL.add-sub-multiply": ["math.G5.DECIMAL.intro-and-compare"],
  "math.G6.PERCENT.intro": ["math.G5.DECIMAL.intro-and-compare"],
  "math.G6.GEOM.surface-area-and-volume": ["math.G5.GEOM.area-triangle-quad"],
};

const KP_META = {
  // description lookup (matches curriculum/math.yaml)
  "math.G1.NUM.count-and-compare": "10 以內的數、計數、大小比較",
  "math.G1.NUM.add-sub-10": "10 以內的加減",
  "math.G1.NUM.add-sub-20": "20 以內的加減",
  "math.G1.GEOM.shape-recognition": "平面圖形（圓、三角形、四邊形）的辨識",
  "math.G2.NUM.add-sub-100": "100 以內的加減；進位與退位",
  "math.G2.NUM.multiply-intro": "乘法概念；2、5、10 的乘法表",
  "math.G2.MEAS.length-cm-m": "長度（公分、公尺）的實測與換算",
  "math.G3.NUM.multiply-1-9": "1–9 乘法表；乘法直式",
  "math.G3.FRAC.intro-fraction": "分數的初步認識；等分分數",
  "math.G3.GEOM.perimeter-intro": "周長的認識與計算",
  "math.G4.NUM.big-numbers": "億以內的數；大數位值",
  "math.G4.FRAC.proper-fraction-compare": "真分數的大小比較與加減（等分母）",
  "math.G4.FRAC.proper-fraction-add-sub": "異分母真分數的加減（公倍數基礎）",
  "math.G4.GEOM.angle-intro": "角度的認識與量測",
  "math.G5.FRAC.add-unlike-denom": "異分母分數的加減（含帶分數）",
  "math.G5.FRAC.multiply-fraction-by-integer": "分數乘以整數",
  "math.G5.DECIMAL.intro-and-compare": "小數的認識、位值與大小比較",
  "math.G5.RATIO.intro": "比與比值；等值比",
  "math.G5.GEOM.area-triangle-quad": "三角形與四邊形面積",
  "math.G5.VOLUME.cubic-cm": "立方公分；正方體、長方體體積",
  "math.G6.FRAC.multiply-fraction-fraction": "分數乘以分數",
  "math.G6.FRAC.divide-fraction-by-integer": "分數除以整數",
  "math.G6.RATIO.scale-and-proportion": "比例與成正比",
  "math.G6.DECIMAL.add-sub-multiply": "小數的四則運算",
  "math.G6.PERCENT.intro": "百分率；小數、分數、百分率的互換",
  "math.G6.GEOM.surface-area-and-volume": "柱體表面積與體積",
};

// ---------- Pure helpers ----------

export function getMathPrerequisites({ knowledge_point }) {
  if (!knowledge_point || !knowledge_point.startsWith("math.")) {
    return { knowledge_point, prereqs: [], found: false };
  }
  const list = PREREQ_MAP[knowledge_point] || [];
  return {
    knowledge_point,
    found: list.length > 0 || knowledge_point in KP_META,
    prereqs: list.map((kp) => ({
      knowledge_point: kp,
      description_zh: KP_META[kp] || null,
    })),
  };
}

export function listAllPrereqPairs() {
  return Object.entries(PREREQ_MAP).map(([kp, prereqs]) => ({ knowledge_point: kp, prereqs }));
}

// ---------- Async helpers that consult mastery_store ----------

import { listMastery } from "./mastery_store.mjs";

const MASTERED_THRESHOLD = 0.85;

async function queryMastery(student_id, kp) {
  try {
    const m = await listMastery(student_id, { subject: "math" });
    const exact = m.find((r) => r.knowledge_point === kp);
    if (exact) return { mastery: exact.mastery, evidence_count: exact.evidence_count };
    return { mastery: 0, evidence_count: 0 };
  } catch (e) {
    return { mastery: 0, evidence_count: 0 };
  }
}

/**
 * Find the lowest-mastery non-mastered prerequisite for the given KP.
 *
 * @param {{student_id:string, knowledge_point:string}} input
 * @returns {Promise<{
 *   knowledge_point:string,
 *   prereq:any,
 *   mastery:number,
 *   evidence_count:number,
 *   recommendation_zh:string,
 *   mastered:boolean,
 * }>}
 */
export async function weakestPrerequisite({ student_id, knowledge_point }) {
  if (!student_id) throw new Error("student_id required");
  const chain = getMathPrerequisites({ knowledge_point });
  if (!chain.prereqs.length) {
    return {
      knowledge_point,
      prereq: null,
      mastery: null,
      evidence_count: null,
      recommendation_zh: "此知識點目前沒有列出的先備知識；可繼續前進。",
      mastered: false,
    };
  }

  let weakest = null;
  let weakestMastery = 1.1;
  for (const prereq of chain.prereqs) {
    const m = await queryMastery(student_id, prereq.knowledge_point);
    if (m.mastery < weakestMastery) {
      weakestMastery = m.mastery;
      weakest = { ...prereq, ...m };
    }
  }

  const mastered = weakest ? weakestMastery >= MASTERED_THRESHOLD : false;
  let recommendation_zh;
  if (!weakest) {
    recommendation_zh = "查無先備知識資料。";
  } else if (mastered) {
    recommendation_zh = `先備 ${weakest.knowledge_point} 已達精熟（${(weakestMastery * 100).toFixed(0)}%）`;
  } else if (weakestMastery < 0.4) {
    recommendation_zh = `建議先回到先備「${weakest.knowledge_point}」做基礎練習，目前精熟度僅 ${(weakestMastery * 100).toFixed(0)}%`;
  } else if (weakestMastery < 0.7) {
    recommendation_zh = `建議快速複習「${weakest.knowledge_point}」，目前精熟度 ${(weakestMastery * 100).toFixed(0)}%`;
  } else {
    recommendation_zh = `先備「${weakest.knowledge_point}」接近精熟，可邊學邊複習`;
  }

  return {
    knowledge_point,
    prereq: weakest,
    mastery: weakest ? weakestMastery : null,
    evidence_count: weakest ? weakest.evidence_count : null,
    recommendation_zh,
    mastered,
  };
}
