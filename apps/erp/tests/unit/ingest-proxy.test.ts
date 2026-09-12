import { describe, expect, it } from "vitest";
import { INTL_MATCHER, MIDDLEWARE_MATCHER, isLocalisedPath } from "@/i18n/route-matcher";

const isClaimedByIntl = isLocalisedPath;

describe("the intl matcher must not claim the analytics proxy", () => {
  // DIFF-01: the middleware now runs on /api and /ingest too (to refuse them on
  // a tenant host), so its matcher is MIDDLEWARE_MATCHER; what next-intl CLAIMS
  // is still INTL_MATCHER, and the two must keep their relationship.
  it("INTL_MATCHER still excludes api and ingest, and MIDDLEWARE_MATCHER is wider by exactly those", () => {
    expect(INTL_MATCHER).toContain("api|ingest");
    expect(MIDDLEWARE_MATCHER).not.toContain("api");
    expect(MIDDLEWARE_MATCHER).not.toContain("ingest");
    expect(MIDDLEWARE_MATCHER).toContain("_next|_vercel");
  });

  it("the shipped literal in proxy.ts is byte-identical to MIDDLEWARE_MATCHER", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(new URL("../../src/proxy.ts", import.meta.url), "utf8");

    const decl = raw.slice(raw.indexOf("export const config"));
    expect(decl, "export const config not found in proxy.ts").toBeTruthy();

    const m = decl.match(/matcher:\s*\[\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/);
    expect(m, "config.matcher must be a single string LITERAL").not.toBeNull();

    expect(JSON.parse(`"${m![1]}"`)).toBe(MIDDLEWARE_MATCHER);

    expect(decl).not.toMatch(/matcher:\s*\[\s*[A-Za-z_$]/);
  });

  it("leaves the CAPTURE endpoint alone — the one that was broken", () => {
    expect(isClaimedByIntl("/ingest/e/")).toBe(false);
    expect(isClaimedByIntl("/ingest/e")).toBe(false);
  });

  it("leaves every other dot-less ingest path alone", () => {
    for (const p of [
      "/ingest",
      "/ingest/",
      "/ingest/i/v0/e",
      "/ingest/decide",
      "/ingest/s/", // session recording endpoint, were it ever enabled
      "/ingest/flags",
    ]) {
      expect(isClaimedByIntl(p), `${p} must reach the rewrite`).toBe(false);
    }
  });

  it("leaves the SDK asset alone (it always did — dot rule)", () => {
    expect(isClaimedByIntl("/ingest/static/array.js")).toBe(false);
  });

  it("still excludes the paths it always excluded", () => {
    for (const p of ["/api/v1/health", "/api/health", "/_next/static/chunk.js", "/_vercel/x"]) {
      expect(isClaimedByIntl(p), `${p} must not be locale-prefixed`).toBe(false);
    }
  });

  it("STILL CLAIMS real pages — the exclusion must not have gone too wide", () => {
    for (const p of ["/", "/dashboard/student", "/login", "/ar/dashboard", "/onboarding"]) {
      expect(isClaimedByIntl(p), `${p} must still be localised`).toBe(true);
    }
  });

  it("does not exclude a route merely because it STARTS with an excluded word", () => {
    expect(isClaimedByIntl("/ingestion-report")).toBe(true);
    expect(isClaimedByIntl("/apifoo")).toBe(true);
    expect(isClaimedByIntl("/ingest-summary")).toBe(true);
  });
});
