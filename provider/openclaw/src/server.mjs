import { loadConfig } from "./config.mjs";
import { createProviderServer } from "./app.mjs";
import { readFile } from "node:fs/promises";
import { verifyAndWriteStagingQuestion } from "./staging-question-quality-writer.mjs";

const config = loadConfig();
if (config.seedStagingVerifiedFixture) {
  const fixtures = JSON.parse(await readFile(new URL("../fixtures/staging-questions.json", import.meta.url), "utf8"));
  for (const fixture of fixtures) await verifyAndWriteStagingQuestion(fixture, config);
}
const server = createProviderServer(config);
server.listen(config.port, "0.0.0.0", () => {
  // 僅記錄非敏感 runtime identity，不輸出 credential 或資料內容。
  console.log(JSON.stringify({ event: "provider_started", port: config.port, runtime_version: config.runtimeVersion }));
});
