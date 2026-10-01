import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mintViewAsToken } from "@repo/server-core/auth/view-as-token";
import { __resetPublicStoreForTests } from "@repo/server-core/cache/public-store";
import { __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";
import { signMockWebhook } from "@repo/server-core/services/payments/gateway/index";
import type { AppEnv } from "../../src/app";
import {
  ORIGIN,
  PASSWORD,
  adminPool,
  auditIds,
  auditWrittenSince,
  callNext,
  callService,
  differences,
  apiRoute,
  nextMethods,
  serviceApp,
  signIn,
  snapshot,
  type AuditRow,
  type Call,
  type Fixtures,
  type Snapshot,
} from "./harness";

// Targeted cases for the routes that moved last (auth, view-as, cron, the
// Paymob webhook, the CSP sink, data-rights export download, the CSV report
// export, and the five public-store reads). The registry sweep already calls
// each of them with placeholder params; these drive the paths the sweep cannot
// reach: real secrets and signatures, redirects with cookies, rate limits,
// file downloads, and a cache invalidation that has to cross hosts.

type Role = keyof Fixtures["users"];
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
  route: string; // folder under apps/api/src/routes
  params?: Record<string, string | string[]>;
  call: (side: Side) => Call | Promise<Call>;
  // Runs after the rate limiter is reset and before the audit baseline; gets a
  // sender bound to the same side (to exhaust a limit, say).
  before?: (side: Side, send: (call: Call) => Promise<Response>) => Promise<void>;
  after?: (side: Side, res: Response) => Promise<void>;
  normalize?: (body: unknown) => unknown;
  // An audit action the route writes fire-and-forget (better-auth's session
  // hook does `void recordAuthEvent(...)`): wait for it to land before
  // collecting, so the comparison does not depend on which side won the race.
  awaitAudit?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Values minted per call (session tokens, view-as jti) are replaced wherever
// they appear, so the two sides compare on shape.
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
      Object.entries(value).map(([k, v]) => [k, k === "token" && typeof v === "string" ? "<token>" : scrub(v)]),
    );
  }
  return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The audit baseline, taken once no fire-and-forget audit write from a set-up
// step (a sign-in's auth.login_succeeded, say) is still landing: otherwise that
// row would count as written by the compared call on whichever side it hit.
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
const FORM = { "content-type": "application/x-www-form-urlencoded" };

let ipSeq = 0;
const freshIp = () => `198.19.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

export function targetedSuite(ctx: TargetedContext): void {
  describe("moved routes: targeted cases, A vs B", () => {
    let app: Hono<AppEnv>;
    let moneyBefore: Record<string, number>;
    const readyExportId = "00000000-0000-4000-8000-0000000000e1";
    const pendingExportId = "00000000-0000-4000-8000-0000000000e2";
    const viewAsCookie = new Map<Side, string>();

    beforeAll(async () => {
      app = serviceApp();
      moneyBefore = await ctx.moneyCounts();
      const fx = ctx.fx();
      await adminPool().query(
        `INSERT INTO data_export_requests (id, user_id, requested_by, status, requested_at, completed_at, expires_at, payload, byte_size, updated_at)
         VALUES ($1, $2, $2, 'ready', now(), now(), now() + interval '1 day', $3::jsonb, 32, now())`,
        [readyExportId, fx.users.student.id, JSON.stringify({ parity: true, tag: ctx.tag })],
      );
    });

    afterAll(async () => {
      const fx = ctx.fx();
      if (!fx) return;
      await adminPool().query("DELETE FROM data_export_requests WHERE user_id = $1", [fx.users.student.id]);
    });

    const send = async (side: Side, route: string, call: Call, params: Record<string, string | string[]> = {}) => {
      if (side === "A") return callNext(nextMethods(await apiRoute(route))[call.method], call, params);
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

    // ---- better-auth ---------------------------------------------------------
    const auth = (path: string, extra: Partial<Call> = {}) => ({
      route: "auth/[...all]",
      params: { all: path.split("/") },
      call: (): Call => ({ method: "GET", path: `/api/auth/${path}`, ...extra }),
    });

    it("auth get-session (anon)", async () => {
      const { a } = await pair("auth get-session (anon)", auth("get-session"));
      expect(a.snap.status).toBe(200);
    });
    it("auth get-session (student)", async () => {
      const { a } = await pair("auth get-session (student)", auth("get-session", { cookie: ctx.cookie("student") }));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({ user: { id: ctx.fx().users.student.id } });
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
    it("auth sign-in/email, good Origin", async () => {
      const email = ctx.fx().users.student.email;
      const { a } = await pair("auth sign-in/email good Origin", {
        ...auth("sign-in/email"),
        awaitAudit: "auth.login_succeeded",
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
    // better-auth turns its own origin check off when NODE_ENV is "test"
    // (create-context: skipOriginCheck = isTest(), read once at import), and
    // vitest runs with NODE_ENV=test, so the 403 is unreachable in this process
    // on either host. These two cases pin that both hosts still agree on a
    // wrong Origin, with and without a session cookie; the 403 itself is not
    // covered here.
    it("auth sign-in/email, wrong Origin with a cookie", async () => {
      const email = ctx.fx().users.student.email;
      const { a } = await pair("auth sign-in/email wrong Origin (cookie)", {
        ...auth("sign-in/email"),
        call: () => ({
          method: "POST",
          path: "/api/auth/sign-in/email",
          cookie: ctx.cookie("student"),
          headers: { origin: "https://evil.example", "x-forwarded-for": freshIp() },
          body: { email, password: PASSWORD },
        }),
        awaitAudit: "auth.login_succeeded",
      });
      expect(a.snap.status).toBe(200);
    });
    it("auth sign-in/email, wrong Origin without a cookie", async () => {
      const email = ctx.fx().users.student.email;
      const { a } = await pair("auth sign-in/email wrong Origin (no cookie)", {
        ...auth("sign-in/email"),
        awaitAudit: "auth.login_succeeded",
        call: () => ({
          method: "POST",
          path: "/api/auth/sign-in/email",
          headers: { origin: "https://evil.example", "x-forwarded-for": freshIp() },
          body: { email, password: PASSWORD },
        }),
      });
      expect(a.snap.status).toBe(200);
    });
    it("auth sign-out clears the cookie and deletes the session row", async () => {
      const tokens = new Map<Side, string>();
      const { a } = await pair("auth sign-out", {
        ...auth("sign-out"),
        call: async (side) => {
          const cookie = await signIn(ctx.fx().users.parent.email, freshIp());
          const pairStr = cookie.split("; ").find((c) => c.split("=")[0]!.endsWith("session_token"))!;
          tokens.set(side, decodeURIComponent(pairStr.slice(pairStr.indexOf("=") + 1)).split(".")[0]!);
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

    // ---- view-as ------------------------------------------------------------
    const claim = (token: string | null): Pair => ({
      route: "v1/auth/view-as/claim",
      call: () => ({
        method: "POST",
        path: "/api/v1/auth/view-as/claim",
        headers: { ...FORM, "x-forwarded-for": freshIp() },
        rawBody: token === null ? "" : `token=${encodeURIComponent(token)}`,
      }),
    });
    it("view-as claim without a token -> 303 /login", async () => {
      const { a } = await pair("view-as claim no token", claim(null));
      expect(a.snap.status).toBe(303);
      expect(a.snap.location).toBe(`${process.env.NEXTAUTH_URL}/login`);
    });
    it("view-as claim with a forged token -> 303 /login", async () => {
      const { token } = mintViewAsToken({
        targetUserId: ctx.fx().users.teacher.id,
        actorUserId: ctx.fx().superAdminId,
        targetRole: "teacher",
      });
      const [body] = token.split(".");
      const { a } = await pair("view-as claim forged token", claim(`${body}.forgedsignature`));
      expect(a.snap.status).toBe(303);
      expect(a.snap.location).toBe(`${process.env.NEXTAUTH_URL}/login`);
    });
    it("view-as claim with a valid token -> 303 /ar/dashboard + session + audit", async () => {
      const { a, raw } = await pair("view-as claim valid token", {
        ...claim(null),
        awaitAudit: "auth.login_succeeded",
        call: () => {
          const { token, jti } = mintViewAsToken({
            targetUserId: ctx.fx().users.teacher.id,
            actorUserId: ctx.fx().superAdminId,
            targetRole: "teacher",
          });
          generated.set(jti, "<jti>");
          return {
            method: "POST",
            path: "/api/v1/auth/view-as/claim",
            headers: { ...FORM, "x-forwarded-for": freshIp() },
            rawBody: `token=${encodeURIComponent(token)}`,
          };
        },
      });
      expect(a.snap.status).toBe(303);
      expect(a.snap.location).toBe(`${process.env.NEXTAUTH_URL}/ar/dashboard`);
      expect(sessionCookieName(a.snap)).toBeTruthy();
      expect(a.audit.map((r) => r.action)).toContain("user.view_as_claimed");
      for (const side of ["A", "B"] as const) {
        viewAsCookie.set(
          side,
          raw[side].headers
            .getSetCookie()
            .map((c) => c.split(";")[0]!)
            .join("; "),
        );
      }
    });
    it("view-as stop (anon) -> 303 NEXTAUTH_URL/dashboard", async () => {
      const { a } = await pair("view-as stop anon", {
        route: "v1/auth/view-as/stop",
        call: () => ({ method: "POST", path: "/api/v1/auth/view-as/stop" }),
      });
      expect(a.snap.status).toBe(303);
      expect(a.snap.location).toBe(`${process.env.NEXTAUTH_URL}/dashboard`);
    });
    it("view-as stop (view-as session) -> 303 back-office + cleared cookie + audit", async () => {
      const { a } = await pair("view-as stop view-as session", {
        route: "v1/auth/view-as/stop",
        call: (side) => ({ method: "POST", path: "/api/v1/auth/view-as/stop", cookie: viewAsCookie.get(side) }),
      });
      expect(a.snap.status).toBe(303);
      expect(a.snap.location).toBe(`${process.env.SUPERADMIN_BASE_URL}/dashboard`);
      expect(a.snap.setCookieAttrs.find((c) => c.split(";")[0]!.endsWith("session_token"))).toMatch(/Max-Age=0/i);
      expect(a.audit.map((r) => r.action)).toContain("user.view_as_ended");
    });

    // ---- cron ---------------------------------------------------------------
    // expire-collaboration-requests writes no money row; a warm-up call first
    // settles whatever is due, so both sides then see the same (empty) batch.
    const JOB = "expire-collaboration-requests";
    const cron = (headers: Record<string, string>, job = JOB, method: Call["method"] = "POST"): Pair => ({
      route: "v1/cron/[job]",
      params: { job },
      call: () => ({ method, path: `/api/v1/cron/${job}`, headers }),
    });
    const secret = () => process.env.CRON_SECRET ?? "";
    it("cron without CRON_SECRET configured -> 401", async () => {
      const saved = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;
      try {
        const { a } = await pair("cron CRON_SECRET unset", cron({ authorization: `Bearer ${saved}` }));
        expect(a.snap.status).toBe(401);
      } finally {
        process.env.CRON_SECRET = saved;
      }
    });
    it("cron wrong secret -> 401", async () => {
      const { a } = await pair("cron wrong secret", cron({ authorization: "Bearer not-the-secret" }));
      expect(a.snap.status).toBe(401);
    });
    it("cron Bearer -> 200", async () => {
      await send("B", "v1/cron/[job]", { method: "POST", path: `/api/v1/cron/${JOB}`, headers: { authorization: `Bearer ${secret()}` } });
      const { a } = await pair("cron Bearer", cron({ authorization: `Bearer ${secret()}` }));
      expect(a.snap.status).toBe(200);
    });
    it("cron x-cron-secret -> 200", async () => {
      const { a } = await pair("cron x-cron-secret", cron({ "x-cron-secret": secret() }));
      expect(a.snap.status).toBe(200);
    });
    // BusinessRuleError is a 422 in the envelope, on both hosts.
    it("cron unknown job -> 422", async () => {
      const { a } = await pair("cron unknown job", cron({ authorization: `Bearer ${secret()}` }, "parity-no-such-job"));
      expect(a.snap.status).toBe(422);
    });
    it("cron GET -> 405", async () => {
      const { a } = await pair("cron GET", cron({ authorization: `Bearer ${secret()}` }, JOB, "GET"));
      expect(a.snap.status).toBe(405);
    });

    // ---- Paymob webhook (PAYMENTS_MODE=mock) ----------------------------------
    const hook = (rawBody: string, hmac: string | null): Pair => ({
      route: "v1/payments/paymob/webhook",
      call: () => ({
        method: "POST",
        path: `/api/v1/payments/paymob/webhook${hmac === null ? "" : `?hmac=${hmac}`}`,
        headers: { "content-type": "application/json" },
        rawBody,
      }),
    });
    const unknownOrder = () =>
      JSON.stringify({ gateway_order_id: `${ctx.tag}-no-such-order`, success: true, amount_cents: 100, currency: "EGP" });
    it("webhook: PAYMENTS_MODE is mock", () => {
      expect(process.env.PAYMENTS_MODE).toBe("mock");
    });
    it("webhook bad HMAC -> 401 invalid_signature", async () => {
      const { a } = await pair("webhook bad HMAC", hook(unknownOrder(), "deadbeef"));
      expect(a.snap.status).toBe(401);
      expect(a.snap.body).toMatchObject({ error: { code: "invalid_signature" } });
    });
    it("webhook missing HMAC -> 401", async () => {
      const { a } = await pair("webhook missing HMAC", hook(unknownOrder(), null));
      expect(a.snap.status).toBe(401);
    });
    it("webhook signed, unknown order -> 200 ignored", async () => {
      const body = unknownOrder();
      const { a } = await pair("webhook ignored event", hook(body, signMockWebhook(body)));
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toMatchObject({ data: { ignored: true } });
    });
    it("webhook signed non-JSON body", async () => {
      const body = "this is not json";
      const { a } = await pair("webhook non-JSON", hook(body, signMockWebhook(body)));
      expect(a.snap.status).toBe(401);
    });
    it("webhook 429 after 120 calls", async () => {
      const p = hook(unknownOrder(), "deadbeef");
      const { a } = await pair("webhook 429", {
        ...p,
        before: async (_side, sendSide) => {
          for (let i = 0; i < 120; i++) await sendSide(await p.call("A"));
        },
      });
      expect(a.snap.status).toBe(429);
    });

    // ---- CSP report sink ------------------------------------------------------
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
    });

    // ---- data-rights export download -------------------------------------------
    const exportCall = (id: string, as: Role | null, method: Call["method"] = "GET"): Pair => ({
      route: "v1/me/data-rights/exports/[id]",
      params: { id },
      call: () => ({ method, path: `/api/v1/me/data-rights/exports/${id}`, cookie: as ? ctx.cookie(as) : undefined }),
    });
    it("data export GET (owner) -> 200 attachment, no-store", async () => {
      const { a } = await pair("data export GET owner", exportCall(readyExportId, "student"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.contentType).toBe("application/json; charset=utf-8");
      expect(a.snap.contentDisposition).toMatch(/^attachment; filename="edura-data-/);
      expect(a.snap.cacheControl).toBe("no-store, private");
    });
    it("data export GET missing id -> 404", async () => {
      const { a } = await pair("data export GET missing", exportCall("00000000-0000-4000-8000-0000000000e9", "student"));
      expect(a.snap.status).toBe(404);
    });
    it("data export GET (another user) -> refused", async () => {
      const { a } = await pair("data export GET other user", exportCall(readyExportId, "teacher"));
      expect(a.snap.status).toBe(403);
    });
    it("data export GET (anon) -> 401", async () => {
      const { a } = await pair("data export GET anon", exportCall(readyExportId, null));
      expect(a.snap.status).toBe(401);
    });
    it("data export DELETE a queued export -> 200 cancelled", async () => {
      const { a } = await pair("data export DELETE queued", {
        ...exportCall(pendingExportId, "student", "DELETE"),
        before: async () => {
          await adminPool().query(
            `INSERT INTO data_export_requests (id, user_id, requested_by, status, updated_at) VALUES ($1, $2, $2, 'pending', now())`,
            [pendingExportId, ctx.fx().users.student.id],
          );
        },
        after: async () => {
          await adminPool().query("DELETE FROM data_export_requests WHERE id = $1", [pendingExportId]);
        },
      });
      expect(a.snap.status).toBe(200);
      expect(a.snap.body).toEqual({ data: { cancelled: true } });
    });
    it("data export DELETE a ready export -> refused", async () => {
      const { a } = await pair("data export DELETE ready", exportCall(readyExportId, "student", "DELETE"));
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
    });

    // ---- CSV report export ------------------------------------------------------
    // The CSV carries its export time to the minute; the two sides may straddle one.
    const minute = (body: unknown) =>
      typeof body === "string" ? body.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, "<minute>") : body;
    const reportCall = (query: string, as: Role | null): Pair => ({
      route: "v1/reports/export",
      call: () => ({ method: "GET", path: `/api/v1/reports/export?${query}`, cookie: as ? ctx.cookie(as) : undefined }),
      normalize: minute,
    });
    it("reports/export csv (center_admin) -> text/csv attachment, no-store, BOM", async () => {
      const { a } = await pair("reports/export expenses (center_admin)", reportCall("report=expenses", "center_admin"));
      expect(a.snap.status).toBe(200);
      expect(a.snap.contentType).toBe("text/csv; charset=utf-8");
      expect(a.snap.contentDisposition).toMatch(/^attachment; filename="expenses-\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(a.snap.cacheControl).toBe("no-store");
      expect(String(a.snap.body).startsWith("﻿")).toBe(true);
    });
    it("reports/export net-profit (manager) -> refused", async () => {
      const { a } = await pair("reports/export net-profit (manager)", reportCall("report=net-profit", "manager"));
      expect(a.snap.status).toBeGreaterThanOrEqual(400);
      expect(a.snap.status).toBeLessThan(500);
    });
    it("reports/export unknown report -> 422", async () => {
      const { a } = await pair("reports/export unknown", reportCall("report=parity-nope", "center_admin"));
      expect(a.snap.status).toBe(422);
    });
    it("reports/export anon -> 401", async () => {
      const { a } = await pair("reports/export anon", reportCall("report=expenses", null));
      expect(a.snap.status).toBe(401);
    });

    // ---- public-store reads -------------------------------------------------------
    // Each side starts from an empty store here, so each runs its own loader;
    // the invalidation case below keeps one store across both sides on purpose.
    const cached = (name: string, path: string, route: string, as: Role | null, params?: Record<string, string>) =>
      it(`cache read ${name}`, async () => {
        const { a } = await pair(`cache read ${name}`, {
          route,
          params: params ?? (route === "v1/centers/[id]" ? { id: ctx.fx().centerId } : undefined),
          before: async () => __resetPublicStoreForTests(),
          call: () => ({
            method: "GET",
            path: path.replace("<center>", ctx.fx().centerId).replace("<grade>", ctx.fx().gradeLevelId),
            cookie: as ? ctx.cookie(as) : undefined,
          }),
        });
        expect(a.snap.status).toBeLessThan(500);
      });
    cached("centers/[id] anon", "/api/v1/centers/<center>", "v1/centers/[id]", null);
    cached("search/teacher-days anon", "/api/v1/search/teacher-days", "v1/search/teacher-days", null);
    cached("search/courses anon", "/api/v1/search/courses", "v1/search/courses", null);
    cached("search/courses scope=all (student)", "/api/v1/search/courses?scope=all", "v1/search/courses", "student");
    cached("catalog/tree anon", "/api/v1/catalog/tree", "v1/catalog/tree", null);
    cached("catalog/tree (student)", "/api/v1/catalog/tree", "v1/catalog/tree", "student");
    cached("catalog/subjects all=1 anon", "/api/v1/catalog/subjects?all=1", "v1/catalog/subjects", null);
    cached("catalog/subjects all=1 (student)", "/api/v1/catalog/subjects?all=1", "v1/catalog/subjects", "student");
    cached("catalog/subjects gradeLevelIds (student)", "/api/v1/catalog/subjects?gradeLevelIds=<grade>", "v1/catalog/subjects", "student");

    it("cache: a write on either host is visible to both on the next read", async () => {
      const fx = ctx.fx();
      const centerId = fx.centerId;
      const read = async (side: Side) => {
        const res = await send(side, "v1/centers/[id]", { method: "GET", path: `/api/v1/centers/${centerId}` }, { id: centerId });
        const snap = await snapshot(res);
        expect(snap.status).toBe(200);
        return (snap.body as { data: { description?: string | null } }).data.description ?? null;
      };
      const patch = async (side: Side, description: string) => {
        const res = await send(side, "v1/centers/me", {
          method: "PATCH",
          path: "/api/v1/centers/me",
          cookie: ctx.cookie("center_admin"),
          body: { description },
        });
        expect(res.status).toBe(200);
      };
      __resetPublicStoreForTests();
      await read("B"); // warm the shared store
      await patch("A", `${ctx.tag}-desc-A`);
      expect([await read("A"), await read("B")]).toEqual([`${ctx.tag}-desc-A`, `${ctx.tag}-desc-A`]);
      await patch("B", `${ctx.tag}-desc-B`);
      expect([await read("A"), await read("B")]).toEqual([`${ctx.tag}-desc-B`, `${ctx.tag}-desc-B`]);
      // Not vacuous: a change that bypasses the invalidator stays unseen while
      // the entry lives, so the fresh reads above came from the tag bump.
      await adminPool().query("UPDATE centers SET description = $1 WHERE id = $2", [`${ctx.tag}-desc-sql`, centerId]);
      expect([await read("A"), await read("B")]).toEqual([`${ctx.tag}-desc-B`, `${ctx.tag}-desc-B`]);
      __resetPublicStoreForTests();
    });

    it("targeted cases wrote no money rows", async () => {
      expect(await ctx.moneyCounts()).toEqual(moneyBefore);
    });
  });
}
