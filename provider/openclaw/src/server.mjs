import { loadConfig } from "./config.mjs";
import { createProviderServer } from "./app.mjs";

const config = loadConfig();
const server = createProviderServer(config);
server.listen(config.port, "0.0.0.0", () => {
  // 僅記錄非敏感 runtime identity，不輸出 credential 或資料內容。
  console.log(JSON.stringify({ event: "provider_started", port: config.port, runtime_version: config.runtimeVersion }));
});
