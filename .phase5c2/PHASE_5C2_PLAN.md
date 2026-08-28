# Phase 5C-2 — Open Response + Voice (PLAN)

## Goal
讓 MentorNest 支援孩子以文字與語音回答，不只限於選擇題 / 數學鍵盤題。

## Sub-phases

### Phase 5C-2A — Open Response (text)
- short_answer
- explain_thinking
- multiline response

### Phase 5C-2B — Voice (STT)
- explain thinking (voice)
- open oral response
- English reading aloud
- English speaking

### Phase 5C-2C — TTS
- question stem
- hint
- feedback
- English pronunciation example

## Hard Rules (per user)

- assessment 不直接覆蓋 mastery
- raw answer 保留最小必要內容
- 不因自由回答就降低 privacy
- 不支援語音當 MC 選答案方式
- no cloud STT fallback
- raw audio 不長期保存，除非有明確需要
- transcript 不自動進 long-term memory
- child audio 不送外部服務

## Architecture (Agent Professional Autonomy v1.1)

### English-Specialist (voice flow)
- Reading aloud + speaking practice via STT
- Voice 永遠不當 MC answer
- EN-* error codes for pronunciation/word_boundary/missing_keyword
- 不寫 mastery, 不越權, 不用 cloud

### Math-Specialist (explain-thinking)
- text + voice explain-thinking 同樣路徑
- assessment-agent 用 rubric 評，不是 pass/fail
- 不寫 mastery, 不越權, 不用 cloud

### Assessment-Agent (rubric interpretation)
- emit evidence only, never write mastery
- 統一 evidence payload shape: transcript + normalized_keyword_set + length + structure_score

### Question-Quality-Agent (open_response question type)
- 新 question type: open_response
- 不用 MC 模擬 open response
- 每題必須附 rubric
- license 照走

### Child-Learning-Experience-Designer (UI)
- OpenResponseComposer: 240-320px textarea, word count, IndexedDB draft
- Recording state: 64x64 mic button, 3 states (idle/recording/processing)
- 60s cap (matches STT skill)
- Listening / transcript review: child 可編輯
- Retry / playback 永遠在最右
- TTS playback: inline ▶ play / pause / speed 0.75-1.5x
- 不顯示 voice 名字, 不放 EQ
- WCAG AA, ≥44px touch, keyboard, color-vision-safe

### Learning-Memory-Agent (privacy)
- 只存 transcript_hash + length + duration + response_kind
- 不存原始 transcript (除非明示)
- raw audio 預設刪除
- transcript 不自動進 long-term

### System-Orchestrator (rounds)

- **Round 8**: Backend infra ✅ (this round)
  - mentornest-tts service 安裝 ✅
  - sherpa-onnx offline TTS ✅
  - Piper en_US lessac high model ✅
  - tts_synthesize.py CLI ✅
  - privacy guards (outbound snapshot) ✅

- **Round 9**: Backend services (Express server)
  - /api/stt/transcribe (proxy to mentornest-stt)
  - /api/tts/synthesize (proxy to mentornest-tts)
  - /api/audio/upload (temporary, with auto-delete)

- **Round 10**: Frontend open-response
  - OpenResponseComposer.tsx
  - QuestionRenderer: support question_type: open_response
  - VoiceRecorder.tsx (MediaRecorder + mic permission)
  - 整合進 SessionView

- **Round 11**: Frontend TTS
  - TTSPlayer.tsx
  - 題目 / hint / feedback 語音播放
  - Quiet Graph v2 token integration

- **Round 12**: Acceptance
  - Playwright + axe (desktop + tablet + mobile)
  - 0 critical / 0 serious / 0 moderate / 0 minor
  - 一題 text explain-thinking 完整流程
  - 一題 voice explain-thinking 完整流程
  - 一題 English reading / speaking

- **Round 13**: Push + Zeabur
  - git push origin/main
  - Zeabur redeploy trigger

## Snapshot

- t=2026-08-28T1659Z — Round 8 backend infra complete
- services/mentornest-tts/ 安裝 + tested
- All Hard Invariants preserved (MD5 unchanged, no production data touched)