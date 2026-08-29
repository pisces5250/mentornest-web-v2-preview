# P0.5 Production Backend Boundary

狀態：`implementation_candidate_not_deployed`

## 協作紀錄

- Lead：Backend
- Participants：Security、Learning Director、Assessment、Learning Memory、Question Quality
- Decision：Browser 只使用同源 session；Tutor／Gateway 從驗證後的 auth context 解析 subject，並透過 server-side OpenClaw adapter 呼叫 capability。
- Execution Owner：Backend
- Verification Owner：Security／QA cross-review
- Hard invariants：child privacy、security、production data integrity、mastery writer boundary、Verified Bank writer boundary、confirmed／inferred separation
- Acceptance evidence：`test/gateway/auth-gateway.test.mjs`、`test/tutor/conversation-api.test.mjs`、typecheck 與完整 regression gate

## Trust boundaries

```text
Browser（HttpOnly mn_session；無 OpenClaw token）
  → Web Edge（同源路由）
  → Tutor／MentorNest Gateway（驗 session、scope、CSRF，從 auth context 取得 subject）
  → OpenClaw capability endpoint（server-only bearer token）
```

Browser request body 的 `student_id` 不具 identity 或 authorization 效力。Tutor conversation
建立 session 時強制以 `req.auth.subjectRef` 覆寫；turn／end 也會驗證 session owner。Learning
Memory 只接受 Gateway writer adapter，失效時 fail-closed，不得 fallback 直寫 production JSONL。

## Capability allowlist

| Gateway capability | Authority | Web scope | 寫入語意 |
|---|---|---|---|
| `learning_director.recommend` | Learning Director | `learning:read` | 無 |
| `assessment.submit_observation` | Assessment | `learning:write` | 非權威 observation；mastery 仍由既有 authority 判定 |
| `learning_memory.append_observation` | Learning Memory | `learning:write` | append-only authority boundary |
| `verified_bank.read` | Question Quality／Verified Bank | `learning:read` | read-only；沒有 writer route |

未列於 allowlist 的 capability（包含 mastery write、Verified Bank write）一律拒絕。

## Authentication 與 secret contract

- `MENTORNEST_GATEWAY_SESSION_SECRET`：只驗證 `mn_session`；token 綁定 `ver=1`、
  `iss=mentornest-web-edge`、`aud=mentornest-tutor`、expiry 與 scopes。
- `MENTORNEST_SERVICE_AUTH_KEY`：只簽 edge 到 Voice／Tutor 的短效 audience-bound service token；
  不得與 session secret 共用。
- `OPENCLAW_GATEWAY_ORIGIN`／`OPENCLAW_GATEWAY_TOKEN`：只存在 Tutor／Gateway backend；
  不得進入 Web image、HTML、`VITE_*` 或 browser response。
- `MENTORNEST_AUTH_MODE=test` 只允許 `student_test_*`／`student_t_*` fake identity；production
  模式完全忽略並拒絕 `X-MentorNest-Test-Subject`。

所有 state-changing browser route 要求 double-submit CSRF：可讀的 `mn_csrf` cookie、
`X-MentorNest-CSRF` header 與 server 依 HttpOnly session 計算的簽章三者必須相同。
Gateway 對 upstream failure 只回傳穩定、無內部細節的 error envelope。

## 尚未完成的外部驗證

OpenClaw runtime repository 必須提供 `/v1/capabilities/invoke`、`/readyz`、上述四項 capability
名稱／版本、bearer token 驗證與 staging namespace 隔離證據。本 repo 的 adapter 與 mock tests
不等於已驗證 OpenClaw image。Voice repository 必須自行驗證 service token audience 與 expiry；
本 repo 不宣稱 Voice image 已通過。
