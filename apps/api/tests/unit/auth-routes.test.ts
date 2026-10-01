import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErpAuth } from "@repo/server-core/erp-auth/create-auth";
import { setErpAuth } from "@repo/server-core/erp-auth/instance";
import { APIError } from "@repo/server-core/erp-auth/plugin-api";
import { mountRoutes } from "../../src/routes/mount";

// The three auth routes reach the database only through these; everything
// else they do (the redirect, the cookies, the method surface) is what the
// tests below pin to the ERP's former Next behaviour.
const platformDb = vi.fn();
vi.mock("@repo/server-core/db/scope", () => ({ platformDb: (fn: unknown) => platformDb(fn) }));
const getSessionUser = vi.fn();
vi.mock("@repo/server-core/erp-auth/session", () => ({ getSessionUser: () => getSessionUser() }));
const getViewAsContext = vi.fn();
vi.mock("@repo/server-core/erp-auth/view-as", async (importActual) => ({
  ...(await importActual<typeof import("@repo/server-core/erp-auth/view-as")>()),
  getViewAsContext: () => getViewAsContext(),
}));
const recordViewAsEnded = vi.fn();
vi.mock("@repo/server-core/services/auth/view-as-audit", () => ({
  recordViewAsEnded: (row: unknown) => recordViewAsEnded(row),
}));

import * as authAll from "../../src/routes/auth/[...all]/route";
import * as claim from "../../src/routes/v1/auth/view-as/claim/route";
import * as stop from "../../src/routes/v1/auth/view-as/stop/route";

const ORIGIN = "https://erp.example";
const SESSION = "edura.session_token=tok.sig; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax";
const CLEAR = "edura.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

function fakeAuth(overrides: Record<string, unknown> = {}): ErpAuth {
  return {
    handler: async (req: Request) =>
      Response.json({ method: req.method, path: new URL(req.url).pathname }),
    api: {},
    ...overrides,
  } as unknown as ErpAuth;
}

function withCookies(...raw: string[]): Headers {
  const h = new Headers();
  for (const c of raw) h.append("set-cookie", c);
  return h;
}

function form(fields: Record<string, string>, url = `${ORIGIN}/api/v1/auth/view-as/claim`): Request {
  return new Request(url, { method: "POST", body: new URLSearchParams(fields) });
}

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_URL", ORIGIN);
  vi.stubEnv("SUPERADMIN_BASE_URL", "https://back.example/");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/auth/[...all] — better-auth's handler under Next's method rules", () => {
  const app = new Hono();
  mountRoutes(app, [{ path: "/api/auth/[...all]", module: authAll }]);

  it("exports exactly what the ERP route exported: GET and its own POST", () => {
    expect(Object.keys(authAll).sort()).toEqual(["GET", "POST"]);
  });

  it("GET and POST hand the raw request to the registered instance's handler", async () => {
    setErpAuth(fakeAuth());
    const get = await app.request(`${ORIGIN}/api/auth/get-session`);
    expect(await get.json()).toEqual({ method: "GET", path: "/api/auth/get-session" });
    const post = await app.request(`${ORIGIN}/api/auth/sign-in/email`, { method: "POST" });
    expect(await post.json()).toEqual({ method: "POST", path: "/api/auth/sign-in/email" });
    expect(platformDb).not.toHaveBeenCalled();
  });

  it("resolves the instance per request, so each host's own registration is the one used", async () => {
    setErpAuth(fakeAuth({ handler: async () => new Response("first") }));
    expect(await (await app.request(`${ORIGIN}/api/auth/ok`)).text()).toBe("first");
    setErpAuth(fakeAuth({ handler: async () => new Response("second") }));
    expect(await (await app.request(`${ORIGIN}/api/auth/ok`)).text()).toBe("second");
  });

  it("HEAD runs GET, OPTIONS lists the surface, PATCH/PUT/DELETE are 405 as in Next", async () => {
    setErpAuth(fakeAuth());
    const head = await app.request(`${ORIGIN}/api/auth/get-session`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const options = await app.request(`${ORIGIN}/api/auth/get-session`, { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const res = await app.request(`${ORIGIN}/api/auth/get-session`, { method });
      expect(res.status).toBe(405);
    }
  });

  it("sign-out revokes every session token the request presented, after the handler ran", async () => {
    setErpAuth(fakeAuth());
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    platformDb.mockImplementation((fn: (tx: unknown) => unknown) => fn({ authSession: { deleteMany } }));
    const res = await app.request(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: "edura.session_token=A.sigA; __Secure-edura.session_token=B.sigB; theme=dark" },
    });
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["A", "B"] } } });
  });

  it("sign-out with no session cookie touches nothing; a failed revocation does not fail the response", async () => {
    setErpAuth(fakeAuth());
    const bare = await app.request(`${ORIGIN}/api/auth/sign-out`, { method: "POST" });
    expect(bare.status).toBe(200);
    expect(platformDb).not.toHaveBeenCalled();

    platformDb.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.request(`${ORIGIN}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: "edura.session_token=A.sigA" },
    });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("[sign-out] surplus session revocation failed", expect.any(Error));
  });
});

describe("POST /api/v1/auth/view-as/claim — redirect built from the public origin", () => {
  it("is a 303 to /login with no cookie when the form carries no token", async () => {
    const claimViewAs = vi.fn();
    setErpAuth(fakeAuth({ api: { claimViewAs } }));
    const res = await claim.POST(form({}, "http://api-service.internal:3006/api/v1/auth/view-as/claim"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login`);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await res.text()).toBe("");
    expect(claimViewAs).not.toHaveBeenCalled();
  });

  it("is the same 303 to /login when the claim is refused, and rethrows anything else", async () => {
    const claimViewAs = vi.fn().mockRejectedValueOnce(new APIError("UNAUTHORIZED", { message: "no" }));
    setErpAuth(fakeAuth({ api: { claimViewAs } }));
    const refused = await claim.POST(form({ token: "t" }));
    expect(refused.status).toBe(303);
    expect(refused.headers.get("location")).toBe(`${ORIGIN}/login`);
    expect(refused.headers.getSetCookie()).toEqual([]);

    claimViewAs.mockRejectedValueOnce(new Error("boom"));
    await expect(claim.POST(form({ token: "t" }))).rejects.toThrow("boom");
  });

  it("on success: 303 to the user's locale dashboard on the public origin, carrying the minted cookies verbatim", async () => {
    const claimViewAs = vi.fn().mockResolvedValue({
      headers: withCookies(SESSION, "edura.two_factor=x; Path=/; HttpOnly"),
      response: { user: { locale: "en" } },
    });
    setErpAuth(fakeAuth({ api: { claimViewAs } }));
    const req = form({ token: "signed" }, "http://api-service.internal:3006/api/v1/auth/view-as/claim");
    const res = await claim.POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/en/dashboard`);
    expect(res.headers.getSetCookie()).toEqual([SESSION, "edura.two_factor=x; Path=/; HttpOnly"]);
    expect(claimViewAs).toHaveBeenCalledWith({ body: { token: "signed" }, headers: req.headers, returnHeaders: true });
  });

  it("any locale but 'en' lands on /ar/dashboard", async () => {
    setErpAuth(fakeAuth({ api: { claimViewAs: vi.fn().mockResolvedValue({ headers: new Headers(), response: {} }) } }));
    const res = await claim.POST(form({ token: "t" }));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/ar/dashboard`);
  });
});

describe("POST /api/v1/auth/view-as/stop", () => {
  const signOut = vi.fn();
  beforeEach(() => {
    signOut.mockResolvedValue({ headers: withCookies(CLEAR) });
    setErpAuth(fakeAuth({ api: { signOut } }));
  });

  it("outside a view-as session: 303 to /dashboard on the public origin, nothing signed out", async () => {
    getViewAsContext.mockResolvedValue(null);
    const res = await stop.POST(new Request("http://api-service.internal:3006/api/v1/auth/view-as/stop", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(signOut).not.toHaveBeenCalled();
    expect(recordViewAsEnded).not.toHaveBeenCalled();
  });

  it("inside one: audits the end, signs out with the request headers, 303 back to the back office with the clear cookie", async () => {
    getViewAsContext.mockResolvedValue({ actorId: "admin-1", actorName: null, actorEmail: null, expiresAt: null });
    getSessionUser.mockResolvedValue({ id: "teacher-1", role: "teacher" });
    recordViewAsEnded.mockResolvedValue(undefined);
    const req = new Request(`${ORIGIN}/api/v1/auth/view-as/stop`, {
      method: "POST",
      headers: { cookie: "edura.session_token=tok.sig", "x-forwarded-for": "203.0.113.9" },
    });
    const res = await stop.POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://back.example/dashboard");
    expect(res.headers.getSetCookie()).toEqual([CLEAR]);
    expect(await res.text()).toBe("");
    expect(signOut).toHaveBeenCalledWith({ headers: req.headers, returnHeaders: true });
    expect(recordViewAsEnded).toHaveBeenCalledWith({
      actorId: "admin-1",
      action: "user.view_as_ended",
      targetId: "teacher-1",
      targetRole: "teacher",
      app: "erp",
      ipAddress: expect.any(String),
    });
  });

  it("a failed audit write never blocks the sign-out", async () => {
    getViewAsContext.mockResolvedValue({ actorId: "admin-1", actorName: null, actorEmail: null, expiresAt: null });
    getSessionUser.mockResolvedValue({ id: "teacher-1", role: "teacher" });
    recordViewAsEnded.mockRejectedValue(new Error("audit down"));
    const res = await stop.POST(new Request(`${ORIGIN}/api/v1/auth/view-as/stop`, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
