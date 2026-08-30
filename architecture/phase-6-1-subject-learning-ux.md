# Phase 6.1 Subject-Specific Learning UX 與 staging closure

## 專業 ownership

Subject Specialist 擁有判斷、rubric、錯因 taxonomy、hint ladder、教學表示需求與後續練習策略；
Learning Experience／UI Designer 擁有 information architecture、interaction、visual hierarchy、
responsive behavior 與 accessibility。Designer 只呈現 specialist contract，不推導答案或改寫教學判斷。

五科需求方向如下：

- Math：等式步驟、數線、fraction bar、worked example；目前有 deterministic validator。
- English：model sentence、pronunciation、vocabulary、conversation；錯因保留完整 `error_codes[]`。
- Chinese：character structure、reading strategy、sentence pattern、text evidence。
- Science：observation evidence、causal model、variable control、concept model。
- Social Studies：timeline、map context、source evidence、perspective。

共用 UI 只保留老師回饋區、狀態公告、再答／提示／下一題 actions、receipt 狀態與安全的
public next step。五科 representation 使用 subject-discriminated kind allowlist；未知 kind 不呈現額外
結構，但保留 specialist 原始 utterance。Representation transport 拒絕 `expected_answer`、
`answer_key`、`rubric` 與 `judgement`。

## Assessment 與 evidence 邊界

- Math objective response 可形成 observed Assessment evidence。
- English diagnosis 保留 specialist `error_codes[]`；confirmed mastery 仍不由 Tutor 寫入。
- Chinese、Science、Social Studies 在正式 evaluator／rubric 完成前回傳 `unverifiable`，不得以
  normalized string comparison 冒充 observed evidence，也不得寫 Assessment 或 Learning Memory。
- Learning Memory 只透過正式 append-only writer；writer 未接受時不呼叫 Learning Director。
- Learning Director 只讀 confirmed mastery 與 recent observations 的分離欄位，不把 inferred
  diagnosis 提升為 confirmed mastery。

## Staging Verified Bank authority

Image 內的 synthetic fixture 保持 `candidate`。只有 staging provider 明確啟用 seed flag 時，
非 HTTP 的 Question Quality writer 才會驗證 structure、provenance/license、answer key、choice
dedupe 與 staging isolation，通過後以 exclusive create 寫入 Verified Bank 並記錄
`quality.authority=question_quality_agent_verify`。Production、非 synthetic ID、路徑逃逸與覆寫都拒絕。

## 驗證紀錄

2026-08-30 本機新工作樹：

- targeted Tutor／deployment／五科 a11y：20/20。
- Provider authority、readiness 與 writer isolation：10/10。
- full regression：347/347。
- TypeScript typecheck：通過。
- production build：通過。
- 真實 React Playwright：先錯、再答對、2 筆 append-only response、browser answer key exposure 0。
- axe：初始與動態老師回饋畫面 critical／serious 皆 0；鍵盤 dialog、開始學習與回饋 focus 皆通過。

上述 browser evidence 使用 canonical Tutor response mock，證明 UI contract 與孩子互動，不冒充
remote staging learning-loop evidence。Remote service identity、readiness、writer receipt、Learning
Memory 與 Director evidence 必須等新 HEAD CI 產生 immutable images 並部署後另行補入。

### 2026-08-30 remote staging deployment attempt

Source commit `f0af273d96e1150edf6ad7d039f89cc7686c5a5c` 的 CI run `33309142063`
四個 jobs 全部成功。Registry 以 staging-only read credential 解析的 immutable identities：

- Web：`sha256:46a6e5b4837fa066c2807e9f13de985cc3dc954081b1f12a63422c6963488d08`
- Tutor：`sha256:2cb4151c9d4dea11c3bc29a439b2d7527c0035b47cf37ce2571361ded1534ab0`
- OpenClaw Provider：`sha256:3124b78dd3d271f2e5db13f4bcebd0e9950cdab1907f602837472da3ac4421c1`
- Voice：`sha256:2d460c502b3d485f570d94f207d38a1ec603bdd91252e666fbe5d402d038cb18`

隔離 services 曾建立為 `phase61-web`、`phase61-tutor`、`phase61-openclaw`、`phase61-voice`。
Tutor 成功拉取指定 digest 並啟動；Provider 與 Voice 的 deployment event 則回報
`FailedToRetrieveImagePullSecret` 與 GHCR `403 Forbidden`。以同一組 read-only credential 直接做
registry scope probe 均成功，故 blocker 是 Zeabur template credential 沒有綁定為可取用的原生
image pull secret，不是 digest 或 PAT scope 錯誤。

由於平台未能證明 template variable 會成為加密 `imageCredential`，沒有把 token 改放一般
environment variable、template file、artifact 或 browser。四個暫時 services 已停止並解除 domain；
Zeabur metadata 保留 `SUSPENDED` tombstone。既有 P0.11 staging baseline 全部仍為 `RUNNING`。

本次沒有形成 Provider／Voice readiness、Question Quality writer receipt、remote learning-loop 或
remote 五科／Voice browser evidence，因此不能據此宣稱 `PHASE 6 STAGING READY`。

## Production isolation

本階段不修改 production resource、不讀寫 production student data、不使用 production credential，
staging failure 不 fallback production。Secret 只可存在 Zeabur encrypted secret／credential storage，
不得進 repo、image、artifact、log 或 browser。本階段不授權 production cutover。

## 已知 UNVERIFIED

- 五科正式 evaluator／rubric 尚未齊備；Chinese、Science、Social Studies runtime assessment 刻意
  fail-closed。
- English voice remote path 不屬於本次 core Math loop，未經 Phase 6.1 新 identity 重驗前保持
  UNVERIFIED。
- Zeabur 必須先以原生加密 `imageCredential` 綁定 Provider 與 Voice private GHCR pull；不得以
  environment variable 或可記錄的 template substitution 取代。
- Provider／Voice readiness、Question Quality writer receipt、remote learning-loop、五科 remote UI
  與 Voice path 尚未形成 evidence。
- 本文件在 remote evidence 補齊前不宣稱 `PHASE 6 STAGING READY`。
