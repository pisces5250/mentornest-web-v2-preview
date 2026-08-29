# P0.6 OpenClaw Learning Runtime 契約證據

狀態：`consumer_contract_verified_external_runtime_unverified`

本文件記錄 Web v2／MentorNest Gateway 對 OpenClaw Learning staging runtime 的
可重現證據；不是 production runtime 已部署或 image 已驗證的聲明。測試只使用
`student_test_*` 合成 subject 與隔離 namespace，未讀寫 production student data。

## Domain boundary

Browser 只能呼叫同源 `/api/learning/*`。Tutor／Gateway 從 authenticated session
取得 `subject_ref`，再以 server-only bearer credential 呼叫 OpenClaw
`/v1/capabilities/invoke`。OpenClaw path、workspace path 與 session semantics 不會進入
browser 或 domain API。

允許的 capability 僅有：

- `learning_director.recommend`
- `assessment.submit_observation`
- `learning_memory.append_observation`
- `verified_bank.read`

Gateway 不允許任意 capability 名稱；尤其沒有 mastery writer 或 Verified Bank writer。
Learning Memory upstream 拒絕、timeout 或不可達時一律 fail-closed，不 fallback 寫本機
production JSONL。

## Readiness contract

OpenClaw `/readyz` 必須以已驗證的 server bearer credential 回應，且至少包含：

- `ok: true`
- `contract_version`
- `runtime_version`
- 完整 `image_digest`（與 deploy-time immutable digest 相同）
- `data_namespace`（與 staging 注入的隔離 namespace 相同）
- `production_data_allowed: false`
- 完整四項 capability 名稱

Tutor readiness 對 version、image、namespace、production-data isolation 或 capability
任何 mismatch 都回報 not ready。Readiness 本身不得讀寫學生資料。

## 可重現證據

`test/gateway/openclaw-staging-smoke.test.mjs` 以真實 loopback HTTP 建立隔離的 runtime
contract harness，驗證四項 capability success path、錯誤 bearer credential、缺少
capability 與 Learning Memory 拒絕。`test/gateway/auth-gateway.test.mjs` 另外驗證
contract mismatch、runtime/image/namespace/isolation mismatch，以及 session／service
credential 的 signature、expiry 與 wrong audience。

執行：

```sh
node --test test/gateway/auth-gateway.test.mjs \
  test/gateway/openclaw-staging-smoke.test.mjs \
  test/deployment/production-topology.test.mjs
```

## 外部證據狀態

| Evidence | 狀態 | 說明 |
|---|---|---|
| Gateway consumer contract 與 fail-closed tests | VERIFIED | 本 repository 可重現 |
| 隔離 HTTP cross-service harness | VERIFIED | 合成資料；不代表真實 OpenClaw image |
| 目前 production OpenClaw runtime version | UNVERIFIED | 本 workspace 無平台/runtime access |
| staging immutable image digest 與 provenance | UNVERIFIED | 尚無 runtime CI／registry attestation |
| 真實 staging `/readyz` response | UNVERIFIED | 尚未部署 staging runtime |
| 真實四項 capability inference／storage behavior | UNVERIFIED | archived plugin snapshot 僅是歷史資訊，不升格為目前 runtime evidence |
| staging namespace 與 production storage 的平台級隔離 | UNVERIFIED | compose guard 已定義，仍需部署 evidence |

在所有外部項目取得證據前，狀態只能是 deploy-ready candidate，不能標記 staging ready。
