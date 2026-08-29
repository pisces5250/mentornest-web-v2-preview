// Social Studies Error Taxonomy v1 — deterministic, pure data; never modifies mastery.
//
// Codes use SS-* prefix and do NOT overlap with MATH-*, ZH-*, EN-*, SCI-*, etc.
// Categories cover the social studies subskills required by the Phase 3-E
// orchestrator (history, geography, civics, culture-society,
// data-interpretation, source-comparison, timeline, map, causality).

export const SOCIAL_STUDIES_ERROR_TAXONOMY = [
  // ───────────── history ─────────────
  {
    code: "SS-HIST-ERA-ORDER",
    category: "history",
    label_zh: "時代先後順序錯誤",
    description: "把兩個歷史時代或事件的先後順序顛倒。",
    examples: ["把清朝當成在明朝之前", "把日治時期當成清朝之後"],
    hint_template: "畫一條時間軸，把事件由左到右依序排出，再確認每個事件落在哪一個時代區段。",
    mini_lesson_hint: "時代排序配對：朝代卡與時間軸互動。",
  },
  {
    code: "SS-HIST-CAUSAL-REVERSE",
    category: "history",
    label_zh: "因果倒置（先後視為因果）",
    description: "把先後發生的兩件事當成前者造成後者。",
    examples: ["因為發明印刷術，所以唐朝出現", "因為有工業革命，所以哥倫布發現新大陸"],
    hint_template: "用「因為 A，所以 B」的句型檢查：A 真的會導致 B 嗎？兩者只是時間相近嗎？",
    mini_lesson_hint: "先後 vs 因果：相關性與因果性分類練習。",
  },
  {
    code: "SS-HIST-SOURCE-MIX",
    category: "history",
    label_zh: "史料類型混淆",
    description: "把第一手史料與第二手史料的角色互換或混用。",
    examples: ["把後人寫的歷史課本當成當事人日記", "把口述歷史誤判為官方文獻"],
    hint_template: "先確認這份史料是事件當時留下，還是事件之後整理而成。",
    mini_lesson_hint: "第一手 vs 第二手史料分類卡。",
  },
  {
    code: "SS-HIST-DYNASTY-MISATTR",
    category: "history",
    label_zh: "朝代歸屬錯誤",
    description: "把人物、政策或事件歸到錯誤的朝代或政權。",
    examples: ["把鄭成功當成清朝官員", "把劉銘傳當成日治時期總督"],
    hint_template: "先寫出人物／事件，再寫出它在世／發生的年代，最後對照朝代表。",
    mini_lesson_hint: "人物 × 朝代對照表配對。",
  },
  {
    code: "SS-HIST-FIGURE-EVENT-MISMATCH",
    category: "history",
    label_zh: "人物與事件錯配",
    description: "把一位歷史人物的成就、發明或行為錯放到另一位人物身上。",
    examples: ["把孫中山的革命當成蔣介石所為", "把孔子說過的話當成孟子所說"],
    hint_template: "把人物與他主要的事件／言論一對一對應，逐項核對。",
    mini_lesson_hint: "歷史人物 × 事件連連看。",
  },
  // ───────────── geography ─────────────
  {
    code: "SS-GEO-COMPASS",
    category: "geography",
    label_zh: "方位判讀錯誤",
    description: "東、南、西、北、東南、东北等方位辨識錯誤。",
    examples: ["把地圖右邊誤判為西方", "搞混東北與東南"],
    hint_template: "先在紙上畫一個指北針，標出上北下南、左西右東，再依箭頭判斷方位。",
    mini_lesson_hint: "指北針與方位八方位互動題。",
  },
  {
    code: "SS-GEO-SCALE",
    category: "geography",
    label_zh: "比例尺判讀錯誤",
    description: "忽略或誤判地圖上的比例尺，造成距離判讀錯誤。",
    examples: ["以為地圖 1 公分等於 1 公里", "把 1:50000 誤讀為 1:5000"],
    hint_template: "先讀比例尺數字代表的實際距離，再用地圖距離乘上倍率。",
    mini_lesson_hint: "比例尺計算機與距離實測練習。",
  },
  {
    code: "SS-GEO-LEGEND",
    category: "geography",
    label_zh: "圖例判讀錯誤",
    description: "未讀懂地圖圖例的符號、顏色或標示。",
    examples: ["把首都符號當成一般城市", "把省界當成國界"],
    hint_template: "讀地圖前先對照圖例，確認每個符號、顏色與線條的意義。",
    mini_lesson_hint: "圖例配對與地圖符號閱讀。",
  },
  {
    code: "SS-GEO-CLIMATE",
    category: "geography",
    label_zh: "氣候類型判讀錯誤",
    description: "把一個地區誤判為錯誤的氣候類型，或忽略緯度、地形影響。",
    examples: ["把熱帶地區當成寒帶", "忽略山脈對氣候的影響"],
    hint_template: "緯度決定基本氣候帶，再看是否靠海或高山，調整為正確氣候類型。",
    mini_lesson_hint: "緯度 × 距海 × 高度三軸氣候分類。",
  },
  {
    code: "SS-GEO-TECTONIC",
    category: "geography",
    label_zh: "板塊／地形作用混淆",
    description: "混淆板塊擠壓、张裂與火山、地震、地形的關係。",
    examples: ["把張裂邊界當成擠壓邊界", "認為台灣不在板塊邊界上"],
    hint_template: "先判斷邊界類型（擠壓／张裂／錯動），再對應火山、地震或山脈的形成。",
    mini_lesson_hint: "板塊邊界類型與地表作用配對。",
  },
  // ───────────── civics ─────────────
  {
    code: "SS-CIVIC-LEGAL-HIERARCHY",
    category: "civics",
    label_zh: "法律位階混淆",
    description: "對憲法、法律、命令、規則之間的位階關係不清楚。",
    examples: ["認為學校規定可以抵觸法律", "把行政命令當成憲法"],
    hint_template: "由上到下依序：憲法 → 法律 → 命令 → 地方自治法規 → 校規；下位階不得牴觸上位階。",
    mini_lesson_hint: "法律位階排序與衝突情境判讀。",
  },
  {
    code: "SS-CIVIC-RIGHTS-DUTIES",
    category: "civics",
    label_zh: "權利與義務對應錯誤",
    description: "把權利當成義務或兩者配對錯誤。",
    examples: ["認為納稅是權利不是義務", "認為受國民教育只是權利"],
    hint_template: "權利＝我可以要求／做什麼；義務＝我必須做／不能不做。逐條分類。",
    mini_lesson_hint: "權利 vs 義務情境分類。",
  },
  {
    code: "SS-CIVIC-INSTITUTION-FN",
    category: "civics",
    label_zh: "機關與功能錯配",
    description: "把政府機關的功能或職權錯配到別的機關。",
    examples: ["把立法權當成行政權", "認為法院負責制定法律"],
    hint_template: "三權分立配對：立法（立法院）、行政（行政院）、司法（司法院）。",
    mini_lesson_hint: "政府機關 × 功能配對卡。",
  },

  // ───────────── culture-society ─────────────
  {
    code: "SS-CULT-ETHNIC",
    category: "culture-society",
    label_zh: "族群與文化混淆",
    description: "把不同族群的文化特徵或歷史混淆。",
    examples: ["把原住民族文化誤認為漢族傳統", "把客家文化當成閩南文化"],
    hint_template: "寫下族群名稱，列出該族群具代表性的語言、節慶與生活習慣。",
    mini_lesson_hint: "台灣族群 × 文化特色配對。",
  },
  {
    code: "SS-CULT-RELIGION",
    category: "culture-society",
    label_zh: "宗教與節慶混淆",
    description: "把不同宗教的節日、儀式或信仰混淆。",
    examples: ["把佛教的浴佛節當成聖誕節", "認為媽祖是佛教神祇"],
    hint_template: "寫下宗教名稱，列出該宗教的核心信仰、代表節日與場所。",
    mini_lesson_hint: "宗教 × 節日 × 場所配對卡。",
  },
  // ───────────── data-interpretation ─────────────
  {
    code: "SS-DATA-POPULATION-CHART",
    category: "data-interpretation",
    label_zh: "人口統計圖判讀錯誤",
    description: "對人口金字塔、年齡分布圖等統計圖判讀錯誤。",
    examples: ["把男性人口誤判為總人口", "把老化指數當成出生率"],
    hint_template: "先看圖的標題與軸線單位，再分別讀左右（男／女）或各年齡層的數值。",
    mini_lesson_hint: "人口金字塔互動閱讀題。",
  },
  {
    code: "SS-DATA-STAT-CURVE",
    category: "data-interpretation",
    label_zh: "統計曲線／趨勢判讀錯誤",
    description: "忽略曲線的上升、下降或持平趨勢，造成錯誤結論。",
    examples: ["把短期波動誤判為長期趨勢", "忽略曲線的轉折點"],
    hint_template: "先畫出整條曲線的起點、終點與轉折點，再描述整體趨勢。",
    mini_lesson_hint: "趨勢線與轉折點互動判讀。",
  },

  // ───────────── source-comparison ─────────────
  {
    code: "SS-SRC-PRIMARY-SECONDARY",
    category: "source-comparison",
    label_zh: "第一手／第二手史料混淆",
    description: "把不同來源的史料當成同一類，或忽略其性質差異。",
    examples: ["把歷史小說當成第一手史料", "把後人整理的年表當成當事人記錄"],
    hint_template: "問自己：這份資料是事件當時留下，還是事件之後整理？",
    mini_lesson_hint: "史料來源分類：當時 vs 後世。",
  },
  // ───────────── timeline ─────────────
  {
    code: "SS-TIME-ORDERING",
    category: "timeline",
    label_zh: "時間軸事件順序錯誤",
    description: "在時間軸上把兩個以上事件的先後排錯。",
    examples: ["把鴉片戰爭排在工業革命之後", "事件順序在朝代之間錯置"],
    hint_template: "把每個事件的年份寫下來，由小到大排好，再貼回時間軸。",
    mini_lesson_hint: "事件時間軸互動排序題。",
  },
  {
    code: "SS-TIME-SIMULTANEOUS",
    category: "timeline",
    label_zh: "同時並存事件忽略",
    description: "忽略不同地區或文化可同時發生同一類事件。",
    examples: ["認為歐洲中世紀時亞洲完全沒有發展", "忽略同一年在多地發生的事件"],
    hint_template: "用多列時間軸，把不同地區並排比對，避免單一時間軸造成錯覺。",
    mini_lesson_hint: "多列並排時間軸：不同地區同時發生什麼？",
  },

  // ───────────── map ─────────────
  {
    code: "SS-MAP-COMPASS",
    category: "map",
    label_zh: "地圖方位錯誤",
    description: "在地圖上把方位或方位關係弄反。",
    examples: ["把地圖右邊的城市誤判為西邊", "搞混地圖上下對應實際方向"],
    hint_template: "看地圖前先找到指北針，確認上為北，再判斷其他方位。",
    mini_lesson_hint: "地圖指北針與方位互動題。",
  },
  {
    code: "SS-MAP-SCALE",
    category: "map",
    label_zh: "地圖比例尺錯誤",
    description: "讀地圖時忽略比例尺或換算錯誤。",
    examples: ["把地圖上 2 公分當成實際 2 公尺", "忽略 1:50000 的倍率"],
    hint_template: "先讀比例尺代表的距離，再用地圖長度乘上倍率。",
    mini_lesson_hint: "比例尺換算練習：公分 vs 公尺 vs 公里。",
  },
  // ───────────── causality ─────────────
  {
    code: "SS-CAUSAL-SHORT-LONG",
    category: "causality",
    label_zh: "短因／長因混淆",
    description: "把短期的近因當成長期結構因素，或反之。",
    examples: ["把一場戰役當成王朝衰亡的長期主因", "忽略長期經濟結構問題"],
    hint_template: "把原因分成「立即發生」與「長期累積」兩欄，分類填入。",
    mini_lesson_hint: "近因 × 遠因分類練習。",
  },
  {
    code: "SS-CAUSAL-MULTI",
    category: "causality",
    label_zh: "多因忽略",
    description: "忽略同一結果可能由多個原因共同造成。",
    examples: ["把一個事件完全歸因於單一人物", "忽略政治、經濟、文化同時影響"],
    hint_template: "列出至少三種可能的原因（政治／經濟／文化／社會），再標註證據。",
    mini_lesson_hint: "多因分析圖：同一結果的多重原因。",
  },
  {
    code: "SS-CAUSAL-CHAIN",
    category: "causality",
    label_zh: "因果鏈中斷",
    description: "在因果鏈中遺漏中間環節，造成邏輯不連貫。",
    examples: ["跳過工業革命到城市化的中間步驟", "忽略貿易政策影響物價的中間環節"],
    hint_template: "把因果鏈寫成 A → B → C → 結果，補齊每一個箭頭之間的環節。",
    mini_lesson_hint: "因果鏈補完題：補上中間步驟。",
  },
];

// ───────────── lookups ─────────────

export function lookupSocialStudiesErrorCode(code) {
  return SOCIAL_STUDIES_ERROR_TAXONOMY.find((e) => e.code === code) || null;
}

export function listSocialStudiesErrorsByCategory(category) {
  return SOCIAL_STUDIES_ERROR_TAXONOMY.filter((e) => e.category === category);
}

export function listSocialStudiesErrorCategories() {
  return [...new Set(SOCIAL_STUDIES_ERROR_TAXONOMY.map((e) => e.category))];
}

export function socialStudiesErrorTaxonomySize() {
  return SOCIAL_STUDIES_ERROR_TAXONOMY.length;
}

export function validateSocialStudiesErrorTaxonomy() {
  const codes = SOCIAL_STUDIES_ERROR_TAXONOMY.map((e) => e.code);
  const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
  return {
    valid:
      dupes.length === 0 &&
      codes.length >= 15 &&
      codes.length <= 25 &&
      codes.every((c) => c.startsWith("SS-")),
    code_count: codes.length,
    categories: listSocialStudiesErrorCategories(),
    errors: dupes.length ? ["duplicate-codes"] : [],
  };
}