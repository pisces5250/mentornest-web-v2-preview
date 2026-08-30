import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServiceToken, createSessionToken } from "../../server/auth/session-auth.mjs";

const REQUIRED_CAPABILITIES = [
  "learning_director.recommend",
  "assessment.submit_observation",
  "learning_memory.append_observation",
  "verified_bank.read",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`P0.7_UNVERIFIED: 缺少 ${name}`);
  return value;
}

function origin(name) {
  const value = new URL(required(name));
  if (!["http:", "https:"].includes(value.protocol)) throw new Error(`${name} 必須是 HTTP(S) origin`);
  return value;
}

function immutable(name) {
  const value = required(name);
  if (!/@sha256:[a-f0-9]{64}$/i.test(value)) throw new Error(`P0.7_UNVERIFIED: ${name} 不是 immutable digest reference`);
  return value;
}

function csrf(session, secret) {
  return createHmac("sha256", secret).update(`csrf:${session}`).digest("base64url");
}

function syntheticWav() {
  const sampleRate = 16_000;
  const seconds = 1;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 800, (samples - index) / 800);
    wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * index / sampleRate) * 4_000 * envelope), 44 + index * 2);
  }
  return wav;
}

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function retry(operation, accept, label) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await operation();
      if (accept(result)) return result;
      lastError = new Error(`${label} 尚未符合預期，HTTP ${result.response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw lastError || new Error(`${label} 未就緒`);
}

function browserHeaders(session, csrfToken, extra = {}) {
  return {
    Cookie: `mn_session=${encodeURIComponent(session)}; mn_csrf=${encodeURIComponent(csrfToken)}`,
    "X-MentorNest-CSRF": csrfToken,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function main() {
  const edge = origin("P07_WEB_EDGE_ORIGIN");
  const tutor = origin("P07_TUTOR_INTERNAL_ORIGIN");
  const invalidRuntimeTutor = origin("P07_TUTOR_INVALID_CREDENTIAL_ORIGIN");
  const mismatchTutor = origin("P07_TUTOR_CONTRACT_MISMATCH_ORIGIN");
  const missingTutor = origin("P07_TUTOR_MISSING_CAPABILITY_ORIGIN");
  const unavailableTutor = origin("P011_TUTOR_PROVIDER_UNAVAILABLE_ORIGIN");
  const unavailableVoiceEdge = origin("P011_WEB_EDGE_VOICE_UNAVAILABLE_ORIGIN");
  const voice = origin("P07_VOICE_INTERNAL_ORIGIN");
  const openclaw = origin("P011_OPENCLAW_INTERNAL_ORIGIN");
  const sessionSecret = required("P07_SESSION_SECRET");
  const serviceKey = required("P07_SERVICE_AUTH_KEY");
  const openclawServiceKey = required("P011_OPENCLAW_SERVICE_AUTH_KEY");
  const subjectRef = process.env.P07_SYNTHETIC_SUBJECT || "student_test_p07_runtime";
  if (!/^student_(?:t_|test_)/.test(subjectRef)) throw new Error("P0.7_UNVERIFIED: subject 必須是 synthetic test identity");
  const voiceImage = immutable("P07_VOICE_IMAGE");
  const openclawImage = immutable("P07_OPENCLAW_IMAGE");
  const expectedNamespace = required("P07_STAGING_DATA_NAMESPACE");
  if (!/staging/i.test(expectedNamespace) || /prod/i.test(expectedNamespace)) {
    throw new Error("P0.7_UNVERIFIED: namespace 未明確隔離於 staging");
  }

  const session = createSessionToken({
    subject_ref: subjectRef,
    scopes: ["tutor:use", "learning:read", "learning:write"],
    exp: Math.floor(Date.now() / 1000) + 300,
  }, sessionSecret);
  const csrfToken = csrf(session, sessionSecret);

  const edgeHealth = await retry(
    () => json(new URL("/healthz", edge)),
    ({ response }) => response.ok,
    "Web Edge healthz",
  );
  assert.equal(edgeHealth.response.ok, true, "Web Edge healthz 必須成功");
  const tutorReady = await retry(
    () => json(new URL("/api/ready", tutor)),
    ({ response, body }) => response.ok && body?.dependencies?.openclaw?.ok === true,
    "Tutor/OpenClaw readiness",
  );
  assert.equal(tutorReady.response.ok, true, "Tutor/OpenClaw readiness 必須成功");
  assert.equal(tutorReady.body?.dependencies?.openclaw?.ok, true);
  assert.equal(tutorReady.body.dependencies.openclaw.image_digest, openclawImage);
  assert.equal(tutorReady.body.dependencies.openclaw.data_namespace, expectedNamespace);
  assert.equal(tutorReady.body.dependencies.openclaw.production_data_allowed, false);
  assert.deepEqual(tutorReady.body.dependencies.openclaw.missing_capabilities, []);

  const contractMismatch = await retry(
    () => json(new URL("/api/ready", mismatchTutor)),
    ({ response, body }) => response.status === 503 && body?.dependencies?.openclaw,
    "contract mismatch probe",
  );
  assert.equal(contractMismatch.response.status, 503, "contract mismatch 必須阻止 readiness");
  assert.ok(contractMismatch.body?.dependencies?.openclaw?.mismatches?.includes("contract_version"));
  const missingCapability = await retry(
    () => json(new URL("/api/ready", missingTutor)),
    ({ response, body }) => response.status === 503 && body?.dependencies?.openclaw,
    "missing capability probe",
  );
  assert.equal(missingCapability.response.status, 503, "missing capability 必須阻止 readiness");
  assert.ok(missingCapability.body?.dependencies?.openclaw?.missing_capabilities?.includes("p07.synthetic.missing"));
  const providerUnavailable = await retry(
    () => json(new URL("/api/ready", unavailableTutor)),
    ({ response, body }) => response.status === 503 && body?.dependencies?.openclaw?.mismatches?.includes("runtime_unavailable"),
    "provider unavailable probe",
  );
  assert.equal(providerUnavailable.response.status, 503, "Provider unavailable 必須阻止 readiness");

  const expiredProviderCredential = createServiceToken({
    subjectRef,
    audience: "openclaw-learning",
    ttlSeconds: -1,
  }, openclawServiceKey);
  const expiredProviderAuth = await json(new URL("/readyz", openclaw), {
    headers: { Authorization: `Bearer ${expiredProviderCredential}` },
  });
  assert.equal(expiredProviderAuth.response.status, 401, "過期 Provider credential 必須 fail-closed");

  const invalidSession = await json(new URL("/api/learning/director/recommend", edge), {
    method: "POST",
    headers: browserHeaders("invalid.session", "invalid-csrf"),
    body: JSON.stringify({ synthetic: true }),
  });
  assert.equal(invalidSession.response.status, 401, "無效 browser auth 必須 fail-closed");

  const capabilityCases = [
    {
      name: "learning_director.recommend",
      path: "/api/learning/director/recommend",
      input: {
        confirmed_mastery: [{
          subject: "math",
          knowledge_point: "fake-kp-fractions",
          mastery: 0.4,
          evidence_status: "confirmed",
        }],
      },
      verify(result) {
        assert.equal(result.body?.result?.evidence_basis, "confirmed_only");
        assert.equal(result.body?.result?.authority, "learning_director_read_only");
      },
    },
    {
      name: "assessment.submit_observation",
      path: "/api/learning/assessment/observations",
      input: {
        assessment_kind: "diagnostic",
        subject: "math",
        knowledge_point: "fake-kp-fractions",
        instrument: {
          question_id: "q.fake.verified.p011",
          verification_status: "verified",
          answer_key_version: "key-v1",
        },
        attempt: {
          response_id: "response.fake.p011",
          result: "correct",
          hints_used: 0,
          first_attempt: true,
          occurred_at: "2026-08-30T00:00:00Z",
        },
      },
      verify(result) {
        assert.equal(result.body?.result?.schema_version, "assessment-observation-v1");
        assert.equal(result.body?.result?.mastery_effect, "none");
        assert.equal(result.body?.result?.authority, "assessment_observation_only");
      },
    },
    {
      name: "learning_memory.append_observation",
      path: "/api/learning/memory/observations",
      input: {
        observation: {
          kind: "synthetic_p011_cross_service",
          knowledge_point: "fake-kp-fractions",
          source: "p011-runtime-evidence",
          occurred_at: "2026-08-30T00:00:00Z",
        },
      },
      verify(result) {
        assert.equal(result.body?.result?.accepted, true);
        assert.equal(result.body?.result?.authority, "learning_memory_writer");
      },
    },
    {
      name: "verified_bank.read",
      path: "/api/learning/verified-bank/query",
      input: { subject: "math", limit: 5 },
      verify(result) {
        assert.ok(Array.isArray(result.body?.result?.questions));
        assert.equal(result.body?.result?.authority, "verified_bank_reader");
        assert.ok(result.body.result.questions.every((question) => question.verification_status === "verified"));
      },
    },
  ];
  for (const capabilityCase of capabilityCases) {
    const result = await json(new URL(capabilityCase.path, edge), {
      method: "POST",
      headers: browserHeaders(session, csrfToken),
      body: JSON.stringify(capabilityCase.input),
    });
    assert.equal(result.response.ok, true, `${capabilityCase.name} runtime smoke 失敗`);
    assert.equal(result.body?.ok, true);
    capabilityCase.verify(result);
  }

  const memoryFailClosed = await json(new URL("/api/learning/memory/observations", invalidRuntimeTutor), {
    method: "POST",
    headers: browserHeaders(session, csrfToken),
    body: JSON.stringify({ observation: { kind: "synthetic_p011_rejection", source: "p011" } }),
  });
  assert.ok(memoryFailClosed.response.status >= 500, "invalid runtime credential 時 Learning Memory 必須 fail-closed");
  assert.equal(memoryFailClosed.body?.ok, false);

  const voiceReady = await retry(
    () => json(new URL("/readyz", voice)),
    ({ response, body }) => response.ok && body?.ok === true,
    "Voice readiness",
  );
  assert.equal(voiceReady.response.ok, true, "Voice readiness 必須成功");
  assert.equal(voiceReady.body?.contract_version, "1");
  assert.deepEqual(new Set(voiceReady.body?.capabilities), new Set(["stt.transcribe", "tts.synthesize"]));
  assert.equal(voiceReady.body?.models?.stt?.ready, true);
  assert.equal(voiceReady.body?.models?.tts?.ready, true);
  assert.equal(voiceReady.body?.privacy?.cloud_fallback, false);
  assert.equal(voiceReady.body?.privacy?.learning_memory_write, false);

  const validVoice = createServiceToken({ subjectRef, audience: "voice-backend", ttlSeconds: 120 }, serviceKey);
  const wrongAudience = createServiceToken({ subjectRef, audience: "tutor-backend", ttlSeconds: 120 }, serviceKey);
  const expired = createServiceToken({ subjectRef, audience: "voice-backend", ttlSeconds: -1 }, serviceKey);
  for (const [label, token] of [
    ["wrong audience", wrongAudience],
    ["expired", expired],
    ["bad signature", `${validVoice}x`],
    ["browser session", session],
  ]) {
    const rejected = await json(new URL("/api/tts/synthesize", voice), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MentorNest-Service-Authorization": `Bearer ${token}` },
      body: JSON.stringify({ text: "合成測試" }),
    });
    assert.ok([401, 403].includes(rejected.response.status), `${label} credential 必須 fail-closed`);
  }

  const voiceUnavailable = await json(new URL("/api/tts/synthesize", unavailableVoiceEdge), {
    method: "POST",
    headers: browserHeaders(session, csrfToken),
    body: JSON.stringify({ text: "這是 unavailable fail-closed 測試。", speed: 1 }),
  });
  assert.ok(voiceUnavailable.response.status >= 500, "Voice unavailable 必須 fail-closed");

  const stt = await json(new URL("/api/stt/transcribe?language=auto", edge), {
    method: "POST",
    headers: {
      Cookie: `mn_session=${encodeURIComponent(session)}; mn_csrf=${encodeURIComponent(csrfToken)}`,
      "X-MentorNest-CSRF": csrfToken,
      "Content-Type": "audio/wav",
    },
    body: syntheticWav(),
  });
  assert.equal(stt.response.ok, true, "synthetic STT inference 必須成功");
  assert.equal(stt.body?.ok, true);
  assert.equal(typeof stt.body?.transcript, "string");
  assert.equal(stt.body?.privacy?.audio_retained, false);
  assert.equal(stt.body?.privacy?.transcript_persisted, false);

  const tts = await json(new URL("/api/tts/synthesize", edge), {
    method: "POST",
    headers: browserHeaders(session, csrfToken),
    body: JSON.stringify({ text: "這是 MentorNest 的合成語音測試。", speed: 1 }),
  });
  assert.equal(tts.response.ok, true, "synthetic TTS inference 必須成功");
  assert.equal(tts.body?.ok, true);
  assert.equal(tts.body?.privacy?.cloud_fallback, false);
  const audio = await fetch(new URL(tts.body.audio_url, edge), {
    headers: { Cookie: `mn_session=${encodeURIComponent(session)}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(audio.ok, true, "TTS audio retrieval 必須成功");
  assert.match(audio.headers.get("content-type") || "", /audio\//);
  const synthesizedAudio = Buffer.from(await audio.arrayBuffer());
  assert.ok(synthesizedAudio.byteLength > 44);

  // 再以剛才由本地 TTS 產生的非 production 語音跑 STT，避免只用純音調掩蓋語音辨識失效。
  const sttRoundTrip = await json(new URL("/api/stt/transcribe?language=auto", edge), {
    method: "POST",
    headers: {
      Cookie: `mn_session=${encodeURIComponent(session)}; mn_csrf=${encodeURIComponent(csrfToken)}`,
      "X-MentorNest-CSRF": csrfToken,
      "Content-Type": "audio/wav",
    },
    body: synthesizedAudio,
  });
  assert.equal(sttRoundTrip.response.ok, true, "synthetic TTS→STT round-trip 必須成功");
  assert.ok(sttRoundTrip.body?.transcript?.trim(), "synthetic speech STT 必須產生非空白 transcript");
  assert.equal(sttRoundTrip.body?.privacy?.audio_retained, false);
  assert.equal(sttRoundTrip.body?.privacy?.transcript_persisted, false);

  console.log(JSON.stringify({
    ok: true,
    evidence: "real_cross_service_runtime",
    synthetic_subject: subjectRef,
    voice_image: voiceImage,
    openclaw_image: openclawImage,
    staging_namespace: expectedNamespace,
    capabilities: REQUIRED_CAPABILITIES,
    voice_models: voiceReady.body.models,
    privacy: voiceReady.body.privacy,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
