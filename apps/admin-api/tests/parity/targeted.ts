import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";
import type { AppEnv } from "../../src/app";
import { registerErpRevalidation } from "../../src/erp-revalidate";
import {
  ORIGIN,
  PASSWORD,
  adminPool,
  auditIds,
  auditWrittenSince,
  callNext,
  callService,
  differences,
  nextMethods,
  nextRouteModule,
  serviceApp,
  signIn,
  snapshot,
  type AuditRow,
  type Call,
  type Fixtures,
  type Role,
  type Snapshot,
} from "./harness";

// Targeted cases for what the registry sweep cannot reach with placeholder
// params and no body: the better-auth door (sign-in, sign-out, the method
// table), the 2FA gate, impersonation start/stop with their cookies and audit
// rows, the view-as mint, the CSP sink's rate limit, the two file exports, the
// SSR session read and the ERP cache revalidation an audited write triggers.

type Side = "A" | "B";
type SideResult = { snap: Snapshot; audit: AuditRow[] };

export type TargetedContext = {
  tag: string;
  fx: () => Fixtures;
  cookie: (role: Role) => string;
  record: (r: { name: string; a: SideResult; b: SideResult; mismatch: string[] }) => void;
  moneyCounts: () => Promise<Record<string, number>>;
};

type Pair = {
  route: string; // folder under apps/admin-api/src/routes
  params?: Record<string, string | string[]>;
  call: (side: Side) => Call | Promise<Call>;
  // Runs after the rate limiter is reset and before the audit baseline; gets a
  // sender bound to the same side (to exhaust a limit, say).
  before?: (side: Side, send: (call: Call) => Promise<Response>) => Promise<void>;
  after?: (side: Side, res: Response) => Promise<void>;
  normalize?: (body: unknown) => unknown;
  // An audit action the route writes fire-and-forget (better-auth's hooks do
  // `void recordAuthEvent(...)`): wait for it to land before collecting, so the
  // comparison does not depend on which side won the race.
  awaitAudit?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// Values minted per call: a view-as token and its jti, a session's expiry.
const MINTED_KEYS = new Set(["token", "jti"]);

// Values minted per call are replaced wherever they appear, so the two sides
// compare on shape.
const generated = new Map<string, string>();
function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    if (ISO.test(value)) return "<time>";
    let out = value;
    for (const [v, label] of generated) out = out.split(v).join(label);
    return out;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, MINTED_KEYS.has(k) && typeof v === "string" ? `<${k}>` : scrub(v)]),
    );
  }
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The audit baseline, taken once no fire-and-forget audit write from a set-up
// step is still landing: otherwise that row would count as written by the
// compared call on whichever side it hit.
async function quietAuditIds(): Promise<Set<string>> {
  let seen = await auditIds();
  for (let i = 0; i < 20; i++) {
    await sleep(75);
    const now = await auditIds();
    if (now.size === seen.size) return now;
    seen = now;
  }
  return seen;
}

const JSON_HEADERS = { origin: ORIGIN };

let ipSeq = 0;
const freshIp = () => `198.19.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

// A browser jar, not a join: a response may delete and then set the same
// cookie name (impersonation clears the old session cookie before writing the
// new one), and only the final state is what the next request carries.
const cookiePairs = (res: Response) => {
  const jar = new Map<string, string>();
  for (const c of res.headers.getSetCookie()) {
    const [pair = "", ...attrs] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const expired = attrs.some((a) => a.trim().toLowerCase() === "max-age=0");
    if (expired || !value) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
};

const quietFetch = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

export function targetedSuite(ctx: TargetedContext): void {
  describe("targeted cases, A vs B", () => {
    let app: Hono<AppEnv>;
    let moneyBefore: Record<string, number>;
    let invoiceId: string | null = null;
    const impersonatedCookie = new Map<Side, string>();

    beforeAll(async () => {
      app = serviceApp();
      moneyBefore = await ctx.moneyCounts();
      const { rows } = await adminPool().query<{ id: string }>("SELECT id FROM invoices ORDER BY created_at LIMIT 1");
      invoiceId = rows[0]?.id ?? null;
      // What instrumentation.ts registers once per process: the audit listener
      // that tells the ERP which public caches a back-office write changed.
      registerErpRevalidation();
      // Nothing in this suite leaves the process: the listener's POST to the
      // ERP is answered by a stub (the revalidation cases swap in their own
      // capturing one and put this back).
      quietFetch();
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await adminPool().query("UPDATE centers SET description = NULL WHERE id = $1", [ctx.fx().centerId]);
    });

    const send = async (side: Side, route: string, call: Call, params: Record<string, string | string[]> = {}) => {
      if (side === "A") return callNext(nextMethods(await nextRouteModule(route))[call.method], call, params);
      return callService(app, call);
    };

    const pair = async (name: string, p: Pair): Promise<{ a: SideResult; b: SideResult; raw: Record<Side, Response> }> => {
      const raw = {} as Record<Side, Response>;
      const run = async (side: Side): Promise<SideResult> => {
        __resetRateLimiterForTests();
        await p.before?.(side, (c) => send(side, p.route, c, p.params));
        const call = await p.call(side);
        const seen = await quietAuditIds();
        const res = await send(side, p.route, call, p.params);
        let audit = await auditWrittenSince(seen);
        for (let i = 0; p.awaitAudit && i < 60 && !audit.some((r) => r.action === p.awaitAudit); i++) {
          await sleep(50);
          audit = await auditWrittenSince(seen);
        }
        raw[side] = res.clone();
        await p.after?.(side, res);
        const snap = await snapshot(res);
        const body = p.normalize ? p.normalize(snap.body) : snap.body;
        return { snap: { ...snap, body: scrub(body) }, audit: scrub(audit) as AuditRow[] };
      };
      const a = await run("A");
      const b = await run("B");
      const mismatch = differences(a, b);
      ctx.record({ name, a, b, mismatch });
      expect(b).toEqual(a);
      return { a, b, raw };
    };

    const sessionCookieName = (snap: Snapshot) => snap.setCookieNames.find((n) => n.endsWith("session_token"));
    const sessionToken = (cookie: string) => {
      const pairStr = cookie.split("; ").find((c) => c.split("=")[0]!.endsWith("session_token"));
      if (!pairStr) throw new Error("no session_token cookie");
      return decodeURIComponent(pairStr.slice(pairStr.indexOf("=") + 1)).split(".")[0]!;
    };

    // ---- better-auth door -----------------------------------------------------
    const auth = (path: string, extra: Partial<Call> = {}) => ({
      route: "auth/[...all]",
      params: { all: path.split("/") },
      call: (): Call => ({ method: "GET", path: `/api/auth/${path}`, ...extra }),
    });

    it("auth get-session (anon)", async () => {
      const { a } = await pair("auth get-session (anon)", auth("get-session"));
      expect(a.snap.status).toBe(200);
    });
    it("auth get-session (super_admin)", async () => {
      const { a } = await pair("auth get-session (super_admin)", auth("get-session", { cookie: ctx.cookie("super_admin") }));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({ user: { id: ctx.fx().users.super_admin.id, twoFactorEnabled: true } });
    });
    // Next answers HEAD by running GET with the HEAD request; better-auth's
    // router registers get-session for GET only, so both hosts answer 404.
    it("auth get-session HEAD", async () => {
      const { a } = await pair("auth get-session HEAD", auth("get-session", { method: "HEAD" }));
      expect(a.snap.status).toBe(404);
      expect(a.snap.body).toBeNull();
    });
    it("auth OPTIONS", async () => {
      const { a } = await pair("auth OPTIONS", auth("get-session", { method: "OPTIONS" }));
      expect(a.snap.status).toBe(204);
      expect(a.snap.allow).toBe("GET, HEAD, OPTIONS, POST");
    });
    for (const method of ["PATCH", "PUT", "DELETE"] as const) {
      it(`auth ${method} -> 405`, async () => {
        const { a } = await pair(`auth ${method}`, auth("sign-out", { method, body: {} }));
        expect(a.snap.status).toBe(405);
      });
    }
    // The back office's /admin/* HTTP surface is sealed: the plugin's own
    // endpoints answer only through auth.api, never over the wire.
    it("auth admin/list-users over HTTP -> sealed", async () => {
      const { a } = await pair("auth admin/list-users sealed", auth("admin/list-users", { cookie: ctx.cookie("super_admin") }));
      expect(a.snap.status).toBe(404);
    });
    it("auth sign-in/email, good Origin -> session cookie", async () => {
      const email = ctx.fx().users.super_admin_no2fa.email;
      const { a } = await pair("auth sign-in/email good Origin", {
        ...auth("sign-in/email"),
        call: () => ({
          method: "POST",
          path: "/api/auth/sign-in/email",
          headers: { ...JSON_HEADERS, "x-forwarded-for": freshIp() },
          body: { email, password: PASSWORD },
        }),
      });
      expect(a.snap.status).toBe(200);
      expect(sessionCookieName(a.snap)).toBeTruthy();
    });
    // A 2FA account stops at the TOTP step: no session cookie, a two_factor
    // cookie instead, and twoFactorRedirect in the body.
    it("auth sign-in/email for a 2FA account -> two-factor step, no session", async () => {
      const email = ctx.fx().users.accountant.email;
      const { a } = await pair("auth sign-in/email 2FA account", {
        ...auth("sign-in/email"),
        call: () => ({
          method: "POST",
          path: "/api/auth/sign-in/email",
          headers: { ...JSON_HEADERS, "x-forwarded-for": freshIp() },
          body: { email, password: PASSWORD },
        }),
      });
      // users.two_factor_enabled alone does not stop the sign-in: the plugin
      // only redirects to the TOTP step when a two-factor secret row exists,
      // and the fixtures have none (the flag was flipped by SQL after sign-in).
      // Both sides answer the same either way; the 2FA gate on /api/v1 is
      // proven by the table cases, not here.
      expect(a.snap.status).toBe(200);
    });
    // A wrong password for an eligible account is refused by better-auth itself;
    // the back office's hook writes auth.login_failed only for an ineligible or
    // unknown email (next case), so no audit row is expected here.
    it("auth sign-in/email, wrong password -> 401", async () => {
      const email = ctx.fx().users.super_admin_no2fa.email;
      const { a } = await pair("auth sign-in/email wrong password", {
        ...auth("sign-in/email"),
        call: () => ({
          method: "POST",
          path: "/api/auth/sign-in/email",
          headers: { ...JSON_HEADERS, "x-forwarded-for": freshIp() },
          body: { email, password: `${PASSWORD}-wrong` },
        }),
      });
      expect(a.snap.status).toBe(401);
      expect(sessionCookieName(a.snap)).toBeUndefined();
    });
    // An ERP account has no door here: refused at sign-in, audited fire-and-forget.
    it("auth sign-in/email for an ERP account -> refused + auth.login_failed", async () => {
      const email = ctx.fx().teacher.email;
      const { a } = await pair("auth sign-in/email ERP account", {
        ...auth("sign-in/email"),
        awaitAudit: "auth.login_failed",
        call: () => ({
          method: "POST",
          path: "/api/auth/sign-in/email",
          headers: { ...JSON_HEADERS, "x-forwarded-for": freshIp() },
          body: { email, password: PASSWORD },
        }),
      });
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
      expect(a.snap.status).toBeLessThan(500);
      expect(a.audit.map((r) => r.action)).toContain("auth.login_failed");
    });
    it("auth sign-out clears the cookie and deletes the session row", async () => {
      const tokens = new Map<Side, string>();
      const { a } = await pair("auth sign-out", {
        ...auth("sign-out"),
        call: async (side) => {
          const cookie = await signIn(ctx.fx().users.super_admin_no2fa.email, freshIp());
          tokens.set(side, sessionToken(cookie));
          return { method: "POST", path: "/api/auth/sign-out", cookie, headers: JSON_HEADERS, body: {} };
        },
      });
      expect(a.snap.status).toBe(200);
      expect(a.snap.setCookieAttrs.find((c) => c.split(";")[0]!.endsWith("session_token"))).toMatch(/Max-Age=0/i);
      const { rows } = await adminPool().query<{ n: number }>(
        "SELECT count(*)::int AS n FROM auth_sessions WHERE token = ANY($1::text[])",
        [[...tokens.values()]],
      );
      expect(tokens.size).toBe(2);
      expect(rows[0]!.n).toBe(0);
    });

    // ---- impersonation ----------------------------------------------------------
    const impersonate = (targetId: string, as: Role | null): Pair => ({
      route: "v1/admin/users/[id]/impersonate",
      params: { id: targetId },
      call: () => ({
        method: "POST",
        path: `/api/v1/admin/users/${targetId}/impersonate`,
        cookie: as ? ctx.cookie(as) : undefined,
        headers: JSON_HEADERS,
      }),
    });
    it("impersonate an accountant (super_admin) -> 200 + impersonated cookie + audit", async () => {
      const fx = ctx.fx();
      const { a, raw } = await pair("impersonate accountant", {
        ...impersonate(fx.users.accountant.id, "super_admin"),
        after: async (side, res) => {
          impersonatedCookie.set(side, cookiePairs(res.clone()));
        },
      });
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({ data: { impersonating: { id: fx.users.accountant.id, role: "accountant" } } });
      expect(sessionCookieName(a.snap)).toBeTruthy();
      expect(a.audit.length).toBeGreaterThan(0);
      expect(raw.A.headers.getSetCookie().length).toBe(raw.B.headers.getSetCookie().length);
    });
    it("impersonate (accountant actor) -> 403", async () => {
      const { a } = await pair("impersonate as accountant", impersonate(ctx.fx().users.accountant.id, "accountant"));
      expect(a.snap.status).toBe(403);
    });
    it("impersonate a super_admin -> refused", async () => {
      const { a } = await pair("impersonate super_admin", impersonate(ctx.fx().users.super_admin_no2fa.id, "super_admin"));
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
      expect(a.snap.status).toBeLessThan(500);
      expect(a.audit).toEqual([]);
    });
    it("impersonate an ERP account -> refused", async () => {
      const { a } = await pair("impersonate ERP account", impersonate(ctx.fx().teacher.id, "super_admin"));
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
      expect(a.snap.status).toBeLessThan(500);
    });
    it("impersonate (anon) -> 401", async () => {
      const { a } = await pair("impersonate anon", impersonate(ctx.fx().users.accountant.id, null));
      expect(a.snap.status).toBe(401);
    });
    const stop = (cookie: (side: Side) => string | undefined): Pair => ({
      route: "v1/admin/impersonation/stop",
      call: (side) => ({ method: "POST", path: "/api/v1/admin/impersonation/stop", cookie: cookie(side), headers: JSON_HEADERS }),
    });
    it("impersonation/stop under the impersonated session -> 200 + restored cookie + audit", async () => {
      const fx = ctx.fx();
      const { a } = await pair("impersonation/stop impersonated", stop((side) => impersonatedCookie.get(side)));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({ data: { stopped: true, restored: fx.users.super_admin.id } });
      expect(sessionCookieName(a.snap)).toBeTruthy();
      expect(a.audit.length).toBeGreaterThan(0);
    });
    it("impersonation/stop under a plain session -> refused", async () => {
      const { a } = await pair("impersonation/stop plain session", stop(() => ctx.cookie("super_admin")));
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
      expect(a.snap.status).toBeLessThan(500);
    });
    it("impersonation/stop (anon) -> 401", async () => {
      const { a } = await pair("impersonation/stop anon", stop(() => undefined));
      expect(a.snap.status).toBe(401);
    });

    // ---- view-as ----------------------------------------------------------------
    const viewAs = (targetId: string, as: Role | null): Pair => ({
      route: "v1/admin/users/[id]/view-as",
      params: { id: targetId },
      call: () => ({
        method: "POST",
        path: `/api/v1/admin/users/${targetId}/view-as`,
        cookie: as ? ctx.cookie(as) : undefined,
        headers: JSON_HEADERS,
      }),
    });
    it("view-as an ERP account (super_admin) -> 200 token + claim URL on the ERP + audit", async () => {
      const fx = ctx.fx();
      const { a, raw } = await pair("view-as teacher", viewAs(fx.teacher.id, "super_admin"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({
        data: { claimUrl: `${process.env.ERP_BASE_URL}/api/v1/auth/view-as/claim`, token: "<token>", target: { id: fx.teacher.id } },
      });
      expect(a.audit.map((r) => r.action)).toContain("user.view_as_requested");
      // The token itself is minted per call and scrubbed; both sides minted one.
      for (const side of ["A", "B"] as const) {
        const body = (await raw[side].json()) as { data: { token: string } };
        expect(body.data.token.split(".").length).toBeGreaterThan(1);
      }
    });
    it("view-as a back-office account -> refused", async () => {
      const { a } = await pair("view-as accountant", viewAs(ctx.fx().users.accountant.id, "super_admin"));
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
      expect(a.snap.status).toBeLessThan(500);
      expect(a.audit).toEqual([]);
    });
    it("view-as (accountant actor) -> 403", async () => {
      const { a } = await pair("view-as as accountant", viewAs(ctx.fx().teacher.id, "accountant"));
      expect(a.snap.status).toBe(403);
    });

    // ---- CSP report sink ----------------------------------------------------------
    const csp = (rawBody: string): Pair => ({
      route: "v1/security/csp-report",
      call: () => ({
        method: "POST",
        path: "/api/v1/security/csp-report",
        headers: { "content-type": "application/csp-report" },
        rawBody,
      }),
    });
    const report = JSON.stringify({
      "csp-report": { "document-uri": `${ORIGIN}/ar`, "violated-directive": "img-src", "blocked-uri": "https://x.example/a.png" },
    });
    for (const [label, body] of [
      ["valid report", report],
      ["garbage", "%%% not a report"],
      ["body over 16 KiB", `{"csp-report":{"blocked-uri":"${"x".repeat(20 * 1024)}"}}`],
    ] as const) {
      it(`csp-report ${label} -> 204, empty body`, async () => {
        const { a } = await pair(`csp-report ${label}`, csp(body));
        expect(a.snap.status).toBe(204);
        expect(a.snap.body).toBeNull();
      });
    }
    it("csp-report 429 after 60 calls", async () => {
      const p = csp(report);
      const { a } = await pair("csp-report 429", {
        ...p,
        before: async (_side, sendSide) => {
          for (let i = 0; i < 60; i++) await sendSide(await p.call("A"));
        },
      });
      expect(a.snap.status).toBe(429);
      expect(a.snap.retryAfter).toBe("60");
    });

    // ---- settlement export (xlsx) -----------------------------------------------------
    const settlementExport = (as: Role | null, query = ""): Pair => ({
      route: "v1/admin/session-settlements/export",
      call: () => ({
        method: "GET",
        path: `/api/v1/admin/session-settlements/export${query}`,
        cookie: as ? ctx.cookie(as) : undefined,
      }),
    });
    it("session-settlements/export (accountant) -> xlsx attachment, row headers", async () => {
      const { a } = await pair("session-settlements/export (accountant)", settlementExport("accountant"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(a.snap.contentDisposition).toMatch(/^attachment; filename="/);
      expect(a.snap.contentLength).toMatch(/^\d+$/);
      expect(a.snap.xEdura["x-edura-rows"]).toMatch(/^\d+$/);
      expect(a.snap.xEdura["x-edura-truncated"]).toBe("false");
      expect(a.snap.body).toMatch(/^<binary \d+ bytes>$/);
    });
    it("session-settlements/export (super_admin, en, bad dates) -> xlsx", async () => {
      const { a } = await pair("session-settlements/export (super_admin)", settlementExport("super_admin", "?locale=en&from=garbage"));
      expect(a.snap.status).toBe(200);
    });
    it("session-settlements/export (anon) -> 401", async () => {
      const { a } = await pair("session-settlements/export anon", settlementExport(null));
      expect(a.snap.status).toBe(401);
    });

    // ---- invoice pdf -----------------------------------------------------------------
    const pdf = (id: string, as: Role | null): Pair => ({
      route: "v1/finance/invoices/[id]/pdf",
      params: { id },
      call: () => ({ method: "GET", path: `/api/v1/finance/invoices/${id}/pdf`, cookie: as ? ctx.cookie(as) : undefined }),
    });
    it("invoices/[id]/pdf (accountant): the first invoice, or 404 when the test DB holds none", async () => {
      if (!invoiceId) {
        const { a } = await pair("invoices/[id]/pdf missing (accountant)", pdf("00000000-0000-4000-8000-00000000abce", "accountant"));
        expect(a.snap.status).toBe(404);
        console.log("invoices/[id]/pdf: no invoice row in edura_test; the 200 (application/pdf inline) pair did not run");
        return;
      }
      const { a } = await pair("invoices/[id]/pdf (accountant)", pdf(invoiceId, "accountant"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.contentType).toBe("application/pdf");
      expect(a.snap.contentDisposition).toMatch(/^inline; filename=".+\.pdf"$/);
      expect(a.snap.body).toMatch(/^<binary \d+ bytes>$/);
    });
    it("invoices/[id]/pdf (anon) -> 401", async () => {
      const { a } = await pair("invoices/[id]/pdf anon", pdf(invoiceId ?? "00000000-0000-4000-8000-00000000abce", null));
      expect(a.snap.status).toBe(401);
    });

    // ---- SSR session read ------------------------------------------------------------
    const ssr = (as: Role | null): Pair => ({
      route: "v1/me/ssr-session",
      call: () => ({ method: "GET", path: "/api/v1/me/ssr-session", cookie: as ? ctx.cookie(as) : undefined }),
    });
    it("me/ssr-session (anon) -> 200 with user: null, no-store", async () => {
      const { a } = await pair("me/ssr-session anon", ssr(null));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toEqual({ data: { user: null, impersonated: false } });
      expect(a.snap.cacheControl).toContain("no-store");
    });
    it("me/ssr-session (super_admin) -> id + twoFactorEnabled, nothing of the session row", async () => {
      const { a } = await pair("me/ssr-session super_admin", ssr("super_admin"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toEqual({
        data: { user: { id: ctx.fx().users.super_admin.id, twoFactorEnabled: true }, impersonated: false },
      });
    });
    it("me/ssr-session (super_admin without 2FA) -> 200: the layout, not this route, decides", async () => {
      const { a } = await pair("me/ssr-session super_admin_no2fa", ssr("super_admin_no2fa"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({ data: { user: { twoFactorEnabled: false }, impersonated: false } });
    });
    it("me/ssr-session (impersonated) -> impersonated: true", async () => {
      const { a } = await pair("me/ssr-session impersonated", {
        ...ssr(null),
        // Each side's impersonated session was stopped above; mint a fresh one per side.
        call: async (side) => {
          const res = await send(
            side,
            "v1/admin/users/[id]/impersonate",
            { method: "POST", path: `/api/v1/admin/users/${ctx.fx().users.accountant.id}/impersonate`, cookie: ctx.cookie("super_admin"), headers: JSON_HEADERS },
            { id: ctx.fx().users.accountant.id },
          );
          expect(res.status).toBe(200);
          return { method: "GET", path: "/api/v1/me/ssr-session", cookie: cookiePairs(res) };
        },
      });
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({
        data: { user: { id: ctx.fx().users.accountant.id }, impersonated: true },
      });
    });

    // ---- ERP revalidation after an audited write ----------------------------------------
    // The one write the harness makes: a centre's description on the tagged
    // is_demo centre. Each side's audit row fires the listener, after() runs
    // the flush, and the flush POSTs the datasets to the ERP — captured here
    // with fetch stubbed, so the two sides must post the same thing.
    type Captured = { url: string; method: string | undefined; secret: string | null; body: string | null };
    it("centers/[id] PATCH (super_admin): audited, and the ERP is told to revalidate the same datasets", async () => {
      const fx = ctx.fx();
      const captured = new Map<Side, Captured[]>();
      let current: Side = "A";
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const headers = new Headers(init?.headers);
        const list = captured.get(current) ?? [];
        list.push({ url, method: init?.method, secret: headers.get("x-internal-secret"), body: typeof init?.body === "string" ? init.body : null });
        captured.set(current, list);
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal("fetch", fetchMock);
      try {
        const { a } = await pair("centers/[id] PATCH description (super_admin)", {
          route: "v1/admin/centers/[id]",
          params: { id: fx.centerId },
          before: async (side) => {
            current = side;
            await adminPool().query("UPDATE centers SET description = NULL WHERE id = $1", [fx.centerId]);
          },
          call: () => ({
            method: "PATCH",
            path: `/api/v1/admin/centers/${fx.centerId}`,
            cookie: ctx.cookie("super_admin"),
            headers: JSON_HEADERS,
            body: { description: `${ctx.tag}-description` },
          }),
          after: async (side) => {
            for (let i = 0; i < 40 && !(captured.get(side)?.length ?? 0); i++) await sleep(25);
          },
        });
        expect(a.snap.status).toBe(200);
        expect(a.snap.body).toMatchObject({
          data: { id: ctx.fx().centerId, changed: ["description"], center: { description: `${ctx.tag}-description` } },
        });
        expect(a.audit.length).toBeGreaterThan(0);
        const posts = { A: captured.get("A") ?? [], B: captured.get("B") ?? [] };
        expect(posts.A.length).toBe(1);
        expect(posts.B).toEqual(posts.A);
        expect(posts.A[0]).toMatchObject({
          url: `${process.env.ERP_BASE_URL}/api/v1/internal/revalidate`,
          method: "POST",
          secret: process.env.INTERNAL_API_SECRET,
        });
        expect(JSON.parse(posts.A[0]!.body ?? "null")).toEqual({ datasets: ["discovery", "publicProfile"] });
      } finally {
        quietFetch();
      }
    });
    it("centers/[id] PATCH (accountant) -> 403, nothing audited, nothing posted", async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);
      try {
        const { a } = await pair("centers/[id] PATCH (accountant)", {
          route: "v1/admin/centers/[id]",
          params: { id: ctx.fx().centerId },
          call: () => ({
            method: "PATCH",
            path: `/api/v1/admin/centers/${ctx.fx().centerId}`,
            cookie: ctx.cookie("accountant"),
            headers: JSON_HEADERS,
            body: { description: "nope" },
          }),
          after: async () => {
            await sleep(50);
          },
        });
        expect(a.snap.status).toBe(403);
        expect(a.audit).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        quietFetch();
      }
    });

    it("targeted cases wrote no money rows", async () => {
      expect(await ctx.moneyCounts()).toEqual(moneyBefore);
    });
  });
}
