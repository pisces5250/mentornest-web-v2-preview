/**
 * Learning authority capability 只供 Tutor backend composition 使用。
 * Browser 不得直接提交 Assessment／Memory 或自報 Director evidence。
 */
export function registerGatewayRoutes() {
  return Object.freeze({ browser_authority_routes: false });
}
