// src/session/fixtures_p5c2.mjs
//
// Phase 5C-2 acceptance-only fixture steps.
//
// Includes open_response (text explain-thinking) and voice_response
// (spoken explain-thinking) steps.  Used ONLY for acceptance tests
// in this directory; production deployments MUST NOT enable fixture mode.

export const FIXTURE_P5C2 = [
  // 1) Text explain-thinking (math)
  {
    step_id: "p5c2_open_text_g5_001",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subject: "math",
    question_type: "open_response",
    representation_type: "text",
    stem: "請用 1~2 句話說明，為什麼 1/2 + 1/3 要先通分才能相加？",
    expected_answer: "（rubric）需提到分母不同、共同分母、通分",
    difficulty: "medium",
    source: "verified",
    license: "CC0-1.0",
  },
  // 2) Voice explain-thinking (math)
  {
    step_id: "p5c2_open_voice_g5_001",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subject: "math",
    question_type: "voice_response",
    representation_type: "text",
    stem: "請用說的：分數加法為什麼要找共同分母？",
    expected_answer: "（rubric）需提到分母不同、共同分母、通分",
    difficulty: "medium",
    source: "verified",
    license: "CC0-1.0",
  },
  // 3) English reading aloud
  {
    step_id: "p5c2_eng_read_g5_001",
    knowledge_point: "english.G5.READ.passage-read-aloud",
    subject: "english",
    question_type: "voice_response",
    representation_type: "text",
    stem: "Read this short passage aloud: \"The girl went to the market to buy some fresh apples for her family.\"",
    expected_answer: "（rubric）需讀出 covered_keywords: girl, market, fresh, apples, family",
    difficulty: "easy",
    source: "verified",
    license: "CC0-1.0",
  },
  // 4) English speaking practice
  {
    step_id: "p5c2_eng_speak_g5_001",
    knowledge_point: "english.G5.SP.speaking-conversation",
    subject: "english",
    question_type: "voice_response",
    representation_type: "text",
    stem: "Tell me about your favorite subject at school. Why do you like it?",
    expected_answer: "（rubric）需有 answer_question feature + 至少 3 keywords",
    difficulty: "medium",
    source: "verified",
    license: "CC0-1.0",
  },
];