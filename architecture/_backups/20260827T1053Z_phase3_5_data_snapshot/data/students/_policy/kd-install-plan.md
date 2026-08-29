# 安裝計畫 — eric-knowledge-digest

> 狀態：待執行（未執行）
> 對應護欄：data/students/_policy/knowledge-digest-guardrails.md
> 對應 vetting：先前 chatbot session 內已完成的 skill-vetter report

---

## 1. 套件來源決策

- 只安裝 `eric-knowledge-digest`，**不安裝** `eric-knowledge-digest-v2`（v2 內容未閱讀、需另跑 vetting）
- 版本鎖 **11.0.0**（ClawHub 上 **目前唯一** 帶 Skill Card 的可裝版本）

### 已驗證版本

| Version | ClawHub Skill Card 可得 | 建議 |
|---|---|---|
| **11.0.0** | ✅ | **鎖定** |
| 10.0.0 | ❌（無 Skill Card） | 不採用 |
| 1.0.0 | ❌（無 Skill Card） | 不採用 |
| `eric-knowledge-digest-v2` | 未讀過 SKILL.md | 不採用 |

### Skill Card 摘要（11.0.0）

- Publisher：`ericn26-star`
- License：**MIT-0**（已確認）
- 使用情境：教材→notes/quizzes/slides/mindmap/audio 轉換
- 自揭露風險：
  - 選用 WebSearch → 教材可能過時／不準
  - 解析／年級適配不完全 → 教材可能誤述或難度偏移
- 自緩解措施：複查生成的教材、人工檢查來源

---

## 2. 安裝指令稿（dry-run，**未執行**）

```bash
# Step 1 — 安裝前先 verify 拉一次 Skill Card 與 metadata
openclaw skills verify eric-knowledge-digest --version 11.0.0 --card \
  | tee .learnings/skill-audits/eric-knowledge-digest.pre-install.txt

# Step 2 — 鎖版安裝到共享 managed skills 目錄（--global）
#         整個 MentorNest 共用，所有 active student 都可調用
#         ⚠️ 不綁定 student_id；執行階段才決定 active student
openclaw skills install eric-knowledge-digest --version 11.0.0 --global

# Step 3 — 安裝後立即 verify（看 ClawHub 是否仍認定本機版本為 11.0.0）
openclaw skills verify eric-knowledge-digest --card \
  | tee .learnings/skill-audits/eric-knowledge-digest.post-install.txt

# Step 4 — 列出來比對
openclaw skills list --global --json \
  | jq '.[] | select(.slug=="eric-knowledge-digest")'
```

> `--global` 與 `--agent <id>` 互斥（OpenClaw CLI 會拒絕）。已決定走 `--global`。

---

## 3. 共享範圍與 student 綁定決策

| 項目 | 決策 |
|---|---|
| 安裝範圍 | 全 MentorNest 共用（`--global`） |
| **student_id 綁定時機** | **不綁**；執行階段才根據當下 active student 決定 |
| Artifacts 寫入根目錄 | `data/students/<student_id>/artifacts/<topic>/`（執行時由 agent 動態解析） |
| Skill audit 記錄位置 | **`.learnings/skill-audits/eric-knowledge-digest.md`**（不進 learning-records，這是系統層 audit 而非學習事件） |

---

## 4. 上線前的清單

執行安裝前確認：

- [ ] 家長已完成護欄 §6 三項勾選（記錄於此檔下方的「家長確認」段落）
- [ ] 已決定走 `eric-knowledge-digest` 11.0.0（不是 v2、不是其他版本）
- [ ] 安裝範圍確認為 `--global`（全 MentorNest 共用）
- [ ] `.learnings/skill-audits/` 已建立
- [ ] 護欄文件已建 ✅（`knowledge-digest-guardrails.md`）

---

## 5. 安裝後必跑的 3 件事（對應護欄 §5）

1. **再次 vetting**：以本地 `skills/eric-knowledge-digest/SKILL.md` 為對象，重跑 §2 條件；寫進 `.learnings/skill-audits/eric-knowledge-digest.md`
2. **audit 記錄（改位置）**：完整 install/verify/vetting 結果寫進 `.learnings/skill-audits/eric-knowledge-digest.md`（**不寫進 data/learning-records/**，那是學生學習事件流）
3. **artifacts 路徑動態解析規則**：KD 執行時，agent 必須先 `student_profile_get` 拿到 active `student_id`，再寫入 `data/students/<student_id>/artifacts/<topic>/`。這個規則要寫入 guardrails §3.1。

---

## 6. 風險與撤除

- `--global` 安裝會把 skill 放進共享 managed 目錄，所有 agent 可見
- 若日後發現問題，可執行：

  ```bash
  # OpenClaw CLI 不直接提供 uninstall；改用手動移除 + verify
  rm -rf ~/.openclaw/skills/eric-knowledge-digest   # 視實際路徑而定
  openclaw skills list --global                     # 確認移除
  openclaw skills check                             # 確認其他 skill 健康
  ```
- 護欄文件本身在安裝前就已生效，**不需要** KD 安裝完成才能保護兒童

---

## 7. 家長確認（決策欄）

請家長在此記錄口頭/書面同意：

| 項目 | 勾選 |
|---|---|
| 已了解 KD 在「無教材」時會主動搜尋網路 | [ ] |
| 同意 artifacts 動態落在 `data/students/<active_student_id>/artifacts/<topic>/` | [ ] |
| 同意 KD 受 MentorNest 教學守則約束 | [ ] |

家長簽名 / 日期：______________________

---

## 8. 變更歷史

- v0.1 — 2026-08-26 — 初版；版本號未定
- v0.2 — 2026-08-26 — 鎖定 11.0.0、改用 `--global`、artifacts 路徑改為動態解析、audit 改存 `.learnings/skill-audits/`、移除 v2 與多版本比較段落
- v0.3 — 2026-08-26 16:39 UTC — **已執行安裝**；實際採方案 1（workspace 範圍，未加 `--global`），請見 `.learnings/skill-audits/eric-knowledge-digest.md` 取得 audit 完整記錄
