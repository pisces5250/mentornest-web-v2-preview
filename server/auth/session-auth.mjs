import { createHmac, timingSafeEqual } from "node:crypto";

const TEST_SUBJECT = /^student_(?:t_|test_)/;

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(claims, secret) {
  if (!secret || secret.length < 32) throw new Error("session secret 至少需要 32 個字元");
  const payload = encode(JSON.stringify({ ...claims, ver: 1, iss: "mentornest-web-edge", aud: "mentornest-tutor" }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.ver !== 1 || claims.iss !== "mentornest-web-edge" || claims.aud !== "mentornest-tutor") return null;
    if (typeof claims.subject_ref !== "string" || !claims.subject_ref) return null;
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= now) return null;
    if (!Array.isArray(claims.scopes)) return null;
    return Object.freeze(claims);
  } catch {
    return null;
  }
}

export function createServiceToken({ subjectRef, audience, ttlSeconds = 60 }, secret) {
  if (!secret || secret.length < 32) throw new Error("service auth key 至少需要 32 個字元");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = encode(JSON.stringify({
    ver: 1,
    iss: "mentornest-gateway",
    subject_ref: subjectRef,
    scopes: ["service:invoke"],
    aud: audience,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyServiceToken(token, { secret, audience, now = Date.now() }) {
  if (!secret || typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.ver !== 1 || claims.iss !== "mentornest-gateway" || claims.aud !== audience) return null;
    if (typeof claims.subject_ref !== "string" || !claims.subject_ref) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null;
    if (claims.iat > nowSeconds + 5 || claims.exp <= nowSeconds) return null;
    if (claims.exp - claims.iat > 120 || claims.exp <= claims.iat) return null;
    if (!Array.isArray(claims.scopes) || !claims.scopes.includes("service:invoke")) return null;
    return claims;
  } catch {
    return null;
  }
}

function cookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const item of raw.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function createBrowserAuth({ mode, sessionSecret }) {
  if (mode === "production" && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error("production 必須設定至少 32 字元的 MENTORNEST_GATEWAY_SESSION_SECRET");
  }
  return function browserAuth(req, res, next) {
    let claims;
    if (mode === "test") {
      const subjectRef = req.header("X-MentorNest-Test-Subject");
      if (!TEST_SUBJECT.test(subjectRef || "")) {
        return res.status(401).json({ ok: false, code: "authentication_required", message: "需要登入。" });
      }
      claims = { subject_ref: subjectRef, scopes: ["tutor:use", "learning:read", "learning:write"] };
    } else {
      claims = verifySessionToken(cookie(req, "mn_session"), sessionSecret);
      if (!claims) return res.status(401).json({ ok: false, code: "authentication_required", message: "需要登入。" });
    }
    req.auth = Object.freeze({ subjectRef: claims.subject_ref, scopes: new Set(claims.scopes) });
    next();
  };
}

export function requireScope(scope) {
  return function scoped(req, res, next) {
    if (!req.auth?.scopes?.has(scope)) {
      return res.status(403).json({ ok: false, code: "forbidden", message: "沒有執行此操作的權限。" });
    }
    next();
  };
}

export function createCsrfProtection({ mode, sessionSecret, methodResolver = (req) => req.method }) {
  return function csrf(req, res, next) {
    const method = methodResolver(req);
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();
    if (mode === "test") {
      if (req.header("X-MentorNest-CSRF") === "test-csrf") return next();
    } else {
      const session = cookie(req, "mn_session");
      const supplied = req.header("X-MentorNest-CSRF");
      const csrfCookie = cookie(req, "mn_csrf");
      const expected = session ? sign(`csrf:${session}`, sessionSecret) : null;
      if (supplied && csrfCookie && supplied === csrfCookie && csrfCookie === expected) return next();
    }
    return res.status(403).json({ ok: false, code: "csrf_rejected", message: "請重新整理頁面再試一次。" });
  };
}
