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

## Production isolation

本階段不修改 production resource、不讀寫 production student data、不使用 production credential，
staging failure 不 fallback production。Secret 只可存在 Zeabur encrypted secret／credential storage，
不得進 repo、image、artifact、log 或 browser。本階段不授權 production cutover。

## 已知 UNVERIFIED

- 五科正式 evaluator／rubric 尚未齊備；Chinese、Science、Social Studies runtime assessment 刻意
  fail-closed。
- English voice remote path 不屬於本次 core Math loop，未經 Phase 6.1 新 identity 重驗前保持
  UNVERIFIED。
- 本文件在 remote evidence 補齊前不宣稱 `PHASE 6 STAGING READY`。
