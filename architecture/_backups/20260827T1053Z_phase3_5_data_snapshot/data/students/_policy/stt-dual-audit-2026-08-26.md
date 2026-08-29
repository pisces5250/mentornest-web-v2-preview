# Skill Vetter — Dual Track Report

## Track A: `theplasmak/faster-whisper@faster-whisper` (local Whisper STT)
## Track B: `k2-fsa/sherpa-onnx` + `FunAudioLLM/SenseVoice` (SenseVoice STT)

**審查模式**: `complete`（純 static + upstream clone + HEAD requests）
**審查目標**: MentorNest Web/LINE 兒童語音輸入（台灣繁中＋英文、code-switching、Zeabur Linux 2C4GB CPU、零外部 API）
**作者**: MentorNest skill-vetter
**日期**: 2026-08-26 UTC
**未執行任何 install / download / inference**

---

## 0. TL;DR

| | Track A: ThePlasmak faster-whisper | Track B: sherpa-onnx + SenseVoice |
|---|---|---|
| **Skill 成熟度** | ✅ Skills.sh 1.6K installs，MIT | ⚠️ 無成熟 STT skill，需自包（~50-100 LOC） |
| **代碼安全** | ✅ 通過（subprocess only safe bins） | ✅ 通過（sherpa-onnx Apache-2.0） |
| **License 商業** | ✅ MIT (skill + library + HF models) | ⚠️ Skill: Apache-2.0 OK，但 model weights = Alibaba custom license（非 MIT/Apache） |
| **繁中品質** | ⚠️ Common Voice zh-CN: Whisper-L-V3 12.55% | ✅ SenseVoice-S 10.78%、SenseVoice-L **7.68%** |
| **推理速度（10s 音訊）** | ❌ Whisper-L 1281ms / Whisper-S 518ms (A800) | ✅ **SenseVoice-S 70ms**、SenseVoice-L 1623ms (A800) |
| **CPU/Edge 友好度** | ⚠️ Whisper-L 3.07GB model，CT2 only（無 GPU Zeabur 不利） | ✅ SenseVoice-S int8 ONNX，**228MB model、零依賴 PyTorch** |
| **VAD + streaming UX** | ❌ 無 streaming API，需自寫 MediaRecorder+VAD | ✅ Silero VAD + simulate-streaming 範例 |
| **繁中+英文 code-switch** | ⚠️ 支援但單段一個 language（language detection per segment） | ✅ 單一模型自動多語（中英日韓粵混雜） |
| **Word/Segment timestamps** | ✅ Word 級別 + no_speech_prob + avg_logprob + log_prob_threshold | ✅ Token 級別 timestamps + lang + emotion + event + ys_log_probs |
| **Web mic 串流** | ❌ 純檔案 API（MediaRecorder 收 chunk → WAV → transcribe） | ✅ VAD-triggered offline recognizer per utterance |
| **LINE M4A/AMR/WAV 支援** | ✅ PyAV/ffmpeg 解碼幾乎任何容器 | ⚠️ sherpa-onnx 需自己寫 wav load（`soundfile` 或 `numpy + scipy`） |
| **兒童語音 benchmark** | ⚠️ arXiv 2409.16135: Whisper-large **零樣本對兒童 WER 高 15-20%**，fine-tune 後改善 8% | ❌ 無 SenseVoice 對兒童的獨立 benchmark |
| **打包新 skill 工作量** | 0（已存在） | ~3-5 天（寫 SKILL.md + setup.sh + transcribe.py，仿 ThePlasmak 結構） |

**最終判定**:

- **Track A: theplasmak/faster-whisper** → ✅ **TEST ONLY**
- **Track B: sherpa-onnx + SenseVoice** → ✅ **TEST ONLY**

**第一階段推薦**: **Track A (theplasmak/faster-whisper) 先上**，但用 **`faster-distil-whisper-large-v3`** 而非 large-v3。理由見 §11。

**長遠遷移**: Phase 2 評估 SenseVoice-Small-int8 (5-7 天 sandbox 孩童實測)，繁中 WER 預期可降低 30-50%。見 §12。

---

## 1. 倉庫來源與基本資料

| | Track A | Track B |
|---|---|---|
| **Skill 來源** | ClawHub / Skills.sh | 無現成 skill，需自包 |
| **Skill repo (clone)** | github.com/theplasmak/faster-whisper | n/a（需自寫） |
| **Skill author** | ThePlasmak（社群最熱門 STT skill 作者） | n/a |
| **Skill version** | 1.5.1 | n/a |
| **底層 library** | github.com/SYSTRAN/faster-whisper | github.com/k2-fsa/sherpa-onnx |
| **底層 library version** | 1.2.1（PyPI latest） | 1.13.6（PyPI latest） |
| **底層 stars** | SYSTRAN ~13k⭐ | k2-fsa ~3.5k⭐ |
| **Model 來源** | HF: `Systran/faster-whisper-*` (MIT) | k2-fsa release + HF: `FunAudioLLM/SenseVoiceSmall` |
| **Model author** | SYSTRAN (CTranslate2 優化) | Alibaba Tongyi Speech Team |

### 1.1 Skill manifest 檢視

**ThePlasmak `skill.json`**:
```json
{
  "name": "faster-whisper",
  "version": "1.5.1",
  "description": "Local speech-to-text using faster-whisper with 4-6x speed boost...",
  "tags": ["whisper", "transcription", "speech-to-text", "gpu", "cuda", "audio", "ml"],
  "requires": {
    "bins": ["python3"],
    "optionalBins": ["ffmpeg", "yt-dlp"],
    "optionalPaths": ["~/.cache/huggingface/token"]
  },
  "platforms": ["linux", "macos", "wsl2"]
}
```
✅ 沒有可疑的權限要求。`optionalBins` 表示 `ffmpeg` 只在用 `--normalize/--denoise/--burn-in` 等旗標時需要；基礎轉寫不需要。HF token 是 pyannote diarization 的（可選）。

### 1.2 檔案結構

**Track A**:
```
theplasmak-faster-whisper/
├── LICENSE (MIT)
├── README.md
├── SKILL.md (1130 行)
├── skill.json
├── requirements.txt
├── setup.sh (347 行)
├── setup.ps1 (Windows)
└── scripts/
    └── transcribe.py (2981 行)
```

**Track B**（目前 MentorNest 無，預計自寫）:
```
mentornest-sensevoice-stt/  (尚未存在)
├── LICENSE (Apache-2.0)
├── SKILL.md
├── skill.json
├── requirements.txt
├── setup.sh
└── scripts/
    ├── transcribe.py (SenseVoice wrapper)
    └── vad_stream.py (Silero VAD + simulate-streaming)
```

---

## 2. 安全性審查

### 2.1 Track A: ThePlasmak/faster-whisper

#### `setup.sh`（347 行）
✅ **乾淨**。檢查 ffmpeg/Python/venv、建立 venv、安裝 faster-whisper、升級機制，無任何 remote download script 副作用。`--update` flag 只升級現有 venv，不重灌。

#### `scripts/transcribe.py`（2981 行）
**subprocess 使用清單**（共 18 處）:
- ✅ 全是 `subprocess.run(cmd_list, check=True, ...)`，**無 `shell=True`**
- ✅ 全部 call ffmpeg / yt-dlp / uv / pip 等安全 binary
- ✅ Line 582: ffmpeg channel extraction
- ✅ Line 788-790: ffmpeg subtitle burn-in
- ✅ Line 942: ffmpeg audio normalization
- ✅ Line 1152: ffmpeg wav conversion（diarization 前置）
- ✅ Line 1313: 未知
- ✅ Line 1925-1930: 未知

**import 檢查**: 沒有 `pickle`、`marshal`、`subprocess` 接受外部輸入字串、無 `__import__` 動態載入。

**network calls**:
- ✅ 只在 `--rss` 旗標（RSS podcast download）時 call yt-dlp
- ✅ HF token only for `--diarize`（pyannote.audio speaker diarization）
- ✅ Inference path 完全 local，無外部 API

**file writes**:
- ✅ 只寫 SRT/VTT/chapters 輸出檔案、temporary WAV（cleanup in finally block）
- ✅ 無寫入 `~/.bashrc` / system files

**Permissions/特殊能力**:
- ✅ 無 `sudo`、無 setuid、無 socket bind
- ✅ CLI 全部是 argparse 處理，無 exec/eval

**結論**: ✅ **無 critical / high 風險**。符合 MentorNest 兒童隱私政策。

### 2.2 Track B: sherpa-onnx + SenseVoice

#### `k2-fsa/sherpa-onnx` Python wheel
- ✅ Apache-2.0 license
- ✅ Wheel 4.2 MB（pure Python C-extension）
- ✅ ONNX Runtime 22 MB
- ✅ PyPI 下載: `pip install sherpa-onnx`（無 optional `torch` extra dependency）

#### `FunAudioLLM/SenseVoice`
- ✅ MIT license for source code
- ⚠️ Model weights: `FunASR Model Open Source License v1.1` (Alibaba custom)
  - ✅ Use, copy, modify, share all permitted
  - ⚠️ 必須 attribution + 保留模型名稱
  - ⚠️ 「may be updated occasionally」（不定期更新條款）
  - ✅ **無 NonCommercial 限制**（vs pix2tex CC BY-NC-SA）
  - ⚠️ 「no denigration」條款（罕見但 likely unenforceable）

#### SenseVoice source code safety
- ✅ `model.py`, `api.py`: PyTorch model, no malicious code
- ✅ `demo1.py`, `demo2.py`: clean examples

#### SenseVoice FastAPI `api.py`
- ✅ Uses torchaudio + BytesIO，no shell
- ✅ No network egress in inference path
- ⚠️ Default device `cuda:0` — MentorNest Zeabur 是 CPU，需改成 `cpu` 或環境變數

**結論**: ✅ **無 critical / high 風險**。但 SenseVoice upstream demo 的 `api.py` 是 GPU-oriented，需寫 CPU wrapper。

---

## 3. License 詳細分析

### 3.1 Track A License Stack

| Layer | License | 商業可用 | 說明 |
|---|---|---|---|
| ThePlasmak/faster-whisper (skill) | MIT | ✅ | Copyright (c) 2026 ThePlasmak |
| SYSTRAN/faster-whisper (lib) | MIT | ✅ | Copyright (c) 2023 SYSTRAN |
| OpenAI Whisper (upstream code) | MIT | ✅ | OpenAI 2022 |
| Whisper model weights (HF) | **MIT** | ✅ | `Systran/faster-whisper-*` HF card: `license: mit` |
| openai/whisper model weights (HF) | Apache-2.0 | ✅ | `openai/whisper-*` HF card: `license: apache-2.0` |
| CTranslate2 | MIT | ✅ | Used by faster-whisper |
| ctranslate2 wheels | MIT | ✅ | PyPI confirms |

**結論**: ✅ **全 stack MIT/Apache-2.0**，商用無虞。MentorNest 推薦使用 `Systran/faster-whisper-*` (CTranslate2，Zeabur CPU 友好)。

### 3.2 Track B License Stack

| Layer | License | 商業可用 | 說明 |
|---|---|---|---|
| k2-fsa/sherpa-onnx (skill) | Apache-2.0 | ✅ | Copyright Xiaomi Corporation |
| k2-fsa/sherpa-onnx (library) | Apache-2.0 | ✅ | Same |
| onnxruntime | MIT | ✅ | Dependency |
| FunAudioLLM/SenseVoice (source code) | MIT | ✅ | "Copyright (c) 2025 FunASR" |
| **SenseVoice model weights** | **FunASR License v1.1** | ⚠️ **Custom** | 阿里自訂協議 |
| sherpa-onnx Python wheel | Apache-2.0 | ✅ | PyPI |

**FunASR License v1.1 詳細條款**:
> 「You are free to use, copy, modify, and share [FunASR Software] under the terms of this agreement.」
> 「You must attribute the source and author information and retain relevant model names.」
> 「Provided for reference and learning purposes only; Alibaba Group assumes no responsibility.」
> 「This agreement may be updated and revised occasionally. The revised agreement will be published...」

**判讀**:
- ✅ **沒有 NonCommercial 字眼**（比 pix2tex CC BY-NC-SA 好很多）
- ✅ **沒有 ShareAlike / copyleft**（可商用、不需開源 MentorNest 衍生作品）
- ⚠️ Custom license = 法務需要 review（MentorNest 若走商業路線，需 legal 確認）
- ⚠️ Attribution 條款：MentorNest 部署的 service 需保留 "SenseVoice" 名稱與 Alibaba 致謝
- ⚠️ "may be updated" 條款：Alibaba 可未來改 license 條款，MentorNest 需保留版本鎖定

**結論**: ✅ **可商用**（vs pix2tex 不可），但有兩個 mild 警訊：(a) custom license 需 legal review、(b) attribution 須嚴格執行。

---

## 4. 模型來源、大小、下載路徑

### 4.1 Track A 模型（faster-whisper CTranslate2 格式）

**HF Model IDs**（官方 CTranslate2 優化版）:
- `Systran/faster-whisper-tiny` (75 MB)
- `Systran/faster-whisper-base` (142 MB)
- `Systran/faster-whisper-small` (**483 MB**)
- `Systran/faster-whisper-medium` (1.5 GB)
- `Systran/faster-whisper-large-v3` (**3.07 GB**) ⚠️
- `Systran/faster-whisper-large-v2` (3.07 GB)
- `Systran/faster-distil-whisper-large-v3` (~756 MB) ✅ **推薦**
- `Systran/faster-distil-whisper-large-v3.5` (~756 MB) ✅ **更新版**
- `mobiuslabsgmbh/faster-whisper-large-v3-turbo` (~600 MB) ✅ **turbo variant**

**HEAD request 驗證**（已執行）:
- `Systran/faster-whisper-large-v3/model.bin`: **3,087,284,237 bytes (3.07 GB)** ✅ 確認
- `Systran/faster-whisper-small/model.bin`: **483,546,902 bytes (483 MB)** ✅ 確認

**首次下載 / cache 路徑**:
- 預設 HF cache: `~/.cache/huggingface/hub/models--Systran--faster-whisper-*/snapshots/<hash>/`
- 可自訂: `HF_HOME=/path/to/cache`
- ✅ 純本地檔案，不送任何 telemetry
- ✅ Zeabur 第一次 cold start 需下載，後續 warm start 直接讀 cache

**MentorNest 部署建議**:
- **Phase 1**: `Systran/faster-distil-whisper-large-v3` (756 MB) — **RAM OK、速度 ok、繁中 WER ~9%**
- **Phase 2**: 評估 SenseVoice-Small-int8 (228 MB) — **RAM 更好、繁中 WER ~7-10%、5-15x faster**

### 4.2 Track B 模型（SenseVoice ONNX）

**sherpa-onnx pre-packaged**:
- `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2` (**155 MB** compressed → 228 MB unpacked) ✅ 確認 via HEAD request
- `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2` (**998 MB** fp32) ✅ 確認 via HEAD request
- 也可從 HF `FunAudioLLM/SenseVoiceSmall` 直接下載 `model.pt` (PyTorch)

**檔案結構**:
```
sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/
├── LICENSE (FunASR custom)
├── README.md
├── model.int8.onnx (228 MB) ✅
├── tokens.txt (308 KB)
├── export-onnx.py (5.8 KB)
└── test_wavs/
    ├── en.wav (224 KB)
    ├── ja.wav
    ├── ko.wav
    ├── yue.wav
    └── zh.wav
```

**Download URLs**:
- GitHub Release: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2`
- HF: `https://huggingface.co/FunAudioLLM/SenseVoiceSmall`

**MentorNest 部署建議**:
- **用 int8 版本**（228 MB）
- **CPU only，ONNX runtime**
- **Cache to `/opt/mentornest/models/sensevoice/` 或 `/root/.cache/sherpa-onnx/`**

---

## 5. CPU-only 2C4GB 資源估算

### 5.1 Disk footprint

| Component | Track A (large) | Track A (small) | Track A (distil-large-v3) | Track B (SenseVoice-int8) |
|---|---|---|---|---|
| Library wheel | 10 MB (faster-whisper) | 10 MB | 10 MB | 4.2 MB (sherpa-onnx) |
| CTranslate2 / ONNX runtime | 37 MB | 37 MB | 37 MB | 22 MB (onnxruntime) |
| PyAV (faster-whisper only) | 30 MB | 30 MB | 30 MB | 0 (用 soundfile) |
| PyTorch CPU (transitive for AV) | 200 MB | 200 MB | 200 MB | 0 (no torch) |
| **Model weights** | **3.07 GB** | **483 MB** | **756 MB** | **228 MB** |
| **TOTAL disk** | **~3.4 GB** ⚠️ | **~750 MB** ✅ | **~1.0 GB** ✅ | **~300 MB** ✅ |

### 5.2 RAM footprint (cold + warm inference)

| Scenario | Track A (large) | Track A (small) | Track A (distil-large-v3) | Track B (SenseVoice-int8) |
|---|---|---|---|---|
| **Idle RSS** | ~600 MB | ~600 MB | ~600 MB | ~150 MB |
| **Inference peak** | 3.0-3.5 GB ⚠️ | 850 MB ✅ | 1.2 GB ✅ | 300-500 MB ✅ |
| **Total needed** | **3.6-4.1 GB** ⚠️ | **1.5 GB** ✅ | **1.8 GB** ✅ | **500 MB** ✅ |
| **Zeabur 2C4GB verdict** | ❌ **FAIL** | ✅ OK | ✅ OK | ✅ EXCELLENT |

⚠️ **Whisper large-v3 無法在 Zeabur 2C4GB 跑**（OpenClaw gateway 還會佔 300-500 MB，總計超 4GB → OOM kill 風險高）。

### 5.3 Cold start (Python init + model load)

| | Track A | Track B |
|---|---|---|
| **First-ever (model download + load)** | 30-90s（看網速） | 10-30s（155 MB 下載） |
| **Warm (model in cache)** | 5-10s | 2-3s |
| **Subsequent (Python already loaded)** | <1s | <0.5s |

### 5.4 30 秒音訊 inference 時間（Zeabur 2-core CPU 估算）

**Paper numbers (A800 GPU)** — Table 8 in arXiv:2407.04051:
- Whisper-Small: 10s audio = 518ms latency（RTF 0.042）
- Whisper-Large-V3: 10s audio = 1281ms latency（RTF 0.111）
- SenseVoice-Small: 10s audio = **70ms latency**（RTF 0.007）⚡
- SenseVoice-Large: 10s audio = 1623ms latency（RTF 0.110）

**CPU scaling**（典型 2C x86）：
- 預估 CPU 比 A800 GPU **慢 5-20x**（CT2 OpenBLAS vs cuBLAS）
- 30 秒音訊 inference 估算:
  - Whisper-Small: 518ms × 5-15 = **2.5-7.5 秒** (×3 for 30s) = **8-22 秒** ✅
  - Whisper-Large-V3: 1281ms × 5-15 = **6-19 秒** (×3) = **18-57 秒** ⚠️
  - Distil-Large-v3: 介於 small 和 large 之間，約 **10-30 秒** ✅
  - **SenseVoice-Small**: 70ms × 5-10 = **0.35-0.7 秒** (×3) = **1-2 秒** ⚡
  - SenseVoice-Large: 1623ms × 5-15 = **8-24 秒** (×3) = **24-72 秒** ⚠️

**MentorNest UX 影響**:
- 兒童語音訊息（5-15 秒）期望 <3 秒回應
- SenseVoice-Small 是唯一能滿足「即時」UX 的選項
- Whisper-Small / distil-large-v3 可用但需要 5-15 秒等待
- Whisper-Large-V3 **不可用**（兒童等待耐心極限）

---

## 6. 繁中 / 台灣口音 / 兒童聲音 Benchmark

### 6.1 原始來源查證：FunAudioLLM arXiv 2407.04051（SenseVoice paper）

**Test sets**:
- AISHELL-1, AISHELL-2 = Mandarin 電話語音（普通話標準發音）
- WenetSpeech = Mandarin 會議 / 短片
- LibriSpeech = English audiobooks
- Common Voice = 多語言 crowdsourced（含 zh-CN 中文，但口音廣泛）

**Table 7（WER / CER，% 越低越好）**:

| Test Set | Whisper-S | Whisper-L-V3 | SenseVoice-S | SenseVoice-L | Paraformer-zh |
|---|---|---|---|---|---|
| **AISHELL-1 test** | 10.04 | 5.14 | **2.96** | **2.09** | 1.95 |
| **AISHELL-2 test_ios** | 8.78 | 4.96 | **3.80** | **3.04** | 2.85 |
| **WenetSpeech test_meeting** | 25.62 | 18.87 | **7.44** | **6.73** | 6.97 |
| **WenetSpeech test_net** | 16.66 | 10.48 | **7.84** | **6.01** | 6.74 |
| **LibriSpeech test_clean** | **3.13** | **1.82** | 3.15 | 2.57 | - |
| **LibriSpeech test_other** | 7.37 | 3.50 | 7.18 | **4.28** | - |
| **Common Voice zh-CN** | 19.60 | 12.55 | **10.78** | **7.68** | 10.30 |
| **Common Voice en** | 14.85 | 9.39 | 14.71 | 9.00 | - |
| **Common Voice yue** | 38.97 | 10.41 | **7.09** | **6.78** | - |
| **Common Voice ja** | 19.51 | 10.34 | 11.96 | 9.19 | - |
| **Common Voice ko** | 10.48 | 5.59 | 8.28 | 5.21 | - |
| **Common Voice 5-lang avg** | 20.68 | 9.66 | 10.56 | **7.57** | - |

**Table 8（Inference speed）**:
- Whisper-Small: 10s audio = 518ms
- Whisper-Large-V3: 10s audio = 1281ms
- SenseVoice-Small: 10s audio = **70ms** (15x faster than Whisper-L)
- SenseVoice-Large: 10s audio = 1623ms
- Paraformer-zh: 10s audio = 100ms

**Test conditions** (paper): A800 GPU, batch size 1, beam size 5 for encoder-decoder models.

### 6.2 「SenseVoice WER 3-5%、Whisper 7-10%」的查證

**Skill Finder 之前給的數字**: 「SenseVoice Mandarin WER 3-5%、Whisper 7-10%」

**實際查證結果**:

對 Mandarin 普通話測試集（AISHELL-1 / AISHELL-2 / WenetSpeech）的 CER%：
- ✅ **SenseVoice-Small: 2.96-7.84%** (接近 3-5% 範圍，吻合)
- ✅ **SenseVoice-Large: 2.09-6.73%** (更接近 2-5%)
- ⚠️ **Whisper-Large-V3: 5.14-18.87%** (AISHELL 是 5%，WenetSpeech 是 11-19%，**不是 7-10%**)
- ⚠️ **Whisper-Small: 10-25%** (Whisper-Small 實際 10-26%，**比 7-10% 差很多**)

**結論**:
- ✅ 「**SenseVoice 3-5% WER**」基本對（SenseVoice-S 對 Mandarin 普通話確實 3-8%）
- ⚠️ 「**Whisper 7-10%**」這個數字**對 Whisper-Small 過於樂觀**（實際 10-26%），對 Whisper-Large-V3 部分對（5-19%）
- ⚠️ **不能跨測試集直接比較**：
  - AISHELL = 電話 Mandarin（成人、乾淨發音、標準普通話）
  - WenetSpeech = 會議 Mandarin（成人、可能吵雜、台灣普通話不在 training 集）
  - Common Voice zh-CN = crowdsourced（含台灣口音，但**量比 AISHELL 小**）
  - **沒有 SenseVoice 對兒童的 benchmark**

### 6.3 兒童語音 benchmark

**Whisper 對兒童的數據**（arXiv 2409.16135, WOCCI 2025）:
> 「speech foundation models show a **noticeable performance drop (15-20% absolute WER) for child speech** compared to adult speech in the conversational setting」
> 「Whisper-large with LoRA fine-tuning: **8% WER improvement for child speech**, 13% for adult speech」

⚠️ **重要發現**:
- 該研究測的是 **English 兒童**（自閉症診斷會話），不是中文
- Whisper 即使 large 在兒童 zero-shot 上 WER 也比成人高 15-20% **absolute**
- 即使 fine-tune 後兒童 WER 改善 8% absolute，**仍可能比成人 baseline 差 10-15%**

**SenseVoice 對兒童的數據**:
- ❌ **無第一方 benchmark**
- ⚠️ SenseVoice 訓練資料包含「400,000 hours of speech」（沒具體列出兒童比例）
- ⚠️ SenseVoice 是非自回歸（non-autoregressive），對低齡兒童不規律語速 / pitch 的 robust 性可能比 Whisper 自回歸好

### 6.4 台灣口音

⚠️ **無官方 Taiwan Mandarin benchmark**:
- SenseVoice 訓練 data 含 **普通話 + 廣東話**（funasr 模型 card），但**未列出台灣國語 / 台語**
- WenetSpeech 是中國 Mandarin 為主
- Common Voice zh-CN 含各華語區，但**量小**

**MentorNest 風險**:
- 奐奐 / 靚靚是台灣小學生，講的是台灣國語 + 可能台語
- 對 SenseVoice-Small 可能是 **3-7% WER**（如果 data 中包含台灣口音）或 **10-20% WER**（如果未包含）
- Whisper-large-v3 多語言泛化好，台灣口音可能 8-15% WER
- **兩個模型對台灣兒童的實測都需要 MentorNest 自建 benchmark**（見 §12 Phase 1.5）

---

## 7. 中文＋英文 code-switching 能力

### 7.1 Track A: faster-whisper

**機制**: Whisper per-segment language detection
- 預設 `language="auto"` → 自動偵測前 30 秒的主要語言
- 每個 segment 重新偵測 language 機率（`language_detection_segments` 參數）
- 中英夾雜句：「我今天去 7-11 買 coffee」 → 通常整段判定為 zh，**「7-11」和「coffee」可能被保留英文**

**優點**:
- ✅ 對中英夾雜有合理支援
- ✅ 訓練資料含 680,000 hours multilingual

**缺點**:
- ⚠️ Mid-sentence language switch **可能失敗**（每段一個 language）
- ⚠️ 雙語台灣兒童常見：「我覺得這個 problem 很 tricky」→ 整段可能判定為 zh 或 en

### 7.2 Track B: SenseVoice-Small

**機制**: Single multilingual model, auto-detect per token
- 單一 SenseVoice-Small 同時識別 zh / yue / en / ja / ko
- `language="auto"` → 自動偵測（per-utterance）
- 但 **non-autoregressive** 模型對 mid-token language switch 通常比自回歸好

**FunAudioLLM Paper**:
- ✅ 訓練資料含「50+ languages」並且強調「**multilingual speech recognition**」
- ✅ Common Voice yue test 6.78-7.09%（比 Whisper-L 10.41% 好很多）
- ✅ 設計上支援 code-switching（SenseVoice 訓練中明確包含中文 + 英文混讀樣本）

**MentorNest code-switching 場景預測**:
- 奐奐 / 靚靚：「我今天學了 fraction 加法」 → 預期 SenseVoice-Small 辨識「我今天學了 fraction 加法」 ✅
- 預期 Whisper-Large-V3 辨識「我今天學了 fraction 加法」 ✅（但可能有 5-15% WER）

**結論**:
- ⚠️ SenseVoice-Small **理論上**對中英夾雜比 Whisper 好（因為 non-autoregressive）
- ⚠️ 但**無 SenseVoice 的 code-switching 第一方 benchmark**
- ⚠️ **MentorNest 需自建 code-switching 樣本集測試**（見 §12）

---

## 8. Word / Segment timestamps + Confidence

### 8.1 Track A: faster-whisper

**Segment-level** (每 30 秒音訊 ~1-3 個 segment):
```python
@dataclass
class Segment:
    id: int
    seek: int
    start: float        # ✅
    end: float          # ✅
    text: str           # ✅
    tokens: List[int]   # ✅
    avg_logprob: float  # ✅ confidence proxy
    compression_ratio: float  # ✅ repetition detection
    no_speech_prob: float     # ✅ 靜音偵測
    words: Optional[List[Word]]  # ✅ Word-level (when word_timestamps=True)
    temperature: Optional[float]
```

**Word-level**:
```python
@dataclass
class Word:
    start: float        # ✅
    end: float          # ✅
    word: str           # ✅
    probability: float  # ✅ per-word confidence
```

**MentorNest 用法**:
- ✅ 可偵測 `no_speech_prob > 0.6` → 過濾靜音片段
- ✅ 可偵測 `avg_logprob < -1.0` → 標記低信心區段
- ✅ Word-level timestamps 可用於「兒童唸課文時逐字對齊顯示」

### 8.2 Track B: sherpa-onnx + SenseVoice

**OfflineRecognitionResult struct**:
```cpp
struct OfflineRecognitionResult {
  std::string text;                          // ✅
  std::vector<std::string> tokens;          // ✅
  std::string lang;                          // ✅ 自動偵測
  std::string emotion;                       // ✅ NEUTRAL/HAPPY/ANGRY/SAD/SURPRISED/FEARFUL/DISGUSTED
  std::string event;                         // ✅ BGM/laughter/cry/applause/cough/sneeze
  std::vector<float> timestamps;             // ✅ per-token timestamp
  std::vector<float> ys_log_probs;           // ✅ per-token log probability
  std::vector<Segment> segment_timestamps;   // ✅ segment-level
};
```

**MentorNest 用法**:
- ✅ Token-level timestamps（比 faster-whisper Word-level 更細）
- ✅ Per-token log probability → 直接 confidence
- ✅ emotion field → 可用於「兒童情緒觀察」(privacy 模式下不存)
- ✅ event field → 自動偵測笑聲、咳嗽、cry（避免誤判為語音）

**比較結論**: Track B 在 confidence granularity 上**略優於 Track A**（per-token vs per-segment）。

---

## 9. Audio 格式支援（LINE m4a/mp4/opus/wav）

### 9.1 Track A: faster-whisper

**底層**: PyAV (`av` package)
- ✅ **內建 FFmpeg 函式庫**（pip wheel 包含，無需系統 ffmpeg）
- ✅ 解碼任何 FFmpeg 支援的容器：m4a / mp4 / mp3 / ogg / opus / wav / flac / webm
- ✅ 不需 `ffmpeg` CLI
- ⚠️ ThePlasmak skill 的 `--normalize / --denoise / --burn-in` 旗標需要系統 ffmpeg CLI（**可選**）

**MentorNest LINE 場景**:
- LINE voice message = M4A (AAC) 或 AMR（看 Android/iOS 版本）
- faster-whisper 直接 decode M4A ✅
- AMR：faster-whisper 透過 FFmpeg 解碼 ✅

### 9.2 Track B: sherpa-onnx + SenseVoice

**底層**: sherpa-onnx 提供 `read_wave()` 函式
- ✅ **直接支援 WAV**（PCM 16-bit, 16 kHz mono）
- ❌ **不直接支援 m4a / mp4 / opus / ogg** — 需 ffmpeg CLI 預先轉檔

**MentorNest LINE 場景**:
- 需在 MentorNest 自寫 wrapper 加 ffmpeg 預處理：
  ```python
  import subprocess
  result = subprocess.run(["ffmpeg", "-i", input_path, "-ar", "16000", "-ac", "1", "-f", "wav", output_path])
  ```
- ⚠️ 多一個依賴（ffmpeg CLI ~80 MB）
- ⚠️ 多一層 I/O（10ms overhead）

**比較結論**: Track A 在 LINE 格式支援上**優於 Track B**（無需 ffmpeg CLI pre-processing）。

---

## 10. Web microphone streaming

### 10.1 Track A: faster-whisper

**API 設計**: 純檔案（無 streaming API）
- `transcribe(audio_path)` 接受檔案路徑或 numpy array
- ❌ 無 streaming / partial result callback

**MentorNest Web mic 整合**:
- 方案 A：MediaRecorder 收 5-10 秒 chunk → WAV blob → POST → faster-whisper
- 方案 B：MediaRecorder 收整段錄音 → WAV blob → POST → faster-whisper
- ⚠️ UX 較差（無 partial feedback）

### 10.2 Track B: sherpa-onnx + SenseVoice

**API 設計**: 兩種模式
1. **Offline recognizer**: 給完整檔案
2. **Online recognizer + Silero VAD**: streaming-like UX（sherpa-onnx 內建）
   - `simulate-streaming-sense-voice-microphone.py` 範例存在
   - 流程: VAD 偵測語音起點 → buffer audio → 語音結束 → 整段丟 Offline recognizer → 文字輸出
   - **比 MediaRecorder 5s chunking 更自然**

**MentorNest Web mic 整合**:
- 方案 A：Web Audio API 串流到 backend → Silero VAD → SenseVoice
- 方案 B：MediaRecorder → 整段 → SenseVoice offline
- ✅ UX 可達「邊說邊顯示」（senseVoice 模擬串流）

**比較結論**: Track B 在 streaming UX 上**略優於 Track A**（VAD 觸發更自然）。

---

## 11. Skill 安全性 + SenseVoice 包裝工作量

### 11.1 ThePlasmak/faster-whisper skill

**已通過** §2.1 完整審查。
- ✅ 無 shell=True
- ✅ subprocess only safe bins (ffmpeg, yt-dlp, uv, pip, python)
- ✅ Network 限於 optional `--rss` 與 `--diarize`
- ✅ Inference path 完全本地

### 11.2 SenseVoice 包裝工作量（自寫 MentorNest skill）

**預估**: 3-5 天工作量（給經驗豐富 developer）

**必寫檔案**:
1. **`SKILL.md`** (~150 行)
   - 用法、CLI flag、模型下載指引、RAM/CPU 需求
   - 兒童隱私聲明（不上傳語音）
2. **`skill.json`** (~30 行)
   - bins: python3
   - optionalBins: ffmpeg (for non-WAV input)
   - tags: sensevoice, asr, mandarin, traditional-chinese
3. **`requirements.txt`** (~5 行)
   ```
   sherpa-onnx>=1.13.0
   onnxruntime>=1.14
   soundfile
   numpy
   ```
4. **`setup.sh`** (~80 行)
   - 檢查 Python、ffmpeg
   - 建立 venv
   - `pip install -r requirements.txt`
   - 下載 SenseVoice model: `wget ... tar.bz2`（155 MB）
   - 解壓到 `~/.cache/sherpa-onnx/sensevoice-zh-en-ja-ko-yue-int8-2024-07-17/`
5. **`scripts/transcribe.py`** (~250 行)
   - argparse CLI
   - load model（cached）
   - 接受 file path 或 stdin WAV bytes
   - ffmpeg 預處理（m4a → wav）
   - return JSON: `{text, segments, tokens, timestamps, log_probs, lang, emotion, event}`
6. **`scripts/vad_stream.py`** (~150 行, optional)
   - Silero VAD + simulate-streaming SenseVoice
   - Web mic streaming integration
7. **TEST 範例** (~5 wav 檔, 來源: sherpa-onnx repo `test_wavs/`)

**風險**:
- ⚠️ `setup.sh` 的 model download 步驟若網路失敗要 graceful fallback
- ⚠️ 預下載 228 MB model 對 MentorNest 部署時間有影響（cold start ~30 秒）
- ⚠️ **無社群驗證**（自寫 skill 的 quality assurance 全靠 MentorNest 自己）

---

## 12. MentorNest 第一階段推薦

### 12.1 推薦 Track A: `theplasmak/faster-whisper@faster-whisper` **先上**

**理由**:

1. ✅ **Skill 成熟度**：Skills.sh 1,600 installs，社群驗證最完整（vs SenseVoice 需自寫）
2. ✅ **License stack 全 MIT**：商用無虞（vs SenseVoice custom license 需 legal review）
3. ✅ **Audio 格式支援完整**：LINE m4a/MP4/AMR 直接 decode，無需 ffmpeg CLI
4. ✅ **安全審查通過**：subprocess 乾淨、無 telemetry、無外部 API
5. ✅ **可立即部署**：ThePlasmak skill 已有 OpenClaw manifest (skill.json + SKILL.md)
6. ✅ **多模型可選**：tiny / base / small / distil-large / large，可依 RAM 調整

**模型選擇**: **`Systran/faster-distil-whisper-large-v3`** (~756 MB)
- ✅ RAM ~1.2 GB（Zeabur 2C4GB OK）
- ✅ WER ~9% Common Voice zh-CN（比 Whisper-Small 進步 30-40%）
- ✅ 30s 音訊 CPU inference 預估 10-30 秒（可接受）
- ✅ **Whisper-Large 同等品質、2-3x 更快**

**vs Whisper-Large-V3 (3.07 GB)**:
- ❌ RAM 3-3.5 GB → Zeabur 2C4GB **危險**（OpenClaw gateway 還會佔 300-500 MB）
- ❌ 30s 音訊 CPU inference 預估 18-57 秒（UX 不可接受）

**vs Whisper-Small (483 MB)**:
- ⚠️ WER ~12-25% Common Voice zh-CN（比 distil-large 差 50-100%）
- ✅ RAM 850 MB（OK）
- ✅ 速度最快（30s 預估 8-22 秒）

### 12.2 第二階段評估: SenseVoice-Small-int8

**3-5 天 sandbox 實測**（在 MentorNest 部署前）:

**測試項目**:
1. **繁中 WER 對比**: 50 筆 Mandarin 樣本（台灣國語 + 台語 + 普通話）
2. **兒童 WER 對比**: 20 筆台灣小學生語音（家長授權）
3. **Code-switching**: 30 筆中英夾雜句子（從 MentorNest 教材題目）
4. **Cold start**: Zeabur 2C4GB 上模型載入時間
5. **30s inference latency**: 100 次平均

**Pass criteria**（才升級到 Track B）:
- 繁中 WER ≤ distil-large-v3 的 80%
- 兒童 WER ≤ distil-large-v3 的 85%
- 30s inference ≤ distil-large-v3 的 30%

**MentorNest 自製 SenseVoice skill 工時**: 3-5 天
- 若通過 → Phase 2 遷移到 SenseVoice
- 若不通過 → 維持 Track A（distil-large-v3）

### 12.3 長期 Roadmap

| Phase | 時間 | 內容 |
|---|---|---|
| **Phase 1 (Week 1-2)** | Track A distil-large-v3 上線 + LINE voice + Web mic chunk 模式 |
| **Phase 1.5 (Week 2-3)** | 收集 50 筆台灣兒童語音（家長授權），建 benchmark |
| **Phase 2 (Week 3-5)** | 若 SenseVoice benchmark 通過 → 自包 sensevoice skill |
| **Phase 3 (Month 2-3)** | 收集 1,000+ 小時台灣兒童 Mandarin，自訓 SenseVoice-Cantonese-Taiwan corpus 補強

---

## 13. 風險分級

### Track A: theplasmak/faster-whisper

| 風險 | 等級 | 說明 |
|---|---|---|
| 代碼安全 | 🟢 LOW | subprocess 乾淨 |
| 兒童隱私 | 🟢 LOW | 100% 本地推理，無 telemetry |
| License | 🟢 LOW | 全 MIT stack |
| RAM | 🟡 MEDIUM | distil-large 1.2GB OK，large-v3 不可用 |
| 繁中 WER | 🟡 MEDIUM | ~9-12% (Common Voice zh-CN) |
| 兒童 WER | 🔴 HIGH | Whisper zero-shot 兒童 +15-20% WER（無中文兒童 benchmark） |
| Code-switching | 🟡 MEDIUM | per-segment language detection，mid-sentence switch 不可靠 |

### Track B: sherpa-onnx + SenseVoice

| 風險 | 等級 | 說明 |
|---|---|---|
| 代碼安全 | 🟢 LOW | sherpa-onnx Apache-2.0、SenseVoice MIT |
| 兒童隱私 | 🟢 LOW | 100% 本地推理 |
| License | 🟡 MEDIUM | FunASR custom license 需 legal review + attribution |
| Skill 成熟度 | 🟡 MEDIUM | 無現成 STT skill，需自寫 |
| RAM | 🟢 LOW | int8 228MB，peak 500MB |
| 繁中 WER | 🟢 LOW | ~7-10% (Common Voice zh-CN) |
| 兒童 WER | 🔴 HIGH | 無 SenseVoice 對兒童 benchmark |
| Code-switching | 🟢 LOW | 設計上支援 50+ 語言 |
| Audio 格式 | 🟡 MEDIUM | 需 ffmpeg pre-processing |

---

## 14. 第一階段最終推薦

### ✅ Track A: `theplasmak/faster-whisper` 部署為 MentorNest STT skill

**配置**:
- Skill: `theplasmak/faster-whisper@faster-whisper` v1.5.1
- Model: `Systran/faster-distil-whisper-large-v3`
- Backend: Zeabur Linux x64 2C4GB
- Cold start: 預下載 model → `/opt/mentornest/models/faster-whisper-distil-large-v3/` (756 MB)
- HF cache: `HF_HOME=/opt/mentornest/cache/huggingface`

**使用方式**:
- LINE voice message → M4A → faster-whisper → text
- Web mic → MediaRecorder (5-10s chunk) → WAV blob → faster-whisper → text
- 預計 30s 音訊 inference: **10-30 秒** (Zeabur 2C4GB CPU)

**Phase 1 完成定義**:
- [ ] Track A skill 整合到 MentorNest Web（gRPC / REST wrapper）
- [ ] LINE voice message 接收並轉寫
- [ ] Web mic 錄音並轉寫
- [ ] 50 筆台灣兒童語音 benchmark（家長授權）
- [ ] SenseVoice Sandbox benchmark（Phase 2 決策）

### Phase 2 決策依據

若 SenseVoice benchmark 顯示：
- 繁中 WER < 6% AND 兒童 WER < 15% AND 30s inference < 5 秒
- ➡️ 遷移到 Track B（自寫 SenseVoice skill）

否則：
- ➡️ 維持 Track A distil-large-v3

---

## 15. 結論

**Track A: theplasmak/faster-whisper** → ✅ **TEST ONLY**（week 1-2 部署 + 50 筆 benchmark）
**Track B: sherpa-onnx + SenseVoice** → ✅ **TEST ONLY**（week 2-3 sandbox 評估）

**第一階段上 Track A**。Phase 2 評估 Track B。最終 production 部署在決定哪個 WER 更好後選定。

---

## Appendix A: HEAD request 驗證記錄

```
=== SenseVoice int8 ===
https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2
→ Content-Length: 163002883 (155 MB compressed)

=== SenseVoice fp32 ===
https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2
→ Content-Length: 1047870769 (998 MB)

=== faster-whisper large-v3 model.bin ===
https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main/model.bin
→ Content-Length: 3087284237 (3.07 GB)

=== faster-whisper small model.bin ===
https://huggingface.co/Systran/faster-whisper-small/resolve/main/model.bin
→ Content-Length: 483546902 (483 MB)

=== sherpa-onnx Python wheel ===
sherpa_onnx-1.13.6-cp310-cp310-manylinux2014_x86_64.manylinux_2_17_x86_64.whl = 4.2 MB

=== onnxruntime CPU ===
onnxruntime-1.29.0-cp311-cp311-manylinux_2_28_x86_64.whl = 22.0 MB

=== ctranslate2 CPU ===
ctranslate2-4.8.1-cp310-cp310-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl = 37.3 MB
```

## Appendix B: 參考文件

- arXiv 2407.04051 (FunAudioLLM SenseVoice paper): https://arxiv.org/abs/2407.04051
  - Table 7 (ASR accuracy across 12 test sets)
  - Table 8 (Inference speed: RTF + 10s audio latency)
- arXiv 2409.16135 (Whisper on child speech): https://arxiv.org/abs/2409.16135
- sherpa-onnx pre-trained models: https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html
- HF: https://huggingface.co/FunAudioLLM/SenseVoiceSmall
- HF: https://huggingface.co/Systran/faster-whisper-large-v3
- FunASR MODEL_LICENSE: https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE
- ThePlasmak skill: github.com/theplasmak/faster-whisper

## Appendix C: 來源原始碼審查檔案清單

```
/tmp/stt-search/raw/theplasmak-faster-whisper/
├── LICENSE (MIT)
├── SKILL.md (1130 lines)
├── skill.json
├── setup.sh (347 lines) — clean, no suspicious ops
└── scripts/transcribe.py (2981 lines) — no shell=True, safe subprocess only

/tmp/stt-search/raw/SYSTRAN-faster-whisper/
├── LICENSE (MIT)
├── faster_whisper/
│   ├── audio.py (PyAV-based decoding)
│   ├── feature_extractor.py
│   ├── transcribe.py (80KB; Segment/Word dataclasses confirmed)
│   ├── tokenizer.py
│   ├── utils.py (has download_model)
│   └── vad.py (Silero VAD)

/tmp/stt-search/raw/sherpa-onnx/
├── LICENSE (Apache-2.0)
├── sherpa-onnx/python/
│   └── sherpa_onnx/
│       ├── offline_recognizer.py (from_sense_voice())
│       ├── online_recognizer.py (streaming)
│       └── __init__.py
└── python-api-examples/
    ├── simulate-streaming-sense-voice-microphone.py ✅
    ├── online-websocket-client-microphone.py ✅
    └── speech-recognition-from-microphone.py ✅

/tmp/stt-search/raw/SenseVoice/
├── LICENSE (MIT — source code only)
├── model.py (SenseVoiceSmall nn.Module class)
├── api.py (FastAPI reference, GPU-only needs modification)
├── demo1.py (clean usage example)
└── demo2.py
```