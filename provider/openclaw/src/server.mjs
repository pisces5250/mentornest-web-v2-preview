import { loadConfig } from "./config.mjs";
import { createProviderServer } from "./app.mjs";
import { verifyAndWriteStagingQuestion } from "./staging-question-quality-writer.mjs";
import { STAGING_QUESTIONS } from "../fixtures/staging-question-set.mjs";

const config = loadConfig();
if (config.seedStagingVerifiedFixture) {
  for (const fixture of STAGING_QUESTIONS) await verifyAndWriteStagingQuestion(fixture, config);
}
const server = createProviderServer(config);
server.listen(config.port, "0.0.0.0", () => {
  // 僅記錄非敏感 runtime identity，不輸出 credential 或資料內容。
  console.log(JSON.stringify({ event: "provider_started", port: config.port, runtime_version: config.runtimeVersion }));
});
