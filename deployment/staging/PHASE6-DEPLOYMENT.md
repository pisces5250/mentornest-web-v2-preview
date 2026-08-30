# Phase 6 staging-only deployment closure

## PREBUILT_V2 image identity

Zeabur dashboard 所稱 Docker Image service 可更新 image reference，儲存後會重新部署。
本專案平台資料中的 `PREBUILT_V2` 只能視為 service type，不能當成 deployment identity。

部署前先以 `deployment/staging/validate-phase6-prebuilt-plan.mjs` 驗證無 secret 的 plan。
Plan 必須把下列資料綁成同一筆 evidence：

- staging `service_id`
- GitHub Actions 本次 HEAD 的完整 source commit
- OCI label `org.opencontainers.image.revision`
- registry 實際解析的 `sha256` digest
- `repository@sha256:digest` target image
- staging namespace、`production_data_allowed=false` 與 secret exposure flags

通過 guard 只代表 plan 合法，輸出的 `mutation_authorized` 固定為 `false`，不會呼叫 Zeabur。
平台更新必須使用完整 digest reference，不使用 SHA tag、mutable tag 或 UI 顯示名稱冒充 identity。
更新後必須重新讀取同一 service、確認 runtime readiness 回報的 image digest 等於 target，並完成
browser learning-loop smoke。Zeabur 沒有獨立 revision ID 時據實記錄
`platform_revision_id: unavailable`。

Zeabur 官方說明：Docker service 可由 Service Image 設定更新 image reference，儲存後會重新啟動；
rollback 會建立新的 deployment，且不會回復 environment variables、volume 或資料庫。因此 rollback
前後都必須重新驗證 namespace、secret 與 writer gates。

## Synthetic Verified Bank fixture

`provider/openclaw/fixtures/staging-question.json` 在 image 中保持 `candidate`，不能直接放入
Verified Bank。只有啟用明確 staging flag `MENTORNEST_SEED_VERIFIED_FIXTURE=true` 時，provider
啟動程序才會呼叫 `staging-question-quality-writer.mjs`。Writer 會驗 structure、synthetic ID、
provenance/license、answer key 與 choices，通過後才蓋上：

```text
verification_status: verified
quality.authority: question_quality_agent_verify
```

Writer 不提供 HTTP route、只接受 staging＋`production_data_allowed=false`，並以 exclusive create
避免覆寫既有 verified item。失敗會阻止 provider 啟動，不得由 Tutor、Browser 或 smoke script
直接寫 verified directory。

## Production isolation、secret 與 writer gates

- 僅允許既有 staging service ID allowlist；production service ID 一律拒絕。
- Provider 仍強制 `MENTORNEST_ENV=staging`、synthetic namespace、staging data root 與
  `MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA=false`。
- GHCR credential 只能存於 Zeabur encrypted image credential；不得進 env、image、plan、log、
  browser 或 evidence artifact。
- Browser authority routes維持關閉；Tutor 使用 capability-bound短效 service token。
- Assessment 只產生 observed evidence、Learning Memory 是 append-only writer、Director 不提升
  observed／inferred 為 confirmed mastery。
- Chinese、Science、Social Studies 在正式 specialist evaluator／rubric 完成前一律
  `unverifiable`，不得以 normalized string match 產生 Assessment 或 Memory evidence。
- 本文件與 guard 不授權 staging mutation，也不代表 production ready／production cutover。
