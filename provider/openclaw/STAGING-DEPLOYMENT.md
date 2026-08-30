# OpenClaw provider candidate staging deployment

本文件描述 candidate 的部署條件，不代表已部署。歷史 production service
`6a8e84ce9ec391c39ae7a996` 保持不動，也不得成為 volume、route 或 data fallback。

## 必要輸入

- 使用 `ghcr.io/pisces5250/mentornest-web-v2-preview-openclaw-provider:<commit-sha>`
  建置，再以 registry 回傳的 `@sha256:<digest>` 部署；禁止 `latest`。
- 從 server-side secret store 將同一個至少 32 字元的
  `OPENCLAW_SERVICE_AUTH_KEY` 注入 Tutor 與 provider；Browser 不得取得此值。
- 設定 `MENTORNEST_ENV=staging`、合規的 `MENTORNEST_DATA_NAMESPACE`、明確的
  `MENTORNEST_DATA_ROOT`、`MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA=false`。
- `OPENCLAW_IMAGE_DIGEST` 必須等於平台實際解析並部署的完整 image digest。
- 掛載全新的 staging-only volume；不得掛 production learning-record、student、
  mastery 或 question-bank volume。

## 驗證與 rollback

1. 先執行 `node deployment/staging/validate-env.mjs` 與 `docker compose config`。
2. 以 authenticated credential 檢查 `/v1/capabilities` 與 `/readyz`，並將回應中的
   contract、runtime、digest、namespace 與部署設定逐項比對。
3. 驗證 invalid signature、wrong audience、expired token、missing namespace、production
   path、traversal、synthetic subject fence 與 Learning Memory fail-closed。
4. 本版 Assessment observation 為 `unavailable`，所以 `/readyz` 正確結果是 503；在真實
   Assessment adapter 與 runtime evidence 完成前，不得把 service 納入健康流量。
5. Rollback 只需停止 candidate 並卸除其 staging-only volume；不得操作 production
   service、DNS、route 或 volume。若刪除 staging volume，仍需人類明確核准。

真正 staging evidence 必須保存 commit SHA tag、registry digest、OCI revision、CI run、
authenticated readiness response 與平台 volume/namespace 設定；本機 image ID 不等同 registry digest。
