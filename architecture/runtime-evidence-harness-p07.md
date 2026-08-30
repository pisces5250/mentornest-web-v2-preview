# P0.7 Runtime Evidence Harness

狀態：`reproducible_harness_ready_runtime_execution_unverified`

此 harness 只在四個服務皆以 immutable digest 提供時執行，不以 contract mock、source test 或
單一 process health 冒充真實 staging runtime evidence。它不部署 production、不使用 production
學生資料，也不改變既有 authority boundary。

## 執行方式

從 secret store 注入 staging 專用 credential，並設定以下非秘密 immutable references：

- `WEB_EDGE_IMAGE`
- `TUTOR_BACKEND_IMAGE`
- `VOICE_BACKEND_IMAGE`
- `OPENCLAW_LEARNING_IMAGE`

其餘環境契約沿用 `deployment/staging/.env.example`。執行：

```sh
deployment/staging/run-runtime-evidence.sh
```

腳本先執行 deployment guard，再 pull digest-bound images，以 `--no-build` 啟動 compose，並從
同一個 Docker private internal network 執行 `test/staging/runtime-evidence-smoke.mjs`。因此 Voice
與 OpenClaw 在 inference 期間沒有外部 network route；成功的 STT/TTS 同時構成 no-cloud
topology evidence。腳本結束時一律移除 candidate containers 與隔離 volume，不會接觸 production
fallback。

## 驗證內容

- Web Edge process health。
- Tutor 對真實 OpenClaw `/readyz` 的 contract version、runtime/image identity、staging namespace、
  production isolation 與四項 capability 檢查。
- Browser session／mutation CSRF success，以及 invalid session；subject 固定使用
  `student_test_p07_runtime`。Edge 必須依原始 HTTP method 驗證 STT/TTS mutation CSRF，不能因
  internal `auth_request` 使用 GET 而略過。
- 四項 OpenClaw capability 的真實 invocation；Learning Memory 只寫 staging synthetic observation。
- 以相同真實 OpenClaw runtime 啟動三個負向 Tutor probe，分別證明 invalid runtime credential、
  deliberate contract mismatch、deliberately required missing capability 均 fail-closed。
- invalid runtime credential 下 Learning Memory 回覆失敗，且 Tutor 不具本機 production JSONL
  fallback writer。
- Voice `/readyz` contract、STT/TTS model readiness、privacy contract。
- Voice valid service credential；wrong audience、expiry 與 signature corruption 均拒絕 inference。
- 一秒、440 Hz、程式產生的 synthetic WAV STT、固定非學生文字 TTS／audio retrieval，並將
  本地 TTS 產物送回 STT，要求取得非空白 transcript，避免純音調 success 掩蓋辨識失效。

## 證據判定邊界

只有命令以 `P0.7_RUNTIME_EVIDENCE_OK` 結束，且輸出記錄四個實際 digest、model identities、
namespace 與 capability list，才能標記真實 cross-service smoke 為 VERIFIED。缺 image、secret、
模型、capability、namespace isolation 或任一負向案例時皆 non-zero fail-closed。

目前 repository 尚未執行此 harness；在 provider immutable images 與 staging-only secrets 可用前，
真實跨服務 runtime evidence 維持 **UNVERIFIED**。
