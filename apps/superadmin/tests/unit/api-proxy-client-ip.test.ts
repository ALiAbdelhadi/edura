import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => () => {
    const res = NextResponse.next();
    res.headers.set("x-test-intl", "1");
    return res;
  },
}));

import middleware from "@/proxy";

// docs/decisions/backend-separation.md "Client IP": the proxy drops whatever
// the browser sent under the two edura names and, when EDURA_PROXY_SECRET is
// set, stamps the platform-derived IP plus the secret on the request the
// rewrite forwards to apps/admin-api. Next carries request-header overrides on
// the middleware response as `x-middleware-request-<name>`.

const SECRET = "proxy-secret-for-tests-0000000000";
const forwarded = (res: NextResponse, name: string) =>
  res.headers.get(`x-middleware-request-${name}`);

function req(path: string, headers: Record<string, string>) {
  return new NextRequest(`https://admin.edura.com${path}`, { headers: { host: "admin.edura.com", ...headers } });
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy: client-IP stamp for the admin-api service", () => {
  it("with the secret set, a forged client-IP header leaves replaced by the platform IP, plus the secret", () => {
    vi.stubEnv("EDURA_PROXY_SECRET", SECRET);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const res = middleware(
      req("/api/v1/admin/users", {
        "x-edura-client-ip": "1.2.3.4",
        "x-edura-proxy-auth": "browser-guess",
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "9.9.9.9",
      }),
    );
    expect(res.status).toBe(200);
    expect(forwarded(res, "x-edura-client-ip")).toBe("203.0.113.7");
    expect(forwarded(res, "x-edura-proxy-auth")).toBe(SECRET);
    expect(res.headers.get("x-middleware-override-headers")).toContain("x-edura-client-ip");
    // No page behaviour on an API path: no locale redirect, no intl, no page CSP.
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-test-intl")).toBeNull();
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(forwarded(res, "x-nonce")).toBeNull();
  });

  it("without the secret, a browser-set stamp is still dropped and nothing is added", () => {
    vi.stubEnv("EDURA_PROXY_SECRET", "");
    const res = middleware(
      req("/api/auth/sign-in/email", { "x-edura-client-ip": "1.2.3.4", "x-edura-proxy-auth": "x", "x-forwarded-for": "9.9.9.9" }),
    );
    expect(res.status).toBe(200);
    const overridden = res.headers.get("x-middleware-override-headers") ?? "";
    expect(overridden).not.toContain("x-edura-client-ip");
    expect(overridden).not.toContain("x-edura-proxy-auth");
    expect(forwarded(res, "x-edura-client-ip")).toBeNull();
    expect(forwarded(res, "x-edura-proxy-auth")).toBeNull();
    expect(forwarded(res, "x-forwarded-for")).toBe("9.9.9.9");
    expect(res.headers.get("x-test-intl")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });

  it("a page request keeps its page behaviour (intl + nonce + CSP) and is never stamped", () => {
    vi.stubEnv("EDURA_PROXY_SECRET", SECRET);
    const res = middleware(req("/ar/dashboard", { "x-edura-client-ip": "1.2.3.4" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test-intl")).toBe("1");
    expect(res.headers.get("content-security-policy")).toContain("nonce-");
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
  });
});
