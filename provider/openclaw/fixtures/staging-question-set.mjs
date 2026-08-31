const SUBJECT_SETS = {
  math: {
    kp: "math.G5.FRAC.add", subskill: "fraction_addition", schema: "math-specialist-evidence-v1",
    code: "MATH-CON-DENOM", representation: "fraction_bar", hint: "先把每一份變成一樣大，再相加。",
    items: [
      ["common-denom-1", "1/3 + 1/2 等於多少？", ["2/5", "5/6", "1/6"], "5/6"],
      ["common-denom-2", "1/4 + 1/2 等於多少？", ["2/6", "3/4", "1/8"], "3/4"],
      ["equivalent", "要計算 1/2 + 1/6，先把 1/2 改寫成？", ["2/6", "3/6", "4/6"], "3/6"],
      ["unit-size", "1/3 和 1/6 哪一個分數單位比較大？", ["1/3", "1/6", "一樣大"], "1/3"],
      ["application", "小安吃了 1/4 盒餅乾，又吃了 1/2 盒，共吃多少盒？", ["2/6", "3/4", "1/8"], "3/4"],
      ["transfer", "2/3 + 1/4 等於多少？", ["3/7", "11/12", "3/12"], "11/12"],
    ],
  },
  english: {
    kp: "english.G5.GRAMMAR.present-progressive", subskill: "grammar", schema: "english-specialist-evidence-v1",
    code: "EN-GRAM-TENSE", representation: "sentence_chunks", hint: "先找主詞，再用 be 動詞加上 -ing。",
    items: [
      ["she-reading", "She ___ a book now.", ["is reading", "read", "are reading"], "is reading"],
      ["they-playing", "They ___ basketball now.", ["is playing", "are playing", "play"], "are playing"],
      ["i-writing", "I ___ a letter right now.", ["am writing", "is writing", "write"], "am writing"],
      ["he-running", "He ___ in the park now.", ["runs", "are running", "is running"], "is running"],
      ["question", "___ you listening now?", ["Are", "Is", "Do"], "Are"],
      ["negative", "We ___ TV now.", ["not watch", "are not watching", "is not watching"], "are not watching"],
    ],
  },
  chinese: {
    kp: "chinese.G5.READING.main-idea", subskill: "main_idea", schema: "chinese-specialist-evidence-v1",
    code: "ZH-READ-DETAIL", representation: "passage_highlight", hint: "找出每一句反覆提到的共同重點。",
    items: [
      ["plants", "短文描述種樹、澆水與照顧幼苗，主要在說什麼？", ["照顧植物需要耐心", "下雨天不能出門", "樹葉都是綠色"], "照顧植物需要耐心"],
      ["library", "短文描述借書、安靜閱讀和按時還書，主要在說什麼？", ["圖書館的使用方式", "書本都很厚", "下課時間很短"], "圖書館的使用方式"],
      ["exercise", "短文說每天散步、伸展並早睡，主要想表達什麼？", ["維持健康的生活習慣", "公園離家很遠", "早上天氣較冷"], "維持健康的生活習慣"],
      ["teamwork", "短文描述同學分工查資料、做海報和報告，主旨是？", ["合作能完成任務", "海報需要很多顏色", "報告一定很困難"], "合作能完成任務"],
      ["water", "短文提醒關緊水龍頭、用洗菜水澆花，主旨是？", ["珍惜水資源", "花盆應放室外", "洗菜需要很多水"], "珍惜水資源"],
      ["practice", "短文描述每天練琴、記下困難並逐步改善，主旨是？", ["持續練習能進步", "樂器聲音很大", "筆記本很重要"], "持續練習能進步"],
    ],
  },
  science: {
    kp: "science.G5.EXPERIMENT.variables", subskill: "experiment", schema: "science-specialist-evidence-v1",
    code: "SCI-EXP-CONTROL", representation: "variable_table", hint: "一次只改一項，其他條件保持相同。",
    items: [
      ["sunlight", "比較日照時間對豆苗高度的影響，應改變哪一項？", ["日照時間", "豆苗種類和水量", "量尺刻度"], "日照時間"],
      ["water", "比較水量對植物生長的影響，應保持哪一項相同？", ["每天水量", "植物種類", "植物高度"], "植物種類"],
      ["temperature", "研究水溫對糖溶解速度的影響，操縱變因是？", ["水溫", "糖的種類", "攪拌杯顏色"], "水溫"],
      ["measurement", "研究肥料量對植株高度的影響，應測量什麼？", ["植株高度", "肥料量", "花盆顏色"], "植株高度"],
      ["fair-test", "比較紙飛機機翼長度對飛行距離的影響，哪項要固定？", ["機翼長度", "投擲方式", "飛行距離"], "投擲方式"],
      ["observation", "實驗後記錄『豆苗高 12 公分』，這是？", ["觀察結果", "原因推論", "控制變因"], "觀察結果"],
    ],
  },
  social_studies: {
    kp: "social.G5.HISTORY.timeline", subskill: "timeline", schema: "social-studies-specialist-evidence-v1",
    code: "SS-TIME-IRRELEVANT", representation: "timeline", hint: "先找日期或年代，再判斷事件先後。",
    items: [
      ["date", "整理歷史事件時間線時，最先要確認什麼？", ["事件發生日期", "圖片顏色", "人物名字長度"], "事件發生日期"],
      ["earlier", "甲事件在 1895 年，乙事件在 1912 年，哪個較早？", ["甲事件", "乙事件", "同時發生"], "甲事件"],
      ["century", "西元 1945 年發生的事件應放在哪個年代附近？", ["1940 年代", "1840 年代", "2040 年代"], "1940 年代"],
      ["sequence", "事件依序發生於 1901、1895、1910 年，最早的是？", ["1901 年事件", "1895 年事件", "1910 年事件"], "1895 年事件"],
      ["source", "要確認事件日期，哪種資料最直接？", ["有日期的歷史紀錄", "沒有說明的插圖", "現代廣告"], "有日期的歷史紀錄"],
      ["duration", "建設從 1920 年開始，1925 年完成，共歷時多久？", ["5 年", "45 年", "1 年"], "5 年"],
    ],
  },
};

const GENERATED_QUESTIONS = Object.entries(SUBJECT_SETS).flatMap(([subject, set]) =>
  set.items.map(([slug, stem, choices, expected]) => Object.freeze({
    id: `q.synthetic.${subject}.${slug}.001`, subject, grade: 5, knowledge_point: set.kp,
    type: "multiple_choice", representation_type: set.representation, difficulty: "medium",
    stem, choices, expected_answer: expected, answer_key_version: "synthetic-v1",
    verification_status: "candidate", source: "staging_synthetic", license: "AI_ORIGINAL",
    provenance: { source_class: "AI_ORIGINAL", license: "AI_ORIGINAL" },
    specialist: {
      schema_version: `${subject}-choice-specialist-v1`, evidence_schema: set.schema,
      subskill: set.subskill, correct_feedback: correctFeedback(subject),
      distractors: Object.fromEntries(choices.filter((choice) => choice !== expected).map((choice) => [choice, {
        error_codes: [set.code], feedback: feedback(subject), hint: set.hint,
        representation: { kind: set.representation, payload: { strategy: set.subskill } },
      }])),
    },
  })));

export const STAGING_QUESTIONS = Object.freeze(GENERATED_QUESTIONS.map((question) => {
  if (question.id !== "q.synthetic.english.negative.001") return question;
  const { choices: _choices, ...voice } = question;
  return Object.freeze({
    ...voice,
    id: "q.synthetic.english.read-aloud.002",
    type: "voice_response",
    representation_type: "text",
    stem: "請先聽一次，再朗讀下面句子。",
    instruction_text: "請先聽一次，再朗讀下面句子。",
    display_text: "We are not watching TV now.",
    spoken_text: "We are not watching TV now.",
    language: "en-US",
    answer_key_version: "synthetic-v2",
    expected_answer: "We are not watching TV now.",
    specialist: {
      schema_version: "english-read-aloud-specialist-v1",
      evidence_schema: "english-specialist-evidence-v1",
      subskill: "reading",
      mode: "read_aloud",
      correct_feedback: "你完整讀出了這個句子。",
      rubric: {
        evaluator: "deterministic_transcript_match",
        low_reliability_result: "unverifiable",
        local_stt_only: true,
        transcript_retention: "none",
      },
    },
  });
}));

function correctFeedback(subject) {
  return {
    math: "答對了，你有先確認分數單位。", english: "答對了，你有根據主詞和時間線索選擇。",
    chinese: "答對了，你抓到整段共同的重點。", science: "答對了，你有分清楚實驗中的角色。",
    social_studies: "答對了，你有使用時間證據判斷。",
  }[subject];
}

function feedback(subject) {
  return {
    math: "這個選項還沒有把分數單位對齊。", english: "這個選項和主詞或正在發生的時間不一致。",
    chinese: "這比較像一個細節，還沒有統整全文。", science: "這個選項混合了要改變、測量或固定的條件。",
    social_studies: "這個選項不是判斷事件先後的時間證據。",
  }[subject];
}
