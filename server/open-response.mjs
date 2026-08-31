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
import { compareReading as readingComparison } from './lib/reading-comparison.mjs';
import { evaluateReadingAloud } from './tutor/reading-aloud-evaluator.mjs';
import { createBrowserAuth, createCsrfProtection, createServiceToken, createSessionToken, requireScope } from './auth/session-auth.mjs';
import {
  createGatewayLearningMemoryWriter,
  createOpenClawGateway,
  createUnavailableGateway,
} from './gateway/openclaw-gateway.mjs';
import { registerGatewayRoutes } from './gateway/routes.mjs';
import { createTutorTurnOrchestrator, TutorTurnError } from './tutor/turn-orchestrator.mjs';
import { createTutorSessionStartOrchestrator, TutorSessionStartError } from './tutor/session-start-orchestrator.mjs';

// === Configuration ===
const PORT = process.env.PORT || 8787;
const STT_SCRIPT = process.env.STTS_SCRIPT
  || '/home/node/.openclaw/workspace/skills/mentornest-stt/scripts/transcribe_audio.py';
const TTS_SCRIPT = process.env.TTSS_SCRIPT
  || '/home/node/.openclaw/workspace/services/mentornest-tts/scripts/tts_synthesize.py';
const AUDIO_TMP = process.env.MENTORNEST_AUDIO_TMP
  || path.join(os.tmpdir(), 'mentornest-audio');
const AUDIO_TTL_MS = 30_000; // 30 seconds
const AUTH_MODE = process.env.MENTORNEST_AUTH_MODE || 'production';
const SESSION_SECRET = process.env.MENTORNEST_GATEWAY_SESSION_SECRET;
const STAGING_ACCESS_PASSWORD = process.env.PASSWORD;
const SERVICE_AUTH_KEY = process.env.MENTORNEST_SERVICE_AUTH_KEY;
const REQUIRED_CAPABILITY_ALIASES = {
  learning_director: 'learning_director.recommend',
  assessment: 'assessment.submit_observation',
  learning_memory: 'learning_memory.append_observation',
  verified_bank_read: 'verified_bank.read',
};
const requiredCapabilities = (process.env.OPENCLAW_REQUIRED_CAPABILITIES ||
  'learning_director.recommend,assessment.submit_observation,learning_memory.append_observation,verified_bank.read')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => REQUIRED_CAPABILITY_ALIASES[value] || value);
if (AUTH_MODE === 'production' && (!SERVICE_AUTH_KEY || SERVICE_AUTH_KEY.length < 32)) {
  throw new Error('production 必須設定至少 32 字元的 MENTORNEST_SERVICE_AUTH_KEY');
}
const browserAuth = createBrowserAuth({
  mode: AUTH_MODE,
  sessionSecret: SESSION_SECRET,
});
const csrfProtection = createCsrfProtection({
  mode: AUTH_MODE,
  sessionSecret: SESSION_SECRET,
});
const edgeCsrfProtection = createCsrfProtection({
  mode: AUTH_MODE,
  sessionSecret: SESSION_SECRET,
  methodResolver: (req) => req.header('X-Original-Method') || 'GET',
});
const gateway = process.env.OPENCLAW_GATEWAY_ORIGIN
  ? createOpenClawGateway({
      baseUrl: process.env.OPENCLAW_GATEWAY_ORIGIN,
      serviceAuthKey: process.env.OPENCLAW_SERVICE_AUTH_KEY,
      requiredCapabilities,
      contractVersion: process.env.OPENCLAW_CAPABILITY_CONTRACT_VERSION || '1',
      expectedRuntimeVersion: process.env.OPENCLAW_EXPECTED_RUNTIME_VERSION,
      expectedImageDigest: process.env.OPENCLAW_EXPECTED_IMAGE_DIGEST,
      expectedDataNamespace: process.env.OPENCLAW_EXPECTED_DATA_NAMESPACE,
      requireProductionDataIsolation: process.env.MENTORNEST_ENV === 'staging',
    })
  : createUnavailableGateway();
const tutorTurnOrchestrator = createTutorTurnOrchestrator({ gateway });
const tutorSessionStartOrchestrator = createTutorSessionStartOrchestrator({ gateway });

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
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

const stagingLoginAttempts = new Map();

function safeSecretEqual(supplied, expected) {
  if (typeof expected !== 'string' || expected.length < 16 || typeof supplied !== 'string') return false;
  const left = crypto.createHash('sha256').update(supplied).digest();
  const right = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

// 僅供隔離 staging 的人工瀏覽器驗證。Production 永遠不註冊此 route。
if (process.env.MENTORNEST_ENV === 'staging') {
  app.post('/api/auth/staging-session', (req, res) => {
    const origin = req.header('Origin');
    let sameHttpsOrigin = false;
    try {
      const parsedOrigin = new URL(origin);
      sameHttpsOrigin = parsedOrigin.protocol === 'https:' && parsedOrigin.host === req.get('host');
    } catch {}
    if (!sameHttpsOrigin) return res.status(403).json({ ok: false, code: 'origin_rejected' });
    const key = req.ip || 'unknown';
    const attempt = stagingLoginAttempts.get(key) || { count: 0, resetAt: 0 };
    const now = Date.now();
    if (attempt.resetAt <= now) { attempt.count = 0; attempt.resetAt = now + 60_000; }
    attempt.count += 1;
    stagingLoginAttempts.set(key, attempt);
    if (attempt.count > 5) return res.status(429).json({ ok: false, code: 'rate_limited' });
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!safeSecretEqual(supplied, STAGING_ACCESS_PASSWORD)) {
      return res.status(401).json({ ok: false, code: 'authentication_failed' });
    }
    const session = createSessionToken({
      // 同一隔離 staging 身分才能驗證跨 session 的 Learning Memory continuity。
      subject_ref: 'student_test_phase62_browser',
      scopes: ['tutor:use'],
      exp: Math.floor(now / 1000) + 3600,
    }, SESSION_SECRET);
    const csrf = crypto.createHmac('sha256', SESSION_SECRET).update(`csrf:${session}`).digest('base64url');
    stagingLoginAttempts.delete(key);
    res.set('Cache-Control', 'no-store');
    res.cookie('mn_session', session, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 3_600_000, path: '/' });
    res.cookie('mn_csrf', csrf, { httpOnly: false, secure: true, sameSite: 'strict', maxAge: 3_600_000, path: '/' });
    return res.json({ ok: true, expires_in: 3600 });
  });
}

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

app.get('/api/ready', async (_req, res) => {
  const openclaw = await gateway.ready();
  return res.status(openclaw.ok ? 200 : 503).json({ ok: openclaw.ok, dependencies: { openclaw } });
});

// 僅供 edge auth_request；不回傳 subject，僅核發短效 audience-bound service credential。
app.get('/api/auth/session/verify', browserAuth, edgeCsrfProtection, (req, res) => {
  const audience = (req.header('X-Original-URI') || '').startsWith('/api/stt') ||
    (req.header('X-Original-URI') || '').startsWith('/api/tts') ||
    (req.header('X-Original-URI') || '').startsWith('/api/audio')
    ? 'voice-backend' : 'tutor-backend';
  res.set('X-MentorNest-Service-Authorization', `Bearer ${createServiceToken({
    subjectRef: req.auth.subjectRef,
    audience,
  }, SERVICE_AUTH_KEY || 'test-only-service-auth-key-32-chars')}`);
  return res.status(204).end();
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

app.post('/api/tutor/english-evaluate', browserAuth, csrfProtection, requireScope('tutor:use'), (req, res) => {
  const body = req.body ?? {};
  const student_id = req.auth.subjectRef;
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
    // Layer A: deterministic comparison. Layer B: real English Specialist.
    // Both run on the server so we don't ship the rules to the browser.
    const result = evaluateReadingAloud({
      student_id,
      knowledge_point,
      age_band,
      expected_text,
      transcript,
      transcript_confidence,
    });
    if (!result.ok) {
      return res.status(400).json(result);
    }

    const { evaluation, reading_comparison, specialist } = result;

    // Audit log (Learning Memory Agent policy, Phase 6A v2):
    //   - student_id is HASHED, never the raw ID; we do not even log its
    //     length (length is itself a re-identification side channel).
    //   - transcript TEXT is NEVER logged, not even partial.  We log only
    //     the transcript's character count.
    //   - specialist decision metadata (action / subskill) is logged so
    //     we can later audit "did the specialist recommend a retry that
    //     the UI actually showed?" without exposing the transcript.
    if (student_id) {
      const sidHash = shortHash(student_id);
      console.log(
        `[tutor] english-evaluate sid=${sidHash} kp=${knowledge_point} ` +
        `age_band=${age_band} coverage=${reading_comparison.coverage.toFixed(2)} ` +
        `reliability=${reading_comparison.reliability.toFixed(2)} ` +
        `overall=${evaluation.overall_result} ` +
        `dominant=${evaluation.dominant_error_code ?? "none"} ` +
        `action=${specialist.action} retry=${evaluation.retry_recommended} ` +
        `transcript_chars=${transcript.length}`,
      );
    }

    return res.json({
      ok: true,
      evaluation,
      reading_comparison,
      specialist: {
        action: specialist.action,
        subskill: specialist.subskill,
        rationale: specialist.rationale,
      },
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

// === Audit helpers (Learning Memory Agent policy) ===

function shortHash(input) {
  // Deterministic, low-collision, NOT cryptographic.  We only need it
  // to mask the raw student_id in server logs so the audit trail does
  // not re-identify the child when piped to a logging service.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

// === Phase 6B — Conversational English Tutor (HTTP polling) ===
//
// Three endpoints:
//   POST /api/tutor/english-conversation/start
//   POST /api/tutor/english-conversation/turn
//   POST /api/tutor/english-conversation/end
//
// Privacy contract (Learning Memory Agent policy, Phase 6B):
//   - Transcript is held ONLY in server-side ring buffer (depth 5).
//     When the session ends, the ring buffer is dropped.
//   - Per-turn transcript / audio / decision is NEVER logged.
//   - At session-end, ONE summary observation is submitted to the
//     configured Learning Memory writer. Storage location and subject
//     resolution are owned by that authority boundary. The observation contains:
//     student_id_hash (NOT raw id), session_duration_sec, turn_count,
//     specialist_actions sequence, dominant_error_code, summary text.
//   - No transcript / no audio in the summary.
//   - Audit log on the console: only session_id, turn_count, action
//     sequence, hash of student_id.  No transcript text.

import {
  startConversation,
  turnConversation,
  endConversation,
  configureLearningMemoryWriter,
} from "./tutor/conversation-manager.mjs";
import { createTestFileLearningMemoryWriter } from "./learning-memory/writer.mjs";

// 唯一允許的 in-process file writer 是 /tmp + fake ID 測試 adapter。
// Production 必須在 composition root 注入正式 Learning Memory authority adapter。
if (process.env.MENTORNEST_LEARNING_RECORDS_DIR) {
  configureLearningMemoryWriter(createTestFileLearningMemoryWriter({
    root: process.env.MENTORNEST_LEARNING_RECORDS_DIR,
  }));
} else {
  configureLearningMemoryWriter(createGatewayLearningMemoryWriter(gateway));
}

registerGatewayRoutes(app, {
  gateway,
  auth: browserAuth,
  csrf: csrfProtection,
  requireScope,
});

app.post('/api/tutor/turn', browserAuth, csrfProtection, requireScope('tutor:use'), async (req, res) => {
  try {
    const result = await tutorTurnOrchestrator.submit(req.body ?? {}, {
      subjectRef: req.auth.subjectRef,
    });
    return res.json(result);
  } catch (error) {
    const status = error instanceof TutorTurnError ? error.status : 502;
    const code = error instanceof TutorTurnError ? error.code : 'learning_loop_unavailable';
    return res.status(status).json({
      ok: false,
      code,
      message: '老師暫時無法完成這次學習記錄，請稍後再試。',
    });
  }
});

// Browser 入口只確認 session 是否可用；不回傳 subject 或任何 authority 資料。
app.get('/api/tutor/session/status', browserAuth, requireScope('tutor:use'), (_req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true });
});

app.post('/api/tutor/session/start', browserAuth, csrfProtection, requireScope('tutor:use'), async (req, res) => {
  try {
    return res.json(await tutorSessionStartOrchestrator.start(req.body ?? {}, {
      subjectRef: req.auth.subjectRef,
    }));
  } catch (error) {
    const status = error instanceof TutorSessionStartError ? error.status : 502;
    return res.status(status).json({
      ok: false,
      code: error instanceof TutorSessionStartError ? error.code : 'session_start_unavailable',
      message: '老師暫時無法準備這次練習，請稍後再試。',
    });
  }
});

app.post('/api/tutor/english-conversation/start', browserAuth, csrfProtection, requireScope('tutor:use'), (req, res) => {
  try {
    const result = startConversation({ ...(req.body ?? {}), student_id: req.auth.subjectRef });
    if (!result.ok) {
      return res.status(400).json({ ok: false, code: result.code, message: result.message });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'unknown',
      message: '老師這邊有一點點問題，再試一次就好。',
      error: err?.message ?? String(err),
    });
  }
});

app.post('/api/tutor/english-conversation/turn', browserAuth, csrfProtection, requireScope('tutor:use'), (req, res) => {
  try {
    const result = turnConversation(req.body ?? {}, req.auth);
    if (!result.ok) {
      const status = result.code === 'session_required' || result.code === 'session_ended' ? 410 : 400;
      return res.status(status).json({ ok: false, code: result.code, message: result.message });
    }
    // Audit log (no transcript text, no raw student_id).
    console.log(
      `[tutor] conversation-turn sess=${result.session_id.slice(0, 8)} ` +
      `turn=${result.turn_index} action=${result.decision.action} ended=${result.ended}`,
    );
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'unknown',
      message: '老師這邊有一點點問題，再試一次就好。',
      error: err?.message ?? String(err),
    });
  }
});

app.post('/api/tutor/english-conversation/end', browserAuth, csrfProtection, requireScope('tutor:use'), async (req, res) => {
  try {
    const result = await endConversation(req.body ?? {}, req.auth);
    if (!result.ok) {
      return res.status(400).json({ ok: false, code: result.code, message: result.message });
    }
    // Audit log: session ended; summary was written.  No transcript / audio.
    console.log(
      `[tutor] conversation-end sess=${result.session.session_id.slice(0, 8)} ` +
      `turn_count=${result.session.turn_index} ` +
      `actions=${(result.summary.specialist_actions || []).join(',')} ` +
      `dominant=${result.summary.dominant_error_code || 'none'}`,
    );
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: 'unknown',
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
