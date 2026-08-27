import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const CONFIGS = {
  erp: path.join(ROOT, "erp/next.config.ts"),
  superadmin: path.join(ROOT, "superadmin/next.config.ts"),
} as const;

function read(app: keyof typeof CONFIGS): string {
  return readFileSync(CONFIGS[app], "utf8");
}

describe.each(Object.keys(CONFIGS) as (keyof typeof CONFIGS)[])("CSP — %s", (app) => {
  it("reports violations somewhere (both report-uri AND report-to)", () => {
    const s = read(app);
    expect(s).toContain("report-uri /api/v1/security/csp-report");
    expect(s).toContain("report-to csp-endpoint");
  });

  it("declares the Reporting-Endpoints group that report-to names", () => {
    expect(read(app)).toMatch(/Reporting-Endpoints/);
  });

  it("ENFORCES by default and only observes when CSP_MODE says so", () => {
    const s = read(app);
    expect(s).toContain('process.env.CSP_MODE === "report-only"');
    expect(s).toContain("{ key: cspHeaderName, value: csp }");
    expect(s).not.toMatch(/\{\s*key:\s*"Content-Security-Policy-Report-Only",\s*value:\s*csp\s*\}/);
  });

  it("keeps the directives that make the policy worth enforcing", () => {
    const s = read(app);
    for (const directive of [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ]) {
      expect(s).toContain(directive);
    }
  });

  it("never allows 'unsafe-eval' in production", () => {
    const s = read(app);
    const evalMentions = s.match(/'unsafe-eval'/g) ?? [];
    expect(evalMentions.length).toBeGreaterThan(0);
    expect(s).toMatch(/isDev \? " 'unsafe-eval'" : ""/);
  });

  it("does not silently regain a wildcard script or connect source", () => {
    const s = read(app);
    expect(s).not.toMatch(/script-src[^`]*\*[^.]/);
    expect(s).not.toMatch(/script-src[^`]*https:(?!\/\/)/);
  });
});

describe("CSP — cross-app invariants", () => {
  it("the back office is never framable and allows no cross-origin frames", () => {
    const s = read("superadmin");
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
});

describe("CSP — the back office's one cross-origin form destination", () => {
  it("allowlists the ERP origin, derived from the same env the mint route uses", () => {
    const s = read("superadmin");
    expect(s).toContain("const erpFormAction");
    expect(s).toContain("process.env.ERP_BASE_URL");
    expect(s).toMatch(/form-action 'self'\$\{erpFormAction/);
  });

  it("does NOT widen form-action to a wildcard", () => {
    const s = read("superadmin");
    expect(s).not.toMatch(/form-action[^`]*\*/);
    expect(s).not.toMatch(/form-action[^`]*https:(?!\/\/)/);
  });

  it("leaves the ERP's own form-action untouched at 'self'", () => {
    const s = read("erp");
    expect(s).toContain("form-action 'self'");
    expect(s).not.toContain("erpFormAction");
  });
});
