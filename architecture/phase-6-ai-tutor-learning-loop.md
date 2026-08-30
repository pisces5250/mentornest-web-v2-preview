# Phase 6 AI Tutor learning loop

## 目標與狀態

本階段把孩子的單次作答串成一個 server-side 教學迴圈：即時判斷、學科診斷、教學回饋、Assessment observed evidence、Learning Memory append、Learning Director 調整，以及 Verified Bank 下一題。現況為 feature branch staging candidate；未授權也未執行 production cutover。

## 權責與資料流

1. Browser 只送出 `question_id`、`response_id`、作答內容、作答次數與提示次數至 authenticated／CSRF-protected `POST /api/tutor/turn`。
2. Tutor server 依 `question_id` 精確讀取 Verified Bank；答案與 `answer_key_version` 不進入 browser。
3. 客觀 validator 產生 observed verdict；學科診斷維持 inferred 狀態，兩者不混寫。
4. Assessment 僅記錄 observation，`mastery_effect: none`；Learning Memory 成功 append 後才允許 Learning Director 與下一題選擇。
5. Learning Director 只用 confirmed mastery 與本次 observed evidence 調整 session；不得把 inferred diagnosis 升格為 confirmed mastery。
6. 下一題由 Verified Bank 提供，回 browser 前以 allowlist DTO 移除答案、rubric 與其他非公開欄位。

## Fail-closed 與安全界線

- 題目未 verified、缺少 answer key version、capability scope 不符、Memory 寫入失敗或 Provider unavailable 時，不完成 learning loop。
- `response_id` 在同一 Tutor process 內支援 replay 與 concurrent dedupe；跨 process／restart 的 durable idempotency 尚未宣告完成。
- Browser 直連 Assessment、Learning Memory、Learning Director、Verified Bank 的 authority routes 已關閉。
- 不記錄 transcript／audio、答案 key、credential 或 production student data。

## 可重現 evidence

- `test/tutor/turn-orchestrator.test.mjs`：verified lookup、判斷、診斷、Assessment、Memory、Director、next-step、fail-closed 與 idempotency。
- `test/tutor/tutor-turn-client.test.mjs`：公開 contract allowlist、敏感欄位拒絕與 writer failure UX。
- `test/a11y/react-browser-gate.mjs`：孩子第一次答錯收到老師回饋、再答後答對、兩筆 append-only response、browser 無 answer key，以及回饋畫面 axe gate。
- 完整測試與 staging runtime 結果須以對應 commit SHA／CI run／immutable image digest 另行記錄，不以舊 run 代替。

## 尚未宣告

- production ready 或 production cutover。
- restart-safe durable idempotency。
- 未經實際 staging deployment 的 runtime evidence。
