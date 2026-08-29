import { GatewayError } from "./openclaw-gateway.mjs";

const ROUTES = Object.freeze([
  ["/api/learning/director/recommend", "learning_director.recommend", "learning:read"],
  ["/api/learning/assessment/observations", "assessment.submit_observation", "learning:write"],
  ["/api/learning/memory/observations", "learning_memory.append_observation", "learning:write"],
  ["/api/learning/verified-bank/query", "verified_bank.read", "learning:read"],
]);

export function registerGatewayRoutes(app, { gateway, auth, csrf, requireScope }) {
  for (const [path, capability, scope] of ROUTES) {
    app.post(path, auth, csrf, requireScope(scope), async (req, res) => {
      try {
        const result = await gateway.invoke(capability, {
          subjectRef: req.auth.subjectRef,
          input: req.body ?? {},
          requestId: req.header("X-Request-Id") || undefined,
        });
        return res.json({ ok: true, result });
      } catch (error) {
        const status = error instanceof GatewayError ? error.status : 502;
        return res.status(status).json({ ok: false, code: "backend_unavailable", message: "服務暫時無法使用，請稍後再試。" });
      }
    });
  }
}
