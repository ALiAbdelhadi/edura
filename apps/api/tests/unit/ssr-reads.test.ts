import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@repo/server-core/errors/classes";
import { __setSessionOverrideForTests, type SessionUser } from "@repo/server-core/erp-auth/session";
import { mountRoutes } from "../../src/routes/mount";

// Phase 4: the reads server-rendered ERP pages used to make in-process. Each
// route is a thin handler over the server-core function the page called, so
// what is pinned here is (a) the arguments the route hands that function, (b)
// that `data` is the function's result with no reshaping, and (c) the doors:
// 401 / 403 / 404 exactly where the page redirected or called notFound().

const staffLink = vi.hoisted(() => ({ row: null as null | { centerId: string; role: string } }));
vi.mock("@repo/server-core/db/scope", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/db/scope")>()),
  platformDb: (fn: (tx: unknown) => unknown) =>
    fn({ centerStaff: { findFirst: async () => staffLink.row } }),
}));

const getViewAsContext = vi.fn();
vi.mock("@repo/server-core/erp-auth/view-as", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/erp-auth/view-as")>()),
  getViewAsContext: () => getViewAsContext(),
}));
const isOnboardingComplete = vi.fn();
vi.mock("@repo/server-core/services/catalog/onboarding", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/services/catalog/onboarding")>()),
  isOnboardingComplete: (u: unknown) => isOnboardingComplete(u),
}));
const buildReceiptDocument = vi.fn();
vi.mock("@repo/server-core/services/payments/receipt-document", () => ({
  buildReceiptDocument: (id: unknown, u: unknown) => buildReceiptDocument(id, u),
}));
const buildReportExport = vi.fn();
vi.mock("@repo/server-core/services/reports/report-export", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/services/reports/report-export")>()),
  buildReportExport: (args: unknown) => buildReportExport(args),
}));
const resolveStudentScan = vi.fn();
vi.mock("@repo/server-core/services/students/student-scan", () => ({
  resolveStudentScan: (raw: unknown, viewer: unknown) => resolveStudentScan(raw, viewer),
}));

import * as ssrSession from "../../src/routes/v1/me/ssr-session/route";
import * as receiptDocument from "../../src/routes/v1/payments/[id]/receipt-document/route";
import * as reportPrint from "../../src/routes/v1/reports/print/route";
import * as studentScan from "../../src/routes/v1/students/scan/[payload]/route";

const app = new Hono();
mountRoutes(app, [
  { path: "/api/v1/me/ssr-session", module: ssrSession },
  { path: "/api/v1/payments/[id]/receipt-document", module: receiptDocument },
  { path: "/api/v1/reports/print", module: reportPrint },
  { path: "/api/v1/students/scan/[payload]", module: studentScan },
]);

const STUDENT: SessionUser = { id: "stu-1", role: "student", locale: "ar", name: "S", email: null };
const ADMIN: SessionUser = { id: "adm-1", role: "center_admin", centerId: "c-1", locale: "ar" };
const STAFF: SessionUser = { id: "stf-1", role: "center_staff", locale: "en" };

function signIn(user: SessionUser | null) {
  __setSessionOverrideForTests(() => user);
}

// What ok() puts on the wire for a server-core result: Dates become ISO
// strings, functions vanish — the same transform, applied to the direct call.
const wire = (v: unknown) => JSON.parse(JSON.stringify(v));

afterEach(() => {
  __setSessionOverrideForTests(null);
  staffLink.row = null;
  vi.clearAllMocks();
});

describe("GET /api/v1/me/ssr-session", () => {
  it("signed out: 200 with user null (the page decides the redirect), no onboarding read", async () => {
    signIn(null);
    getViewAsContext.mockResolvedValue(null);
    const res = await app.request("http://x/api/v1/me/ssr-session");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ data: { user: null, onboardingComplete: false, viewAs: null } });
    expect(isOnboardingComplete).not.toHaveBeenCalled();
  });

  it("signed in: data is getSessionUser + isOnboardingComplete(user) + getViewAsContext, verbatim", async () => {
    signIn(STUDENT);
    isOnboardingComplete.mockResolvedValue(false);
    const viewAs = { actorId: "sa-1", actorName: "Ali", actorEmail: null, expiresAt: new Date("2026-09-30T10:00:00Z") };
    getViewAsContext.mockResolvedValue(viewAs);
    const res = await app.request("http://x/api/v1/me/ssr-session");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(wire({ user: STUDENT, onboardingComplete: false, viewAs }));
    expect(isOnboardingComplete).toHaveBeenCalledWith(STUDENT);
  });

  it("exports GET only", () => {
    expect(Object.keys(ssrSession)).toEqual(["GET"]);
  });
});

describe("GET /api/v1/payments/[id]/receipt-document", () => {
  it("401 when signed out (the page redirected to login)", async () => {
    signIn(null);
    const res = await app.request("http://x/api/v1/payments/p-1/receipt-document");
    expect(res.status).toBe(401);
    expect(buildReceiptDocument).not.toHaveBeenCalled();
  });

  it("data is buildReceiptDocument(paymentId, user) for the caller", async () => {
    signIn(STUDENT);
    const doc = {
      receiptNumber: "R-1",
      amount: 12_000,
      currency: "EGP",
      isRefund: false,
      paymentMethod: "cash",
      note: null,
      paidAt: new Date("2026-09-01T08:00:00Z"),
      student: { id: "stu-1", name: "S", code: "ABC" },
      payer: null,
      issuer: { kind: "center", id: "c-1", name: "C" },
      course: null,
      recordedBy: null,
    };
    buildReceiptDocument.mockResolvedValue(doc);
    const res = await app.request("http://x/api/v1/payments/p-1/receipt-document");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual(wire(doc));
    expect(buildReceiptDocument).toHaveBeenCalledWith("p-1", STUDENT);
  });

  it("any AppError from the build is a 404, as the page's notFound() was", async () => {
    signIn(STUDENT);
    for (const err of [new NotFoundError("Payment not found"), new ForbiddenError()]) {
      buildReceiptDocument.mockRejectedValueOnce(err);
      const res = await app.request("http://x/api/v1/payments/p-2/receipt-document");
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("not_found");
    }
  });

  it("a non-AppError is not hidden behind a 404", async () => {
    signIn(STUDENT);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    buildReceiptDocument.mockRejectedValueOnce(new Error("db down"));
    const res = await app.request("http://x/api/v1/payments/p-3/receipt-document");
    expect(res.status).toBe(500);
    quiet.mockRestore();
  });
});

describe("GET /api/v1/reports/print", () => {
  const built = {
    table: { columns: [{ key: "a", header: { ar: "أ", en: "A" }, type: "money" }], rows: [{ a: 100 }], totalRow: { a: 100 } },
    def: { tier: "manager", title: { ar: "ت", en: "T" }, load: async () => null },
  };

  it("401 signed out, 403 for a non-centre role", async () => {
    signIn(null);
    expect((await app.request("http://x/api/v1/reports/print?key=net-profit")).status).toBe(401);
    signIn(STUDENT);
    expect((await app.request("http://x/api/v1/reports/print?key=net-profit")).status).toBe(403);
    expect(buildReportExport).not.toHaveBeenCalled();
  });

  it("403 for a staff role outside the export tiers (receptionist), like /reports/export", async () => {
    signIn(STAFF);
    staffLink.row = { centerId: "c-1", role: "receptionist" };
    const res = await app.request("http://x/api/v1/reports/print?key=net-profit");
    expect(res.status).toBe(403);
    expect(buildReportExport).not.toHaveBeenCalled();
  });

  it("404 for a missing or unknown key (the page's notFound), before any build", async () => {
    signIn(ADMIN);
    for (const q of ["", "?key=", "?key=nope"]) {
      expect((await app.request(`http://x/api/v1/reports/print${q}`)).status).toBe(404);
    }
    expect(buildReportExport).not.toHaveBeenCalled();
  });

  it("centre admin: data is buildReportExport({key, user: actor.acting, staffRole: null, from, to}) — no provenance", async () => {
    signIn(ADMIN);
    buildReportExport.mockResolvedValue(built);
    const res = await app.request("http://x/api/v1/reports/print?key=net-profit&from=2026-09-01&to=2026-09-30");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual(wire(built));
    expect(buildReportExport).toHaveBeenCalledTimes(1);
    const args = buildReportExport.mock.calls[0]![0];
    expect(args).toEqual({
      key: "net-profit",
      user: { id: "adm-1", role: "center_admin", centerId: "c-1", locale: "ar", name: null, email: null },
      staffRole: null,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect("provenance" in args).toBe(false);
  });

  it("accountant staff: acts as the centre (tenancy from the staff link), staffRole forwarded, open range", async () => {
    signIn(STAFF);
    staffLink.row = { centerId: "c-9", role: "center_accountant" };
    buildReportExport.mockResolvedValue(built);
    const res = await app.request("http://x/api/v1/reports/print?key=net-profit");
    expect(res.status).toBe(200);
    expect(buildReportExport.mock.calls[0]![0]).toEqual({
      key: "net-profit",
      user: { id: "stf-1", role: "center_admin", centerId: "c-9", locale: "en", name: null, email: null },
      staffRole: "center_accountant",
      from: undefined,
      to: undefined,
    });
  });

  it("an AppError from the build (a tier refusal) is a 404, as the page's notFound() was", async () => {
    signIn(ADMIN);
    buildReportExport.mockRejectedValueOnce(new ForbiddenError("This staff role cannot export this report"));
    const res = await app.request("http://x/api/v1/reports/print?key=net-profit");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/students/scan/[payload]", () => {
  const valid = {
    outcome: "valid",
    identity: { studentId: null, name: "أ***", studentCode: "K7Q2", educationSystem: null, gradeLevel: null, track: null, tier: "public" },
    counter: null,
    door: null,
  };

  it("session-optional: anonymous is passed as viewer null, never a 401", async () => {
    signIn(null);
    resolveStudentScan.mockResolvedValue(valid);
    const res = await app.request("http://x/api/v1/students/scan/K7Q2");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual(wire(valid));
    expect(resolveStudentScan).toHaveBeenCalledWith("K7Q2", null);
  });

  it("signed in: the viewer is the caller, and the payload is decoded the way the page decoded it", async () => {
    signIn(ADMIN);
    const revoked = { outcome: "revoked", revokedAt: new Date("2026-09-02T00:00:00Z"), reason: "lost", identity: valid.identity };
    resolveStudentScan.mockResolvedValue(revoked);
    // The path segment is decoded once by the router (as Next did) and once
    // more by the handler (as the page did): %252F -> %2F -> /
    const res = await app.request("http://x/api/v1/students/scan/v1%252Fabc");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(wire(revoked));
    expect(resolveStudentScan).toHaveBeenCalledWith("v1/abc", ADMIN);
  });
});
