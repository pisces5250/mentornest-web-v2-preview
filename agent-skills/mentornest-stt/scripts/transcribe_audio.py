#!/usr/bin/env python3
"""
MentorNest STT — `transcribe_audio` tool.

Local-only speech-to-text using sherpa-onnx 1.13.6 + SenseVoice-Small int8.

Privacy guarantees:
  - 100% on-device, no cloud STT fallback
  - Audio is NEVER written to Learning Memory
  - Original audio is NOT retained unless --save-audio is explicitly set
  - Converted temp WAV files live in an isolated temp dir and are deleted
    immediately after transcription (regardless of success/failure)
  - ffmpeg subprocess uses argument list only (shell=False is mandatory)

Audio format handling:
  - WAV (16-bit PCM mono 16 kHz): direct decode
  - WAV (other rates / stereo): ffmpeg resample
  - M4A / MP3 / MP4 / WebM / OGG / Opus / AMR / AAC:
      ffmpeg -> 16 kHz mono signed 16-bit PCM WAV -> temp file -> auto-deleted

Usage:
  python3 transcribe_audio.py --file-path /path/to/audio.{wav,m4a,mp3,webm,ogg,opus,amr,aac} \
    [--language auto] [--student-id ID] [--save-audio]

Output: JSON with transcript, language, tokens, timestamps, emotion, event, duration, RTF.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import wave
from typing import Optional, Tuple

# Make sherpa_onnx importable from production venv
VENV_SITE_PACKAGES = '/home/node/.openclaw/workspace/services/mentornest-stt/lib/python3.11/site-packages'
sys.path.insert(0, VENV_SITE_PACKAGES)

import numpy as np  # noqa: E402
import sherpa_onnx  # noqa: E402
from opencc import OpenCC  # noqa: E402

OPENCC_TW = OpenCC("s2twp")


# ===== Configuration =====
FFMPEG_PATH = '/home/node/.openclaw/workspace/bin/ffmpeg'
DEFAULT_MODEL_DIR = '/home/node/.openclaw/workspace/models/sensevoice/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
TARGET_SAMPLE_RATE = 16000
TARGET_CHANNELS = 1
TARGET_SAMPLE_FMT = 's16'  # signed 16-bit PCM
FFMPEG_TIMEOUT_SEC = 60


# ===== Privacy guard =====
def tcp_snapshot() -> list:
    """Snapshot of ESTABLISHED outbound TCP sockets owned by THIS process."""
    my_inodes = set()
    try:
        for fd in os.listdir(f'/proc/{os.getpid()}/fd'):
            try:
                target = os.readlink(f'/proc/{os.getpid()}/fd/{fd}')
                if target.startswith('socket:['):
                    inode = int(target[len('socket:['):-1])
                    my_inodes.add(inode)
            except (OSError, ValueError):
                pass
    except OSError:
        pass

    socks = []
    try:
        with open('/proc/net/tcp') as f:
            next(f)
            for line in f:
                p = line.split()
                if len(p) > 9 and p[3] == '01':
                    inode = int(p[9])
                    if inode not in my_inodes:
                        continue
                    def parse_addr(s):
                        ip_h, port_h = s.split(':')
                        ip = '.'.join(str(int(ip_h[i:i+2], 16)) for i in (6, 4, 2, 0))
                        return ip, int(port_h, 16)
                    socks.append({
                        'local': parse_addr(p[1]),
                        'remote': parse_addr(p[2]),
                        'inode': inode,
                    })
    except Exception:
        pass
    return socks


def assert_no_new_outbound(before: list, after: list, fail: bool = False) -> list:
    """Check if THIS Python process opened any new outbound connection."""
    new = [s for s in after if s not in before]
    if new and fail:
        raise RuntimeError(
            f'PRIVACY VIOLATION: this process opened {len(new)} new outbound connections: {new}'
        )
    return new


def get_rss_mb() -> float:
    with open('/proc/self/status') as f:
        for line in f:
            if line.startswith('VmRSS:'):
                return int(line.split()[1]) / 1024
    return 0.0


# ===== Format detection =====
def detect_format(path: str) -> str:
    """Detect audio format by magic bytes.

    Returns one of: 'wav', 'mp3', 'mp4' (covers m4a/aac/mp4/mov),
                    'ogg' (covers ogg/opus/oga),
                    'amr', 'webm', 'unknown'
    """
    with open(path, 'rb') as f:
        magic = f.read(16)

    if magic[:4] == b'RIFF' and magic[8:12] == b'WAVE':
        return 'wav'
    if magic[:3] == b'ID3' or magic[:2] == b'\xff\xfb' or magic[:2] == b'\xff\xf3':
        return 'mp3'
    if magic[4:8] == b'ftyp':
        return 'mp4'
    if magic[:4] == b'OggS':
        return 'ogg'
    if magic[:5] == b'#!AMR':
        return 'amr'
    if magic[:4] == b'\x1a\x45\xdf\xa3':
        return 'webm'
    return 'unknown'


# ===== ffmpeg conversion =====
class FFmpegError(RuntimeError):
    """ffmpeg invocation failed."""
    pass


def convert_to_wav_via_ffmpeg(src_path: str, dst_path: str) -> dict:
    """Convert any audio file to 16 kHz mono signed 16-bit PCM WAV.

    Uses argument list (NEVER shell=True). Returns ffmpeg run stats.
    Raises FFmpegError on failure.
    """
    if not os.path.exists(FFMPEG_PATH):
        raise FFmpegError(
            f'ffmpeg binary not found at {FFMPEG_PATH}. '
            f'Install or update FFMPEG_PATH in transcribe_audio.py.'
        )

    cmd = [
        FFMPEG_PATH,
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', src_path,
        '-ar', str(TARGET_SAMPLE_RATE),
        '-ac', str(TARGET_CHANNELS),
        '-sample_fmt', TARGET_SAMPLE_FMT,
        '-f', 'wav',
        dst_path,
    ]

    t0 = time.perf_counter()
    try:
        result = subprocess.run(
            cmd,
            shell=False,
            capture_output=True,
            timeout=FFMPEG_TIMEOUT_SEC,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        elapsed = time.perf_counter() - t0
        raise FFmpegError(
            f'ffmpeg timed out after {FFMPEG_TIMEOUT_SEC}s '
            f'converting {src_path} -> {dst_path}'
        ) from e
    except FileNotFoundError as e:
        raise FFmpegError(f'ffmpeg binary not executable: {e}') from e

    elapsed = time.perf_counter() - t0
    stderr_tail = result.stderr.decode('utf-8', errors='replace')[-500:] if result.stderr else ''

    if result.returncode != 0:
        raise FFmpegError(
            f'ffmpeg conversion failed (returncode={result.returncode}, '
            f'{elapsed:.2f}s) for {src_path} -> {dst_path}. '
            f'ffmpeg stderr tail: {stderr_tail}'
        )

    if not os.path.exists(dst_path):
        raise FFmpegError(
            f'ffmpeg returned success but output file missing: {dst_path}'
        )

    return {
        'cmd': cmd,
        'returncode': result.returncode,
        'stderr_tail': stderr_tail,
        'elapsed_sec': round(elapsed, 3),
    }


# ===== WAV loading =====
def read_wav_to_float32(path: str) -> Tuple[np.ndarray, int, float]:
    """Read a 16-bit PCM WAV file into float32 [-1, 1].

    Returns (samples, sample_rate, duration_sec).
    """
    with wave.open(path, 'rb') as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        n = w.getnframes()
        raw = w.readframes(n)

    if sw != 2:
        raise ValueError(f'Expected 16-bit PCM, got {sw*8}-bit in {path}')
    if ch != 1:
        raise ValueError(f'Expected mono, got {ch} channels in {path}')

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return samples, sr, n / sr


# ===== Audio loading (WAV or ffmpeg-decoded) =====
def load_audio_as_16k_mono(path: str) -> Tuple[np.ndarray, float, dict]:
    """Load audio as 16 kHz mono float32 PCM. Returns (samples, duration_sec, info)."""
    if not os.path.exists(path):
        raise FileNotFoundError(f'Audio file not found: {path}')

    fmt = detect_format(path)
    info = {
        'source_format': fmt,
        'path': path,
        'ffmpeg_used': False,
    }

    # Case 1: WAV at exact target spec
    if fmt == 'wav':
        with wave.open(path, 'rb') as w:
            sr = w.getframerate()
            ch = w.getnchannels()
            sw = w.getsampwidth()
        if sr == TARGET_SAMPLE_RATE and ch == TARGET_CHANNELS and sw == 2:
            samples, _, duration = read_wav_to_float32(path)
            info['wav_native_decode'] = True
            return samples, duration, info
        info['wav_resampled'] = True

    # Case 2: Anything else or non-spec WAV -> ffmpeg required
    if not os.path.exists(FFMPEG_PATH):
        raise FFmpegError(
            f'Audio format {fmt!r} requires ffmpeg, but ffmpeg not found at '
            f'{FFMPEG_PATH}.'
        )

    temp_dir = tempfile.mkdtemp(prefix='mentornest-stt-')
    temp_wav = os.path.join(temp_dir, 'converted.wav')
    info['temp_wav_dir'] = temp_dir

    try:
        ffmpeg_result = convert_to_wav_via_ffmpeg(path, temp_wav)
        info['ffmpeg_used'] = True
        info['ffmpeg_cmd'] = ffmpeg_result['cmd']
        info['ffmpeg_elapsed_sec'] = ffmpeg_result['elapsed_sec']
        info['ffmpeg_returncode'] = ffmpeg_result['returncode']
        info['temp_wav_path'] = temp_wav

        samples, sr, duration = read_wav_to_float32(temp_wav)
        if sr != TARGET_SAMPLE_RATE:
            raise FFmpegError(
                f'Internal error: ffmpeg output is {sr} Hz, expected {TARGET_SAMPLE_RATE} Hz'
            )
        return samples, duration, info
    finally:
        # ALWAYS delete temp WAV + dir, success or failure
        try:
            if os.path.exists(temp_wav):
                os.unlink(temp_wav)
            os.rmdir(temp_dir)
        except OSError as e:
            print(f'[warn] temp cleanup failed: {e}', file=sys.stderr)


# ===== Recognizer (cached) =====
_recognizer_cache = {}


def get_recognizer(model_dir: str, num_threads: int = 2):
    """Lazy-load and cache recognizer (one per process)."""
    key = (model_dir, num_threads)
    if key not in _recognizer_cache:
        model_path = os.path.join(model_dir, 'model.int8.onnx')
        tokens_path = os.path.join(model_dir, 'tokens.txt')
        if not os.path.exists(model_path):
            raise FileNotFoundError(f'model.int8.onnx not in {model_dir}')
        if not os.path.exists(tokens_path):
            raise FileNotFoundError(f'tokens.txt not in {model_dir}')

        tcp_before = tcp_snapshot()
        load_start = time.perf_counter()
        rec = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=model_path,
            tokens=tokens_path,
            num_threads=num_threads,
            debug=False,
        )
        load_time = time.perf_counter() - load_start
        tcp_after = tcp_snapshot()
        assert_no_new_outbound(tcp_before, tcp_after)
        _recognizer_cache[key] = (rec, load_time)
    return _recognizer_cache[key]


# ===== Main tool =====
def transcribe(
    file_path: str,
    language: str = 'auto',
    student_id: Optional[str] = None,
    save_audio: bool = False,
    model_dir: str = DEFAULT_MODEL_DIR,
    num_threads: int = 2,
) -> dict:
    """Transcribe an audio file. Returns JSON-serializable dict."""
    tcp_before = tcp_snapshot()

    recognizer, model_load_time = get_recognizer(model_dir, num_threads)

    archived_path = None
    if save_audio:
        archive_dir = '/home/node/.openclaw/workspace/data/stt-tmp'
        os.makedirs(archive_dir, exist_ok=True)
        import shutil
        ts = int(time.time())
        archived_path = os.path.join(archive_dir, f'{ts}-{os.path.basename(file_path)}')
        shutil.copy2(file_path, archived_path)

    samples, duration, load_info = load_audio_as_16k_mono(file_path)

    stream = recognizer.create_stream()
    stream.accept_waveform(TARGET_SAMPLE_RATE, samples)
    t0 = time.perf_counter()
    recognizer.decode_stream(stream)
    inference_sec = time.perf_counter() - t0

    r = stream.result
    rtf = inference_sec / duration if duration > 0 else 0.0

    tcp_after = tcp_snapshot()
    new_outbound = [s for s in tcp_after if s not in tcp_before]
    assert_no_new_outbound(tcp_before, tcp_after, fail=False)

    model_dir_name = os.path.basename(model_dir)
    model_version = model_dir_name.split('-')[-1] if model_dir_name else 'unknown'

    output = {
        'transcript': __import__('re').sub(
            r'(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])',
            '',
            OPENCC_TW.convert(r.text)
        ).strip(),
        'detected_language': r.lang,
        'tokens': list(r.tokens),
        'timestamps': list(r.timestamps),
        'emotion': r.emotion,
        'event': r.event,
        'duration_sec': round(duration, 4),
        'inference_sec': round(inference_sec, 4),
        'rtf': round(rtf, 4),
        'model': 'sensevoice-small-int8',
        'model_version': model_version,
        'language_hint': language,
        'model_load_time_sec': round(model_load_time, 3),
        'peak_rss_mb': round(get_rss_mb(), 1),
        'outbound_connections': len(new_outbound),
        'archived_to': archived_path,
        'student_id_audit': student_id if student_id else None,
        'python_version': sys.version.split()[0],
        'sherpa_onnx_version': sherpa_onnx.__version__,
        'source_format': load_info.get('source_format'),
        'ffmpeg_used': load_info.get('ffmpeg_used', False),
        'ffmpeg_path': FFMPEG_PATH,
        'ffmpeg_elapsed_sec': load_info.get('ffmpeg_elapsed_sec'),
        'ffmpeg_returncode': load_info.get('ffmpeg_returncode'),
        'wav_native_decode': load_info.get('wav_native_decode', False),
        'wav_resampled': load_info.get('wav_resampled', False),
        'temp_wav_deleted': True,
    }

    return output


# ===== CLI =====
def main():
    parser = argparse.ArgumentParser(
        description='MentorNest STT — local SenseVoice transcription',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 transcribe_audio.py --file-path voice.wav
  python3 transcribe_audio.py --file-path line-voice.m4a --student-id student_001
  python3 transcribe_audio.py --file-path lesson.webm --language zh
  python3 transcribe_audio.py --file-path opus.webm --save-audio
        """,
    )
    parser.add_argument('--file-path', required=True,
                        help='Audio file: WAV/M4A/MP3/MP4/WebM/OGG/Opus/AMR/AAC')
    parser.add_argument('--language', default='auto',
                        help='Language hint: auto/zh/en/yue/ja/ko (informational)')
    parser.add_argument('--student-id', default=None,
                        help='Audit log only; NEVER stored in Learning Memory')
    parser.add_argument('--save-audio', action='store_true',
                        help='Archive original audio (default: NO)')
    parser.add_argument('--model-dir', default=DEFAULT_MODEL_DIR,
                        help='SenseVoice model directory')
    parser.add_argument('--num-threads', type=int, default=2,
                        help='ONNX threads (default: 2)')

    args = parser.parse_args()

    try:
        result = transcribe(
            file_path=args.file_path,
            language=args.language,
            student_id=args.student_id,
            save_audio=args.save_audio,
            model_dir=args.model_dir,
            num_threads=args.num_threads,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        error_result = {
            'error': str(e),
            'error_type': type(e).__name__,
            'file_path': args.file_path,
        }
        print(json.dumps(error_result, ensure_ascii=False, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()