import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedClientIp } from "@repo/server-core/rate-limit/token-bucket";
import { requestHeaders } from "@repo/server-core/http/request-context";
import {
  CLIENT_IP_HEADER,
  PROXY_AUTH_HEADER,
  stampProxyClientIp,
} from "@repo/server-core/http/proxy-client-ip";
import { resolveProxiedClientIp } from "@repo/server-core/http/proxy-client-ip-trust";
import { createApp } from "../../src/app";

// The one rule: per-IP limits key on an IP the edge vouches for, never on a
// header the browser can set. docs/decisions/backend-separation.md "Client IP".

const SECRET = "proxy-secret-for-tests-0000000000";

afterEach(() => vi.unstubAllEnvs());

function whoAmI(secret: string | undefined) {
  const app = createApp({ proxySecret: () => secret, accessLog: false });
  app.get("/api/v1/whoami", async (c) => {
    // What a handler sees (c.get), what core sees through the raw request, and
    // what code that is not handed the request sees through requestHeaders().
    const bound = await requestHeaders();
    return Response.json({
      ip: c.get("clientIp"),
      vouched: c.get("clientIpVouched"),
      core: trustedClientIp((n) => c.req.raw.headers.get(n)),
      viaContext: trustedClientIp((n) => bound.get(n)),
      leaked: c.req.raw.headers.get(CLIENT_IP_HEADER) ?? bound.get(CLIENT_IP_HEADER),
      auth: c.req.raw.headers.get(PROXY_AUTH_HEADER),
    });
  });
  return async (headers: Record<string, string>) => {
    const res = await app.request("http://localhost/api/v1/whoami", { headers });
    return (await res.json()) as {
      ip: string;
      vouched: boolean;
      core: string;
      viaContext: string;
      leaked: string | null;
      auth: string | null;
    };
  };
}

describe("service: x-edura-client-ip is believed only with the shared secret", () => {
  it("a spoofed stamp with NO secret header is ignored and stripped", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const ask = whoAmI(SECRET);
    const a = await ask({ [CLIENT_IP_HEADER]: "1.2.3.4", "x-forwarded-for": "203.0.113.7" });
    expect(a).toMatchObject({ ip: "203.0.113.7", vouched: false, core: "203.0.113.7", viaContext: "203.0.113.7", leaked: null, auth: null });
    const b = await ask({ [CLIENT_IP_HEADER]: "5.6.7.8", "x-forwarded-for": "203.0.113.7" });
    expect(b.ip).toBe(a.ip); // rotating the spoof does not rotate the key
  });

  it("a spoofed stamp with the WRONG secret is ignored and stripped", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const ask = whoAmI(SECRET);
    const r = await ask({
      [CLIENT_IP_HEADER]: "1.2.3.4",
      [PROXY_AUTH_HEADER]: "not-the-secret",
      "x-forwarded-for": "203.0.113.7",
    });
    expect(r).toMatchObject({ ip: "203.0.113.7", vouched: false, core: "203.0.113.7", leaked: null, auth: null });
  });

  it("with the service secret UNSET a stamp is never honoured, whatever it carries", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const ask = whoAmI(undefined);
    const r = await ask({ [CLIENT_IP_HEADER]: "1.2.3.4", [PROXY_AUTH_HEADER]: "", "x-forwarded-for": "203.0.113.7" });
    expect(r).toMatchObject({ ip: "203.0.113.7", vouched: false, leaked: null });
  });

  it("the correct secret is honoured by the handler, by core and by requestHeaders()", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const ask = whoAmI(SECRET);
    const r = await ask({
      [CLIENT_IP_HEADER]: "198.51.100.42",
      [PROXY_AUTH_HEADER]: SECRET,
      "x-forwarded-for": "10.0.0.9", // the rewrite hop's own address
    });
    expect(r).toMatchObject({
      ip: "198.51.100.42",
      vouched: true,
      core: "198.51.100.42",
      viaContext: "198.51.100.42",
      leaked: null,
      auth: null,
    });
  });

  it("a vouched stamp lands in the TRUSTED_CLIENT_IP_HEADER slot when the deployment names one", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-railway-client-ip");
    const ask = whoAmI(SECRET);
    const r = await ask({
      [CLIENT_IP_HEADER]: "198.51.100.42",
      [PROXY_AUTH_HEADER]: SECRET,
      "x-railway-client-ip": "10.0.0.9",
      "x-forwarded-for": "9.9.9.9, 10.0.0.9",
    });
    expect(r).toMatchObject({ ip: "198.51.100.42", core: "198.51.100.42", vouched: true });
  });

  it("direct traffic (no stamp) reads the service's own platform header, unchanged", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-railway-client-ip");
    const ask = whoAmI(SECRET);
    const r = await ask({ "x-railway-client-ip": "203.0.113.50", "x-forwarded-for": "9.9.9.9, 10.0.0.9" });
    expect(r).toMatchObject({ ip: "203.0.113.50", core: "203.0.113.50", vouched: false });
  });

  it("a vouched but unparseable stamp yields 'unknown' — never a fallback the client could steer", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const h = new Headers({
      [CLIENT_IP_HEADER]: "unknown",
      [PROXY_AUTH_HEADER]: SECRET,
      "x-forwarded-for": "9.9.9.9",
    });
    const r = resolveProxiedClientIp(h, SECRET);
    expect(r.ip).toBe("unknown");
    expect(r.vouched).toBe(true);
    expect(trustedClientIp((n) => r.headers.get(n))).toBe("unknown");
  });
});

describe("proxy: stampProxyClientIp", () => {
  it("always deletes a browser-set stamp and auth header", () => {
    const h = new Headers({ [CLIENT_IP_HEADER]: "1.2.3.4", [PROXY_AUTH_HEADER]: "x", "x-forwarded-for": "203.0.113.7" });
    stampProxyClientIp(h, undefined);
    expect(h.get(CLIENT_IP_HEADER)).toBeNull();
    expect(h.get(PROXY_AUTH_HEADER)).toBeNull();
    expect(h.get("x-forwarded-for")).toBe("203.0.113.7");
  });

  it("with the secret set, stamps the platform-derived IP (not the browser's) and the secret", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const h = new Headers({
      [CLIENT_IP_HEADER]: "1.2.3.4",
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "9.9.9.9",
    });
    stampProxyClientIp(h, SECRET);
    expect(h.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(h.get(PROXY_AUTH_HEADER)).toBe(SECRET);
  });

  it("proxy stamp -> service verify round-trips end to end", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const h = new Headers({ [CLIENT_IP_HEADER]: "1.2.3.4", "x-forwarded-for": "203.0.113.7" });
    stampProxyClientIp(h, SECRET);
    const ask = whoAmI(SECRET);
    const r = await ask(Object.fromEntries(h.entries()));
    expect(r).toMatchObject({ ip: "203.0.113.7", vouched: true, core: "203.0.113.7" });
  });
});
