# P0.5 Staging topology 與部署契約

狀態：`implementation_candidate_not_deployed`

本文件是 P0.5 staging 契約，不是 production cutover 授權。既有 production
`mentornest-web`（service ID `6a8eaa6e7d3d98c91024fb26`）必須保留為 fallback；
不得用 staging deployment ID 覆寫、刪除或改流量。

## 協作決策

- Lead：Infrastructure
- Participants：Security、Backend、Voice integration、QA
- Execution Owner：Infrastructure
- Verification Owner：QA／Security cross-review
- Hard invariants：child privacy、security、production data integrity、Learning Memory 與 mastery writer boundaries、destructive production action 需人類批准

## 實際 staging 邊界

```text
Browser
  │ HTTPS；只見同源 cookie 與 /api
  ▼
Web Edge
  │ auth_request：向 MentorNest Gateway 驗證 HttpOnly session + CSRF context
  ├─ /api/tutor/* ──────────────► Tutor Backend
  ├─ /api/stt|tts|audio/* ──────► Voice Backend（獨立 image）
  └─ /api/learning/* ───────────► authenticated MentorNest Gateway（Tutor deployment unit）
                                      │ service token；僅內網
                                      ▼
                                  OpenClaw Learning Backend
```

OpenClaw 不對 browser 或 edge 公開。`OPENCLAW_GATEWAY_TOKEN` 只注入 Gateway 與
OpenClaw；不得注入 Web image、nginx 或任何 `VITE_*`。Gateway 從已驗證 session
解析 subject identity，client `student_id` 不具 authorization 效力。

Edge 的 Voice 路徑先經 Gateway session verification，再將 Gateway 核發的短效
`X-MentorNest-Service-Authorization` 傳給 Voice。Voice 只做 STT／TTS／短效 audio
serving，不承載 Tutor、Assessment、Learning Memory 或 mastery 邏輯。CORS 保持關閉；
browser 使用同源 edge。若平台迫使跨 origin，必須另行 security review，不能使用
credential wildcard。

Browser session 與 service credential 必須使用不同 signing key。Gateway 使用
`MENTORNEST_GATEWAY_SESSION_SECRET` 驗證 browser session，並使用獨立的
`MENTORNEST_SERVICE_AUTH_KEY` 核發最長 60 秒、含明確 `aud` 與 subject reference 的
service token。Voice sibling service 必須以同一份 service-auth contract 與 key 驗證
`aud=voice-backend`；不得取得 browser session secret，也不得信任 edge 自行填入的
student header。

## Environment contract

| Deployment unit | Public URL | Internal URL | 必要設定 |
|---|---|---|---|
| Web Edge | staging 平台核發的 HTTPS URL | port 80 | `TUTOR_BACKEND_ORIGIN`、`GATEWAY_BACKEND_ORIGIN`、`VOICE_BACKEND_ORIGIN` |
| Tutor／Gateway | 無 | `http://tutor-backend:8787` | `MENTORNEST_GATEWAY_SESSION_SECRET`、`MENTORNEST_SERVICE_AUTH_KEY`、`OPENCLAW_GATEWAY_ORIGIN`／token、required capability versions |
| Voice | 無 | `http://voice-backend:8502` | service-auth key、模型與 script paths；不得開放 CORS |
| OpenClaw Learning | 無 | `http://openclaw-learning:18789` | gateway token、隔離 staging data namespace、必要 capabilities |

Secret 必須來自平台 secret store。Image 必須使用 immutable digest。所有 unit 都必須
明確設 `MENTORNEST_ENV=staging`，且 OpenClaw 必須設
`MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA=false`。

## Health、readiness 與 deploy gate

- Web `GET /healthz` 僅代表 nginx liveness；整體 readiness 由平台檢查三個 upstream。
- Tutor `GET /api/health` 是 process liveness；`GET /api/ready` 必須驗證 session verifier、
  Gateway config，以及 OpenClaw capability/version 可達，probe 不得讀寫學生資料。
- Voice `/healthz` 是 process liveness；`/readyz` 必須驗證 STT/TTS 模型、script、temp
  storage 及 service-auth config，不可執行真實學生音訊。
- OpenClaw `/readyz` 必須驗證 Gateway auth 與 Learning Director、Assessment、Learning
  Memory、Verified Bank read contracts；probe 不得寫 Learning Memory。
- 部署前先執行 `node deployment/staging/validate-env.mjs`，再執行 blocking
  `verify:full`、container build、staging browser/a11y、authenticated route smoke 與
  fallback drill。任何一項失敗皆不得切換流量。

## Rollback／fallback

Staging rollout 只建立新的 candidate deployment，不改 production DNS、route 或
service ID。rollback 是將 staging candidate scale-to-zero／回復上一個 immutable
staging digest；production fallback 全程不動。任何 production cutover、資料 migration
或 fallback 移除都是另一項需人類核准的工作。

## 尚未驗證的跨 repo 依賴

本 workspace 沒有 Voice Backend sibling repository，因此本 repo **沒有驗證** Voice
image、`/healthz`／`/readyz` 實作、service-auth 驗證、模型 readiness 或平台設定。
`VOICE_BACKEND_IMAGE` 是 staging 的 fail-closed 必要輸入，必須由 Voice repository 的
CI 產生 digest與驗收 evidence 後才能部署。該 repo 還必須加入 audience、expiry、
signature 與拒絕 browser session token的 contract tests；本文件不把這項跨 repo 工作
誤記為已完成。

OpenClaw image、capability/version readiness 與 staging data namespace 也需 runtime
repository／平台共同提供；compose 只定義 consumer contract，不構成 image 已驗證證據。
