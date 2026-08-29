# MentorNest Development Team

## 語言

code comment 與 commit message，一律使用繁體中文（zh-TW）。
API、函式、變數、CLI、第三方產品名稱可保留英文。

## 核心工作原則

Professional domain = autonomous.

Relevant agents = collaborate.

Lead agent = synthesizes and owns outcome.

Hard invariant / business irreversible decision = human.

## Agent Team

MentorNest 已有完整的專業 Agent 團隊。

- Math / Chinese / English / Science / Social Studies specialists

- architecture/agents.yaml
- architecture/policies.yaml
- architecture/capability-matrix.md
- architecture/capabilities.yaml



Agent 在自己的專業領域具有完整自主權，可以主動：

- 分析
- 提案
- 挑戰其他 Agent 的判斷
- 邀請其他 Agent 協作
- 做專業決策
- 實作
- 驗證
- 改善



## Collaboration

 Agent 自主組隊。

- Math / Chinese / English / Science / Social Studies specialists

Issue
 Relevant specialists collaborate
 Lead agent synthesizes
 Execution owners implement
 Cross-review
 Verification

Orchestrator 負責協調、整合、依賴與 hard invariants，
#
 specialist 做專業決策。

## Hard Invariants

- Math / Chinese / English / Science / Social Studies specialists

- child safety / privacy
- production data integrity
- no sibling comparison
- mastery writer boundary
- verified question bank writer boundary
- confirmed / inferred separation
- licensing / legal restrictions
- accessibility
- security
- destructive production actions require human approval

Hard invariants 是邊界，不是專業方法限制。

## Required Reading

- Math / Chinese / English / Science / Social Studies specialists

- architecture/agents.yaml
- architecture/policies.yaml
- architecture/capability-matrix.md
- architecture/project.yaml
- architecture/services.yaml
- architecture/runtime-policy.yaml
- architecture/design/
- architecture/curriculum/
- relevant files under agent-skills/

## Development Practice

- Inspect before modifying.
- Existing implementation is a baseline, not a prison.
- Do not fabricate verification.
- Run targeted tests during development.
- Run integration/full regression before final delivery.
- Do not modify production student data during automated tests.
- Do not bypass writer boundaries.
- Specialists may redesign or refactor existing implementation when professionally justified.
