import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_PREFIX } from "@repo/server-core/erp-auth/cookie-prefix";
import { __setSessionOverrideForTests, type SessionUser } from "@repo/server-core/erp-auth/session";
import { mountRoutes } from "../../src/routes/mount";

// Phase 4: the public reads that /p/[handle], /pricing and sitemap.ts used to
// make in-process. The profile gate moved from apps/erp to server-core with
// its cases (formerly apps/erp/tests/unit/public-profile-for-request.test.ts).

const state = vi.hoisted(() => ({
  shared: { kind: "center", id: "center-1", handle: "h" } as null | { kind: string; id: string; handle: string },
  fresh: 0,
  sharedReads: 0,
}));

vi.mock("@repo/server-core/services/public-handles/public-profiles", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/services/public-handles/public-profiles")>()),
  readPublicProfile: async () => {
    state.fresh++;
    return { kind: "fresh", id: "center-1", handle: "h" };
  },
}));
vi.mock("@repo/server-core/services/public-handles/public-profiles-cache", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/services/public-handles/public-profiles-cache")>()),
  resolvePublicProfileAnonymous: async () => {
    state.sharedReads++;
    return state.shared;
  },
}));
const getPricingExamples = vi.fn();
vi.mock("@repo/server-core/services/pricing/public-rates", () => ({
  getPricingExamples: () => getPricingExamples(),
}));
const listSitemapHandles = vi.fn();
vi.mock("@repo/server-core/services/public-handles/sitemap-handles", () => ({
  listSitemapHandles: () => listSitemapHandles(),
}));

import {
  mayEditProfile,
  publicProfileForRequest,
} from "@repo/server-core/services/public-handles/public-profile-for-request";
import * as profile from "../../src/routes/v1/public/profiles/[handle]/route";
import * as pricing from "../../src/routes/v1/public/pricing/route";
import * as sitemap from "../../src/routes/v1/public/sitemap-handles/route";

const app = new Hono();
mountRoutes(app, [
  { path: "/api/v1/public/profiles/[handle]", module: profile },
  { path: "/api/v1/public/pricing", module: pricing },
  { path: "/api/v1/public/sitemap-handles", module: sitemap },
]);

const session = `${SESSION_COOKIE_PREFIX}.session_token=abc.def`;
let viewer: SessionUser | null = null;
let sessionReads = 0;

const wire = (v: unknown) => JSON.parse(JSON.stringify(v));

beforeEach(() => {
  __setSessionOverrideForTests(() => {
    sessionReads++;
    return viewer;
  });
  viewer = null;
  sessionReads = 0;
  state.fresh = 0;
  state.sharedReads = 0;
  state.shared = { kind: "center", id: "center-1", handle: "h" };
});
afterEach(() => {
  __setSessionOverrideForTests(null);
  vi.clearAllMocks();
});

async function pathFor(cookie: string | null) {
  const out = await publicProfileForRequest("h", cookie);
  return (out as { kind: string } | null)?.kind === "fresh" ? "fresh" : "shared";
}

describe("publicProfileForRequest (moved unchanged from apps/erp)", () => {
  it("serves an anonymous visitor from the shared cache without a session query", async () => {
    expect(await pathFor(null)).toBe("shared");
    expect(sessionReads).toBe(0);
  });

  it("treats unrelated cookies as anonymous", async () => {
    expect(await pathFor("NEXT_LOCALE=ar; theme=dark")).toBe("shared");
    expect(sessionReads).toBe(0);
  });

  it("serves a signed-in visitor who cannot edit the profile from the shared cache", async () => {
    viewer = { id: "student-1", role: "student", locale: "ar" };
    expect(await pathFor(session)).toBe("shared");
  });

  it("reads fresh for the centre's own admin — an owner always sees their edit", async () => {
    viewer = { id: "admin-1", role: "center_admin", centerId: "center-1", locale: "ar" };
    expect(await pathFor(session)).toBe("fresh");
  });

  it("serves another centre's admin from the shared cache", async () => {
    viewer = { id: "admin-2", role: "center_admin", centerId: "center-2", locale: "ar" };
    expect(await pathFor(session)).toBe("shared");
  });

  it("reads fresh when a session cookie meets a handle the cache says is missing", async () => {
    state.shared = null;
    expect(await pathFor(`__Secure-${session}`)).toBe("fresh");
  });

  it("treats a garbage session cookie (no user) as a non-editor", async () => {
    viewer = null;
    expect(await pathFor(session)).toBe("shared");
  });
});

describe("mayEditProfile", () => {
  const center = { kind: "center", id: "c1" } as never;
  const teacher = { kind: "teacher", id: "t1" } as never;
  const v = (role: string, extra: object = {}) => ({ id: "u", role, ...extra }) as never;

  it("centre: its admin and staff, or a centre role whose centre is unknown", () => {
    expect(mayEditProfile(v("center_admin", { centerId: "c1" }), center)).toBe(true);
    expect(mayEditProfile(v("center_staff", { centerId: "c1" }), center)).toBe(true);
    expect(mayEditProfile(v("center_admin"), center)).toBe(true);
    expect(mayEditProfile(v("center_admin", { centerId: "c2" }), center)).toBe(false);
    expect(mayEditProfile(v("teacher"), center)).toBe(false);
  });

  it("teacher: the teacher, and any assistant", () => {
    expect(mayEditProfile({ id: "t1", role: "teacher" } as never, teacher)).toBe(true);
    expect(mayEditProfile(v("assistant"), teacher)).toBe(true);
    expect(mayEditProfile(v("teacher"), teacher)).toBe(false);
    expect(mayEditProfile(v("parent"), teacher)).toBe(false);
  });
});

describe("GET /api/v1/public/profiles/[handle]", () => {
  it("anonymous: data is the gate's shared answer, no session read, and still no-store", async () => {
    const res = await app.request("http://x/api/v1/public/profiles/h");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual(wire(await publicProfileForRequest("h", null)));
    expect(sessionReads).toBe(0);
  });

  it("with a session cookie: the request's Cookie header reaches the gate; an editor is read fresh and never cached", async () => {
    viewer = { id: "admin-1", role: "center_admin", centerId: "center-1", locale: "ar" };
    const res = await app.request("http://x/api/v1/public/profiles/h", { headers: { cookie: session } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual({ kind: "fresh", id: "center-1", handle: "h" });
    expect(state.fresh).toBe(1);
  });

  it("404 when the gate answers null (the page's notFound)", async () => {
    state.shared = null;
    const res = await app.request("http://x/api/v1/public/profiles/nope");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("never carries a CDN cache header: it reads the session on one branch", () => {
    expect(Object.keys(profile)).toEqual(["GET"]);
  });
});

describe("GET /api/v1/public/pricing", () => {
  it("data is getPricingExamples(), verbatim", async () => {
    const examples = {
      rates: { teacherDirectBp: 1000, platformTeacherFee: 500, platformCenterFee: 500, split: null, live: false },
      teacherDirect: { price: 30_000, platformCommission: 3_000, teacherNet: 27_000 },
      hallSplit: null,
      flatFee: { lessonPrice: 5_000, platform: 1_000, center: 0, teacher: 4_000 },
    };
    getPricingExamples.mockResolvedValue(examples);
    const res = await app.request("http://x/api/v1/public/pricing");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual(wire(examples));
  });
});

describe("GET /api/v1/public/sitemap-handles", () => {
  it("data is listSitemapHandles(), verbatim (dates as ISO strings)", async () => {
    const rows = [
      { handle: "a", updatedAt: new Date("2026-09-01T00:00:00Z") },
      { handle: "b", updatedAt: new Date("2026-09-02T00:00:00Z") },
    ];
    listSitemapHandles.mockResolvedValue(rows);
    const res = await app.request("http://x/api/v1/public/sitemap-handles");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toEqual(wire(rows));
  });

  it("a database failure is a 500 envelope; the ERP sitemap keeps its own try/catch -> []", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    listSitemapHandles.mockRejectedValueOnce(new Error("no db"));
    const res = await app.request("http://x/api/v1/public/sitemap-handles");
    expect(res.status).toBe(500);
    quiet.mockRestore();
  });
});
