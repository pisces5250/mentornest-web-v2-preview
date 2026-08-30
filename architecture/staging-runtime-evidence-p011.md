# P0.11 真實 staging runtime evidence

狀態：`PREPARING_DEPLOYMENT`

本文件只接受平台或真實 runtime 證據。Compose、測試碼與預期 topology 不等同已部署。

## 不可變邊界

- 不修改、刪除或取代 production service、volume、domain 或 fallback。
- 不存取 production student data，不重用 production secret，不掛 production volume。
- 四個 staging service 全部使用完整 `image@sha256` identity，不使用 `latest`。
- Web Edge 是唯一 public surface；Tutor、Voice、OpenClaw Provider 僅允許 private network。
- Browser 不持有 service/provider credential；secret 只由平台 secret store 注入。
- OpenClaw 僅掛 staging-only volume，namespace 必須含 `staging` 且不得含 `prod`。

## Runtime evidence gate

只有下列欄位均有實際平台證據時，狀態才可改為 `STAGING READY`：

| Service | Service ID | Digest | Deploy revision | Endpoint | Health/readiness | Exposure |
|---|---|---|---|---|---|---|
| Web Edge | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | public HTTPS only |
| Tutor Backend | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | private |
| Voice Backend | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | private |
| OpenClaw Provider | UNVERIFIED | `ghcr.io/pisces5250/mentornest-web-v2-preview-openclaw-provider@sha256:9b6f55dee35fc6b1ce000b7a0ee8733727f1a89f29e165ff29e7d161a5ec312a` | UNVERIFIED | UNVERIFIED | image runtime verified；platform UNVERIFIED | private |

平台 evidence 還必須包含 TLS、DNS、secret injection 方式、volume mount、health probe、
namespace mode、platform health 與實際 deployed digest。

## Cross-service acceptance

- 四項 Learning capability 必須用各自正式 typed schema 呼叫。
- Assessment 必須回 `assessment-observation-v1` 與 `mastery_effect: none`。
- Learning Memory 必須回 single-writer authority，且只寫 `student_test_*` staging namespace。
- Voice 必須以 synthetic audio 驗證 TTS 與非空 STT，並證明 no-cloud。
- invalid／expired／wrong-audience credential、wrong contract、missing capability、Provider unavailable、
  Voice unavailable 與 Memory rejection 全部必須 fail-closed。
- 不得 fallback 至 production OpenClaw、production data、direct JSONL write 或 cloud STT/TTS。

在上述實際 evidence 完成前，狀態只能是 `PREPARING_DEPLOYMENT`、
`DEPLOYED BUT NOT STAGING READY` 或 `UNVERIFIED`。
