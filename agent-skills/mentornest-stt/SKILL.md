---
name: mentornest-stt
version: 1.0.0
description: Local Mandarin speech-to-text for MentorNest children. Uses sherpa-onnx + SenseVoice-Small int8 fully on-device, no external API. Trigger when transcribing audio, voice notes, LINE voice messages, or microphone input for student learning.
---

# MentorNest STT

Local-only speech-to-text for MentorNest children. Powered by `sherpa-onnx 1.13.6 + SenseVoice-Small int8`.

**Privacy**: 100% on-device. NO cloud API. NO outbound during inference. Audio is NEVER uploaded. Audio is NEVER written to Learning Memory.

## When to use

Use this skill whenever you need to transcribe audio for a MentorNest child:

- A child sends a voice message via LINE
- A child speaks into the MentorNest Web microphone
- A recorded home practice session
- A math problem stated verbally

Do **NOT** use this skill for:

- Synthesizing speech (use a TTS skill)
- Adult-only voice content (e.g., parent messages, internal testing)
- Anything that would require cloud STT (network is blocked by design)

## Tool: `transcribe_audio`

Single tool that all STT operations route through.

**Input**:
| Field | Required | Type | Description |
|---|---|---|---|
| `file_path` | yes | string | Path to audio file (WAV / M4A / MP3 / OGG/Opus / AMR) |
| `language` | no | string | Hint: `auto` (default) / `zh` / `en` / `yue` / `ja` / `ko` |
| `student_id` | no | string | If given, audit-logs the call but audio content is NEVER stored in Learning Memory |
| `save_audio` | no | bool | Default `false`. If `true`, archive the audio file to `data/stt-tmp/` for up to 30 days |

**Output** (JSON):
```json
{
  "transcript": "四十二除以六等於七",
  "detected_language": "<|zh|>",
  "tokens": ["四", "十", "二", "除", "以", "六", "等", "於", "七"],
  "timestamps": [0.42, 0.84, 1.26, 1.68, 2.10, 2.52, 2.94, 3.36, 3.78],
  "emotion": "<|NEUTRAL|>",
  "event": "<|Speech|>",
  "duration_sec": 4.61,
  "inference_sec": 0.596,
  "rtf": 0.129,
  "model": "sensevoice-small-int8",
  "model_version": "2024-07-17",
  "outbound_connections": 0
}
```

## How to call

The tool wraps a single Python script:

```bash
python3 /home/node/.openclaw/workspace/skills/mentornest-stt/scripts/transcribe_audio.py \
  --file-path /path/to/audio.wav \
  [--language auto] \
  [--student-id student_001] \
  [--save-audio] \
  [--model-dir /home/node/.openclaw/workspace/models/sensevoice/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17]
```

The script auto-decodes M4A / MP3 / OGG via ffmpeg if available, or fails with a clear error message.

## Audio format handling

The script accepts:
- WAV (16-bit PCM mono / stereo, any sample rate — auto-resampled to 16 kHz)
- M4A (LINE voice notes) — requires ffmpeg
- MP3 — requires ffmpeg
- OGG / Opus (Web mic MediaRecorder default) — requires ffmpeg
- AMR (legacy LINE format) — requires ffmpeg

If ffmpeg is unavailable, only WAV (16-bit PCM 16 kHz mono) is accepted, with a fix-it-yourself error message.

## Privacy guarantees (HARD CONSTRAINTS)

1. **No outbound during inference**: The script snapshots `/proc/net/tcp` before and after, and FAILS if any new ESTABLISHED connection appears.

2. **No Learning Memory writes**: The script NEVER calls `learning_record_append` with audio-derived content. The transcript itself may be passed back to the caller, but is not auto-recorded.

3. **No audio archival by default**: Raw audio is NOT saved. To archive for debugging, caller must explicitly pass `--save-audio`.

4. **No cloud fallback**: There is NO fallback to Groq / Deepgram / Azure / Whisper API. If local inference fails, the tool returns an error.

5. **No telemetry**: sherpa-onnx does not phone home (verified). No MLflow / W&B / Sentry.

## Model

- **Path**: `/home/node/.openclaw/workspace/models/sensevoice/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`
- **Files**: `model.int8.onnx` (228 MB), `tokens.txt` (308 KB)
- **License**: FunASR Model Open Source License v1.1 (商用 OK, attribution required, no NC)
- **Languages**: Mandarin (zh), English (en), Cantonese (yue), Japanese (ja), Korean (ko)
- **CPU only**: ~470 MB peak RSS, ~0.15 RTF (6-7× realtime) on Zeabur 2C4GB
- **Cold start**: ~3 seconds for first inference

## Files in this skill

```
skills/mentornest-stt/
├── SKILL.md                      ← this file
├── scripts/
│   ├── transcribe_audio.py       ← the CLI tool
│   └── transcribe_audio_lib.py   ← shared Python module
├── references/
│   ├── model-license.md          ← SenseVoice license details
│   └── audio-formats.md          ← supported formats and ffmpeg fallbacks
└── examples/
    └── test_transcribe.py        ← self-test (optional, requires model loaded)
```

## When NOT to use this skill

- If the child explicitly says "don't record me" — honor that and don't transcribe
- If audio is shorter than 0.5 seconds — likely noise, skip
- If audio is longer than 60 seconds — chunk into smaller segments (not yet implemented; flag for caller)
- For batch evaluation (multiple files, ground truth, WER/CER computation) — use the sandbox benchmark tool in `/tmp/mentornest-sensevoice-test/`, NOT this production skill