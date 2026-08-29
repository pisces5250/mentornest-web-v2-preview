// word_problem_decomposer.mjs
//
// Phase 3 sub-session A. Pure text-only word-problem decomposition.
//
// Decompose a Chinese math word problem into:
//   - quantities[]         (named numbers)
//   - unknowns[]          (question targets)
//   - operations_hint[]   (suggested arithmetic operations)
//   - constraints[]       (key conditions stated in the stem)
//   - question_type       (part-part-whole | comparison | ratio | change |
//                          rate | proportion | measurement | fraction-mix |
//                          unknown — text-only fallback)
//   - vocabulary_clues[]  (matched Chinese math vocabulary)
//   - answer_unit_hint    (inferred answer unit)
//   - ambiguity_flags[]   (unclear cues)
//   - answer_kind_hint    (number | unit-expression | expression | string)
//
// We also bundle a small template matcher that, given a knowledge_point id
// from architecture/curriculum/math.yaml, picks one of several built-in
// templates and reports a confidence score.

// ---------- Vocabulary regex (zh-TW) ----------
//
// 比      — ratio / compare
// 多 / 少 — comparison or change
// 共      — sum
// 剩下    — subtraction residue
// 增加    — increase
// 減少    — decrease
// 倍      — multiplication as ratio
// 分數    — fractions
// 整除    — divisible / integer-quotient constraint
//
// All regexes are anchored loosely (no \b because Chinese has no word
// boundaries) and operate on the lowercased stem.

const VOCAB_RULES = [
  {
    id: "vocab-bǐ",
    pattern: /比/g,
    label: "比",
    meaning: "ratio or comparison",
    operation_hint: "compare",
  },
  {
    id: "vocab-duō",
    pattern: /多/g,
    label: "多",
    meaning: "more than / extra / increase",
    operation_hint: "add-or-subtract",
  },
  {
    id: "vocab-shǎo",
    pattern: /(少|沒有)/g,
    label: "少",
    meaning: "less than / missing / decrease",
    operation_hint: "subtract",
  },
  {
    id: "vocab-gòng",
    pattern: /共|一共|總共/g,
    label: "共",
    meaning: "sum total",
    operation_hint: "add",
  },
  {
    id: "vocab-shèng",
    pattern: /剩下|還剩|剩餘/g,
    label: "剩下",
    meaning: "leftover / remainder",
    operation_hint: "subtract",
  },
  {
    id: "vocab-zēng",
    pattern: /增加|多了|又買了|又來了/g,
    label: "增加",
    meaning: "increase / add",
    operation_hint: "add",
  },
  {
    id: "vocab-jiǎn",
    pattern: /減少|用掉|吃掉|送走|賣出/g,
    label: "減少",
    meaning: "decrease / consume",
    operation_hint: "subtract",
  },
  {
    id: "vocab-bèi",
    pattern: /(\d+\s*)?倍/g,
    label: "倍",
    meaning: "multiple / times",
    operation_hint: "multiply",
  },
  {
    id: "vocab-fraction",
    pattern: /分數|分之/g,
    label: "分數",
    meaning: "fraction vocabulary",
    operation_hint: "fraction-arithmetic",
  },
  {
    id: "vocab-divisibility",
    pattern: /整除|整分|剛好分完/g,
    label: "整除",
    meaning: "exact-divisibility constraint",
    operation_hint: "divisible",
  },
  {
    id: "vocab-rate",
    pattern: /(每|時速|速度|單價|平均)/g,
    label: "率",
    meaning: "rate / unit-rate phrase",
    operation_hint: "rate",
  },
  {
    id: "vocab-perimeter-area",
    pattern: /(周長|面積|體積|容積|表面積)/g,
    label: "幾何量",
    meaning: "geometric measurement",
    operation_hint: "geometry",
  },
];

function extractVocabularyClues(stem) {
  const found = [];
  for (const rule of VOCAB_RULES) {
    const matches = stem.match(rule.pattern);
    if (matches && matches.length) {
      found.push({
        id: rule.id,
        label: rule.label,
        meaning: rule.meaning,
        count: matches.length,
        operation_hint: rule.operation_hint,
      });
    }
  }
  return found;
}

function extractNumbers(stem) {
  const matches = stem.match(/(\d+\/\d+|\d+\.\d+|\d+)/g) || [];
  return matches
    .map((m) => {
      if (m.includes("/")) {
        const [a, b] = m.split("/").map((x) => parseInt(x, 10));
        return { raw: m, kind: "fraction", value: { numerator: a, denominator: b } };
      }
      if (m.includes(".")) {
        return { raw: m, kind: "decimal", value: parseFloat(m) };
      }
      return { raw: m, kind: "integer", value: parseInt(m, 10) };
    });
}

function inferUnit(stem) {
  // Very simple Chinese-unit hint extractor.
  const map = [
    { pattern: /(個|顆|隻|人|位|名)/, unit: "個" },
    { pattern: /(顆|粒|顆糖|顆球)/, unit: "顆" },
    { pattern: /(公尺|公尺的|米|m|cm|公里)/, unit: "長度單位" },
    { pattern: /(公分)/, unit: "公分" },
    { pattern: /(公尺)/, unit: "公尺" },
    { pattern: /(公里)/, unit: "公里" },
    { pattern: /(公斤|公克|克|kg)/, unit: "重量單位" },
    { pattern: /(公升|毫升|ml|l)/, unit: "容量單位" },
    { pattern: /(元|塊錢|分)/, unit: "元" },
    { pattern: /(本|冊)/, unit: "本" },
    { pattern: /(分鐘|小時|秒)/, unit: "時間單位" },
  ];
  for (const m of map) {
    if (m.pattern.test(stem)) return m.unit;
  }
  return null;
}

function inferAnswerKind(stem, vocab) {
  const hasQ = /多少|幾|求|問/g.test(stem);
  if (!hasQ) return "string";
  if (vocab.find((v) => v.id === "vocab-bèi")) return "number";
  if (vocab.find((v) => v.id === "vocab-perimeter-area")) return "number";
  if (inferUnit(stem) && inferUnit(stem) !== "個") return "number";
  return "number";
}

function inferQuestionType(vocab) {
  const labels = new Set(vocab.map((v) => v.label));
  if (labels.has("比") && labels.has("倍")) return "ratio";
  if (labels.has("比")) return "comparison";
  if (labels.has("共") || labels.has("剩下")) return "part-part-whole";
  if (labels.has("增加") || labels.has("減少") || labels.has("多") || labels.has("少")) return "change";
  if (labels.has("分數")) return "fraction-mix";
  if (labels.has("率")) return "rate";
  return "unknown";
}

// ---------- Public: decomposeWordProblem ----------

/**
 * @param {{stem:string, grade?:number, knowledge_point?:string}} input
 */
export function decomposeWordProblem(input) {
  if (!input || typeof input.stem !== "string") {
    return {
      ok: false,
      reason: "stem-required",
      quantities: [],
      unknowns: [],
      operations_hint: [],
      constraints: [],
      question_type: "unknown",
      vocabulary_clues: [],
      answer_unit_hint: null,
      ambiguity_flags: ["missing-stem"],
      answer_kind_hint: "string",
    };
  }
  const stem = input.stem;
  const vocab = extractVocabularyClues(stem);
  const numbers = extractNumbers(stem);

  // Heuristic: the LAST number is usually the unknown target / question prompt.
  const unknownCounts = (stem.match(/多少|幾|求|問/g) || []).length;
  const unknowns = [];
  if (unknownCounts > 0) {
    unknowns.push({ slot: "q", kind: "answer-target", raw_hint: "多少 / 幾" });
  }
  if (numbers.length > 0) {
    unknowns.push({ slot: "ref", kind: "largest-or-last", value: numbers[numbers.length - 1].raw });
  }

  const ambiguity_flags = [];
  if (vocab.find((v) => v.id === "vocab-bǐ") && vocab.find((v) => v.id === "vocab-bèi")) {
    ambiguity_flags.push("ratio-vs-multiple — both 比 and 倍 present, clarify");
  }
  if (vocab.length === 0) ambiguity_flags.push("no-vocabulary-clue-matched");
  if (numbers.length < 1) ambiguity_flags.push("no-number-detected");
  if (unknownCounts === 0) ambiguity_flags.push("no-question-phrase-detected");

  return {
    ok: true,
    stem_summary: stem.length > 60 ? stem.slice(0, 60) + "…" : stem,
    quantities: numbers,
    unknowns,
    operations_hint: [...new Set(vocab.map((v) => v.operation_hint))],
    constraints: vocab.map((v) => `${v.label} (${v.meaning})`),
    question_type: inferQuestionType(vocab),
    vocabulary_clues: vocab,
    answer_unit_hint: inferUnit(stem),
    ambiguity_flags,
    answer_kind_hint: inferAnswerKind(stem, vocab),
  };
}

// ---------- Built-in template library (keyed by KP) ----------

const TEMPLATE_LIBRARY = [
  {
    template_id: "WP-G5-RATIO-COMPARE",
    applies_to: ["math.G5.RATIO.intro"],
    description: "兩量比較並求其中一個量的典型比例題",
    signature: ["比", "倍", "已知量", "求比較量"],
  },
  {
    template_id: "WP-G3-FRAC-OF-WHOLE",
    applies_to: ["math.G3.FRAC.intro-fraction"],
    description: "把整體分成 n 等份，求其中一份或若干份",
    signature: ["分成", "等份", "其中", "份"],
  },
  {
    template_id: "WP-G4-FRAC-ADD-LIKE",
    applies_to: ["math.G4.FRAC.proper-fraction-add-sub"],
    description: "同分母真分數加減",
    signature: ["分數", "分母相同", "加/減"],
  },
  {
    template_id: "WP-G5-FRAC-ADD-UNLIKE",
    applies_to: ["math.G5.FRAC.add-unlike-denom"],
    description: "異分母分數加減（含帶分數）",
    signature: ["分數", "異分母", "加/減"],
  },
  {
    template_id: "WP-G4-FRAC-COMPARE",
    applies_to: ["math.G4.FRAC.proper-fraction-compare"],
    description: "真分數大小比較",
    signature: ["分數", "比大小", "哪個大/小"],
  },
  {
    template_id: "WP-G6-PERCENT-SWAP",
    applies_to: ["math.G6.PERCENT.intro"],
    description: "百分率 / 小數 / 分數互換",
    signature: ["百分率", "小數", "分數"],
  },
  {
    template_id: "WP-G6-RATIO-SCALE",
    applies_to: ["math.G6.RATIO.scale-and-proportion"],
    description: "比例尺 / 正比例",
    signature: ["比例", "正比", "對應"],
  },
  {
    template_id: "WP-G5-DEC-COMP",
    applies_to: ["math.G5.DECIMAL.intro-and-compare"],
    description: "小數大小比較",
    signature: ["小數", "比較", "位值"],
  },
  {
    template_id: "WP-G3-PERIM",
    applies_to: ["math.G3.GEOM.perimeter-intro"],
    description: "周長計算",
    signature: ["周長", "邊長"],
  },
  {
    template_id: "WP-G5-AREA",
    applies_to: ["math.G5.GEOM.area-triangle-quad"],
    description: "三角形 / 四邊形面積",
    signature: ["面積", "底", "高"],
  },
  {
    template_id: "WP-G2-LEN",
    applies_to: ["math.G2.MEAS.length-cm-m"],
    description: "公分 / 公尺實測與換算",
    signature: ["公分", "公尺", "長度"],
  },
  {
    template_id: "WP-G5-VOL",
    applies_to: ["math.G5.VOLUME.cubic-cm"],
    description: "立方公分 / 正方體體積",
    signature: ["體積", "立方公分", "長方體", "正方體"],
  },
  {
    template_id: "WP-G6-FRAC-MUL-FRAC",
    applies_to: ["math.G6.FRAC.multiply-fraction-fraction"],
    description: "分數乘分數（整體的一部分之一）",
    signature: ["分數", "分數", "乘"],
  },
  {
    template_id: "WP-G6-FRAC-DIV-INT",
    applies_to: ["math.G6.FRAC.divide-fraction-by-integer"],
    description: "分數除以整數",
    signature: ["分數", "除", "整數"],
  },
  {
    template_id: "WP-G6-SURFACE-VOL",
    applies_to: ["math.G6.GEOM.surface-area-and-volume"],
    description: "柱體表面積與體積",
    signature: ["表面積", "體積", "長方體", "正方體"],
  },
  {
    template_id: "WP-G2-ADD-SUB-100",
    applies_to: ["math.G2.NUM.add-sub-100"],
    description: "100 以內加減，進位退位",
    signature: ["加", "減", "進位", "退位"],
  },
  {
    template_id: "WP-G3-MUL-19",
    applies_to: ["math.G3.NUM.multiply-1-9"],
    description: "1–9 乘法直式",
    signature: ["×", "乘法", "幾個", "每"],
  },
  {
    template_id: "WP-G2-MUL-INTRO",
    applies_to: ["math.G2.NUM.multiply-intro"],
    description: "2/5/10 乘法概念",
    signature: ["每", "共", "個", "×"],
  },
  {
    template_id: "WP-G1-ADD-SUB-20",
    applies_to: ["math.G1.NUM.add-sub-20"],
    description: "20 以內加減",
    signature: ["加", "減", "剩下"],
  },
  {
    template_id: "WP-G1-COUNT-COMP",
    applies_to: ["math.G1.NUM.count-and-compare"],
    description: "10 以內數與大小比較",
    signature: ["幾個", "比較", "多", "少"],
  },
];

export function listWordProblemTemplates() {
  return TEMPLATE_LIBRARY.map((t) => ({
    template_id: t.template_id,
    applies_to: t.applies_to,
    description: t.description,
  }));
}

// ---------- Public: matchWordProblemTemplate ----------

/**
 * @param {{stem:string, knowledge_point?:string}} input
 * @returns {{template_id:string|null, confidence:number, rationale:string}}
 */
export function matchWordProblemTemplate(input) {
  if (!input || typeof input.stem !== "string") {
    return { template_id: null, confidence: 0, rationale: "no-stem" };
  }
  const decomp = decomposeWordProblem(input);
  const candidates = [];

  // 1) Exact KP match → high confidence
  if (input.knowledge_point) {
    const direct = TEMPLATE_LIBRARY.find((t) => t.applies_to.includes(input.knowledge_point));
    if (direct) {
      candidates.push({ tpl: direct, score: 0.9, reason: "direct-kp-match" });
    }
  }

  // 2) Signature / vocabulary match — count vocabulary-clue overlaps.
  for (const tpl of TEMPLATE_LIBRARY) {
    const sigMatches = tpl.signature.filter((s) => decomp.vocabulary_clues.find((v) => v.label === s || v.id && s.includes(v.label))).length;
    const numOverlap = decomp.vocabulary_clues.length ? sigMatches / tpl.signature.length : 0;
    if (sigMatches >= 2) {
      candidates.push({ tpl, score: 0.4 + 0.1 * sigMatches, reason: `signature-overlap-${sigMatches}` });
    } else if (sigMatches === 1) {
      candidates.push({ tpl, score: 0.35, reason: "signature-partial" });
    }
  }

  if (candidates.length === 0) {
    return {
      template_id: null,
      confidence: 0,
      rationale: `no-template-match — question_type=${decomp.question_type}, vocab=${decomp.vocabulary_clues.length}`,
      decomposition: decomp,
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  return {
    template_id: top.tpl.template_id,
    confidence: Math.min(1, Math.round(top.score * 100) / 100),
    rationale: `${top.tpl.description} — ${top.reason}`,
    decomposition: decomp,
  };
}
