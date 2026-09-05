import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as erpCsp from "@/lib/security/csp";
import * as saCsp from "../../../superadmin/src/lib/security/csp";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// SECURITY_AUDIT.md M-09: the page CSP is minted per request in src/proxy.ts
// with a nonce; next.config keeps the transport headers and an API-only CSP.
const PAGE = {
  erp: (nonce?: string, isDev = false) =>
    erpCsp.buildPageCsp({ nonce, isDev, realtimeHttp: "https://rt.example" }),
  superadmin: (nonce?: string, isDev = false) =>
    saCsp.buildPageCsp({ nonce, isDev, erpFormAction: "https://erp.example" }),
} as const;

describe.each(["erp", "superadmin"] as const)("CSP — %s page policy", (app) => {
  it("reports violations somewhere (both report-uri AND report-to)", () => {
    const s = PAGE[app]("n0nce");
    expect(s).toContain("report-uri /api/v1/security/csp-report");
    expect(s).toContain("report-to csp-endpoint");
  });

  it("declares the Reporting-Endpoints group that report-to names", () => {
    expect(read(`${app}/next.config.ts`)).toMatch(/Reporting-Endpoints/);
  });

  it("ENFORCES by default and only observes when CSP_MODE says so", () => {
    const mod = app === "erp" ? erpCsp : saCsp;
    expect(mod.cspHeaderName({} as unknown as NodeJS.ProcessEnv)).toBe("Content-Security-Policy");
    expect(mod.cspHeaderName({ CSP_MODE: "report-only" } as unknown as NodeJS.ProcessEnv)).toBe(
      "Content-Security-Policy-Report-Only",
    );
    const proxy = read(`${app}/src/proxy.ts`);
    expect(proxy).toContain("response.headers.set(headerName, csp)");
    expect(proxy).toContain('requestHeaders.set("x-nonce", nonce)');
  });

  it("keeps the directives that make the policy worth enforcing", () => {
    const s = PAGE[app]("n0nce");
    for (const directive of ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) {
      expect(s).toContain(directive);
    }
  });

  it("script-src is nonce + strict-dynamic and NEVER 'unsafe-inline' (M-09)", () => {
    const s = PAGE[app]("abc123");
    expect(s).toMatch(/script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
    const scriptSrc = s.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // and a nonce-less build (API fallback path) still has no inline allowance
    expect(PAGE[app]()).toMatch(/script-src 'self'(;|$)/);
  });

  it("never allows 'unsafe-eval' in production", () => {
    expect(PAGE[app]("n", false)).not.toContain("'unsafe-eval'");
    expect(PAGE[app]("n", true)).toContain("'unsafe-eval'");
  });

  it("does not silently regain a wildcard script or connect source", () => {
    const s = PAGE[app]("n");
    expect(s).not.toMatch(/script-src[^;]*\*/);
    expect(s).not.toMatch(/script-src[^;]*https:(?!\/\/)/);
  });

  it("the layout passes the request nonce to the one author-written script", () => {
    const layout = read(`${app}/src/app/[locale]/layout.tsx`);
    expect(layout).toContain('(await headers()).get("x-nonce")');
    expect(layout).toMatch(/<script src="\/theme-init\.js" async nonce=\{nonce\} \/>/);
  });

  it("API routes get a locked-down CSP from next.config", () => {
    const cfg = read(`${app}/next.config.ts`);
    expect(cfg).toContain('{ source: "/api/:path*", headers: [{ key: cspHeaderName, value: apiCsp }] }');
    const mod = app === "erp" ? erpCsp : saCsp;
    expect(mod.buildApiCsp()).toContain("default-src 'none'");
  });
});

describe("CSP — cross-app invariants", () => {
  it("the back office is never framable and allows no cross-origin frames", () => {
    const s = PAGE.superadmin("n");
    expect(s).toContain("frame-ancestors 'none'");
    expect(s).toContain("frame-src 'none'");
  });

  it("both apps expose the report endpoint they point at", () => {
    for (const app of ["erp", "superadmin"] as const) {
      const route = path.join(ROOT, app, "src/app/api/v1/security/csp-report/route.ts");
      expect(() => readFileSync(route, "utf8")).not.toThrow();
      expect(readFileSync(route, "utf8")).toContain("export const POST");
    }
  });

  it("neither app ignores type errors at build any more (M-09)", () => {
    expect(read("erp/next.config.ts")).not.toContain("ignoreBuildErrors");
    expect(read("superadmin/next.config.ts")).not.toContain("ignoreBuildErrors");
  });

  it("the Vercel build only forgives a signal death after a completed next build", () => {
    for (const app of ["erp", "superadmin"] as const) {
      expect(read(`${app}/vercel.json`)).toContain("bash ../../scripts/vercel-build.sh");
    }
    const sh = readFileSync(path.resolve(ROOT, "../scripts/vercel-build.sh"), "utf8");
    expect(sh).toContain('[ "$rc" -ge 128 ]');
    expect(sh).toMatch(/Compiled successfully/);
    for (const app of ["erp", "superadmin"] as const) {
      expect(read(`${app}/vercel.json`)).not.toMatch(/\|\| \(\[ -f \.next\/BUILD_ID/);
    }
  });
});

describe("CSP — the back office's one cross-origin form destination", () => {
  it("allowlists the ERP origin, derived from the same env the mint route uses", () => {
    expect(saCsp.erpFormActionFromEnv({ ERP_BASE_URL: "https://erp.example/" } as unknown as NodeJS.ProcessEnv)).toBe("https://erp.example");
    expect(saCsp.erpFormActionFromEnv({ APP_BASE_URL: "https://app.example" } as unknown as NodeJS.ProcessEnv)).toBe("https://app.example");
    expect(PAGE.superadmin("n")).toContain("form-action 'self' https://erp.example");
  });

  it("does NOT widen form-action to a wildcard", () => {
    const s = PAGE.superadmin("n");
    expect(s).not.toMatch(/form-action[^;]*\*/);
    expect(s).not.toMatch(/form-action[^;]*https:(?!\/\/)/);
  });

  it("leaves the ERP's own form-action untouched at 'self'", () => {
    const s = PAGE.erp("n");
    expect(s).toMatch(/form-action 'self';/);
    expect(read("erp/src/lib/security/csp.ts")).not.toContain("erpFormAction");
  });
});
