import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next-intl's middleware cannot be loaded under vitest (it imports a bare
// "next/server" from inside its own package). It is not under test here —
// the tenant branch runs BEFORE it and returns without calling it — so it is
// replaced by a pass-through that marks the response.
vi.mock("next-intl/middleware", () => ({
  default: () => () => {
    const res = NextResponse.next();
    res.headers.set("x-test-intl", "1");
    return res;
  },
}));

import middleware, { config } from "@/proxy";

// src/proxy.ts: a tenant host serves ONE thing. Its root is rewritten to the
// public page; every other path is sent back to the canonical host, so no
// login, session or API call ever happens on a subdomain.

function req(url: string, host: string) {
  return new NextRequest(url, { headers: { host } });
}

const ENV = { PUBLIC_ROOT_DOMAIN: process.env.PUBLIC_ROOT_DOMAIN, APP_BASE_URL: process.env.APP_BASE_URL };

describe("tenant subdomain routing", () => {
  beforeEach(() => {
    process.env.PUBLIC_ROOT_DOMAIN = "edura.com";
    process.env.APP_BASE_URL = "https://www.edura.com";
  });
  afterEach(() => {
    process.env.PUBLIC_ROOT_DOMAIN = ENV.PUBLIC_ROOT_DOMAIN;
    process.env.APP_BASE_URL = ENV.APP_BASE_URL;
  });

  it("rewrites the root of a tenant host to the default-locale public page", () => {
    const res = middleware(req("https://elmaged.edura.com/", "elmaged.edura.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://elmaged.edura.com/ar/p/elmaged");
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps an explicit locale", () => {
    const res = middleware(req("https://elmaged.edura.com/en", "elmaged.edura.com"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://elmaged.edura.com/en/p/elmaged");
  });

  it("sends every other path back to the canonical host — no auth on a subdomain", () => {
    for (const path of ["/ar/login", "/register", "/ar/dashboard/admin", "/en/p/other?x=1"]) {
      const res = middleware(req(`https://elmaged.edura.com${path}`, "elmaged.edura.com"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`https://www.edura.com${path}`);
    }
  });

  it("still carries the per-request CSP on a tenant response", () => {
    const res = middleware(req("https://elmaged.edura.com/", "elmaged.edura.com"));
    const csp = res.headers.get("content-security-policy") ?? res.headers.get("content-security-policy-report-only");
    expect(csp).toMatch(/nonce-/);
  });

  it("treats the root domain, www and a reserved label as ordinary hosts (intl runs)", () => {
    for (const host of ["edura.com", "www.edura.com", "api.edura.com", "a.b.edura.com"]) {
      const res = middleware(req(`https://${host}/`, host));
      expect(res.headers.get("x-test-intl")).toBe("1");
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      expect(res.headers.get("location")).toBeNull();
    }
  });

  // SECURITY_AUDIT.md (2026-09-11) DIFF-01: the matcher used to exclude /api
  // and /ingest, so the tenant branch never saw them and the "no API call ever
  // lives on a tenant subdomain" claim above was only true for page paths.
  it("the exported matcher reaches API and ingest paths (so the tenant branch can refuse them)", () => {
    const re = new RegExp(`^${config.matcher[0]!.replace(/^\//, "/")}$`);
    for (const p of ["/api/auth/sign-in/email", "/api/v1/centers/x", "/ingest/e"]) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of ["/_next/static/x.js", "/sw.js", "/_vercel/insights"]) {
      expect(re.test(p), p).toBe(false);
    }
  });

  it("refuses API and ingest paths on a tenant host with 404 — never a redirect carrying a credential", () => {
    for (const p of ["/api/auth/sign-in/email", "/api/v1/centers/x", "/ingest/e"]) {
      const res = middleware(req(`https://elmaged.edura.com${p}`, "elmaged.edura.com"));
      expect(res.status, p).toBe(404);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("passes API paths through untouched on the canonical host (no locale routing, no page CSP)", () => {
    const res = middleware(req("https://www.edura.com/api/v1/centers/x", "www.edura.com"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test-intl")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });

  it("is dormant without PUBLIC_ROOT_DOMAIN", () => {
    delete process.env.PUBLIC_ROOT_DOMAIN;
    const res = middleware(req("https://elmaged.edura.com/", "elmaged.edura.com"));
    expect(res.headers.get("x-test-intl")).toBe("1");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.status).not.toBe(307);
  });
});
