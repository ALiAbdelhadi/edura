import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, withPlatformContext } from "@repo/database";
import { __resetRateLimiterForTests } from "@repo/server-core/rate-limit/token-bucket";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
import { sweepTag } from "../../../../packages/database/scripts/test-cleanup";
import type { Hono } from "hono";
import type { AppEnv } from "../../src/app";
import type { NextRouteHandler } from "../../src/next-route";
import { sweepRoutes, type SweepRoute } from "./sweep";
import { targetedSuite } from "./targeted";
import {
  HTTP_METHODS,
  nextMethods,
  adminPool,
  auditWrittenSince,
  auditIds,
  callNext,
  callService,
  closeAdminPool,
  differences,
  createFixtures,
  apiRoute,
  loadNextHost,
  mount,
  serviceApp,
  signIn,
  snapshot,
  type AuditRow,
  type Call,
  type Fixtures,
  type Method,
  type Snapshot,
} from "./harness";

type Role = keyof Fixtures["users"];

type Case = {
  name: string;
  route: string; // path under apps/api/src/routes
  pattern: string; // Hono pattern the service mounts it at
  method: Method;
  path: () => string;
  params?: () => Record<string, string>;
  as?: Role;
  body?: unknown;
  expectStatus: number;
  write?: {
    before: () => Promise<void>; // puts the state back so both sides start equal
    after: () => Promise<void>; // removes what the call created
  };
  normalize?: (body: unknown) => unknown;
};

const tag = `par-${Math.floor(Math.random() * 1e9).toString(36)}`;
let fx: Fixtures;
const cookies = new Map<Role, string>();
let gradeLevelId = "";
const missingCourseId = "00000000-0000-4000-8000-00000000abcd";
const roomName = `${tag}-hall`;

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
const createdRoomIds: string[] = [];
const normalizeGenerated = (body: unknown) =>
  scrub(body, (s) => (ISO.test(s) ? "<time>" : createdRoomIds.includes(s) ? "<room-id>" : null));

async function roomIdsNamed(name: string): Promise<string[]> {
  const { rows } = await adminPool().query<{ id: string }>("SELECT id FROM rooms WHERE name = $1", [name]);
  return rows.map((r) => r.id);
}

const cases: Case[] = [
  { name: "health GET", route: "health", pattern: "/api/health", method: "GET", path: () => "/api/health", expectStatus: 200, normalize: normalizeGenerated },
  { name: "health HEAD", route: "health", pattern: "/api/health", method: "HEAD", path: () => "/api/health", expectStatus: 200 },
  ...(["student", "teacher", "center_admin", "parent", "manager", "assistant"] as const).map(
    (as): Case => ({ name: `me GET (${as})`, route: "v1/me", pattern: "/api/v1/me", method: "GET", path: () => "/api/v1/me", as, expectStatus: 200 }),
  ),
  { name: "me GET (unauthenticated)", route: "v1/me", pattern: "/api/v1/me", method: "GET", path: () => "/api/v1/me", expectStatus: 401 },
  // ?all=1 and ?gradeLevelIds= went through the ERP's "use cache: remote" wrappers
  // (cacheTag/cacheLife from next/cache), which exist only inside a Next build —
  // not portable to the service as-is, and not callable here on either side.
  { name: "catalog/subjects mine=1 (student)", route: "v1/catalog/subjects", pattern: "/api/v1/catalog/subjects", method: "GET", path: () => "/api/v1/catalog/subjects?mine=1", as: "student", expectStatus: 200 },
  { name: "catalog/subjects gradeLevelId (student)", route: "v1/catalog/subjects", pattern: "/api/v1/catalog/subjects", method: "GET", path: () => `/api/v1/catalog/subjects?gradeLevelId=${gradeLevelId}`, as: "student", expectStatus: 200 },
  { name: "400 catalog/subjects no gradeLevelId", route: "v1/catalog/subjects", pattern: "/api/v1/catalog/subjects", method: "GET", path: () => "/api/v1/catalog/subjects", as: "student", expectStatus: 400 },
  { name: "requireRole: center/audit-logs/actors (center_admin)", route: "v1/center/audit-logs/actors", pattern: "/api/v1/center/audit-logs/actors", method: "GET", path: () => "/api/v1/center/audit-logs/actors", as: "center_admin", expectStatus: 200 },
  { name: "403 wrong role: center/audit-logs/actors (teacher)", route: "v1/center/audit-logs/actors", pattern: "/api/v1/center/audit-logs/actors", method: "GET", path: () => "/api/v1/center/audit-logs/actors", as: "teacher", expectStatus: 403 },
  { name: "center-actor: rooms GET (center_admin)", route: "v1/rooms", pattern: "/api/v1/rooms", method: "GET", path: () => "/api/v1/rooms", as: "center_admin", expectStatus: 200 },
  { name: "center-actor: rooms GET (staff manager)", route: "v1/rooms", pattern: "/api/v1/rooms", method: "GET", path: () => "/api/v1/rooms", as: "manager", expectStatus: 200 },
  { name: "403 center-actor: rooms GET (staff receptionist)", route: "v1/rooms", pattern: "/api/v1/rooms", method: "GET", path: () => "/api/v1/rooms", as: "receptionist", expectStatus: 403 },
  { name: "403 wrong role: rooms GET (student)", route: "v1/rooms", pattern: "/api/v1/rooms", method: "GET", path: () => "/api/v1/rooms", as: "student", expectStatus: 403 },
  { name: "teacher-actor: attendance-mode GET (teacher)", route: "v1/teacher/attendance-mode", pattern: "/api/v1/teacher/attendance-mode", method: "GET", path: () => "/api/v1/teacher/attendance-mode", as: "teacher", expectStatus: 200 },
  { name: "teacher-actor: attendance-mode GET (assistant)", route: "v1/teacher/attendance-mode", pattern: "/api/v1/teacher/attendance-mode", method: "GET", path: () => "/api/v1/teacher/attendance-mode", as: "assistant", expectStatus: 200 },
  { name: "404 courses/[id] GET (teacher)", route: "v1/courses/[id]", pattern: "/api/v1/courses/:id", method: "GET", path: () => `/api/v1/courses/${missingCourseId}`, params: () => ({ id: missingCourseId }), as: "teacher", expectStatus: 404 },
  {
    name: "write: attendance-mode PATCH (assistant, audited)",
    route: "v1/teacher/attendance-mode",
    pattern: "/api/v1/teacher/attendance-mode",
    method: "PATCH",
    path: () => "/api/v1/teacher/attendance-mode",
    as: "assistant",
    body: { mode: "counter_and_door" },
    expectStatus: 200,
    write: {
      before: () => setMode("counter_only"),
      after: () => setMode("counter_only"),
    },
  },
  {
    name: "write: rooms POST (staff manager, audited)",
    route: "v1/rooms",
    pattern: "/api/v1/rooms",
    method: "POST",
    path: () => "/api/v1/rooms",
    as: "manager",
    body: { name: roomName, capacity: 20 },
    expectStatus: 201,
    normalize: normalizeGenerated,
    write: {
      before: async () => {
        if ((await roomIdsNamed(roomName)).length) throw new Error("room left over from the other side");
      },
      after: async () => {
        const ids = await roomIdsNamed(roomName);
        createdRoomIds.push(...ids);
        await adminPool().query("DELETE FROM rooms WHERE id = ANY($1::uuid[])", [ids]);
      },
    },
  },
  {
    name: "400 write: rooms POST empty name (staff manager)",
    route: "v1/rooms",
    pattern: "/api/v1/rooms",
    method: "POST",
    path: () => "/api/v1/rooms",
    as: "manager",
    body: { name: "" },
    expectStatus: 400,
  },
];

async function setMode(mode: "counter_only" | "counter_and_door") {
  await withPlatformContext((tx) =>
    tx.teacherProfile.update({ where: { userId: fx.users.teacher.id }, data: { attendanceMode: mode } }),
  );
}

type SideResult = { snap: Snapshot; audit: AuditRow[] };
const results: { name: string; a: SideResult; b: SideResult; mismatch: string[] }[] = [];

beforeAll(async () => {
  await assertDbEnv(["test"], { intent: "apps/api test:parity" });
  await loadNextHost();
  fx = await createFixtures(tag);
  let n = 0;
  for (const role of Object.keys(fx.users) as Role[]) {
    cookies.set(role, await signIn(fx.users[role].email, `198.18.${Math.floor(n / 250)}.${(n++ % 250) + 1}`));
  }
  gradeLevelId = fx.gradeLevelId;
});

afterAll(async () => {
  try {
    if (results.length) {
      const lines = results.map((r) => `${r.mismatch.length ? "MISMATCH" : "match   "}  ${String(r.a.snap.status).padEnd(3)} ${r.name}${r.mismatch.length ? `\n            ${r.mismatch.join("\n            ")}` : ""}`);
      console.log(`\nparity (${results.filter((r) => !r.mismatch.length).length}/${results.length} match)\n${lines.join("\n")}`);
    }
    printSweep();
    if (fx) {
      const swept = await sweepTag(tag, { quiet: true });
      const left = await adminPool().query<{ n: number }>(
        "SELECT (SELECT count(*) FROM users WHERE email ILIKE $1)::int + (SELECT count(*) FROM centers WHERE name ILIKE $1)::int + (SELECT count(*) FROM rooms WHERE name ILIKE $1)::int AS n",
        [`%${tag}%`],
      );
      console.log(`teardown: swept ${swept.total} rows tagged ${tag} on '${swept.dbEnv}', ${left.rows[0]!.n} left`);
    }
  } finally {
    await closeAdminPool();
    await prisma.$disconnect();
  }
});

describe("route parity: bare handler (A) vs service stack (B)", () => {
  for (const c of cases) {
    it(c.name, async () => {
      __resetRateLimiterForTests();
      const mod = await apiRoute(c.route);
      const handler = mod[c.method] as NextRouteHandler | undefined;
      if (!handler) throw new Error(`${c.route} exports no ${c.method}`);
      const call: Call = { method: c.method, path: c.path(), cookie: c.as ? cookies.get(c.as) : undefined, body: c.body };

      const app = serviceApp();
      mount(app, c.method, c.pattern, handler);

      const run = async (side: () => Promise<Response>): Promise<SideResult> => {
        await c.write?.before();
        const seen = await auditIds();
        const res = await side();
        const audit = await auditWrittenSince(seen);
        await c.write?.after();
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
      if (c.write && c.expectStatus < 400) expect(na.audit.length).toBeGreaterThan(0);
      expect(nb).toEqual(na);
    });
  }

  // better-auth extends a session once updateAge (1 day) has passed and sets
  // the refreshed cookie from getSession. In Next, nextCookies() writes it onto
  // the response through cookies(); on the service, serviceCookies() puts it on
  // the Response. An RSC render (`RSC: 1`, no `next-action`) cannot write a
  // cookie, so there neither the cookie nor the DB row moves. (Next's side
  // cannot be observed outside a Next request: nextCookies() returns early.)
  it("session refresh after updateAge: service response carries the cookie the DB row was extended to", async () => {
    const cookie = await signIn(fx.users.teacher.email, "198.18.9.9");
    const pair = cookie.split("; ").find((c) => c.split("=")[0]!.endsWith("session_token"));
    if (!pair) throw new Error("no session_token cookie");
    const sessionCookieName = pair.split("=")[0]!;
    const token = decodeURIComponent(pair.slice(pair.indexOf("=") + 1)).split(".")[0]!;
    const ageOut = () =>
      adminPool().query("UPDATE auth_sessions SET expires_at = now() + interval '1 hour' WHERE token = $1", [token]);
    const row = async () => {
      const { rows } = await adminPool().query<{ extended: boolean; secs_left: number }>(
        "SELECT expires_at > now() + interval '2 hours' AS extended, EXTRACT(EPOCH FROM (expires_at - now()))::int AS secs_left FROM auth_sessions WHERE token = $1",
        [token],
      );
      return rows[0]!;
    };
    const app = serviceApp();
    const me = (await apiRoute("v1/me")).GET as NextRouteHandler;
    mount(app, "GET", "/api/v1/me", me);

    await ageOut();
    const res = await callService(app, { method: "GET", path: "/api/v1/me", cookie });
    const after = await row();
    const snap = await snapshot(res);
    console.log(
      `session refresh via service: status ${snap.status}, set-cookie [${snap.setCookieNames.join(", ")}], ` +
        `DB expires_at extended: ${after.extended}`,
    );
    expect(snap.status).toBe(200);
    expect(after.extended).toBe(true);
    expect(snap.setCookieNames).toEqual([sessionCookieName]);
    const refreshed = res.headers.getSetCookie().find((c) => c.startsWith(`${sessionCookieName}=`))!;
    const maxAge = Number(/;\s*Max-Age=(\d+)/i.exec(refreshed)?.[1]);
    expect(Number.isFinite(maxAge)).toBe(true);
    // The cookie's lifetime and the row's remaining lifetime were both derived
    // from the same expiresIn at the same moment.
    expect(Math.abs(maxAge - after.secs_left)).toBeLessThan(120);
    expect(refreshed).toMatch(/;\s*HttpOnly/i);
    expect(refreshed).toMatch(/;\s*Path=\//i);
    // The new cookie value is the same token (a refresh, not a re-mint).
    expect(decodeURIComponent(refreshed.slice(refreshed.indexOf("=") + 1).split(";")[0]!).split(".")[0]).toBe(token);

    await ageOut();
    const rsc = await callService(app, { method: "GET", path: "/api/v1/me", cookie, headers: { RSC: "1" } });
    const rscSnap = await snapshot(rsc);
    const afterRsc = await row();
    expect(rscSnap.status).toBe(200);
    expect(rscSnap.setCookieNames).toEqual([]);
    expect(afterRsc.extended).toBe(false);

    await ageOut();
    const action = await callService(app, {
      method: "GET",
      path: "/api/v1/me",
      cookie,
      headers: { RSC: "1", "next-action": "0123456789abcdef" },
    });
    const actionSnap = await snapshot(action);
    expect(actionSnap.status).toBe(200);
    expect(actionSnap.setCookieNames).toEqual([sessionCookieName]);
    expect((await row()).extended).toBe(true);
  });
});

// ---- registry sweep ---------------------------------------------------------
// Every moved route (the generated ROUTES table), A vs B:
//   anon: every HTTP method, no session, `{}` as the JSON body of a write;
//   <role>: every route that exports GET, signed in as each fixture role.
// Params are placeholders (sweep.ts), so these prove the shape of the answer —
// auth, role gates, validation, 404/405, the method table — not a populated
// read. Writes are only ever anonymous with an empty body, and the sweep ends by
// checking that no money table gained or lost a row.

const ROLES: Role[] = ["center_admin", "manager", "receptionist", "teacher", "assistant", "student", "parent"];
const WRITES = new Set<Method>(["POST", "PUT", "PATCH", "DELETE"]);
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
  const out = [`\nregistry sweep: ${sweep.routes.length} routes, ${sweepResults.length} cases, ${(ms / 1000).toFixed(1)} s`];
  for (const [cat, e] of byCategory) out.push(`  ${cat.padEnd(14)} ${e.n - e.bad}/${e.n} match, ${e.errors} answered 5xx on A`);
  for (const r of sweepResults.filter((x) => x.mismatch.length)) {
    out.push(`  MISMATCH ${r.category} ${r.method} ${r.route}\n            ${r.mismatch.join("\n            ")}`);
  }
  const fives = sweepResults.filter((r) => r.a.snap.status >= 500);
  if (fives.length) out.push(`  5xx on A (equal on both sides unless listed above):\n    ${fives.map((r) => `${r.category} ${r.method} ${r.route} -> ${r.a.snap.status}`).join("\n    ")}`);
  if (sweep.skipped.length) out.push(`  skipped:\n    ${sweep.skipped.map((s) => `${s.path}  (${s.reason})`).join("\n    ")}`);
  console.log(out.join("\n"));
}

describe("registry sweep: every moved route, A vs B", () => {
  let app: Hono<AppEnv>;
  let moneyBefore: Record<string, number>;

  beforeAll(async () => {
    app = serviceApp();
    moneyBefore = await moneyCounts();
    sweepStarted = performance.now();
  });

  const one = async (category: string, route: SweepRoute, method: Method, as?: Role) => {
    const handler = nextMethods(await apiRoute(route.rel))[method];
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
