import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The CSP is a HEADER, not a module — there is nothing to import and call, so
 * this reads the two next.config.ts files as text and asserts the properties
 * that must hold. Text assertions are the right tool here precisely because
 * the failure mode being guarded is someone editing the policy string by hand
 * and quietly removing a directive.
 *
 * WHY THIS TEST EXISTS. The policy shipped Report-Only "until real traffic
 * confirms nothing legit is flagged", and carried no report-uri and no
 * report-to — so nothing was ever confirmed by anything, and the header
 * neither blocked nor recorded for months. The invariants below are the ones
 * that made that possible, frozen so it cannot recur silently.
 */

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
    // The whole point: a Report-Only policy with no reporting sink observes
    // nothing. report-uri covers Safari/older Chrome, report-to covers current
    // Chrome — dropping either silently unreports a slice of real users.
    expect(s).toContain("report-uri /api/v1/security/csp-report");
    expect(s).toContain("report-to csp-endpoint");
  });

  it("declares the Reporting-Endpoints group that report-to names", () => {
    // `report-to` without this header is inert — it points at a group that
    // does not exist, which looks configured and reports nothing.
    expect(read(app)).toMatch(/Reporting-Endpoints/);
  });

  it("ENFORCES by default and only observes when CSP_MODE says so", () => {
    const s = read(app);
    expect(s).toContain('process.env.CSP_MODE === "report-only"');
    // The header name must be the switched variable, never hard-coded back to
    // Report-Only — that is the regression this asserts against.
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
    // 'unsafe-eval' may appear ONLY inside the isDev conditional.
    const evalMentions = s.match(/'unsafe-eval'/g) ?? [];
    expect(evalMentions.length).toBeGreaterThan(0);
    expect(s).toMatch(/isDev \? " 'unsafe-eval'" : ""/);
  });

  it("does not silently regain a wildcard script or connect source", () => {
    const s = read(app);
    // A bare `*` or a scheme-only source would defeat the policy entirely.
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
      // A policy naming an endpoint that does not exist would make every
      // violation a 404 — reported nowhere, exactly as before.
      expect(() => readFileSync(route, "utf8")).not.toThrow();
      expect(readFileSync(route, "utf8")).toContain("export const POST");
    }
  });
});

describe("CSP — the back office's one cross-origin form destination", () => {
  /**
   * `form-action 'self'` blocks a cross-origin form submit SILENTLY: no
   * request leaves the browser, no console error the page can catch, nothing
   * to log. The "view as" handoff is delivered as a top-level form POST to the
   * ERP precisely so the token never enters a URL (history, Referer, proxy
   * logs) — which is exactly the shape this directive refuses by default.
   *
   * Every curl proof of that handoff passed while a real browser dropped it on
   * the floor, because curl has no CSP. Found by clicking the button.
   *
   * These assertions freeze BOTH halves: the allowlist must exist, and it must
   * be derived from the same variable the mint route posts to, so the policy
   * and the destination cannot drift apart.
   */
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
    // The ERP posts forms only to itself. Nothing about the handoff requires
    // relaxing this side, and relaxing both would be a symmetry that is not
    // earned.
    const s = read("erp");
    expect(s).toContain("form-action 'self'");
    expect(s).not.toContain("erpFormAction");
  });
});

