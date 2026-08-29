/**
 * mentornest-web-v2 — Open Response + Voice backend
 *
 * Endpoints:
 *   POST /api/stt/transcribe           — receive audio, run local SenseVoice, return transcript
 *   POST /api/tts/synthesize           — receive text, run local sherpa-onnx TTS, return audio URL
 *   GET  /api/audio/:id                — serve synthesised audio (TTL 30s, then auto-delete)
 *   GET  /api/health                   — health probe
 *   POST /api/tutor/english-evaluate   — deterministic English read-aloud evaluation
 *                                         (Phase 6A — does NOT touch audio; pure function)
 *
 * Hard Invariants:
 *   1. Audio saved to /tmp ONLY. TTL 30s. Auto-deleted.
 *   2. No outbound network calls during inference (STT/TTS snapshots /proc/net/tcp).
 *   3. Transcripts returned in response body ONLY. Never persisted to long-term memory.
 *   4. student_id (if provided) is logged but NEVER joined with the transcript payload.
 *   5. Cloud STT/TTS fallback: NONE. Local-only.
 *   6. Tutor evaluation is deterministic and stateless; no remote calls, no
 *      audio access, no LLM. Input is the child-confirmed transcript text
 *      only (already on the wire after STT).
 */

import express from 'express';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { evaluateReading as englishSpecialistEvaluate } from './tutor/english-specialist.mjs';
import { compareReading as readingComparison } from './lib/reading-comparison.mjs';

// === Configuration ===
const PORT = process.env.PORT || 8787;
const STT_SCRIPT = process.env.STTS_SCRIPT
  || '/home/node/.openclaw/workspace/skills/mentornest-stt/scripts/transcribe_audio.py';
const TTS_SCRIPT = process.env.TTSS_SCRIPT
  || '/home/node/.openclaw/workspace/services/mentornest-tts/scripts/tts_synthesize.py';
const AUDIO_TMP = process.env.MENTORNEST_AUDIO_TMP
  || path.join(os.tmpdir(), 'mentornest-audio');
const AUDIO_TTL_MS = 30_000; // 30 seconds

await fs.mkdir(AUDIO_TMP, { recursive: true });

// === Privacy helpers ===

function snapshotOutbound() {
  const conns = new Set();
  if (!existsSync('/proc/net/tcp')) return conns;
  try {
    const data = readFileSync('/proc/net/tcp', 'utf8');
    for (const line of data.split('\n').slice(1)) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      if (parts[3] === '01') conns.add(parts[1]); // ESTABLISHED
    }
  } catch {}
  return conns;
}

function assertNoOutbound(before, after, op) {
  const newConns = [...after].filter(c => !before.has(c));
  if (newConns.length > 0) {
    throw new Error(`Outbound connection detected during ${op}: ${newConns.join(',')}`);
  }
}

// === Express app ===

const app = express();
app.use(express.json({ limit: '256kb' }));

// Raw body for audio uploads
app.use('/api/stt/transcribe', express.raw({ type: '*/*', limit: '10mb' }));

// === Audio registry (TTL-based) ===
const audioRegistry = new Map(); // id -> { path, expiresAt }

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of audioRegistry) {
    if (entry.expiresAt < now) {
      audioRegistry.delete(id);
      fs.unlink(entry.path).catch(() => {});
    }
  }
}, 5000);

// === Health ===

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    services: {
      stt: existsSync(STT_SCRIPT),
      tts: existsSync(TTS_SCRIPT),
    },
    audio_registry_size: audioRegistry.size,
    privacy: {
      cloud_fallback: false,
      audio_ttl_ms: AUDIO_TTL_MS,
      transcript_persisted: false,
    },
  });
});

// === POST /api/stt/transcribe ===
//
// Body: raw audio bytes (any format STT supports: WAV/M4A/MP3/OGG/Opus/AMR)
// Query: ?language=auto|zh|en
// Headers: X-Student-Id (optional, audit-only, NEVER joined to transcript)
//
app.post('/api/stt/transcribe', async (req, res) => {
  const audio = req.body;
  if (!Buffer.isBuffer(audio) || audio.length < 100) {
    return res.status(400).json({ ok: false, error: 'audio body missing or too small' });
  }

  const language = req.query.language || 'auto';
  const studentId = req.header('X-Student-Id') || null;

  // Refuse production student IDs (per project policy)
  if (studentId && ['student_001', 'student_002'].includes(studentId)) {
    return res.status(403).json({ ok: false, error: 'production student_id refused in preview' });
  }

  const audioId = crypto.randomBytes(8).toString('hex');
  const tmpPath = path.join(AUDIO_TMP, `stt-${audioId}.bin`);
  await fs.writeFile(tmpPath, audio);

  const before = snapshotOutbound();
  const t0 = Date.now();

  const args = [
    STT_SCRIPT,
    '--file-path', tmpPath,
    '--language', String(language),
  ];
  if (studentId) args.push('--student-id', studentId);
  // Note: NO --save-audio. Audio is auto-deleted below.

  const child = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => stdout += d);
  child.stderr.on('data', (d) => stderr += d);

  child.on('close', async (code) => {
    const after = snapshotOutbound();
    try { await fs.unlink(tmpPath); } catch {}

    if (code !== 0) {
      return res.status(500).json({ ok: false, error: 'stt inference failed', stderr: stderr.slice(-300) });
    }
    try {
      assertNoOutbound(before, after, 'STT');
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'stt produced invalid JSON' });
    }

    // Return transcript (NOT auto-recorded anywhere)
    res.json({
      ok: true,
      transcript: parsed.transcript || '',
      detected_language: parsed.detected_language || null,
      duration_sec: parsed.duration_sec || 0,
      inference_sec: parsed.inference_sec || 0,
      model: parsed.model || 'sensevoice-small-int8',
      privacy: {
        audio_retained: false,
        transcript_persisted: false,
        student_id_logged_only: !!studentId,
        inference_total_ms: Date.now() - t0,
      },
    });
  });
});

// === POST /api/tts/synthesize ===
//
// Body: { text: string, speed?: 0.5-2.0 }
// Returns: { ok, audio_id, audio_url, duration_sec }
// Client fetches audio via GET /api/audio/:id
//
app.post('/api/tts/synthesize', async (req, res) => {
  const { text, speed = 1.0 } = req.body || {};
  if (!text || typeof text !== 'string' || text.length === 0) {
    return res.status(400).json({ ok: false, error: 'text missing or empty' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ ok: false, error: 'text too long (>2000 chars)' });
  }
  if (typeof speed !== 'number' || speed < 0.5 || speed > 2.0) {
    return res.status(400).json({ ok: false, error: 'speed out of range [0.5, 2.0]' });
  }

  const audioId = crypto.randomBytes(8).toString('hex');
  const outPath = path.join(AUDIO_TMP, `tts-${audioId}.wav`);

  const before = snapshotOutbound();
  const t0 = Date.now();

  const args = [
    TTS_SCRIPT,
    '--text', text,
    '--output', outPath,
    '--speed', String(speed),
  ];

  const child = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => stdout += d);
  child.stderr.on('data', (d) => stderr += d);

  child.on('close', async (code) => {
    const after = snapshotOutbound();
    if (code !== 0) {
      return res.status(500).json({ ok: false, error: 'tts inference failed', stderr: stderr.slice(-300) });
    }
    try {
      assertNoOutbound(before, after, 'TTS');
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'tts produced invalid JSON' });
    }

    if (!parsed.ok) {
      return res.status(500).json({ ok: false, error: parsed.error || 'tts failed' });
    }

    // Register with TTL
    audioRegistry.set(audioId, {
      path: outPath,
      expiresAt: Date.now() + AUDIO_TTL_MS,
    });

    res.json({
      ok: true,
      audio_id: audioId,
      audio_url: `/api/audio/${audioId}`,
      duration_sec: parsed.duration_sec,
      inference_sec: parsed.inference_sec,
      privacy: {
        audio_retained_until_ms: Date.now() + AUDIO_TTL_MS,
        cloud_fallback: false,
        inference_total_ms: Date.now() - t0,
      },
    });
  });
});

// === GET /api/audio/:id ===
//
app.get('/api/audio/:id', async (req, res) => {
  const entry = audioRegistry.get(req.params.id);
  if (!entry) {
    return res.status(404).json({ ok: false, error: 'audio not found or expired' });
  }
  res.set('Content-Type', 'audio/wav');
  res.set('Cache-Control', 'no-store');
  const data = await fs.readFile(entry.path);
  res.send(data);
});

// === POST /api/tutor/english-evaluate ===
//
// Body:
//   {
//     student_id: string,
//     knowledge_point: string,
//     age_band: "G1-G2"|"G3-G4"|"G5-G6"|"G7+",
//     expected_text: string,
//     transcript: string,
//     transcript_confidence?: number|null
//   }
//
// Response: { ok: true, evaluation: TutorEvaluation }  (see src/tutor/TutorEvaluationContract.ts)
//
// Privacy:
//   - The transcript has already crossed the wire at /api/stt/transcribe.
//     This endpoint does NOT touch audio, does NOT log the transcript text
//     alongside student_id, and does NOT call any remote service.
//   - This is a pure deterministic function. Two identical inputs always
//     produce identical outputs.

app.post('/api/tutor/english-evaluate', (req, res) => {
  const body = req.body ?? {};
  const student_id = typeof body.student_id === 'string' ? body.student_id : '';
  const knowledge_point = typeof body.knowledge_point === 'string' ? body.knowledge_point : '';
  const age_band = body.age_band;
  const expected_text = typeof body.expected_text === 'string' ? body.expected_text : '';
  const transcript = typeof body.transcript === 'string' ? body.transcript : '';
  const transcript_confidence =
    typeof body.transcript_confidence === 'number' && Number.isFinite(body.transcript_confidence)
      ? body.transcript_confidence
      : null;

  // Validate required fields. We reject early with a friendly code so
  // the front-end can show a child-appropriate message.
  if (!expected_text.trim()) {
    return res.status(400).json({
      ok: false,
      code: 'expected_required',
      message: '找不到題目的朗讀內容。請重整頁面再試一次。',
    });
  }
  if (!transcript.trim() && transcript_confidence === null) {
    return res.status(400).json({
      ok: false,
      code: 'transcript_required',
      message: '老師還沒收到你說的內容，請再說一次。',
    });
  }
  const allowedBands = ['G1-G2', 'G3-G4', 'G5-G6', 'G7+'];
  if (!allowedBands.includes(age_band)) {
    return res.status(400).json({
      ok: false,
      code: 'invalid_payload',
      message: '請確認你的年級設定，再試一次。',
    });
  }

  try {
    // Layer A: deterministic comparison. Layer B: English Specialist.
    // Both run on the server so we don't ship the rules to the browser.
    const reading_comparison = readingComparison({
      expected: expected_text,
      transcript,
      sttConfidence: transcript_confidence,
    });
    const evaluation = englishSpecialistEvaluate({
      student_id,
      knowledge_point,
      age_band,
      expected_text,
      transcript,
      transcript_confidence,
    });

    // Audit log: count-only, never transcript text alongside student_id.
    if (student_id) {
      console.log(
        `[tutor] english-evaluate student=${student_id.length}chars ` +
        `kp=${knowledge_point} age_band=${age_band} ` +
        `coverage=${reading_comparison.coverage.toFixed(2)} ` +
        `reliability=${reading_comparison.reliability.toFixed(2)} ` +
        `overall=${evaluation.overall_result} ` +
        `transcript_chars=${transcript.length}`,
      );
    }

    return res.json({
      ok: true,
      evaluation,
      reading_comparison,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'specialist_unavailable',
      message: '老師這邊有一點點問題，再試一次就好。',
      error: err?.message ?? String(err),
    });
  }
});

// === Error handler ===
app.use((err, _req, res, _next) => {
  res.status(500).json({ ok: false, error: err.message });
});

// === Listen ===
app.listen(PORT, () => {
  console.log(`[mentornest-backend] listening on http://localhost:${PORT}`);
  console.log(`[mentornest-backend] stt script: ${STT_SCRIPT}`);
  console.log(`[mentornest-backend] tts script: ${TTS_SCRIPT}`);
  console.log(`[mentornest-backend] audio TTL: ${AUDIO_TTL_MS}ms`);
  console.log(`[mentornest-backend] privacy: cloud_fallback=false, transcript_persisted=false`);
});