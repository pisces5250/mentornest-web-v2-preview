# P0.7 Runtime Evidence Closure

狀態：`not_staging_ready_runtime_evidence_incomplete`

日期：2026-08-30

## 判定

**尚未具備真正 staging deployment evidence。** Voice 與 OpenClaw 任一必要 provider
runtime evidence 缺失即不得降級標準；contract tests、source commit、workflow 定義與合成
harness 均不能取代實際 image/runtime證據。

## Voice Backend

| 證據 | 狀態 | 說明 |
|---|---|---|
| Provider feature source | VERIFIED | sibling `feature/p0-6-staging-contract`，commit `270cc37841304d0d6a197542db5d070072019437`，遠端 ref已確認 |
| 本機 contract tests／syntax／workflow parse | VERIFIED | 4/4、Node syntax、YAML、diff check通過 |
| GitHub Actions最終結果 | **UNVERIFIED** | Private Actions API需要未提供的read credential |
| Immutable GHCR digest | **UNVERIFIED** | Private Packages API／registry需要未提供的read credential |
| 真 container `/readyz`、auth、model/privacy readiness | **UNVERIFIED** | Workflow已設blocking案例，但外部無可讀run evidence |
| Synthetic TTS→WAV→STT inference | **UNVERIFIED** | Workflow已使用synthetic fixture；無可讀run/artifact結果 |
| No-cloud runtime | **UNVERIFIED** | Workflow以`--network none`執行；無可讀run evidence |

Voice workflow只在上述container cases全通過後發布`p07-<commit SHA>` candidate，不發布
production tag、不deploy。它沒有Tutor、Learning、Assessment或Memory邏輯。

## OpenClaw Learning Runtime

| 證據 | 狀態 | 說明 |
|---|---|---|
| Provider repository／runtime target | **UNVERIFIED** | Workspace、local runtime與公開repository inventory均無可定位provider |
| Runtime version／immutable image digest | **UNVERIFIED** | 無registry或provenance target |
| 真實`/readyz`／contract version | **UNVERIFIED** | 無staging endpoint |
| Learning Director／Assessment／Learning Memory writer／Verified Bank read | **UNVERIFIED** | 只有consumer harness，不是provider runtime evidence |
| Staging namespace／production isolation | **UNVERIFIED** | 只有compose guard，沒有平台storage evidence |
| Provider invalid／expired／wrong-audience credential | **UNVERIFIED** | 現有OpenClaw consumer使用opaque bearer，provider claims contract不存在 |

P0.6已驗證的Gateway allowlist、mismatch、missing capability、invalid bearer與Learning Memory
fail-closed仍有效，但不能升格為OpenClaw runtime evidence。

## Cross-service smoke

已建立`deployment/staging/run-runtime-evidence.sh`、digest-only compose overlay與
`test/staging/runtime-evidence-smoke.mjs`。Harness會驗四項capability、Voice STT／TTS及
TTS→STT round-trip、auth負向案例、contract/capability mismatch、Memory fail-closed、
staging namespace與internal-network no-cloud topology。

目前因缺Voice可讀digest evidence、OpenClaw image／endpoint與staging-only credentials，
**真實執行為UNVERIFIED**；未輸出`P0.7_RUNTIME_EVIDENCE_OK`，不得宣稱cross-service通過。

## Hard invariants

- 沒有讀寫production student data、raw audio或真實transcript。
- Browser仍不持有OpenClaw token或service signing key。
- Learning Memory保持single-writer authority，不fallback寫production JSONL。
- Production fallback保留；未merge、未deploy、未cutover。
- P0.7補上edge auth subrequest的原始mutation CSRF驗證，避免STT／TTS因internal GET繞過。

## Merge建議

不建議merge為staging-ready基線。可保留P0.7 branch作為fail-closed runtime evidence harness；
待取得Voice private Actions／Packages read evidence，並提供明確OpenClaw provider target後，
再以四個immutable digests執行相同harness。
