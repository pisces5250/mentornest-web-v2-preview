# MentorNest 護欄 — eric-knowledge-digest

> 狀態：**已生效（家長護欄核准）**（v11.0.0 已裝於 workspace；audit 見 `.learnings/skill-audits/eric-knowledge-digest.md`）
> 對象：家長決策者 + MentorNest agent 主程式
> 適用 skill 來源：ClawHub `@ericn26-star/eric-knowledge-digest` v11.0.0
> 家長正式護欄核准：見 §6（2026-08-26 16:41 UTC）

---

## 1. 為什麼需要這份護欄

`eric-knowledge-digest`（後簡稱 KD）是一個 **純 prompt-only** 的 skill：
- 沒有附帶任何 script、Python、Node 程式
- 不會自動執行 shell、不會讀取憑證
- 會請 agent 觸發 LLM 原生能力（gen_images、audio、WebSearch、file_write）

風險全部來自「agent 替誰、用什麼教材、產出放在哪裡、誰看得到」。
SOUL.md / AGENTS.md / MentorNest 的兒童安全政策是這份護欄的上層，本文件是 KD 專屬的強化層。

---

## 2. 安裝前的硬性條件

只有在下述三項**全部成立**時，才建議安裝：

| # | 條件 | 驗證方式 |
|---|---|---|
| A | 已驗證 student_id（active student 是誰、幾年級） | `student_profile_get` 回傳非空 |
| B | 目前沒有任何相同 skill 正在執行 | `sessions_list` 檢查 |
| C | 家長（或監護人）已口頭或書面同意這個 skill | 由觸發者記錄在 `data/learning-records/<student_id>.jsonl` |

任一項不通過：拒絕安裝，僅以「已 vetting 但未安裝」狀態記錄於本檔。

---

## 3. Agent 必須遵守的護欄（執行階段）

### 3.1 學生身份先於教材

- 在 KD 讀教材前，必先用 `student_profile_get` 取得**當下 active student** 的 student_id
- 安裝時**不綁定 student_id**；執行階段才動態決定 active student
- 教材不得跨學生共享：不得把 student_002 的照片讀進給 student_001
- 若教材來自家長上傳，使用 `data/students/<student_id>/artifacts/<topic>/` 作為輸出根目錄，**不要寫到 workspace root 或共享資料夾**——其中 `<student_id>` 與 `<topic>` 由執行當下動態解析

### 3.2 教材來源分級（含家長 WebSearch 政策）

| 來源 | 行為 |
|---|---|
| 已上傳的 PDF / 照片（使用者主動給） | OK，可直接處理 |
| URL（使用者提供） | 必須先取得使用者再次確認；不進入 cache 以避免後續誤解 |
| **WebSearch 合成** | **家長護欄（2026-08-26 16:41 UTC）：僅在「沒有提供教材」或「家長明確要求補充資料」時允許；不可默認主動搜尋**。觸發前必須先詢問並等待回覆；搜尋結果的來源清單要先複查再產 artifacts |

> 觸發搜尋後的內容會被當作「教材內容」處理，但不應取代教科書本身的定義。
> 若孩子拿 KD 生成的「教材」當考試答案，這不是學習，這是作弊。
> **WebSearch 預設 OFF**；agent 不得在「沒教材」時自作主張打開，也不得在「已給教材」時主動補充搜尋。

### 3.3 輸出分級

KD 一次最多會產出 6 種檔案。每種檔案在兒童模式下的可接受性：

| 輸出 | 給孩子看 | 給家長看 | 規則 |
|---|---|---|---|
| `{topic}_quiz.html` | ✅（互動 Quiz） | ✅ | MentorNest 教學守則適用：單題交付、不要一次倒 20 題 |
| `{topic}_mindmap.png` | ✅ | ✅ | OK |
| `{topic}_slides.pdf/.pptx` | ✅（先 PDF） | ✅ | OK，但播放 PPTX 時不要 auto-play 動畫 |
| `{topic}_notes.pdf`（手寫風） | ⚠️ **僅複習用** | ✅ | **家長護欄（2026-08-26 16:41 UTC）：只能做複習教材；不得產生可冒充孩子作業、考卷或繳交內容的答案稿**。檔頭必須有「複習教材・不得作為作業答案」浮水印/banner |
| `{topic}_audio.mp3` | ⚠️ 由家長陪同 | ✅ | **家長護欄（2026-08-26 16:41 UTC）：禁止 auto-play，必須由使用者主動播放**；不 embed 播放按鈕、不主動播送 |
| `content_script.md`（投影片文字稿） | ❌ 不給孩子 | ✅ | 屬於中間流程產物，跳過 |

> 任何檔案的 `MEDIA:` 直送回聊天 channel 時，仍須遵守 SOUL.md「不主動預覽、不 auto-play」規則。

### 3.4 學習哲學約束（與 SOUL.md 一致）

- **教孩子怎麼想，不只給答案**：KD 生成的 Quiz、解釋都要走 MentorNest 一題一問流程
- **不要解完整份作業**：notes.pdf 不得是「假裝手寫的解答」
- **錯誤要可診斷**：quiz.html 要附 explanation，但 explanation 必須由 LLM 自己寫、不直接貼 WebSearch 結果
- **視覺優先**：分數、幾何、面積、座標等概念，若 KD 沒有產 visual，需提醒 KD 加 mindmap 或示意圖

### 3.5 隱私與隔離（含 artifacts 路徑硬規則）

- 教材內含個資（學校名、姓名、家長聯絡方式）時，先 mask 再進 KD
- 不要把 KD 生成的 artifacts 同步到雲端，除非家長明確要求
- 不要把 artifacts 路徑寫進 SOUL.md / IDENTITY.md / USER.md
- **家長護欄（2026-08-26 16:41 UTC）：所有 KD 產物必須寫入 `data/students/<student_id>/artifacts/<topic>/`，不得寫到共用 workspace 根目錄**
  - `<student_id>` 與 `<topic>` 由 agent 在每次執行時動態解析
  - 寫入前必須先 `student_profile_get` 拿到 active student_id
  - 任何寫到 workspace root、共享目錄、SOUL/IDENTITY/USER/MEMORY 的 KD 產物都屬於本護欄違規

---

## 4. 拒絕清單（hard no）

agent 對 KD 的請求**永遠拒絕**以下情境：

1. 替孩子寫回家作業、並產出可繳交版本
2. 把成人內容或不當教材當輸入源（例如家長不小心貼到的個資影像）
3. 自動把生成的 artifacts 寄給第三方、上傳雲端、寫進共享 drive
4. 把生成的 `quiz.html` 內嵌到外部網域（KD 預設是本地檔，符合；agent 不要把它改成可被外部讀取的 URL）
5. 把 `audio.mp3` / `slides.pdf` 設為 auto-play / auto-download 並直接 embed 到 channel
6. 跨學生拼接題庫（stu_001 的答題紀錄不得餵給 stu_002）
7. 在 KD 沒有「教材」時，跳過詢問直接 WebSearch 後產教材（亦不得在已給教材時主動補充搜尋）
8. **把 KD 產物寫到 `data/students/<student_id>/artifacts/<topic>/` 以外的位置，包含 workspace root、共享目錄、SOUL/IDENTITY/USER/MEMORY.md**

---

## 5. 安裝後必做的三件事

完成 `openclaw skills install eric-knowledge-digest` 後（不限 `--global`）：

1. **再次 vetting**：以本地 SKILL.md 為對象，重跑本護欄 §2 的硬性條件
2. **記錄安裝事實**：寫進 **`.learnings/skill-audits/eric-knowledge-digest.md`**（**不寫進** `data/learning-records/`，那是學生學習事件流）
   - 欄位：`installed_at`, `installed_by`, `version`, `scope`, `install_command`, `pre_install_verify_url`, `post_install_verify_result`, `local_vetting_outcome`, `guardrails_attached`, `parent_approval_at`, `uninstall_procedure`
3. **artifacts 路徑**：執行階段由 `student_profile_get` 動態解析；輸出根目錄 = `data/students/<active_student_id>/artifacts/<topic>/`（家長護欄 6.1 已明文要求）

---

## 6. 家長正式護欄核准（2026-08-26 16:41 UTC）

### 6.1 原始核准文（供稽核，不可竄改）

> WebSearch：允許，但只能在「沒有提供教材」或「家長明確要求補充資料」時使用；不可默認主動搜尋。
> Audio：允許，但禁止 auto-play，必須由使用者主動播放。
> 手寫風格筆記：允許，但只能做複習教材，不得產生可冒充孩子作業、考卷或繳交內容的答案稿。
> 所有 KD 產物必須寫入 data/students/<student_id>/artifacts/<topic>/，不得寫到共用 workspace 根目錄。
> 執行 KD 前必須先確認 active student_id。

### 6.2 護欄落地對應

| 議題 | 家長核准（原文要點） | 護欄條文位置 |
|---|---|---|
| WebSearch | 僅在「無教材」或「家長明確要求補充資料」時允許；不可默認主動搜尋 | §3.2、§4 #7 |
| Audio | 禁止 auto-play；必須由使用者主動播放 | §3.3、§4 #5 |
| 手寫風筆記 | 只能複習用；不得產生可冒充作業/考卷/繳交內容 | §3.3、§3.4、§4 #1 |
| Artifacts 路徑 | 必寫入 `data/students/<student_id>/artifacts/<topic>/`；不得寫共用 workspace 根目錄 | §3.5、§4 #8、§5 #3 |
| Active student | 執行前必須先確認 active student_id | §3.1、§2 A |

### 6.3 衍生執行規則

- WebSearch 觸發前必須先口頭/文字詢問「要不要用搜尋找教材？」並等待回覆
- WebSearch 結果出來後，必須先把來源清單交給使用者複查，再產出 artifacts
- Audio 檔一律附「需手動播放」標記；agent 不主動播送、不 embed 播放按鈕到 channel reply
- 手寫風 notes.pdf 在檔頭必須有浮水印或 banner：「複習教材・不得作為作業答案」
- 當 KD 被要求產 notes.pdf 時，agent 主動問：「這份是給孩子複習用？還是要作為作業？」；如為後者，**改走 study-buddy deck 或 adaptive-learning quiz** 而非手寫風 notes
- 每次 KD 觸發前，agent 必須先用 `student_profile_get` 確認 active student_id，並以該 id 解析 artifacts 路徑

### 6.4 護欄生效後 KD 的可使用範圍（單頁速查）

| 動作 | 狀態 |
|---|---|
| 把已上傳 PDF 轉 quiz.html | ✅ OK |
| 把已上傳 PDF 轉 slides / mindmap | ✅ OK |
| WebSearch 找教材 | ⚠️ 預設 OFF，需明確要求 |
| 產手寫風 notes.pdf | ⚠️ 僅複習用，浮水印強制 |
| 產 audio.mp3 | ⚠️ 禁 auto-play |
| 替孩子寫作業答案 | ❌ hard no |
| 跨學生拼題庫 | ❌ hard no |
| 寫到 workspace root / 共享目錄 | ❌ hard no |

---

## 7. 變更歷史

- v0.1 — 2026-08-26 — 初版，於 vetting 完成後撰寫；尚未安裝
- v0.2 — 2026-08-26 — 配合安裝計畫 v0.2：artifacts 路徑明確為動態解析、audit 改存 `.learnings/skill-audits/`、明示 `--global` 安裝
- v0.3 — 2026-08-26 16:39 UTC — 安裝落地（workspace 範圍，非 --global）；status 改為「已生效」
- v0.4 — 2026-08-26 16:41 UTC — **家長口頭決策入護欄**：WebSearch / Audio / 手寫風 notes 三項
- v0.5 — 2026-08-26 16:41 UTC — **家長正式護欄核准**：完整五項核准文（WebSearch / Audio / 手寫風 / artifacts 路徑 / active student）入 §6；§3.2、§3.3、§3.5 文案與之對齊；新增 §6.2 / §6.3 / §6.4 速查表；artifacts 路徑違規新增為 hard no #8
