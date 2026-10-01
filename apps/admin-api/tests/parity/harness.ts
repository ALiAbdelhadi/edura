import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { hashPassword } from "@repo/server-core/auth/passwords";
import { createAdminAuth, type AdminAuth } from "@repo/server-core/backoffice-auth/create-auth";
import { setAdminAuth } from "@repo/server-core/backoffice-auth/instance";
import { setAfterScheduler } from "@repo/server-core/http/after";
import { setCspReporter, type CspReporter } from "@repo/server-core/observability/csp-report";
import { setUserTagger } from "@repo/server-core/observability/user-tagger";
import {
  createParityHarness,
  snapshot as coreSnapshot,
  type Method,
  type NextOracle,
  type RouteModule,
  type Snapshot as CoreSnapshot,
} from "@repo/service-kit/parity/harness";
import type { NextRouteHandler } from "@repo/service-kit/next-route";
import { withPlatformContext } from "@repo/database";
import { registerAfterScheduler } from "../../src/after";
import { createApp, type AppEnv } from "../../src/app";
import { bindCspReporter } from "../../src/csp-reporter";
import { auth as serviceAuth, bindSessionHost } from "../../src/session-seam";
import { testPool } from "../../../../packages/database/scripts/test-pool";

export {
  HTTP_METHODS,
  differences,
  mount,
  type AuditRow,
  type Call,
  type Method,
  type RouteModule,
} from "@repo/service-kit/parity/harness";

export const ORIGIN = "http://localhost:3004";

const serviceDir = fileURLToPath(new URL("../../", import.meta.url));
const oracleDir = fileURLToPath(new URL("../../../superadmin/", import.meta.url));
const oracleRequire = createRequire(`${oracleDir}package.json`);

// Side A has two shapes. `shim`: the superadmin route module — the one-line
// re-export under apps/superadmin/src/app/api that imports the Next host's
// bindings (next-bindings + the nextCookies() auth instance) before handing the
// admin-api handler to Next. `direct`: the admin-api handler module itself,
// bound the way the Next host bound it minus Next-only pieces. Shim while the
// shims exist, direct once they are gone; PARITY_ORACLE overrides.
export type OracleMode = "shim" | "direct";
const SHIM_DIR = `${oracleDir}src/app/api/`;
function pickMode(): OracleMode {
  const forced = process.env.PARITY_ORACLE;
  if (forced === "shim" || forced === "direct") return forced;
  if (forced) throw new Error(`PARITY_ORACLE must be "shim" or "direct", got "${forced}"`);
  return existsSync(SHIM_DIR) ? "shim" : "direct";
}
export const ORACLE_MODE: OracleMode = pickMode();

type NextHost = NextOracle & {
  auth: AdminAuth;
  tagger: Parameters<typeof setUserTagger>[0];
  cspReporter: CspReporter;
};
let nextHost: NextHost | null = null;

function bindNext(): void {
  if (!nextHost) throw new Error("loadNextHost() first");
  setAdminAuth(nextHost.auth);
  setUserTagger(nextHost.tagger);
  setAfterScheduler(nextHost.after);
  setCspReporter(nextHost.cspReporter);
}

function bindService(): void {
  bindSessionHost();
  registerAfterScheduler();
  bindCspReporter();
}

const harness = createParityHarness({
  origin: ORIGIN,
  serviceDir,
  oracleDir,
  bindNext,
  bindService,
  testPool: () => testPool(),
});

export const { apiRoute, callNext, callService, adminPool, auditIds, auditWrittenSince, closeAdminPool } = harness;

// In shim mode the Next host's own modules: its auth instance (nextCookies()
// last, as apps/superadmin/src/lib/auth/auth.ts builds it), its Sentry user
// tagger and the same @sentry/nextjs CSP capture next-bindings.ts registers.
// In direct mode: the same createAdminAuth with no cookie plugin (nextCookies()
// writes nothing outside a Next request anyway), no tagger, no reporter.
export async function loadNextHost(): Promise<void> {
  const oracle = harness.loadNextOracle();
  if (ORACLE_MODE === "direct") {
    nextHost = { ...oracle, auth: createAdminAuth({ extraPlugins: [] }), tagger: () => {}, cspReporter: () => {} };
    return;
  }
  const authMod = (await import(/* @vite-ignore */ `${oracleDir}src/lib/auth/auth.ts`)) as { auth: AdminAuth };
  const userMod = (await import(/* @vite-ignore */ `${oracleDir}src/lib/observability/sentry-user.ts`)) as {
    tagSentryUser: NextHost["tagger"];
  };
  const Sentry = oracleRequire("@sentry/nextjs") as {
    captureMessage: (message: string, ctx: Record<string, unknown>) => unknown;
  };
  nextHost = {
    ...oracle,
    auth: authMod.auth,
    tagger: userMod.tagSentryUser,
    cspReporter: (c) => {
      Sentry.captureMessage(c.message, { level: c.level, tags: c.tags, extra: c.extra, fingerprint: c.fingerprint });
    },
  };
}

// Side A's module for a route folder: the superadmin shim when the mode is
// shim and one exists, else the admin-api module itself. Routes the back
// office never had a shim for (served by the service only) are listed.
export const shimless = new Set<string>();
export async function nextRouteModule(rel: string): Promise<RouteModule> {
  if (ORACLE_MODE === "shim") {
    const shim = `${SHIM_DIR}${rel}/route.ts`;
    if (existsSync(shim)) return (await import(/* @vite-ignore */ shim)) as RouteModule;
    shimless.add(rel);
  }
  return apiRoute(rel);
}

// Every method of a route module the way Next's app-route module answers it.
export function nextMethods(mod: RouteModule): Record<Method, NextRouteHandler> {
  if (!nextHost) throw new Error("loadNextHost() first");
  return nextHost.autoImplement(mod);
}

// B: the service stack, the same handler mounted with nextRoute.
export function serviceApp(): Hono<AppEnv> {
  return createApp({ proxySecret: () => undefined, accessLog: false });
}

// ---- snapshots -------------------------------------------------------------

export type Snapshot = CoreSnapshot & {
  contentLength: string | null;
  retryAfter: string | null;
  // Every x-edura-* header (the exports carry row counts and truncation).
  xEdura: Record<string, string>;
};

const BINARY = ["application/pdf", "application/vnd.openxmlformats", "application/octet-stream"];

// The core snapshot plus the back office's own headers. A binary body (xlsx,
// pdf) is reduced to its byte length: each side renders its own, and the
// formats carry a timestamp of their own.
export async function snapshot(res: Response): Promise<Snapshot> {
  const contentType = res.headers.get("content-type") ?? "";
  const binary = BINARY.some((t) => contentType.includes(t));
  const bytes = binary ? (await res.clone().arrayBuffer()).byteLength : null;
  const base = await coreSnapshot(res);
  const xEdura: Record<string, string> = {};
  for (const [k, v] of [...res.headers.entries()].sort()) if (k.startsWith("x-edura-")) xEdura[k] = v;
  return {
    ...base,
    body: binary ? `<binary ${bytes} bytes>` : base.body,
    contentLength: res.headers.get("content-length"),
    retryAfter: res.headers.get("retry-after"),
    xEdura,
  };
}

// ---- fixtures ------------------------------------------------------------

export const PASSWORD = `Parity-${Math.random().toString(36).slice(2, 10)}-9`;

export type Role = "super_admin" | "accountant" | "super_admin_no2fa";

export type Fixtures = {
  tag: string;
  // A tagged is_demo centre: the target of the one audited write (centers/[id] PATCH).
  centerId: string;
  // An ERP account, the only kind a view-as handoff may target.
  teacher: { id: string; email: string };
  users: Record<Role, { id: string; email: string }>;
};

// Every row is is_demo and carries the tag in a swept column (users.email,
// users.name, centers.name), so sweepTag removes it and everything hanging off it.
export async function createFixtures(tag: string): Promise<Fixtures> {
  const passwordHash = await hashPassword(PASSWORD);
  return withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: `P${tag.replace(/[^a-z0-9]/gi, "")}`.slice(0, 12).toUpperCase(),
        status: "active",
        isDemo: true,
      },
    });
    const mk = async (local: string, role: string) => {
      const email = `${tag}-${local}@parity.test`;
      const u = await tx.user.create({
        data: { email, role: role as never, name: `${tag}-${local}`, status: "active", passwordHash, isDemo: true },
      });
      return { id: u.id, email };
    };
    const users: Fixtures["users"] = {
      super_admin: await mk("superadmin", "super_admin"),
      accountant: await mk("accountant", "accountant"),
      super_admin_no2fa: await mk("superadmin-no2fa", "super_admin"),
    };
    const teacher = await mk("teacher", "teacher");
    await tx.teacherProfile.create({ data: { userId: teacher.id } });
    return { tag, centerId: center.id, teacher, users };
  });
}

// A real session through the service's better-auth instance (side A's instance
// differs only by the cookie plugin, which writes nothing outside a request it hosts).
export async function signIn(email: string, ip: string): Promise<string> {
  const { headers } = await serviceAuth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ "x-forwarded-for": ip, "user-agent": "parity-harness" }),
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
  if (!cookie) throw new Error(`sign-in for ${email} returned no cookie`);
  return cookie;
}

// The 2FA gate reads users.two_factor_enabled on every request. A fixture
// signs in while it is off (on, the sign-in would stop at the TOTP step) and
// is flipped afterwards, so its session passes the gate from then on.
export async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
  await adminPool().query("UPDATE users SET two_factor_enabled = $2 WHERE id = $1", [userId, enabled]);
}
