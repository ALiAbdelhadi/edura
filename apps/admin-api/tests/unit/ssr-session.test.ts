import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setRequestHeadersSource } from "@repo/server-core/http/request-context";
import { setAdminAuth } from "@repo/server-core/backoffice-auth/instance";
import { mountRoutes } from "../../src/routes/mount";
import * as ssrSession from "../../src/routes/v1/me/ssr-session/route";

// Phase 5: the read apps/superadmin's dashboard layout made in-process through
// auth.api.getSession. What is pinned: (a) the route hands getSession the
// request's own headers, (b) `data` carries only the user's id + 2FA flag and
// whether the session is an impersonation — never the session row or token,
// (c) signed out is a 200 with user null, and (d) the response is no-store.

const getSession = vi.fn();
setAdminAuth({ api: { getSession: (args: unknown) => getSession(args) } } as never);

const app = new Hono();
mountRoutes(app, [{ path: "/api/v1/me/ssr-session", module: ssrSession }]);

let presented: Headers = new Headers();
setRequestHeadersSource(async () => presented);

afterEach(() => {
  vi.clearAllMocks();
  presented = new Headers();
});

describe("GET /api/v1/me/ssr-session", () => {
  it("signed out: 200 with user null and impersonated false, no-store", async () => {
    getSession.mockResolvedValue(null);
    const res = await app.request("http://x/api/v1/me/ssr-session");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ data: { user: null, impersonated: false } });
  });

  it("signed in: hands getSession the caller's headers and answers id + twoFactorEnabled only", async () => {
    presented = new Headers({ cookie: "edura-superadmin.session_token=abc" });
    getSession.mockResolvedValue({
      user: { id: "sa-1", email: "sa@edura.eg", role: "super_admin", twoFactorEnabled: true },
      session: { id: "s-1", token: "tok-1", userId: "sa-1", impersonatedBy: null, expiresAt: new Date("2026-10-02T10:00:00Z") },
    });
    const res = await app.request("http://x/api/v1/me/ssr-session", { headers: presented });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ data: { user: { id: "sa-1", twoFactorEnabled: true }, impersonated: false } });
    expect(getSession).toHaveBeenCalledTimes(1);
    const args = getSession.mock.calls[0]![0] as { headers: Headers };
    expect(args.headers.get("cookie")).toBe("edura-superadmin.session_token=abc");
  });

  it("an impersonated session is reported as impersonated: true, with the target's id", async () => {
    getSession.mockResolvedValue({
      user: { id: "u-2", role: "accountant", twoFactorEnabled: false },
      session: { id: "s-2", token: "tok-2", userId: "u-2", impersonatedBy: "sa-1" },
    });
    const res = await app.request("http://x/api/v1/me/ssr-session");
    expect(await res.json()).toEqual({ data: { user: { id: "u-2", twoFactorEnabled: false }, impersonated: true } });
  });

  it("exports GET only", () => {
    expect(Object.keys(ssrSession)).toEqual(["GET"]);
  });
});
