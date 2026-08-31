import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { chromium } from "playwright";
import { createSessionToken } from "../../server/auth/session-auth.mjs";

const baseUrl = process.env.MN_BROWSER_BASE_URL ?? "https://mentornest-phase61-f0af273.zeabur.app";
const zeaburToken = process.env.ZEABUR_TOKEN;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const audioPath = process.env.MN_FAKE_MIC_AUDIO;

assert.ok(zeaburToken, "需要 ZEABUR_TOKEN 才能取得既有 staging 登入 secret");
assert.ok(executablePath, "需要 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
assert.ok(audioPath, "需要 MN_FAKE_MIC_AUDIO");

async function stagingSessionCookies() {
  const response = await fetch("https://api.zeabur.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${zeaburToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query {
        service(_id: "6a945464f58fe6cbb975bbac") {
          variables(environmentID: "6a93dfa53bf3ef23ef4d5838") { key value }
        }
      }`,
    }),
  });
  assert.equal(response.ok, true, "無法讀取 staging service metadata");
  const body = await response.json();
  const secret = body.data?.service?.variables?.find(
    (item) => item.key === "SESSION_SECRET",
  )?.value;
  assert.ok(secret, "phase61-web 未設定 staging session secret");
  const session = createSessionToken({
    subject_ref: "student_test_phase62_browser",
    scopes: ["tutor:use"],
    exp: Math.floor(Date.now() / 1000) + 900,
  }, secret);
  const csrf = createHmac("sha256", secret).update(`csrf:${session}`).digest("base64url");
  return { session, csrf };
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${audioPath}`,
    "--autoplay-policy=user-gesture-required",
  ],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    permissions: ["microphone"],
  });
  await context.addInitScript(() => {
    window.__mnActiveMicTracks = 0;
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!original) return;
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      for (const track of stream.getAudioTracks()) {
        window.__mnActiveMicTracks += 1;
        const stop = track.stop.bind(track);
        let stopped = false;
        track.stop = () => {
          if (!stopped) {
            stopped = true;
            window.__mnActiveMicTracks = Math.max(0, window.__mnActiveMicTracks - 1);
          }
          stop();
        };
      }
      return stream;
    };
  });
  const auth = await stagingSessionCookies();
  await context.addCookies([
    { name: "mn_session", value: auth.session, url: baseUrl, httpOnly: true, secure: true, sameSite: "Strict" },
    { name: "mn_csrf", value: auth.csrf, url: baseUrl, httpOnly: false, secure: true, sameSite: "Strict" },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  const requests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/api\/(stt\/transcribe|tts\/synthesize|tutor\/english-conversation\/turn)$/.test(url.pathname)) {
      requests.push({ path: url.pathname, at: Date.now() });
    }
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByTestId("start-session").waitFor();
  await page.getByTestId("subject-picker").getByText("我想換一科").click();
  await page.getByTestId("subject-chip-english").click();
  await page.getByTestId("start-session").click();
  await page.getByTestId("voice-recorder").waitFor();

  // 第一題朗讀只用來依正式 Session/Director 流程進入 conversation 題。
  await page.getByTestId("voice-record-start").click();
  await page.waitForTimeout(7_500);
  await page.getByTestId("voice-record-stop").click();
  await page.getByTestId("voice-submit").waitFor({ timeout: 30_000 });
  // synthetic fixture 不一定朗讀銀行指定句；依產品提供的 transcript
  // 校正介面改成畫面上的正式 target，讓 writer/evaluator 正常判定後銜接對話。
  const readAloudTarget = await page.getByTestId("read-aloud-target").innerText();
  await page.getByTestId("voice-transcript-textarea").fill(readAloudTarget.trim());
  await page.getByTestId("voice-submit").click();
  const advance = page.getByTestId("next-question");
  try {
    await advance.waitFor({ timeout: 60_000 });
  } catch (error) {
    const visibleTestIds = await page.locator("[data-testid]").evaluateAll((elements) => elements
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.getAttribute("data-testid")));
    console.error(JSON.stringify({ stage: "read_aloud_bridge", visibleTestIds }));
    throw error;
  }
  await advance.click();

  const conversation = page.locator("section[role='region'][data-phase]");
  await page.getByTestId("start-conversation").waitFor();
  await page.evaluate(() => {
    window.__mnConversationTransitions = [];
    const target = document.querySelector("section[role='region'][data-phase]");
    const record = () => {
      const phase = target?.getAttribute("data-phase");
      const previous = window.__mnConversationTransitions.at(-1);
      if (phase && previous?.phase !== phase) {
        window.__mnConversationTransitions.push({
          phase,
          at: Date.now(),
          activeMicTracks: window.__mnActiveMicTracks ?? 0,
        });
      }
    };
    record();
    new MutationObserver(record).observe(target, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await page.getByTestId("start-conversation").click();

  await conversation.waitFor();
  await page.waitForFunction(() => {
    const transitions = window.__mnConversationTransitions ?? [];
    return transitions.filter((item) => item.phase === "LISTENING").length >= 11;
  }, null, { timeout: 300_000, polling: 250 });

  const transitions = await page.evaluate(() => window.__mnConversationTransitions);
  const listeningCount = transitions.filter((item) => item.phase === "LISTENING").length;
  const speakingCount = transitions.filter((item) => item.phase === "SPEAKING").length;
  const thinkingCount = transitions.filter((item) => item.phase === "THINKING").length;
  assert.ok(speakingCount >= 11, "greeting 加 10 輪皆須進入 SPEAKING");
  assert.ok(listeningCount >= 11, "每次老師說完皆須回到 LISTENING");
  assert.ok(thinkingCount >= 10, "孩子每輪語音皆須進入 THINKING");
  assert.equal(
    transitions.filter((item) => item.phase === "SPEAKING").every((item) => item.activeMicTracks === 0),
    true,
    "老師播放期間 microphone track 必須全部停止",
  );
  assert.equal(await page.getByTestId("conversation-playback-retry").isVisible().catch(() => false), false);
  assert.equal(await page.locator("[data-testid='tts-play']").count(), 0, "正常 Conversation 不得顯示手動播放鍵");

  const firstStt = requests.find((request) => request.path.endsWith("stt/transcribe"));
  const firstTts = requests.find((request) => request.path.endsWith("tts/synthesize"));
  assert.ok(firstTts && firstStt && firstTts.at < firstStt.at, "greeting 必須先自動 TTS，再開始第一輪 STT");

  const sttRequests = requests.filter((request) => request.path.endsWith("stt/transcribe"));
  const tutorRequests = requests.filter((request) => request.path.endsWith("english-conversation/turn"));
  const ttsRequests = requests.filter((request) => request.path.endsWith("tts/synthesize"));
  assert.ok(sttRequests.length >= 10, "至少需要 10 輪真實 STT");
  assert.ok(tutorRequests.length >= 10, "至少需要 10 輪 Tutor decision");
  assert.ok(ttsRequests.length >= 11, "greeting 加 10 輪都需要 TTS");
  const conversationStartedAt = transitions.find((item) => item.phase === "SPEAKING")?.at ?? 0;
  for (const request of sttRequests.filter((item) => item.at >= conversationStartedAt)) {
    const phaseAtRequest = transitions.filter((item) => item.at <= request.at).at(-1)?.phase;
    assert.equal(phaseAtRequest, "THINKING", "STT request 不得在老師 SPEAKING 時觸發");
  }

  // 隔離注入一次 TTS HTTP failure：正常對話不顯示播放鍵，但故障時必須
  // 出現可用鍵盤啟動的 recovery，重試成功後重新回到 LISTENING。
  let injectedFailure = false;
  const failOnce = async (route) => {
    if (!injectedFailure) {
      injectedFailure = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' });
      return;
    }
    await route.continue();
  };
  await page.route("**/api/tts/synthesize", failOnce);
  const retryPlayback = page.getByTestId("conversation-playback-retry");
  await retryPlayback.waitFor({ timeout: 60_000 });
  await page.unroute("**/api/tts/synthesize", failOnce);
  await retryPlayback.focus();
  assert.equal(await retryPlayback.evaluate((element) => element === document.activeElement), true);
  await retryPlayback.click();
  await page.waitForFunction(() => document.querySelector("section[role='region'][data-phase]")?.getAttribute("data-phase") === "LISTENING", null, { timeout: 60_000 });

  console.log(JSON.stringify({
    browser: "Google Chrome",
    rounds: Math.min(sttRequests.length, tutorRequests.length, ttsRequests.length - 1),
    phases: { speaking: speakingCount, listening: listeningCount, thinking: thinkingCount },
    requests: { stt: sttRequests.length, tutor: tutorRequests.length, tts: ttsRequests.length },
    greetingAutoPlayed: true,
    manualPlayRequired: false,
    speakingMicTracks: 0,
    sttDuringSpeaking: 0,
    recoveryVisible: true,
    recoveryReturnedToListening: true,
  }));
} finally {
  await browser.close();
}
