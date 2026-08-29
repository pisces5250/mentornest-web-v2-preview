# MentorNest Student Policies — Index

此目錄用來收納 **per-family / per-skill 的政策強化層**。
上層是 `AGENTS.md` / `SOUL.md` / `IDENTITY.md` / `USER.md`，本目錄的內容是針對特定 skill 或情境的補充。

## 文件清單

| 檔案 | 適用範圍 | 狀態 |
|---|---|---|
| `knowledge-digest-guardrails.md` | ClawHub `@ericn26-star/eric-knowledge-digest` 11.0.0（workspace） | **v0.5 家長護欄已生效**（2026-08-26 16:41 UTC） |
| `kd-install-plan.md` | 上述 skill 的安裝指令稿 | 已完成 v0.3（方案 1 workspace 範圍） |

## 安裝後 audit 落點

skill install/verify/vetting 結果寫入：`.learnings/skill-audits/<skill-slug>.md`
（**不寫入** `data/learning-records/`，那是學生學習事件流）

## 讀取順序

任何 agent 在執行 skill 之前：
1. 讀本目錄的 `INDEX.md`
2. 找出對應 skill 的護欄檔
3. 確認 § 硬性條件與 § 拒絕清單
4. 再進入 skill 行為

未列在本 INDEX 中的 skill：視為「無專屬護欄」，需先依 SOUL.md / AGENTS.md 通用原則執行；必要時觸發上層管理人補寫護欄。
