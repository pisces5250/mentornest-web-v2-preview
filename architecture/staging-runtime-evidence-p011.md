# P0.11 真實 staging runtime evidence

狀態：`STAGING READY`

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

對 prebuilt immutable image deployment，`service_id + immutable_image_digest +
runtime_readiness_evidence` 共同構成可接受的 deployment identity。Zeabur 未提供
獨立 revision ID 時，據實記錄 `platform_revision_id: unavailable`；此欄位不可偽造，
也不因此否定已由 immutable digest 與 runtime readiness 證實的 deployment。

| Service | Service ID | Digest | Platform revision ID | Endpoint | Health/readiness | Exposure |
|---|---|---|---|---|---|---|
| Web Edge | `6a93e051cb61b34ad92fb553` | `ghcr.io/pisces5250/mentornest-web-v2-preview-web@sha256:afd11580b5afc580e859eaea71829af957b6ac3ceff0eba5ad0736451d4f7b20` | `platform_revision_id: unavailable` | `https://mentornest-p011-runtime-20260830.zeabur.app` | `RUNNING/READY`；`/healthz` 200 | 唯一 public surface；TLS provisioned |
| Tutor Backend | `6a93e04ecb61b34ad92fb541` | `ghcr.io/pisces5250/mentornest-web-v2-preview-tutor@sha256:93b39ec2ecbbc8d21675979a1178eb8f1e3659492593dd9857f5bc818bc8bd9f` | `platform_revision_id: unavailable` | `http://tutor-backend:8787` | `RUNNING`；`/api/ready` 200，OpenClaw dependency ready | private；無 domain |
| Voice Backend | `6a93e9b18eb2f64ed5f19f71` | `ghcr.io/pisces5250/mentornest-voice-backend@sha256:2d460c502b3d485f570d94f207d38a1ec603bdd91252e666fbe5d402d038cb18` | `platform_revision_id: unavailable` | `http://voice-backend:8502` | `RUNNING`；`/healthz`、`/readyz` 200，STT/TTS ready | private；port forwarding disabled、無 domain |
| OpenClaw Provider | `6a93dff9cb61b34ad92fb51c` | `ghcr.io/pisces5250/mentornest-web-v2-preview-openclaw-provider@sha256:7ad7dd65ff66b831633387c3c0345dda8471e7922fc8698515d92e431fa408c0` | `platform_revision_id: unavailable` | `http://openclaw-learning:18789` | `RUNNING`；authenticated Tutor readiness 200 | private；無 domain |

平台 evidence 還必須包含 TLS、DNS、secret injection 方式、volume mount、health probe、
namespace mode、platform health 與實際 deployed digest。

## 2026-08-30 平台 evidence

- 新建獨立 project `mentornest-p0-11-staging`（`6a93dfa58eb2f64ed5f19baa`）與
  `staging` environment（`6a93dfa53bf3ef23ef4d5838`）；未使用現有 production project。
- OpenClaw 掛載獨立 volume `mentornest-p011-staging-openclaw-data` 到
  `/var/lib/mentornest-staging`；namespace 為 `student_test_p011_staging`，
  `MENTORNEST_ALLOW_PRODUCTION_STUDENT_DATA=false`。
- staging-only session／service／Provider keys 由執行期隨機產生並直接注入
  Zeabur service variables；全部 `exposed=false`，未輸出或落盤。
- GitHub Actions run `33298531468` 已驗證 Web／Tutor／OpenClaw publish jobs
  成功，並以 registry digest 重拉驗證。
- Voice run `33298323873` 完成 contract tests、container runtime 與 immutable
  image publish，但 GitHub 不支援 user-owned private repository attestation，因此該
  step 失敗並跳過 digest runtime artifact。Voice package 不允許匿名拉取；
  為避免把 `GH_TOKEN` 持久化成平台 image credential，本次不建立
  Voice service。
- Web Edge 在 Voice private DNS 缺少時以 `host not found in upstream
  "voice-backend"` 拒絕啟動；此為預期 fail-closed，未 fallback 至 production
  或 cloud Voice。因此 TLS、四服務 smoke 與負向路徑仍未完成。
- 後續執行環境已提供 `VOICE_GHCR_PULL_USERNAME` 與
  `VOICE_GHCR_PULL_TOKEN`，但 Zeabur API 只提供會建立 service
  `imageCredential` 的持久化 private-image credential，沒有已驗證的一次性 pull
  介面。為遵守 credential 不持久化要求，本輪未送出 credential mutation，Voice
  service、Web restart 與 TLS provisioning 仍未執行。
- QA cross-review 發現 runtime evidence runner 原先推導 `${project_name}_private`，
  與 Compose 明確指定的 `STAGING_PRIVATE_NETWORK_NAME` 不一致；runner 已改用契約
  network 名稱並加入 regression。Voice 負向 smoke 另新增 browser session token
  直送 Voice 必須被拒的案例。
- Targeted deployment/gateway tests 經允許 loopback listener 的環境重跑後全綠；
  完整 `npm test` 為 319/319，`npm run typecheck` 與 `npm run build` 皆成功。
  這些是 code/harness evidence，不替代尚缺的 Zeabur runtime、TLS 或跨服務 evidence。
- 經人類明確授權後建立 Voice staging service `6a93e9b18eb2f64ed5f19f71`，
  private DNS 為 `voice-backend`，Zeabur `imageCredential` 已加密保存且未注入
  container environment。OCI bearer pull 驗證回 200，resolved digest 與指定 digest
  一致；平台 image 狀態已從 `PULL_FAILED` 進入 `STARTING/PROBING`。
- Container 內 `/healthz` 回 200；STT/TTS models ready，且 privacy 回報
  `cloud_fallback=false`、`learning_memory_write=false`。`/readyz` 因
  `VOICE_SOURCE_COMMIT`／`VOICE_IMAGE_DIGEST` 缺失而回 503。
- 補 metadata 時確認 Zeabur `updateEnvironmentVariable` 是 replace semantics，導致
  Voice app env 目前只保留兩個 runtime metadata keys。因修復同時涉及建立新的
  staging-only service-auth key、同步 Tutor 與重啟兩個 staging services，安全審核要求
  額外人類授權；在授權前維持 fail-closed，不啟動 Web、TLS 或 cross-service smoke。

## 2026-08-30 runtime integration evidence

- 人類擴大 staging-only 授權後，以逐項 variable mutation 恢復 Voice app env，產生新的
  staging-only `MENTORNEST_SERVICE_AUTH_KEY` 並同步 Tutor；兩端 secret 均
  `exposed=false`。Voice 與 Tutor 重啟後皆為 `RUNNING`。
- Voice `/readyz` 回 200：contract `1`、runtime `mentornest-voice-0.2.0`、source
  commit `65613c80ea69bc2452fe71c2b592ff835ae150d4`、image digest一致；STT/TTS
  models ready，`cloud_fallback=false`、raw audio default retention `none`、
  `learning_memory_write=false`。
- Tutor `/api/ready` 回 200：OpenClaw contract `1`、runtime
  `mentornest-openclaw-provider-0.2.0`、image digest一致、namespace
  `student_test_p011_staging`、`production_data_allowed=false`、無 missing capability
  或 mismatch。
- Web generated domain為 `mentornest-p011-runtime-20260830.zeabur.app`；HTTPS
  `/healthz` 200、HTTP 302至HTTPS、curl chain verify result `0`。Leaf certificate SAN
  符合 hostname，有效期至 `2026-11-28T07:54:10Z`。Tutor、Voice、OpenClaw均無 domain。
- Public synthetic cross-service flow實測：invalid session 401；Tutor、Learning Director、
  Assessment、Learning Memory、Verified Bank、TTS、audio retrieval、TTS→STT皆 200。
  Assessment維持 `mastery_effect:none`，Memory authority為正式 writer，Verified Bank只回
  verified questions；STT transcript非空且不保留audio/transcript。
- Voice private auth負向實測：wrong audience、expired、bad signature與browser-session
  shape全部回401，且未執行inference。
- 取得專用Tutor package read-only credential後，建立三個private、無domain、無health-gate
  的隔離fault services：`tutor-contract-mismatch`（`6a93f6becb61b34ad92fbe29`）、
  `tutor-missing-capability`（`6a93f6c28eb2f64ed5f1a4b7`）、
  `tutor-provider-unavailable`（`6a93f6cfcb61b34ad92fbe3b`）。Credential僅保存於各
  service `imageCredential`，未注入container env。
- Remote fault evidence：contract mismatch回503且mismatch為`contract_version`；missing
  capability回503且列出`p011.synthetic.missing`；Provider unavailable回503且mismatch為
  `runtime_unavailable`；短暫suspend Voice後，public Web TTS回504與`ok:false`，未fallback。
- Voice fault drill後已恢復`RUNNING`，`/readyz`與public Web TTS重驗皆200。三個fault
  services已送出delete並由Zeabur suspend，處於平台可取消刪除的保留期；無public domain、
  不再運行。主四服務仍全數`RUNNING`。
- 最終gate曾偵測到早期serial drill殘留的主Tutor
  `OPENCLAW_CAPABILITY_CONTRACT_VERSION` mismatch；已將該staging-only變數恢復為`1`
  並重啟。最終Tutor `/api/ready`回200、OpenClaw `ok:true`且mismatches為空；再次由
  public Web執行Tutor、四capabilities與Voice TTS，全部回200。
- 四項remote fault cases、既有主cross-service flow、TLS、privacy、auth、namespace與
  production isolation gates均有實際runtime evidence，因此狀態升級為`STAGING READY`。

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
