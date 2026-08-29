# Supported Audio Formats

The `transcribe_audio` tool accepts the following audio formats:

## Native support (no ffmpeg required)

| Format | Notes |
|---|---|
| WAV (16-bit PCM mono 16 kHz) | ✅ Direct decode, fastest |

## ffmpeg-required

| Format | Source | ffmpeg command |
|---|---|---|
| WAV (other sample rates / stereo) | Various | `-i in.wav -ar 16000 -ac 1 -sample_fmt s16 -f wav out.wav` |
| M4A | LINE voice notes (iOS / Android) | `-i in.m4a -ar 16000 -ac 1 -sample_fmt s16 -f wav out.wav` |
| MP3 | Various | (same as M4A) |
| OGG / Opus | Web mic MediaRecorder default | (same as M4A) |
| AMR | Legacy LINE voice format | (same as M4A) |
| MP4 | Video files (audio track) | (same as M4A) |

## Why 16 kHz mono 16-bit PCM?

SenseVoice-Small int8 was trained on 16 kHz mono audio. Any other format must
be resampled before inference. ffmpeg handles all common formats and is the
standard tool for this conversion.

## Production environment status

**ffmpeg**: NOT installed on current Zeabur production environment.

To install ffmpeg (requires sudo, NOT currently available):
```
sudo apt-get install -y ffmpeg
```

Without ffmpeg, only WAV (16 kHz mono 16-bit) is accepted. For LINE voice
messages (m4a), Web mic (Opus), and MP3, ffmpeg must be installed by the
Zeabur platform admin.
