# P0.6 Remote Evidence 與 Staging Readiness

狀態：`deploy_ready_candidate_external_evidence_incomplete`

日期：2026-08-30

本文件只記錄可重現或可定位的證據。Contract harness 不等同 provider image，source commit
不等同 container digest，配置存在也不等同 staging 已部署。

## Evidence matrix

| 項目 | 狀態 | 證據／原因 |
|---|---|---|
| 本機 `verify:full` | VERIFIED | Typecheck、314/314 unit/integration、build、實際 Chrome Playwright 全部通過 |
| 實際 rendered React axe | VERIFIED | critical／serious 0；總 violations 0 |
| Keyboard-only baseline | VERIFIED | 設定 dialog、Escape／focus return、鍵盤啟動 session 通過 |
| OpenClaw consumer contract harness | VERIFIED | `test/gateway/openclaw-staging-smoke.test.mjs`；四 capability、錯誤 auth、missing capability、Memory fail-closed |
| OpenClaw runtime identity／image／真 staging | **UNVERIFIED** | 沒有 runtime repository／registry／平台證據 |
| Voice provider remediation source | VERIFIED（source candidate） | sibling branch `feature/p0-6-staging-contract`，commit `0104abc`；provider tests 4/4 |
| Voice remote CI／container digest／STT-TTS image inference | **UNVERIFIED** | private Actions API 無可讀 run；本機無 Docker／模型 image |
| Web v2 GitHub Actions／Web-Tutor container | **UNVERIFIED** | push 到既有 origin 被安全審查要求目的地特定授權；沒有 run ID／URL |
| 真實跨服務 staging smoke | **UNVERIFIED** | 尚無 OpenClaw 與 Voice immutable verified digests，也未建立 staging deployment |
| Production fallback | VERIFIED（registry／未變更） | `mentornest-web` service ID 保留；未 cutover、未刪除、未改流量 |

## 已建立的 deploy gate

- CI 對 `feature/**` 與 pull request 執行 Node 22 `verify:full`。
- CI build Web／Tutor images，實際啟動並驗證 Web `/healthz`、Tutor `/api/health`、
  `cloud_fallback=false` 與 Docker health status。
- Staging guard 要求完整 SHA-256 Voice／OpenClaw image references、固定 OpenClaw runtime
  version、明確 staging namespace、production data 禁用與分離 secrets。
- Tutor `/api/ready` 對 OpenClaw contract/runtime/image/namespace/isolation/capabilities mismatch
  全部 fail-closed。
- Voice provider candidate 對 signature、expiry、issuer、audience、scope、subject-bound audio、
  model/privacy readiness 採 fail-closed。

## Hard invariants 結果

- Browser 不持有 OpenClaw token 或 service-auth key。
- Client `student_id` 不具 identity／authorization 效力。
- Learning Memory 仍經單一 writer authority；失敗不得 fallback 寫 production JSONL。
- `mastery_candidate_kps` 維持非權威 observation 語意。
- Production fixture、staging image／namespace／secret guards 未放寬。
- Voice 只承載 Voice capability，沒有 Tutor／Learning／Assessment／Memory logic。
- 未讀寫 production student data，未變更 child privacy policy。
- Production `mentornest-web` fallback 保留，未 merge、未 deploy、未 cutover。

## Readiness decision

目前可判定為 `deploy-ready candidate`，不可判定為 `staging ready` 或 `merge ready`。
解除 blocker 必須取得：Web v2 遠端 CI run、Web／Tutor image build與 health evidence、Voice
provider CI 與 immutable digest／fixture inference、OpenClaw runtime digest／readyz／四 capability
與平台 namespace isolation，最後對相同 digests 執行 authenticated cross-service smoke。
