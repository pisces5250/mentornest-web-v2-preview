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
    difficulty: "medium",
    source: "verified",
    license: "CC0-1.0",
  },
  // 5) Phase 6B — Conversational English Tutor
  //    Routes to ConversationTutor (VAD + HTTP polling + real
  //    upstream English Specialist).  The conversation runs until
  //    the student presses 「結束對話」; no verdict pop-up.
  {
    step_id: "p6b_eng_conv_g5_001",
    knowledge_point: "english.G5.CONV.free-conversation",
    subject: "english",
    question_type: "english_conversation",
    representation_type: "text",
    stem: "和老師聊一聊：你平常最喜歡做的事是什麼？為什麼喜歡？",
    difficulty: "easy",
    source: "verified",
    license: "CC0-1.0",
    conversation: {
      tutor_persona_zh: "友善、會用簡單中文鼓勵孩子繼續說",
      greeting_zh: "嗨，老師在聽喔，隨時開始吧。",
      suggested_topics_zh: ["最喜歡做的事", "昨天發生的事", "一個朋友"],
      target_turn_count: 8,
    },
  },

  // 3) English reading aloud
  {
    step_id: "p5c2_eng_read_g5_001",
    knowledge_point: "english.G5.READ.passage-read-aloud",
    subject: "english",
    question_type: "voice_response",
    representation_type: "text",
    stem: "Read this short passage aloud: \"The girl went to the market to buy some fresh apples for her family.\"",
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
    difficulty: "medium",
    source: "verified",
    license: "CC0-1.0",
  },

];
