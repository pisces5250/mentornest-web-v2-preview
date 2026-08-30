import { createHmac } from "node:crypto";

const secret = process.env.OPENCLAW_SERVICE_AUTH_KEY;
if (!secret || secret.length < 32) process.exit(1);
const payload = Buffer.from(JSON.stringify({
  ver: 1,
  iss: "mentornest-gateway",
  aud: "openclaw-learning",
  subject_ref: "service_readiness",
  scopes: ["service:invoke"],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 30,
})).toString("base64url");
const signature = createHmac("sha256", secret).update(payload).digest("base64url");
const response = await fetch(`http://127.0.0.1:${process.env.PORT || 18789}/readyz`, {
  headers: { Authorization: `Bearer ${payload}.${signature}` },
}).catch(() => null);
// 任一必要capability或dependency缺失時503是正確的not-ready。
process.exit(response?.status === 200 ? 0 : 1);
