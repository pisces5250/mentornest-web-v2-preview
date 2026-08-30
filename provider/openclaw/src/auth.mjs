import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyServiceCredential(token, secret, now = Date.now()) {
  if (typeof token !== "string" || typeof secret !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.ver !== 1 || claims.iss !== "mentornest-gateway" || claims.aud !== "openclaw-learning") return null;
    if (!Array.isArray(claims.scopes) || !claims.scopes.includes("service:invoke")) return null;
    if (typeof claims.subject_ref !== "string" || !claims.subject_ref) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null;
    if (claims.iat > nowSeconds + 5 || claims.exp <= nowSeconds) return null;
    if (claims.exp - claims.iat > 120 || claims.exp <= claims.iat) return null;
    return Object.freeze(claims);
  } catch {
    return null;
  }
}
