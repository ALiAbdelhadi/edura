import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import { __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTag } from "../../../../packages/database/scripts/test-cleanup";
import type { Hono } from "hono";
import type { NextRouteHandler } from "@repo/service-kit/next-route";
import type { AppEnv } from "../../src/app";
import { sweepRoutes, type SweepRoute } from "./sweep";
import { targetedSuite } from "./targeted";
import {
  HTTP_METHODS,
  ORACLE_MODE,
  adminPool,
  auditIds,
  auditWrittenSince,
  callNext,
  callService,
  closeAdminPool,
  createFixtures,
  differences,
  loadNextHost,
  mount,
  nextMethods,
  nextRouteModule,
  serviceApp,
  setTwoFactorEnabled,
  shimless,
  signIn,
  snapshot,
  type AuditRow,
  type Call,
  type Fixtures,
  type Method,
  type Role,
  type Snapshot,
} from "./harness";

type Case = {
  name: string;
  route: string; // path under apps/admin-api/src/routes
  pattern: string; // Hono pattern the service mounts it at
  method: Method;
  path: () => string;
  params?: () => Record<string, string>;
  as?: Role;
  body?: unknown;
  expectStatus: number;
  normalize?: (body: unknown) => unknown;
};

const tag = `par-${Math.floor(Math.random() * 1e9).toString(36)}`;
let fx: Fixtures;
const cookies = new Map<Role, string>();
const missingId = "00000000-0000-4000-8000-00000000abcd";

// Replaces per-call generated values wherever they appear.
function scrub(value: unknown, replace: (s: string) => string | null): unknown {
  if (typeof value === "string") return replace(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, replace));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, replace)]));
  }
  return value;
}
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const normalizeGenerated = (body: unknown) => scrub(body, (s) => (ISO.test(s) ? "<time>" : null));

const cases: Case[] = [
  { name: "health GET", route: "health", pattern: "/api/health", method: "GET", path: () => "/api/health", expectStatus: 200, normalize: normalizeGenerated },
  { name: "health HEAD", route: "health", pattern: "/api/health", method: "HEAD", path: () => "/api/health", expectStatus: 200 },
  { name: "me GET (super_admin)", route: "v1/me", pattern: "/api/v1/me", method: "GET", path: () => "/api/v1/me", as: "super_admin", expectStatus: 200 },
  { name: "me GET (accountant)", route: "v1/me", pattern: "/api/v1/me", method: "GET", path: () => "/api/v1/me", as: "accountant", expectStatus: 200 },
  { name: "me GET (unauthenticated)", route: "v1/me", pattern: "/api/v1/me", method: "GET", path: () => "/api/v1/me", expectStatus: 401 },
  // The 2FA gate: a super_admin whose session was minted before 2FA was
  // required (two_factor_enabled still false) is refused every v1 route.
  { name: "403 2FA gate: me GET (super_admin without 2FA)", route: "v1/me", pattern: "/api/v1/me", method: "GET", path: () => "/api/v1/me", as: "super_admin_no2fa", expectStatus: 403 },
  { name: "403 2FA gate: finance/dashboard GET (super_admin without 2FA)", route: "v1/finance/dashboard", pattern: "/api/v1/finance/dashboard", method: "GET", path: () => "/api/v1/finance/dashboard", as: "super_admin_no2fa", expectStatus: 403 },
  // Role tiers: super_admin-only vs finance (accountant + super_admin).
  { name: "admin/centers GET (super_admin)", route: "v1/admin/centers", pattern: "/api/v1/admin/centers", method: "GET", path: () => "/api/v1/admin/centers", as: "super_admin", expectStatus: 200, normalize: normalizeGenerated },
  { name: "403 wrong role: admin/centers GET (accountant)", route: "v1/admin/centers", pattern: "/api/v1/admin/centers", method: "GET", path: () => "/api/v1/admin/centers", as: "accountant", expectStatus: 403 },
  { name: "401 admin/centers GET (unauthenticated)", route: "v1/admin/centers", pattern: "/api/v1/admin/centers", method: "GET", path: () => "/api/v1/admin/centers", expectStatus: 401 },
  { name: "finance/dashboard GET (accountant)", route: "v1/finance/dashboard", pattern: "/api/v1/finance/dashboard", method: "GET", path: () => "/api/v1/finance/dashboard", as: "accountant", expectStatus: 200, normalize: normalizeGenerated },
  { name: "finance/dashboard GET (super_admin)", route: "v1/finance/dashboard", pattern: "/api/v1/finance/dashboard", method: "GET", path: () => "/api/v1/finance/dashboard", as: "super_admin", expectStatus: 200, normalize: normalizeGenerated },
  { name: "admin/centers/[id] GET (super_admin)", route: "v1/admin/centers/[id]", pattern: "/api/v1/admin/centers/:id", method: "GET", path: () => `/api/v1/admin/centers/${fx.centerId}`, params: () => ({ id: fx.centerId }), as: "super_admin", expectStatus: 200, normalize: normalizeGenerated },
  { name: "403 wrong role: admin/centers/[id] GET (accountant)", route: "v1/admin/centers/[id]", pattern: "/api/v1/admin/centers/:id", method: "GET", path: () => `/api/v1/admin/centers/${fx.centerId}`, params: () => ({ id: fx.centerId }), as: "accountant", expectStatus: 403 },
  { name: "404 admin/centers/[id] GET missing (super_admin)", route: "v1/admin/centers/[id]", pattern: "/api/v1/admin/centers/:id", method: "GET", path: () => `/api/v1/admin/centers/${missingId}`, params: () => ({ id: missingId }), as: "super_admin", expectStatus: 404 },
  // Validation doors only: a strict schema refuses an unknown key before any write.
  { name: "400 admin/centers/[id] PATCH unknown key (super_admin)", route: "v1/admin/centers/[id]", pattern: "/api/v1/admin/centers/:id", method: "PATCH", path: () => `/api/v1/admin/centers/${fx.centerId}`, params: () => ({ id: fx.centerId }), as: "super_admin", body: { bogus: 1 }, expectStatus: 400 },
  { name: "400 me PATCH bad locale (accountant)", route: "v1/me", pattern: "/api/v1/me", method: "PATCH", path: () => "/api/v1/me", as: "accountant", body: { locale: "fr" }, expectStatus: 400 },
];

type SideResult = { snap: Snapshot; audit: AuditRow[] };
const results: { name: string; a: SideResult; b: SideResult; mismatch: string[] }[] = [];

beforeAll(async () => {
  await assertDbEnv(["test"], { intent: "apps/admin-api test:parity" });
  await loadNextHost();
  fx = await createFixtures(tag);
  let n = 0;
  for (const role of Object.keys(fx.users) as Role[]) {
    cookies.set(role, await signIn(fx.users[role].email, `198.18.${Math.floor(n / 250)}.${(n++ % 250) + 1}`));
  }
  // Signed in first, then required to have 2FA: the sessions above pass the
  // gate; super_admin_no2fa keeps its unflipped account for the gate cases.
  await setTwoFactorEnabled(fx.users.super_admin.id, true);
  await setTwoFactorEnabled(fx.users.accountant.id, true);
});

afterAll(async () => {
  try {
    if (results.length) {
      const lines = results.map((r) => `${r.mismatch.length ? "MISMATCH" : "match   "}  ${String(r.a.snap.status).padEnd(3)} ${r.name}${r.mismatch.length ? `\n            ${r.mismatch.join("\n            ")}` : ""}`);
      console.log(`\nparity [oracle: ${ORACLE_MODE}] (${results.filter((r) => !r.mismatch.length).length}/${results.length} match)\n${lines.join("\n")}`);
    }
    printSweep();
    if (shimless.size) {
      console.log(`side A fell back to the admin-api module (no superadmin shim exists): ${[...shimless].sort().join(", ")}`);
    }
    if (fx) {
      const swept = await sweepTag(tag, { quiet: true });
      const left = await adminPool().query<{ n: number }>(
        "SELECT (SELECT count(*) FROM users WHERE email ILIKE $1)::int + (SELECT count(*) FROM centers WHERE name ILIKE $1)::int AS n",
        [`%${tag}%`],
      );
      console.log(`teardown: swept ${swept.total} rows tagged ${tag} on '${swept.dbEnv}', ${left.rows[0]!.n} left`);
    }
  } finally {
    await closeAdminPool();
    await prisma.$disconnect();
  }
});

describe(`route parity [oracle: ${ORACLE_MODE}]: Next-shaped call (A) vs service stack (B)`, () => {
  for (const c of cases) {
    it(c.name, async () => {
      __resetRateLimiterForTests();
      const mod = await nextRouteModule(c.route);
      const handler = mod[c.method] as NextRouteHandler | undefined;
      if (!handler) throw new Error(`${c.route} exports no ${c.method}`);
      const call: Call = { method: c.method, path: c.path(), cookie: c.as ? cookies.get(c.as) : undefined, body: c.body };

      const app = serviceApp();
      mount(app, c.method, c.pattern, handler);

      const run = async (side: () => Promise<Response>): Promise<SideResult> => {
        const seen = await auditIds();
        const res = await side();
        const audit = await auditWrittenSince(seen);
        return { snap: await snapshot(res), audit };
      };
      const a = await run(() => callNext(handler, call, c.params?.() ?? {}));
      const b = await run(() => callService(app, call));

      const norm = (r: SideResult): SideResult => ({
        snap: { ...r.snap, body: c.normalize ? c.normalize(r.snap.body) : r.snap.body },
        audit: normalizeGenerated(r.audit) as AuditRow[],
      });
      const na = norm(a);
      const nb = norm(b);
      const mismatch = differences(na, nb);
      results.push({ name: c.name, a: na, b: nb, mismatch });

      expect(na.snap.status).toBe(c.expectStatus);
      expect(nb).toEqual(na);
    });
  }
});

// ---- registry sweep ---------------------------------------------------------
// Every route in the generated ROUTES table, A vs B:
//   anon: every HTTP method, no session, `{}` as the JSON body of a write;
//   <role>: every route that exports GET, signed in as super_admin and accountant.
// Params are placeholders (sweep.ts), so these prove the shape of the answer —
// auth, the 2FA gate, role tiers, validation, 404/405, the method table — not a
// populated read. Writes are only ever anonymous with an empty body (refused at
// the session door), and the sweep ends by checking that no money table gained
// or lost a row.

const ROLES: Role[] = ["super_admin", "accountant"];
const WRITES = new Set<Method>(["POST", "PUT", "PATCH", "DELETE"]);
// The ERP harness's list plus the back office's own invoices.
const MONEY_TABLES = [
  "payments",
  "expenses",
  "transactions",
  "payouts",
  "points_ledger",
  "payment_intents",
  "wallet_ledger",
  "wallet_settings",
  "parent_wallet_ledger",
  "center_wallet_ledger",
  "subscriptions",
  "session_settlements",
  "external_teacher_settlements",
  "invoices",
];

type SweepResult = { category: string; route: string; method: Method; a: SideResult; b: SideResult; mismatch: string[] };
const sweep = sweepRoutes();
const sweepResults: SweepResult[] = [];
let sweepStarted = 0;
let sweepMs = 0;

async function moneyCounts(): Promise<Record<string, number>> {
  const { rows } = await adminPool().query<Record<string, number>>(
    `SELECT ${MONEY_TABLES.map((t) => `(SELECT count(*) FROM ${t})::int AS ${t}`).join(", ")}`,
  );
  return rows[0]!;
}

async function sweepSide(call: () => Promise<Response>): Promise<SideResult> {
  __resetRateLimiterForTests();
  const seen = await auditIds();
  const res = await call();
  const audit = await auditWrittenSince(seen);
  const snap = await snapshot(res);
  return { snap: { ...snap, body: normalizeGenerated(snap.body) }, audit: normalizeGenerated(audit) as AuditRow[] };
}

function printSweep(): void {
  if (!sweepResults.length && !sweep.skipped.length) return;
  const byCategory = new Map<string, { n: number; bad: number; errors: number }>();
  for (const r of sweepResults) {
    const e = byCategory.get(r.category) ?? { n: 0, bad: 0, errors: 0 };
    e.n++;
    if (r.mismatch.length) e.bad++;
    if (r.a.snap.status >= 500) e.errors++;
    byCategory.set(r.category, e);
  }
  const ms = sweepMs || (sweepStarted ? performance.now() - sweepStarted : 0);
  const out = [`\nregistry sweep [oracle: ${ORACLE_MODE}]: ${sweep.routes.length} routes, ${sweepResults.length} cases, ${(ms / 1000).toFixed(1)} s`];
  for (const [cat, e] of byCategory) out.push(`  ${cat.padEnd(14)} ${e.n - e.bad}/${e.n} match, ${e.errors} answered 5xx on A`);
  for (const r of sweepResults.filter((x) => x.mismatch.length)) {
    out.push(`  MISMATCH ${r.category} ${r.method} ${r.route}\n            ${r.mismatch.join("\n            ")}`);
  }
  const fives = sweepResults.filter((r) => r.a.snap.status >= 500);
  if (fives.length) out.push(`  5xx on A (equal on both sides unless listed above):\n    ${fives.map((r) => `${r.category} ${r.method} ${r.route} -> ${r.a.snap.status}`).join("\n    ")}`);
  if (sweep.skipped.length) out.push(`  skipped:\n    ${sweep.skipped.map((s) => `${s.path}  (${s.reason})`).join("\n    ")}`);
  console.log(out.join("\n"));
}

describe("registry sweep: every route, A vs B", () => {
  let app: Hono<AppEnv>;
  let moneyBefore: Record<string, number>;

  beforeAll(async () => {
    app = serviceApp();
    moneyBefore = await moneyCounts();
    sweepStarted = performance.now();
  });

  const one = async (category: string, route: SweepRoute, method: Method, as?: Role) => {
    const handler = nextMethods(await nextRouteModule(route.rel))[method];
    const call: Call = {
      method,
      path: route.url,
      cookie: as ? cookies.get(as) : undefined,
      body: WRITES.has(method) ? {} : undefined,
    };
    const a = await sweepSide(() => callNext(handler, call, route.params));
    const b = await sweepSide(() => callService(app, call));
    const mismatch = differences(a, b);
    sweepResults.push({ category, route: route.path, method, a, b, mismatch });
    expect(b).toEqual(a);
  };

  for (const route of sweep.routes) {
    for (const method of HTTP_METHODS) {
      it(`anon ${method} ${route.path}`, () => one("anon", route, method));
    }
  }
  for (const as of ROLES) {
    for (const route of sweep.routes.filter((r) => r.module.GET)) {
      it(`${as} GET ${route.path}`, () => one(as, route, "GET", as));
    }
  }

  it("sweep wrote no money rows", async () => {
    sweepMs = performance.now() - sweepStarted;
    expect(await moneyCounts()).toEqual(moneyBefore);
  });
});

targetedSuite({
  tag,
  fx: () => fx,
  cookie: (role) => cookies.get(role)!,
  record: (r) => results.push(r),
  moneyCounts,
});
