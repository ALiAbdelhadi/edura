/**
 * PHASE 1 SWEEP — auth-guard coverage across EVERY endpoint-method.
 *
 * For each of the ~340 exported route handlers:
 *   a) call it ANONYMOUSLY            -> must be 401 (or be an explicitly public/secret-guarded route)
 *   b) call it with a WRONG-ROLE session -> must be 401/403/404 (never 200)
 *
 * Bodies are intentionally `{}` so that a route which validates BEFORE
 * authenticating is visible (it answers 400 instead of 401) — that ordering is
 * itself reported as SUSPICIOUS.
 */
import fs from "node:fs";
import { call, record, flush, actors } from "./_apiharness.mjs";
import { concrete } from "./_params.mjs";

const INV = fs
  .readFileSync("/private/tmp/claude-501/-Users-ali-edura/67a8faec-c4d6-469f-b551-9d5c7366c730/scratchpad/inventory.txt", "utf8")
  .trim().split("\n").map((l) => {
    const [app, path, methods] = l.split("|");
    return { app, path, methods: methods ? methods.split(",") : [] };
  });

// Routes that are legitimately reachable without a session.
const PUBLIC = [
  "/api/v1/_ping", "/api/v1/%5Fping",
  "/api/v1/auth/login", "/api/v1/auth/register/student", "/api/v1/auth/register/parent",
  "/api/v1/auth/register/center", "/api/v1/auth/password/forgot", "/api/v1/auth/password/reset",
  "/api/v1/auth/invite/accept",
  "/api/v1/centers/[id]", "/api/v1/centers/[id]/rooms", "/api/v1/teachers/[teacherId]",
  "/api/v1/search/centers", "/api/v1/search/courses", "/api/v1/search/teachers",
  "/api/v1/catalog/tree", "/api/v1/catalog/subjects", "/api/v1/subjects",
  "/api/v1/temp-students/claim",
  "/api/auth/[...nextauth]",
];
// Routes guarded by a shared secret rather than a session.
const SECRET_GUARDED = [
  "/api/v1/cron/[job]", "/api/v1/internal/chat-notify", "/api/v1/payments/paymob/webhook",
];

// Which "wrong role" to probe each family with.
function wrongRoleFor(app, path) {
  if (app === "superadmin") {
    if (path.startsWith("/api/v1/admin/")) return "accountant";      // accountant must not reach super-admin surface
    if (path.startsWith("/api/v1/finance/")) return "student";       // www role must not reach finance at all
    return "student";
  }
  if (path.startsWith("/api/v1/admin/")) return "student";
  if (path.startsWith("/api/v1/center/") || path.startsWith("/api/v1/centers/me")) return "student";
  if (path.startsWith("/api/v1/teacher/")) return "student";
  if (path.startsWith("/api/v1/parent/")) return "student";
  if (path.startsWith("/api/v1/finance/")) return "student";
  return "student";
}

// For www routes whose natural owner IS a student, probe with a teacher instead.
const STUDENT_OWNED = ["/api/v1/me/points", "/api/v1/me/points/history", "/api/v1/me/subjects",
  "/api/v1/me/wallet", "/api/v1/me/wallet/history", "/api/v1/me/family-code",
  "/api/v1/me/family-code/rotate", "/api/v1/me/subscriptions", "/api/v1/me/roster/choice",
  "/api/v1/me/children", "/api/v1/me/subject-requests", "/api/v1/me/credentials"];

async function main() {
  const saCookieOnWww = actors.superadmin.cookie; // superadmin cookie is for the OTHER app
  for (const { app, path, methods } of INV) {
    for (const m of methods) {
      const url = concrete(app, path);
      const meta = { app, method: m, path, url };

      // --- (a) anonymous ---
      const anon = await call(app, m, url, { body: m === "GET" || m === "DELETE" ? undefined : {} });
      const isPublic = PUBLIC.includes(path);
      const isSecret = SECRET_GUARDED.includes(path);
      let verdict, note = "";
      if (isPublic) {
        verdict = anon.status === 401 ? "SUSPICIOUS" : "PASS";
        note = "public route (no session required)";
      } else if (isSecret) {
        verdict = [401, 403].includes(anon.status) ? "PASS" : "FAIL";
        note = "shared-secret guarded; anonymous must be rejected";
      } else if (anon.status === 401) {
        verdict = "PASS"; note = "anonymous rejected";
      } else if ([400, 422].includes(anon.status)) {
        verdict = "SUSPICIOUS"; note = `validation ran BEFORE auth (anonymous got ${anon.status})`;
      } else if (anon.status === 405) {
        verdict = "PASS"; note = "405 (method not routed here)";
      } else {
        verdict = "FAIL"; note = `anonymous NOT rejected (${anon.status})`;
      }
      record({ ...meta, case: "anon", actor: null, status: anon.status, expected: isPublic ? "2xx" : "401", verdict, note, body: (anon.text || "").slice(0, 200) });

      // --- (b) wrong role ---
      if (!isPublic && !isSecret) {
        const wr = STUDENT_OWNED.includes(path) ? "teacher" : wrongRoleFor(app, path);
        const res = await call(app, m, url, { actor: wr, body: m === "GET" || m === "DELETE" ? undefined : {} });
        let v, n = "";
        if ([401, 403, 404].includes(res.status)) { v = "PASS"; n = `wrong role (${actors[wr].role}) rejected`; }
        else if ([400, 422].includes(res.status)) { v = "SUSPICIOUS"; n = `wrong role (${actors[wr].role}) passed the role gate, stopped only by validation (${res.status})`; }
        else if (res.status === 405) { v = "PASS"; n = "405"; }
        else if (res.status >= 500) { v = "SUSPICIOUS"; n = `wrong role (${actors[wr].role}) -> ${res.status} server error: ${(res.text || "").slice(0, 160)}`; }
        else { v = "FAIL"; n = `wrong role (${actors[wr].role}) ALLOWED (${res.status})`; }
        record({ ...meta, case: "wrong-role", actor: wr, status: res.status, expected: "401|403|404", verdict: v, note: n, body: (res.text || "").slice(0, 200) });
      }

      // --- (c) cross-app session (www cookie on superadmin / vice versa) ---
      if (app === "superadmin" && !isPublic && !isSecret && m === "GET") {
        const res = await call(app, m, url, { actor: "centerAdmin" });
        record({
          ...meta, case: "cross-app-session", actor: "centerAdmin", status: res.status,
          expected: "401|403", verdict: [401, 403].includes(res.status) ? "PASS" : "FAIL",
          note: [401, 403].includes(res.status) ? "www session invalid on superadmin app" : `www session ACCEPTED by superadmin app (${res.status})`,
          body: (res.text || "").slice(0, 200),
        });
      }
      if (app === "www" && !isPublic && !isSecret && m === "GET") {
        const res = await call(app, m, url, { headers: { cookie: `next-auth.session-token=${saCookieOnWww.split("=")[1]}` } });
        record({
          ...meta, case: "cross-app-session", actor: "superadmin(cookie)", status: res.status,
          expected: "401|403|404", verdict: [401, 403, 404].includes(res.status) ? "PASS" : "FAIL",
          note: [401, 403, 404].includes(res.status) ? "superadmin token invalid on www" : `superadmin token ACCEPTED by www (${res.status})`,
          body: (res.text || "").slice(0, 200),
        });
      }
    }
  }
  flush("sweep-auth");
}
main();
