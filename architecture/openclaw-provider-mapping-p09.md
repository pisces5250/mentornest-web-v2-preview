# P0.9 OpenClaw Provider capability mapping

狀態：`versioned_provider_candidate_assessment_unavailable_runtime_evidence_pending`

本文件只記錄歷史 OpenClaw plugin snapshot 到 P0.5 Gateway domain contract 的
可證明映射。它不是目前 Zeabur runtime、container image 或 staging deployment 的證據。

## Source identity 與證據限制

- 可檢查 snapshot：`architecture/_backups/20260827T0840Z/`
- 歷史 workspace：`/home/node/.openclaw/workspace`
- 歷史 plugin：`/home/node/.openclaw/plugins/mentornest-learning`
- 歷史 gateway port：`18789`
- snapshot 不是獨立 provider repository，也沒有 image build provenance。
- registry／changelog 的 shipped 敘述不能取代 source、test 與 runtime evidence。

Provider candidate 只能挑選必要的 adapter 與 domain implementation；不得無差別複製
workspace、學生資料、runtime session 或 production filesystem layout。

## Capability mapping

| Domain capability | 歷史 source evidence | Candidate 狀態 | Authority boundary |
|---|---|---|---|
| `learning_director.recommend` | `learning_director.mjs` 有 read-only weakness、prerequisite、weekly strategy functions；candidate 只接受 confirmed mastery envelope | `adapter`／`available` | 只能提出策略，不得直接寫 mastery 或 Learning Memory |
| `assessment.submit_observation` | 未找到等價、可執行的 assessment observation capability | `UNAVAILABLE` | 不得以 mastery writer、Learning Memory append 或 UI candidate 冒充 Assessment verdict |
| `learning_memory.append_observation` | `index.ts` 的 `learning_record_append` 對單一學生 JSONL append | `adapter`／`available` | 唯一正式 writer；只 append；upstream 失敗不得 fallback 寫 production JSONL |
| `verified_bank.read` | `verified_bank_lookup.mjs` 透過 `question_store.mjs` 只讀 `questions/verified/` | `adapter`／`available` | 只讀；candidate 額外要求 `verification_status=verified`，不得提供 Verified Bank writer |

API discovery 的 `available` 只代表 candidate adapter 可呼叫，不等於真實 staging runtime
已驗證。只有 image runtime 與部署證據通過後才能宣告 staging ready。`assessment.submit_observation` 在正式 Assessment implementation
存在以前必須回傳 `capability_unavailable`。

若 consumer readiness 要求完整四項 capability，Assessment 仍 unavailable 時 provider
readiness 必須 fail-closed；不得為了讓 staging gate 變綠而把名稱列入 capability 清單。

## 最小版本化 API

### `GET /readyz`

需驗證 server credential，並回傳：

- `ok`
- `contract_version`
- `runtime_version`
- `image_digest`
- `data_namespace`
- `production_data_allowed: false`
- 僅列出已通過 runtime 驗證的 `capabilities`
- unavailable／required capability 狀態與穩定錯誤碼

Namespace、image identity、contract version、required capability 任一不符時，`ok` 必須為
`false`。Readiness 不得讀寫任何學生資料。

### `GET /v1/capabilities`

回傳版本化 discovery document。每項 capability 至少有 `name`、`status`、
`contract_version`；合法狀態為 `available`、`unavailable`。歷史 registry 或尚未納入
image 的 source 不得標記 `available`。

### `POST /v1/capabilities/invoke`

Request envelope：

```json
{
  "contract_version": "1",
  "capability": "verified_bank.read",
  "subject_ref": "student_test_p09_001",
  "input": {}
}
```

Response envelope 必須是 typed、versioned 的 success 或穩定錯誤，不回傳 OpenClaw
filesystem path、tool-call ID、agent session 或內部 stack。未知 capability 回
`capability_not_allowed`；已知但尚不存在回 `capability_unavailable`。

## Authentication

- Browser 不持有 provider credential；只允許 Tutor／Gateway server-side invocation。
- Credential 必須驗證 signature、expiry、固定 provider audience 與必要 scope；驗證金鑰
  只由 server-side secret store 注入。
- 無 credential、錯 signature、過期、wrong audience 一律 fail-closed。
- Provider log／error／readiness 不得輸出 credential。
- `subject_ref` 必須經 schema 與 traversal 驗證；不得直接成為任意 filesystem path。

## Staging namespace isolation

Provider process 必須在啟動前驗證：

1. 明確設定 staging namespace 與 staging data root。
2. Namespace 不得為空、`production` 或 production-like 值。
3. Data root 不得等於、包含或 fallback 到歷史
   `/home/node/.openclaw/workspace/data` production layout。
4. 不掛 production learning-record、mastery、student 或 question volume。
5. 測試只使用 `student_test_*`／`student_fake_*` subject；拒絕已知 production fixture。
6. Learning Memory write error 必須原樣轉成 domain failure，不得轉寫另一份 JSONL。

歷史 source 內的 hard-coded `/home/node/.openclaw/workspace` 是 packaging blocker；candidate
必須改為明確注入、fail-closed 的 staging roots，不能保留 production path fallback。

## 最小 package 建議

新的最小 provider source 應只包含：

- HTTP adapter、auth middleware、contract schemas、readiness／discovery。
- 經審計的 Learning Director read-only implementation。
- Learning Memory single-writer adapter。
- Verified Bank verified-only reader adapter。
- Assessment unavailable adapter（穩定 fail-closed response）。
- synthetic fixtures、unit／container contract tests、Dockerfile 與 build metadata。

它不得包含歷史學生資料、production configuration、OpenClaw session state、Voice、Tutor、
Web 或未使用的 plugin tools。Assessment 真實能力應由 Assessment authority另行實作與驗證，
再以可逆 commit 加入；不可在本輪以相近工具補假 implementation。
