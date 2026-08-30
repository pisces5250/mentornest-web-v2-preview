# Production replacement candidate 拓撲（P0）

狀態：`candidate_not_cut_over`

本文件記錄 P0 engineering decision；既有 production `mentornest-web` 保留為 fallback，未經人類核准不得切換流量、移除或覆寫。

## 決策與責任

- Lead：Infrastructure／QA
- Participants：Backend、Frontend、Security、UX、System Orchestrator
- Execution owner：Infrastructure／QA（部署契約）、各服務 owner（實作）
- Verification owner：QA；不得與 production data writer 共用測試資料
- Hard invariants：child privacy、安全性、production data integrity、Learning Memory 與 mastery writer boundaries、accessibility

## Candidate topology

```text
Browser
  │ HTTPS、secure HttpOnly session cookie
  ▼
Web edge（nginx；static SPA、同源 API gateway）
  ├─ /api/tutor/*             → Tutor backend
  ├─ /api/stt|tts|audio/*     → Voice backend
  └─ /api/learning/*          → authenticated MentorNest Gateway
                                      └─ OpenClaw learning runtime adapter
                                      └─ authoritative Assessment / Mastery / Memory
```

Web static frontend、Tutor backend、Voice backend 與 OpenClaw runtime 是不同 deployment units。Voice backend 不是 Web image 的內建 subprocess；模型、音訊暫存與 local inference lifecycle 由 Voice service 擁有。`server/open-response.mjs` 在 P0 仍可作本機 combined development adapter，但不代表最終 service ownership。

## API 與安全契約

- 瀏覽器預設只呼叫同源 `/api`；內部 origin 只能由 deployment environment 注入，不得進入 browser bundle。
- Production authentication 由 edge 驗證 secure、HttpOnly、SameSite cookie；edge 傳遞短效、audience-bound service credential。服務不得信任 client 提供的 `student_id` 作 authorization 或 filesystem locator。
- CORS 預設不開放；若 Voice 因平台限制必須跨 origin，只允許明列的 production Web origin、必要 methods/headers，且不得使用 wildcard credentials。
- 所有 state-changing routes 必須檢查 authentication、authorization 與 CSRF；health endpoint 不回傳學生資料、路徑、secret 或詳細錯誤。
- External error envelope 只提供穩定 error code 與 request ID；stderr、stack、transcript 與 raw audio 不得回傳或寫入一般 log。
- Learning evidence 只能送至正式 Learning Memory writer；Tutor 與 browser session 不得直接寫 production JSONL 或宣告 mastery。

## Health 與 deployment gates

- Web：`GET /healthz` 驗證 static server 可服務；readiness 尚須由平台確認三個 upstream routes。
- Tutor：`GET /api/health` 應區分 process liveness 與 dependency readiness。
- Voice：必須獨立提供 liveness/readiness，readiness 驗證 STT/TTS 模型與 script 可用。
- OpenClaw adapter：readiness 驗證 gateway 可達及必要 tool contracts/version；不得讀寫 production record 作 probe。
- Cutover 前 gates：`npm ci`、typecheck、unit/integration、build、container build、真實 browser/a11y acceptance、security/privacy review、service-ID guard、staging smoke、fallback 演練。
- 本 repo 的 CI 與 Docker artifacts 只建立 candidate evidence，不執行 deploy。

## Configuration contract

| 變數 | owner | 用途 |
|---|---|---|
| `TUTOR_BACKEND_ORIGIN` | Web edge | Tutor internal origin |
| `VOICE_BACKEND_ORIGIN` | Web edge | Voice internal origin |
| `GATEWAY_BACKEND_ORIGIN` | Web edge | authenticated MentorNest Gateway internal origin；edge 不直連 OpenClaw |
| `PORT` | Tutor | HTTP listen port |
| `MENTORNEST_ENV` | 各服務 | `development` / `test` / `staging` / `production`；production 禁止 fixture |

Secrets、session signing keys 與 service credentials 必須由平台 secret store 注入，不列入 repository 或 `VITE_*`。

## 尚未解除的 cutover blockers

- Strict TypeScript gate 已建立，但現有 JS／TS 混合邊界與既存型別債使 `npm run typecheck` 尚未通過；預設 `npm run verify` 先以可重現 tests + production build 為 blocking gate，`npm run verify:full` 保留為待清零的完整 gate，不能宣稱 typecheck 已綠。
- 尚未實作 production authentication/session 與 OpenClaw learning gateway adapter。
- Voice service 的獨立 image、health contract 與平台設定不在本 repository，需跨 repo 驗證。
- `server/open-response.mjs` 尚待拆分 Tutor／Voice ownership；P0 Docker backend 只作 integration candidate。
- 尚未有 staging service IDs、平台 deployment evidence 與 fallback 演練紀錄。

P0.5 已新增可執行的 staging composition 與 fail-closed environment guard，詳見
`architecture/staging-topology-p05.md`。這是 candidate artifact，尚無實際平台部署證據。
