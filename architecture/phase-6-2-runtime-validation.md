# Phase 6.2 五科 Runtime 與 Voice Evidence

日期：2026-08-31（Asia/Taipei）  
範圍：`mentornest-p0-11-staging`／`staging`，不包含 production cutover。

## Deployment identity

- Source HEAD：`be7d54be87abd884f054dbeb5657faaf3f52e911`
- commits：`eccf001 建立五科正式教學閉環`、`be7d54b 落實五科伺服器學習介面`
- Web：service `6a945464f58fe6cbb975bbac`，tag `be7d54be87abd884f054dbeb5657faaf3f52e911`，digest `sha256:0d08a08c0050dca8f6ba7512c4b5b88bb8d4150d3bb4dab83fbb156ef15e7bc3`
- Tutor：service `6a945464f58fe6cbb975bbad`，同 commit tag，digest `sha256:4830a79d557ec82a02e352cbd251e9270fc53d9bf546ebfdb04beaca990ffd06`
- OpenClaw：service `6a945464f58fe6cbb975bbae`，同 commit tag，digest `sha256:b4b3f2dbdb8825e9570f0bf8d81cf68c7fcc6312c800937c3128c7a9d5f26359`
- Voice：service `6a945464f58fe6cbb975bbaf`，沿用 Phase 6.1 immutable identity；本階段未改 image 或 credential。
- 四個 services 最終 metadata 均為 `RUNNING`；public URL 為 `https://mentornest-phase61-f0af273.zeabur.app`，TLS 通過實際 browser 與 API 呼叫。
- GitHub Actions run `33326218157` 對應精確 HEAD；API 查得四個 jobs（verify、provider candidate、Web/Tutor publish、Provider publish）均 `completed/success`，且三個 commit tags 已可由 GHCR manifest 解析為上述 digests。Run summary 最後一次查詢受公開 API rate limit 影響，未另行宣稱額外結論。

## Question Quality 與五科正式最小能力

五個 synthetic candidates 由 image 內 fixture 交給唯一 staging Question Quality writer；writer 以 exclusive create 寫入隔離 namespace，gate 包含 structure、provenance、answer key、choice dedupe、subject-specialist 與 staging isolation。沒有 browser writer route，也未直接寫 storage。

五科共用的只有安全 evidence envelope；正式判斷、error taxonomy、feedback、hint 與 representation 由各科 Specialist 擁有：

- Math：分數單位與共同分母，`MATH-*`；fraction bar／number line。
- English：現在進行式與主詞一致，`EN-*`；sentence chunks 與朗讀語句。
- Chinese：主旨與細節／無文本支持，`ZH-*`；段落標記與心智圖。
- Science：實驗變因與公平測試，`SCI-*`；變因表與實驗圖。
- Social Studies：時間線與史料相關性，`SS-*`；timeline 與 source cards。

沒有正式 specialist metadata、不是可客觀判斷題型或答案格式無效時維持 `unverifiable`，且不寫負向 Assessment／Memory。

## Remote server-backed learning loops

同一個短效 synthetic child session 經 public HTTPS、Web Edge 與 Tutor 跑完五科。所有 public question 均未含 `expected_answer`、`answer`、`answer_key`、`rubric` 或 `specialist`。

| 科目 | Verified item | verdict／authority | Assessment receipt | Memory receipt | Director／next |
|---|---|---|---|---|---|
| Math | `q.synthetic.math.g5.frac.add.001` | incorrect／`objective_math_validator` | `aobs_aebdbf3d42a1642c46ee4cce` | `lmem_2b913f62-5406-4311-b9ee-dc7d850685b9` | `learning_director_read_only`／同科 verified item |
| English | `q.synthetic.english.g5.grammar.001` | correct／`english_specialist_verified_choice_evaluator` | `aobs_eeacb96a96d875c67e45b73a` | `lmem_75f14edc-2542-4107-9ca3-70e26abdbe59` | 同上／同科 verified item |
| Chinese | `q.synthetic.chinese.g5.reading.001` | correct／`chinese_specialist_verified_choice_evaluator` | `aobs_b83133a6cab71b5582e6c126` | `lmem_e8f8607b-1290-4d05-8bdd-f2fb2141af9c` | 同上／同科 verified item |
| Science | `q.synthetic.science.g5.experiment.001` | correct／`science_specialist_verified_choice_evaluator` | `aobs_4e276ed5ed78a6f10c21fb48` | `lmem_4340dcf3-92c4-4389-ad80-cb92b053b28b` | 同上／同科 verified item |
| Social Studies | `q.synthetic.social.g5.timeline.001` | correct／`social_studies_specialist_verified_choice_evaluator` | `aobs_206778e1aaf22e5da7c0842a` | `lmem_a2b830ee-3fb8-4c81-9365-9c2686cd5043` | 同上／同科 verified item |

Assessment 仍是 observation，`mastery_effect:none`；Memory 保存 observed 與 inferred 分離的 subject payload；Director 只有 read-only recommendation authority。

## Browser 與 accessibility

系統 Google Chrome headless 實際載入 public staging TLS URL。五科逐一切換後，`POST /api/tutor/session/start` 均回 200、各自 verified question 均實際 render。Axe 掃描五個 session screen 皆無 serious／critical violation。

Designer 保留共用的 session shell、auth、answer isolation、focus 與狀態回饋；科目內容不套同一 detail template：Math 使用步驟 list、English 使用 `lang=en` model phrase、Chinese 使用 `lang=zh-Hant` 文句、Science 使用觀察／證據 definition list、Social Studies 使用時間／地點／資料脈絡 list。

## Voice reliability

既有歷史 failure 有兩次精準 `45000ms` watchdog 後 SIGTERM，且曾出現 readiness probe timeout；CPU 最近兩小時平均 `2.60%`、最大 `27.30%`，Memory 平均 `242.22MB`、最大 `524.04MB`，沒有取得 CPU/RAM 飽和或 OOM evidence。因此「每次必然重載模型」只能保留為先前推論，不能當已確認根因。

本階段在未改 Voice image、credential 或 timeout 下，連續三次真實 local-only synthetic TTS → audio retrieval → STT 已成功：

- 第一次：TTS 200（約 2992ms）、audio 78588 bytes、STT 200（4871ms）、transcript 非空、model `sensevoice-small-int8`、總流程 8615ms。
- 第二次：TTS 200、STT 200（2947ms）、總流程 3631ms。
- 第三次：TTS 200、STT 200（3030ms）、總流程 3798ms。
- 三次均走 Web Edge 與 Voice staging，`cloud_fallback=false`，皆小於 30 秒 SLO。

目前 evidence 支持冷／暖路徑已可用，但歷史 45 秒 timeout 的根因尚未由 Voice source instrumentation 證實；後續應補 queue/model-load/decode/inference/RSS 指標，不能只放寬 timeout。

## Verification 與 isolation

- targeted：29/29 PASS。
- full regression：357/357 PASS（需 loopback 權限的 harness 亦通過）。
- typecheck：PASS。
- production build：PASS。
- `git diff --check`：PASS。
- 未修改 production resource、production data、production credential／volume；staging failure 無 production fallback；secret 未寫入 repo、artifact、image 或 browser。

## Readiness verdict

- `CORE PHASE 6 STAGING READY`：是。
- `VOICE STAGING READY`：是（以連續三次 <30 秒 remote synthetic round-trip 為本輪 gate）。
- `FULL PHASE 6 STAGING READY`：是。

Remaining UNVERIFIED（非本輪 staging blocker）：Voice 歷史 timeout 的精確 source-level root cause；Learning Memory idempotency 跨 process restart 的 durable guarantee；五科目前只驗證最小正式 multiple-choice evaluator，開放題／口說 rubric 尚未宣稱具備正式能力。

## 2026-08-31 三缺口與入口 UI closure

Runtime source identity：`efa8ce5bc1c640af54cf8109c1e08c664e6be07b`。GitHub Actions run `33352135433` 公開頁面標示 `completed successfully`；Web／Tutor／OpenClaw 使用同一 immutable commit-SHA tag，Voice image 未修改。四個 Phase 6.1 services 最終皆 `RUNNING`，public domain TLS 為 `PROVISIONED`。本次受 private GHCR 與公開 API rate limit 限制，未重新取得三個 manifest digest，故不偽造或覆寫先前 digest。

- Question Quality：五科各六題，共 30 個 synthetic candidates；每題經正式 writer 取得 stable SHA-256 content digest 與 `qqr_*` receipt。同 ID 同內容跨 restart replay 原 receipt，同 ID 不同內容 409；Verified Bank 支援排除 current/recent question，Tutor 只呈現具完整正式 evaluator contract 的 instrument。
- 下一題：最終 remote sessions 每科回四題；五科真實 turn 均產生 Assessment、Memory、Director 與不同的 eligible next question，public payload 無 answer key，沒有 confirmed mastery 宣稱。
- Memory recovery：以 `response_id` 綁定 immutable assessment artifact 與 writer idempotency key；失敗時不呼叫 Director、不顯示下一題，孩子可按「再存一次」重送同一交易。Provider 已驗證跨 process/restart replay、八路並行只 append 一筆、payload conflict 409。
- 孩子回饋：browser 不再呈現 `SS-*`／`EN-*` 等內部診斷碼，只顯示 specialist feedback、提示與 child-safe next reason。
- 入口 UI：單一 primary CTA「開始今天的學習」；換科收在 secondary disclosure，五科各自顯示教學模式；resume subject/topic 保持一致，提供「先休息」。未登入、驗證中、ready、service unavailable 四狀態分離。
- Remote Chrome：staging login 200；入口 Axe serious/critical 0；英文 session 顯示 `題目 1 / 4`。Screenshot：[phase6-2-entry-efa8ce5.png](evidence/phase6-2-entry-efa8ce5.png)。
- Voice：三次新 synthetic TTS→audio→STT 均成功，約 4–6 秒；model `sensevoice-small-int8`，audio 不保留、transcript 不持久化。實測 STT 會將 `We're`／`T.V.` 轉成 contraction／逐字母形式，Tutor 僅在 read-aloud evaluator 做 deterministic normalization；remote turn 最終判定 `correct`，authority `english_read_aloud_deterministic_evaluator`，Assessment `aobs_32eeeae36bd2b69bc5af113c`、Memory `lmem_306cc20c-b259-4666-b729-ed7b375e5624`，且 response 不回傳 raw transcript。

最終驗證：full regression 369/369、typecheck、production build、真實 Chrome browser gate、`git diff --check` 與 final HEAD GitHub CI 全綠。Production resources、student data、credential、volume、fallback 與 cutover 均未修改。

## 人工瀏覽器存取修正

一般瀏覽器原先沒有取得 synthetic staging session，首次點擊被 Tutor 正確回 401，但 UI 誤顯示為題目準備失敗。修正後：

- Web `6a945464f58fe6cbb975bbac`：tag `577325df0b6e7274476248e48e445d6c728a7dde`，digest `sha256:0f97531046163636aef5a7692551648b654b150ac6011a4e4066f6b73530e7b2`。
- Tutor `6a945464f58fe6cbb975bbad`：tag `8a296a4913f209fef72febf6226988b1f06c3058`，digest `sha256:ae47df655bf2e7883f0e954c62785878f2f9024257c7877d66d00759505e307d`。
- 未登入的 401 會顯示 staging 存取密碼表單，不再誤報老師／題庫故障。
- 登入 route 只在 `MENTORNEST_ENV=staging` 註冊，限制 HTTPS exact-host Origin、每 IP 每分鐘五次，並以 constant-time digest comparison 驗證既有 staging `PASSWORD`。
- 成功後只核發一小時、`Secure`／`SameSite=Lax`／HttpOnly 的 `mn_session`；密碼不進 bundle、Cookie 或 log。
- 全新無 Cookie Chrome 實證：session start 401 → staging login 200 → session start 200；題目實際 render、無 error，`mn_session.httpOnly=true`。
