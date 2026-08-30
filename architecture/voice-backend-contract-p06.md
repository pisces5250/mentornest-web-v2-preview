# Voice Backend staging contract 與 P0.6 證據

狀態：`provider_source_audited_not_staging_ready`

本文件定義 MentorNest Web／Gateway 對獨立 Voice Backend 的 staging contract，並記錄
P0.6 可重現證據的真實邊界。它不是 Voice image 已通過驗收的宣告，也不授權 production
cutover。

## Service ownership

Voice Backend 只擁有 STT、TTS、短效 audio serving，以及其模型／暫存生命週期。它不得
承載 Tutor、Learning Director、Assessment、Learning Memory、mastery 或 Verified Bank
邏輯。原始音訊預設不保留、不得寫入 Learning Memory，且 inference 不得 fallback 到
cloud provider。

此 repository 的 staging edge 以同源 API 接收 browser request，先透過 MentorNest
Gateway 驗證 browser session，再把短效 service credential 傳給 Voice。Browser 不得
直接取得 Voice internal origin、service auth key 或 credential。

## Provider contract v1

### Service authentication

- Header：`X-MentorNest-Service-Authorization: Bearer <token>`。
- Token：由 MentorNest Gateway 以 HMAC-SHA256 產生的 `<base64url payload>.<signature>`。
- 必要 claims：
  - `ver: 1`
  - `iss: "mentornest-gateway"`
  - `aud: "voice-backend"`
  - 非空白 `subject_ref`
  - `scopes` 包含 `service:invoke`
  - `exp` 為 Unix seconds，且驗證當下仍有效
- Voice 必須使用 `MENTORNEST_SERVICE_AUTH_KEY` 驗簽；不得取得或接受 browser session
  signing secret。
- 簽章錯誤、過期、錯誤 audience、錯誤 issuer/version、缺少 scope 或直接傳 browser
  cookie token，一律 fail-closed，回覆 `401`／`403`，且不得執行 inference。
- `X-Student-Id`、query/body 的 `student_id` 皆不具 authorization 效力；Voice 只使用
  已驗證 token 的 `subject_ref` 做最小化 audit correlation，且不得把 transcript 寫入
  learning data。

### Health 與 readiness

- `GET /healthz`：process liveness；不得需要 student identity，不回傳 path、secret、原始
  error 或 student data。
- `GET /readyz`：不使用真實學生音訊、不寫任何 learning data；成功時至少回傳：

```json
{
  "ok": true,
  "contract_version": "1",
  "capabilities": ["stt.transcribe", "tts.synthesize"],
  "models": {
    "stt": { "ready": true, "identity": "<model name + version>" },
    "tts": { "ready": true, "identity": "<model name + version>" }
  },
  "privacy": {
    "cloud_fallback": false,
    "audio_retention_default": "none",
    "learning_memory_write": false
  }
}
```

缺少任一必要模型／script、auth config、可寫入的隔離 temp storage、contract version 或
privacy invariant 時必須回 `503` 且 `ok:false`。Readiness 不得只代表 HTTP process 可達。

### Inference surface

- `POST /api/stt/transcribe`：binary audio，成功回傳非空白 transcript 與 local model
  identity；不得保留 raw audio 或建立 outbound cloud connection。
- `POST /api/tts/synthesize`：JSON request，成功回傳短效 audio reference 或 audio bytes，
  並標示 local model identity；不得 fallback cloud TTS。
- `GET /api/audio/:id`：僅提供不可猜測、短效、由同一 authenticated subject 建立的 audio；
  expiry 後回 `404`／`410`。
- 外部 error envelope 不得洩漏 filesystem path、stack、model command、secret、transcript
  或 raw audio。

## Immutable image 與 CI evidence envelope

Voice repository 的 CI 必須產生 immutable image digest，並以該 digest 執行下列測試。
`VOICE_BACKEND_IMAGE` 只能接受 `@sha256:` reference；tag、Dockerfile 存在或 image build
成功都不能替代 runtime contract evidence。

Provider evidence 至少應包含：source commit、workflow run URL/ID、image digest、contract
version、STT/TTS model identities、測試案例與結果、執行時間。測試素材只能使用明確的
synthetic／fixture audio，不得使用 production student data。

必要 provider cases：valid credential 的 STT/TTS success、invalid signature、expired token、
wrong audience、browser session token rejection、readiness contract mismatch、STT/TTS model
not-ready、audio expiry、no-cloud/no-retention assertion。

## P0.6 provider source audit（2026-08-30）

遠端 repository `pisces5250/mentornest-voice-backend` 存在；P0.6 以唯讀 shallow clone
審計 HEAD `e4725785ff4e9ea37ff64cc236399a127fbb451a`。該 checkout 僅位於暫存目錄，
本輪未修改或 push sibling repo。

目前 provider 是 preview-era contract，與 P0.5 staging contract 不相容：

- 沒有 service-auth middleware，STT、TTS 與 audio routes 皆可在到達 service 後直接呼叫；
  未驗證 signature、expiry、`aud=voice-backend`、issuer、scope 或 browser token rejection。
- 只有 `GET /api/health`，沒有 `/healthz`／`/readyz`、contract version 或 capability list。
  Health 固定回 `ok:true`，即使 model/script 不存在；因此不是 fail-closed readiness。
- CORS 預設允許 preview origin 與 localhost，且接受 `X-Student-Id`；P0.5 staging 預期
  internal-only、同源 edge、CORS 關閉，以及 identity 只取自 authenticated context。
- `X-Student-Id` 由 caller 控制，只針對兩個 hard-coded production fixture 值拒絕，不能
  作為 production/staging identity 或完整 production-data guard。
- Docker healthcheck 只查 `/api/health`；repository 沒有 CI workflow、automated tests 或
  published immutable image digest evidence。
- Source 有 local-only inference 與 `/proc/net/tcp` 差異檢查；STT temporary input 在
  inference 完成／失敗後刪除，TTS audio registry 為 30 秒。但 warm TTS cache 預設保留
  synthesized samples 5 分鐘，因此「audio retention default=none」尚未符合字面 contract，
  需由 privacy/security owner 明確定義短效 operational cache 是否容許。
- Source syntax check（`node --check server/open-response.mjs` 與 `tts_worker.mjs`）通過；
  這只證明 JavaScript 可解析，不證明 model 或 inference 可運作。

本機沒有 Docker CLI，且未取得既有 image digest／runtime URL，因此 container build、
model readiness、STT/TTS inference、network isolation 均未執行。這些項目不可由 README、
Dockerfile 或 source-level privacy flag 推定為 VERIFIED。

## P0.6 evidence matrix（2026-08-30）

| 項目 | 狀態 | 此 repo 的證據／缺口 |
|---|---|---|
| Gateway 以獨立 key 核發 `aud=voice-backend` token | VERIFIED（consumer） | `server/auth/session-auth.mjs`、`test/gateway/auth-gateway.test.mjs` |
| Edge 不將 service credential 暴露給 browser | VERIFIED（static） | `deployment/nginx/default.conf.template` 使用 internal `auth_request` 與 upstream header |
| Voice 使用獨立 service deployment | VERIFIED（topology） | `deployment/staging/compose.yaml` 的 `voice-backend` image/service/network |
| Voice image 必須 immutable digest | VERIFIED（deploy guard） | `deployment/staging/validate-env.mjs` 拒絕非 `@sha256:` image |
| Voice provider source identity | VERIFIED（source） | 遠端 HEAD `e4725785ff4e9ea37ff64cc236399a127fbb451a`，兩個 server modules syntax green |
| Voice provider 驗證 signature／expiry／audience | **FAILED / MISSING** | provider routes 沒有 service-auth middleware 或 contract tests |
| `/healthz`／`/readyz` contract v1 與 model readiness | **FAILED / MISSING** | 只有固定 `ok:true` 的 `/api/health`，無 readiness／version／capabilities |
| STT basic local inference | **UNVERIFIED（service）** | repo 只有歷史 local STT skill／fixtures，不能證明 Voice image endpoint |
| TTS basic local inference | **UNVERIFIED** | 無 Voice provider source、model 或 runtime |
| no cloud fallback／no retention | **PARTIAL（source）／UNVERIFIED（runtime）** | source 無 cloud adapter並有 TCP 差異檢查；未執行 image network test，且 warm TTS cache 預設 5 分鐘 |
| Cross-service Web／Tutor → Voice staging smoke | **UNVERIFIED** | 尚無已驗證 Voice digest與 staging URL/deployment |

因此目前結論是 `deploy_contract_defined_but_voice_provider_blocks_staging_ready`。Voice
repository 必須先加入 service auth、fail-closed readiness、P0.5 environment contract、
automated CI/provider tests，產生 immutable digest，再由此 repo 對同一 digest完成
cross-service smoke；此前不得把 Voice staging readiness 標為 VERIFIED。

## Provider remediation candidate

已在 sibling repository 建立並 push `feature/p0-6-staging-contract`，commit
`0104abc`。該 candidate：

- 對 STT／TTS／audio routes 加入 signature、expiry、issuer、audience、scope 驗證，並只從
  token 取得 subject identity；audio reference 同時綁定 subject。
- 新增 `/healthz` 與 fail-closed `/readyz` contract v1，檢查 auth、STT/TTS assets、TTS
  worker、ffmpeg 與 temp storage，回報 model identities 與 privacy contract。
- staging/production 缺少 service auth key 時拒絕啟動；允許 `ALLOWED_ORIGINS=""` 真正關閉
  CORS；外部 500 envelope 不再回傳 raw runtime error。
- 新增 Node 22 CI、4 項 provider contract tests、syntax gate 與 GHCR candidate image build/push。

本機 provider tests 4/4 與 syntax gate 通過。GitHub Actions API 對未授權請求回 `404`，
故遠端 workflow 結果、container build、GHCR digest 仍是 **UNVERIFIED**；不得以 branch 已
push 取代遠端 evidence。
