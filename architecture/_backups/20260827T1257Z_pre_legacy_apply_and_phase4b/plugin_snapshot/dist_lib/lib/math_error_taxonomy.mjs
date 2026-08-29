// math_error_taxonomy.mjs
//
// Math-specific error taxonomy. Hierarchical: each top-level category has 1–4
// specific sub-codes. Used by Math Specialist v2 for diagnosis → hint routing.
// Codes use the family "MATH-*" so they do not collide with "ZH-*" Chinese
// taxonomy or with the legacy generic error_type strings used in Phase 1.

export const MATH_ERROR_TAXONOMY = [
  // ---- 概念 (concept) ----
  {
    code: "MATH-CONCEPT",
    label_zh: "概念迷思",
    description: "學生對該知識點的核心概念理解不足",
    hint_template: "讓我們先確認這個關鍵概念的意義。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-CONCEPT-OP", label_zh: "運算概念模糊", description: "不理解加/減/乘/除的核心意義" },
      { code: "MATH-CONCEPT-FRAC", label_zh: "分數概念模糊", description: "分數視為兩個整數而非『部分與整體』" },
      { code: "MATH-CONCEPT-DEC", label_zh: "小數位值", description: "小數位值與進位關係不清楚" },
      { code: "MATH-CONCEPT-RATIO", label_zh: "比與比例觀念", description: "不理解比值或正比例關係" },
    ],
  },
  // ---- 程序 (procedure) ----
  {
    code: "MATH-PROCEDURE",
    label_zh: "程序錯誤",
    description: "解題步驟順序或方法不正確",
    hint_template: "我們把步驟一步一步重新整理看看。",
    representation_hint: "visual",
    children: [
      { code: "MATH-PROCEDURE-ORDER", label_zh: "步驟順序錯誤", description: "先乘除後加減或括號處理錯誤" },
      { code: "MATH-PROCEDURE-ALGO", label_zh: "直式演算錯誤", description: "直式計算進位退位搞錯" },
      { code: "MATH-PROCEDURE-FORMULA", label_zh: "公式套用錯誤", description: "公式套對象錯誤（如面積/周長）" },
    ],
  },
  // ---- 計算 (calculation) ----
  {
    code: "MATH-CALCULATION",
    label_zh: "計算錯誤",
    description: "運算結果本身算錯，程序正確",
    hint_template: "看得出你抓到方法了，再驗算一次數字。",
    representation_hint: "symbolic",
    children: [
      { code: "MATH-CALC-ADD-SUB", label_zh: "加減計算錯", description: "個位/十位加法進退位錯誤" },
      { code: "MATH-CALC-MUL-DIV", label_zh: "乘除計算錯", description: "九九乘法或除法步驟錯誤" },
      { code: "MATH-CALC-CARRY", label_zh: "進位錯誤", description: "進位遺漏或多進" },
    ],
  },
  // ---- 單位 (unit) ----
  {
    code: "MATH-UNIT",
    label_zh: "單位換算錯誤",
    description: "單位換算或標示錯誤",
    hint_template: "先確認題目問的單位是什麼，再看你的答案是什麼單位。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-UNIT-LENGTH", label_zh: "長度單位錯", description: "公分/公尺/公里關係錯誤" },
      { code: "MATH-UNIT-WEIGHT", label_zh: "重量單位錯", description: "克/公斤/公噸關係錯誤" },
      { code: "MATH-UNIT-VOLUME", label_zh: "容量/體積單位錯", description: "毫升/公升/立方公分關係錯誤" },
    ],
  },
  // ---- 題意理解 (stem reading) ----
  {
    code: "MATH-STEM",
    label_zh: "題意理解錯誤",
    description: "沒抓到題目關鍵條件或問句",
    hint_template: "我們先把題目重讀一次，把『已知』與『問的』分開標出來。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-STEM-MISSED-COND", label_zh: "漏看條件", description: "忽略題目給的某個限制或已知" },
      { code: "MATH-STEM-QUESTION", label_zh: "問錯問題", description: "解的是另一個問題" },
      { code: "MATH-STEM-KEYWORD", label_zh: "關鍵詞誤讀", description: "比/多/少/倍/共/剩下理解反了" },
    ],
  },
  // ---- 數感 (number sense) ----
  {
    code: "MATH-NUMSENSE",
    label_zh: "數感不足",
    description: "估算/數量級判斷錯誤",
    hint_template: "先大約估一下答案大概多大，再算精確值。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-NUMSENSE-ESTIMATE", label_zh: "估算錯誤", description: "數量級差很多倍" },
      { code: "MATH-NUMSENSE-MAGNITUDE", label_zh: "大小判斷錯", description: "分數/小數大小判斷錯誤" },
    ],
  },
  // ---- 分數運算 (fraction ops) ----
  {
    code: "MATH-FRAC-OPS",
    label_zh: "分數運算錯誤",
    description: "分數四則運算錯誤",
    hint_template: "畫一條分數線，把分數『通分』再算。",
    representation_hint: "visual",
    children: [
      { code: "MATH-FRAC-ADD-DIFF", label_zh: "異分母加法錯", description: "通分錯誤或未通分" },
      { code: "MATH-FRAC-MUL", label_zh: "分數乘法錯", description: "分子分母交叉乘或約分錯誤" },
      { code: "MATH-FRAC-DIV", label_zh: "分數除法錯", description: "未取倒數或顛倒錯誤" },
      { code: "MATH-FRAC-MIXED", label_zh: "帶分數處理錯", description: "帶分數化為假分數或整數部分處理錯" },
    ],
  },
  // ---- 小數運算 (decimal ops) ----
  {
    code: "MATH-DEC-OPS",
    label_zh: "小數運算錯誤",
    description: "小數加減乘除錯誤",
    hint_template: "把小數的小數點對齊，補零到相同位數。",
    representation_hint: "symbolic",
    children: [
      { code: "MATH-DEC-ALIGN", label_zh: "小數點對位錯", description: "小數點未對齊" },
      { code: "MATH-DEC-DECIMAL-COUNT", label_zh: "小數位數錯", description: "答案小數位數錯" },
    ],
  },
  // ---- 比例 (ratio / proportion) ----
  {
    code: "MATH-RATIO",
    label_zh: "比例錯誤",
    description: "比/比值/正比例計算錯誤",
    hint_template: "先把題目中兩個量寫成比，再看是要放大還是縮小。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-RATIO-EQUIV", label_zh: "等值比", description: "找不出等值比" },
      { code: "MATH-RATIO-PROP", label_zh: "正比例計算", description: "未列比例式直接相乘" },
    ],
  },
  // ---- 圖形 (geometry) ----
  {
    code: "MATH-GEOM",
    label_zh: "圖形概念錯誤",
    description: "幾何圖形/空間關係錯誤",
    hint_template: "把圖形畫出來，標出已知邊長再看。",
    representation_hint: "visual",
    children: [
      { code: "MATH-GEOM-SHAPE-ID", label_zh: "圖形辨識錯", description: "認錯圓/三角形/四邊形" },
      { code: "MATH-GEOM-AREA-VS-PERIM", label_zh: "面積/周長搞混", description: "用錯公式" },
      { code: "MATH-GEOM-FACE", label_zh: "立體圖形要素", description: "面/邊/頂點對應錯誤" },
    ],
  },
  // ---- 公式記憶 (formula recall) ----
  {
    code: "MATH-FORMULA",
    label_zh: "公式記憶錯誤",
    description: "公式本身記錯或記反",
    hint_template: "公式的來源我們用一個小故事記起來。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-FORMULA-FORGET", label_zh: "忘了公式", description: "完全記不起公式" },
      { code: "MATH-FORMULA-SWAP", label_zh: "公式記反", description: "公式符號記反" },
    ],
  },
  // ---- 解題策略 (problem-solving strategy) ----
  {
    code: "MATH-STRATEGY",
    label_zh: "解題策略錯誤",
    description: "無法選對解題策略或拆解題目",
    hint_template: "先想想看：這種題目常見的解法有哪幾種？",
    representation_hint: "concrete",
    children: [
      { code: "MATH-STRATEGY-CHOOSE", label_zh: "策略選擇錯", description: "選了不合適的策略" },
      { code: "MATH-STRATEGY-BACKTRACK", label_zh: "不願回頭", description: "卡住不願重新審視條件" },
    ],
  },
  // ---- 表徵切換 (representation switching) ----
  {
    code: "MATH-REPR",
    label_zh: "表徵切換失敗",
    description: "無法在符號/具體/視覺之間切換",
    hint_template: "我們換一種方式描述同一件事試試看。",
    representation_hint: "visual",
    children: [
      { code: "MATH-REPR-CONCRETE-FAIL", label_zh: "具體表徵失敗", description: "用實物操作仍不理解" },
      { code: "MATH-REPR-SYMBOLIC-FAIL", label_zh: "符號表徵失敗", description: "符號抽象化失敗" },
    ],
  },
  // ---- 文字題分解 (word problem decomposition) ----
  {
    code: "MATH-WP",
    label_zh: "文字題分解失敗",
    description: "無法把文字題拆成數學條件",
    hint_template: "把題目畫成一張圖或表格，把量寫出來。",
    representation_hint: "visual",
    children: [
      { code: "MATH-WP-QUANT", label_zh: "量未抽出", description: "沒有標出已知量與未知量" },
      { code: "MATH-WP-UNIT", label_zh: "文字題單位錯", description: "題目單位不一致未轉換" },
    ],
  },
  // ---- 先備知識缺失 (prerequisite) ----
  {
    code: "MATH-PREREQ",
    label_zh: "先備知識不足",
    description: "此知識點需要的基礎未學會",
    hint_template: "我們先回到上一步的基礎練習，先把地基打穩。",
    representation_hint: "concrete",
    children: [
      { code: "MATH-PREREQ-MISSING", label_zh: "基礎缺失", description: "必要先備知識未具備" },
      { code: "MATH-PREREQ-WEAK", label_zh: "基礎薄弱", description: "先備不穩需重新鞏固" },
    ],
  },
];

const ALL_CODES = (() => {
  const out = new Set();
  for (const top of MATH_ERROR_TAXONOMY) {
    out.add(top.code);
    for (const c of top.children || []) out.add(c.code);
  }
  return Array.from(out);
})();

export function lookupMathErrorCode(code) {
  if (!code) return null;
  for (const top of MATH_ERROR_TAXONOMY) {
    if (top.code === code) return top;
    for (const c of top.children || []) {
      if (c.code === code) return { ...c, parent: top.code };
    }
  }
  return null;
}

export function listMathErrorsByCategory(category) {
  if (!category) return [];
  const hit = MATH_ERROR_TAXONOMY.find((t) => t.code === category);
  return hit ? [hit, ...(hit.children || []).map((c) => ({ ...c, parent: hit.code }))] : [];
}

export function listMathErrorCategories() {
  return MATH_ERROR_TAXONOMY.map((t) => ({ code: t.code, label_zh: t.label_zh }));
}

export function mathErrorTaxonomySize() {
  return ALL_CODES.length;
}

export function validateMathErrorTaxonomy() {
  const seen = new Set();
  const dupes = [];
  for (const top of MATH_ERROR_TAXONOMY) {
    if (seen.has(top.code)) dupes.push(top.code);
    seen.add(top.code);
    for (const c of top.children || []) {
      if (seen.has(c.code)) dupes.push(c.code);
      seen.add(c.code);
    }
  }
  return {
    ok: dupes.length === 0,
    duplicates: dupes,
    total_codes: ALL_CODES.length,
    category_count: MATH_ERROR_TAXONOMY.length,
  };
}
