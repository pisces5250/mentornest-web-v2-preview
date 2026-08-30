# MentorNest OpenClaw Provider Candidate

這是 staging-only、最小化且可重現建置的 OpenClaw provider adapter。它不包含歷史
workspace，也不讀取或掛載 production learning data。

## 契約

- `GET /readyz`：驗證runtime identity、namespace及必要capability完整性。
- `GET /v1/capabilities`：回報四項capability的`available`／`unavailable`狀態與原因。
- `POST /v1/capabilities/invoke`：版本化、server-only HMAC credential保護的呼叫入口。

所有端點都要求短效service credential；issuer為`mentornest-gateway`、audience為
`openclaw-learning`，並要求`service:invoke`scope。Browser不得取得signing key。

目前 Learning Director、Learning Memory writer 與 Verified Bank read 為 candidate
`adapter`；Assessment observation 因無歷史 runtime evidence 保持 `unavailable`，因此
`/readyz` 回 503。這是刻意的 fail-closed 狀態，不得解讀為完整
staging runtime。

## Build與test

```sh
node --test provider/openclaw/test/*.test.mjs
docker build --build-arg VCS_REVISION="$(git rev-parse HEAD)" \
  -f provider/openclaw/Dockerfile provider/openclaw
```

Runtime必須由secret store注入`OPENCLAW_SERVICE_AUTH_KEY`，並設定：

- `MENTORNEST_ENV=staging`
- `MENTORNEST_DATA_NAMESPACE`：不得含production語意
- `MENTORNEST_DATA_ROOT`：獨立staging volume
- `MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA=false`
- `OPENCLAW_IMAGE_DIGEST`：部署的完整immutable image identity

任何必要設定缺失、production-like path或mutable image identity都會拒絕啟動。
