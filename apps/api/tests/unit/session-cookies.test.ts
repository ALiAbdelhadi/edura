import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import {
  collectServiceCookies,
  cookieName,
  isCookielessRscRequest,
  serviceCookies,
} from "../../src/session-cookies";

const app = () => createApp({ proxySecret: () => undefined, accessLog: false });

// What a server-side auth.api call leaves on ctx.context.responseHeaders.
function authHeaders(...setCookies: string[]): Headers {
  const h = new Headers();
  for (const c of setCookies) h.append("set-cookie", c);
  return h;
}

const SESSION = "__Secure-edura.session_token=abc.def; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax";

describe("service cookie sink", () => {
  it("appends what the auth layer set onto the response, attributes untouched", async () => {
    const a = app();
    a.get("/api/v1/probe", () => {
      collectServiceCookies(authHeaders(SESSION, "edura.two_factor=x; Path=/; HttpOnly"));
      return Response.json({ ok: true });
    });
    const res = await a.request("http://localhost/api/v1/probe");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([SESSION, "edura.two_factor=x; Path=/; HttpOnly"]);
  });

  it("keeps the LAST value the auth layer set per name", async () => {
    const a = app();
    a.get("/api/v1/probe", () => {
      collectServiceCookies(authHeaders("edura.session_token=first; Path=/"));
      collectServiceCookies(authHeaders("edura.session_token=second; Path=/"));
      return Response.json({ ok: true });
    });
    const res = await a.request("http://localhost/api/v1/probe");
    expect(res.headers.getSetCookie()).toEqual(["edura.session_token=second; Path=/"]);
  });

  it("the route's own set-cookie wins over the sink's copy of the same name", async () => {
    const a = app();
    a.get("/api/v1/probe", () => {
      collectServiceCookies(authHeaders("edura.session_token=stale; Path=/", "edura.other=1; Path=/"));
      const res = Response.json({ ok: true });
      res.headers.append("set-cookie", "edura.session_token=; Max-Age=0; Path=/");
      return res;
    });
    const res = await a.request("http://localhost/api/v1/probe");
    expect(res.headers.getSetCookie().sort()).toEqual(
      ["edura.other=1; Path=/", "edura.session_token=; Max-Age=0; Path=/"].sort(),
    );
  });

  it("appends alongside the request-id middleware on a handler-built Response", async () => {
    const a = app();
    a.get("/api/v1/probe", () => {
      collectServiceCookies(authHeaders(SESSION));
      return Response.json({ ok: true }, { headers: { "x-request-id": "will-be-overwritten-anyway" } });
    });
    const res = await a.request("http://localhost/api/v1/probe");
    // Both later middlewares (request id, cookie sink) wrote onto the same response.
    expect(res.headers.getSetCookie()).toEqual([SESSION]);
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("leaves a response alone when the auth layer set nothing", async () => {
    const a = app();
    a.get("/api/v1/probe", () => {
      collectServiceCookies(new Headers());
      collectServiceCookies(undefined);
      return Response.json({ ok: true });
    });
    const res = await a.request("http://localhost/api/v1/probe");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("is a no-op outside a request scope", () => {
    expect(() => collectServiceCookies(authHeaders(SESSION))).not.toThrow();
  });

  it("reads the name up to the first '=' including a __Secure- prefix", () => {
    expect(cookieName(SESSION)).toBe("__Secure-edura.session_token");
    expect(cookieName(" a=b=c; Path=/")).toBe("a");
    expect(cookieName("bare")).toBe("bare");
  });
});

describe("RSC session-refresh skip (nextCookies' rule)", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("RSC: 1 without next-action is the one cookieless case", () => {
    expect(isCookielessRscRequest(h({ RSC: "1" }))).toBe(true);
    expect(isCookielessRscRequest(h({ RSC: "1", "next-action": "abc" }))).toBe(false);
    expect(isCookielessRscRequest(h({}))).toBe(false);
    expect(isCookielessRscRequest(h({ RSC: "0" }))).toBe(false);
  });
});

describe("serviceCookies() plugin shape", () => {
  const plugin = serviceCookies();
  it("has nextCookies' id slot, matchers and hook count", () => {
    expect(plugin.id).toBe("service-cookies");
    const before = plugin.hooks?.before ?? [];
    const after = plugin.hooks?.after ?? [];
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    const ctx = (path: string) => ({ path }) as Parameters<(typeof before)[0]["matcher"]>[0];
    expect(before[0]!.matcher(ctx("/get-session"))).toBe(true);
    expect(before[0]!.matcher(ctx("/sign-in/email"))).toBe(false);
    expect(after[0]!.matcher(ctx("/sign-in/email"))).toBe(true);
  });
});
