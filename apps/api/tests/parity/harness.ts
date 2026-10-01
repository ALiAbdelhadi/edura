import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { hashPassword } from "@repo/server-core/auth/passwords";
import { setPublicDataInvalidator } from "@repo/server-core/cache/public-data";
import { bumpPublicDataTag } from "@repo/server-core/cache/public-store";
import { setErpAuth } from "@repo/server-core/erp-auth/instance";
import type { ErpAuth } from "@repo/server-core/erp-auth/create-auth";
import { setAfterScheduler } from "@repo/server-core/http/after";
import { setUserTagger } from "@repo/server-core/observability/user-tagger";
import { createErpAuth } from "@repo/server-core/erp-auth/create-auth";
import { createParityHarness, type Method, type NextOracle, type RouteModule } from "@repo/service-kit/parity/harness";
import type { NextRouteHandler } from "@repo/service-kit/next-route";
import { withPlatformContext } from "@repo/database";
import { registerAfterScheduler } from "../../src/after";
import { bindPublicDataCache } from "../../src/cache";
import { createApp, type AppEnv } from "../../src/app";
import { auth as serviceAuth, bindSessionHost } from "../../src/session-seam";
import { testPool } from "../../../../packages/database/scripts/test-pool";

export {
  HTTP_METHODS,
  differences,
  mount,
  snapshot,
  type AuditRow,
  type Call,
  type Method,
  type Snapshot,
} from "@repo/service-kit/parity/harness";

export const ORIGIN = "http://localhost:3002";

// Side A is the handler invoked directly, the way a Next app-route module is
// called: its own better-auth instance (createErpAuth with no cookie plugin, as
// apps/erp built it with nextCookies(), which writes nothing outside a Next
// request), no user tagger, Next's own after() and method table.
type NextHost = NextOracle & { auth: ErpAuth; tagger: (s: unknown) => void };
let nextHost: NextHost | null = null;

function bindNext(): void {
  if (!nextHost) throw new Error("loadNextHost() first");
  setErpAuth(nextHost.auth);
  setUserTagger(nextHost.tagger as Parameters<typeof setUserTagger>[0]);
  setAfterScheduler(nextHost.after);
  // The same store bump the service binds (src/cache.ts).
  setPublicDataInvalidator(bumpPublicDataTag);
}

function bindService(): void {
  bindSessionHost();
  registerAfterScheduler();
  bindPublicDataCache();
}

// The generic core (request building, A/B calls, the Next oracle, audit rows)
// with the ERP's origin, folders and the two hosts' registrations.
const harness = createParityHarness({
  origin: ORIGIN,
  serviceDir: fileURLToPath(new URL("../../", import.meta.url)),
  oracleDir: fileURLToPath(new URL("../../../erp/", import.meta.url)),
  bindNext,
  bindService,
  testPool: () => testPool(),
});

export const { apiRoute, callNext, callService, adminPool, auditIds, auditWrittenSince, closeAdminPool } = harness;

export async function loadNextHost(): Promise<void> {
  nextHost = { ...harness.loadNextOracle(), auth: createErpAuth({ extraPlugins: [] }), tagger: () => {} };
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

// ---- fixtures ------------------------------------------------------------

export const PASSWORD = `Parity-${Math.random().toString(36).slice(2, 10)}-9`;

export type Fixtures = {
  tag: string;
  centerId: string;
  gradeLevelId: string;
  // A back-office account, the actor of a view-as handoff. Not signed in: the
  // ERP refuses it a session.
  superAdminId: string;
  users: Record<
    "center_admin" | "manager" | "receptionist" | "teacher" | "assistant" | "student" | "parent",
    { id: string; email: string }
  >;
};

// Every row is is_demo and carries the tag in a swept column (users.email,
// centers.name, rooms.name), so sweepTag removes it and everything hanging off it.
export async function createFixtures(tag: string): Promise<Fixtures> {
  const passwordHash = await hashPassword(PASSWORD);
  return withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: `P${tag.replace(/[^a-z0-9]/gi, "")}`.slice(0, 12).toUpperCase(), status: "active", isDemo: true },
    });
    const mk = async (local: string, role: string) => {
      const email = `${tag}-${local}@parity.test`;
      const u = await tx.user.create({
        data: { email, role: role as never, name: `${tag}-${local}`, status: "active", passwordHash, isDemo: true },
      });
      return { id: u.id, email };
    };
    const superAdmin = await mk("superadmin", "super_admin");
    const users = {
      center_admin: await mk("owner", "center_admin"),
      manager: await mk("manager", "center_staff"),
      receptionist: await mk("reception", "center_staff"),
      teacher: await mk("teacher", "teacher"),
      assistant: await mk("assistant", "assistant"),
      student: await mk("student", "student"),
      parent: await mk("parent", "parent"),
    };
    await tx.centerAdminProfile.create({ data: { userId: users.center_admin.id, centerId: center.id } });
    await tx.centerStaff.create({ data: { centerId: center.id, staffUserId: users.manager.id, role: "manager" } });
    await tx.centerStaff.create({
      data: { centerId: center.id, staffUserId: users.receptionist.id, role: "receptionist" },
    });
    await tx.teacherProfile.create({ data: { userId: users.teacher.id } });
    await tx.teacherAssistant.create({ data: { teacherId: users.teacher.id, assistantId: users.assistant.id } });
    // A grade that has at least one active offering, so ?mine=1 returns real subjects.
    const offering = await tx.subjectOffering.findFirst({
      where: { isActive: true, subject: { is: { isActive: true } } },
      select: { gradeLevelId: true },
      orderBy: { gradeLevelId: "asc" },
    });
    if (!offering) throw new Error("no active subject offering in the test catalog");
    await tx.studentProfile.create({
      data: {
        userId: users.student.id,
        fullName: `${tag}-student`,
        familyLinkCode: `${tag}-fl`,
        gradeLevelId: offering.gradeLevelId,
      },
    });
    return { tag, centerId: center.id, gradeLevelId: offering.gradeLevelId, superAdminId: superAdmin.id, users };
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
