import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", host, "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});

let previewOutput = "";
preview.stdout.on("data", (chunk) => { previewOutput += String(chunk); });
preview.stderr.on("data", (chunk) => { previewOutput += String(chunk); });

async function waitForPreview() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // 預覽服務尚未 ready。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite preview 未 ready：${previewOutput}`);
}

try {
  await waitForPreview();
  const gate = spawn(process.execPath, ["test/a11y/react-browser-gate.mjs"], {
    stdio: "inherit",
    env: { ...process.env, MN_BROWSER_BASE_URL: baseUrl },
  });
  const exitCode = await new Promise((resolve) => gate.once("exit", resolve));
  if (exitCode !== 0) process.exitCode = typeof exitCode === "number" ? exitCode : 1;
} finally {
  preview.kill("SIGTERM");
}
