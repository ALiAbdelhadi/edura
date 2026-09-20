// What does ONE request cost the server? Closed loop, no think time, so req/s at
// saturation = 1 / (CPU seconds per request) for a single-threaded server.
//   TARGET=page|api|login|health k6 run tests/load/cost-split.js
import http from "k6/http";
import { ERP, loadSessions, identity } from "./lib/common.js";
const sessions = loadSessions("student");
const T = __ENV.TARGET || "page";
const URLS = { page: "/ar/dashboard/student", api: "/api/v1/me/subscriptions", login: "/ar/login", health: "/api/health", rsc: "/ar/dashboard/student/schedule" };
export const options = { vus: Number(__ENV.VUS || 32), duration: __ENV.DURATION || "30s", noCookiesReset: true, summaryTrendStats: ["avg", "med", "p(95)"] };
export default function () {
  const who = identity(sessions, ERP);
  const headers = { "x-forwarded-for": `10.77.${__VU}.${1 + (__ITER % 250)}` };
  if (T === "rsc") { headers.rsc = "1"; headers["next-url"] = "/ar/dashboard/student"; }
  http.get(`${ERP}${URLS[T]}`, { headers });
}
