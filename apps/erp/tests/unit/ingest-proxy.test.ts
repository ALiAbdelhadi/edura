import { describe, expect, it } from "vitest";
import { INTL_MATCHER, isLocalisedPath } from "@/i18n/route-matcher";

// =============================================================================
// The next-intl matcher vs the PostHog reverse proxy.
//
// REGRESSION, 2026-08-02. `/ingest/*` is rewritten to PostHog (next.config.ts)
// so that ad-blockers, which list *.i.posthog.com by name, do not silently
// delete analytics. But next-intl's middleware matcher claimed the path first
// and 307'd `POST /ingest/e/` to `/ar/ingest/e` — a route that does not exist.
// Every captured event was redirected into nothing.
//
// It hid well: `/ingest/static/array.js` was already excluded by the matcher's
// `.*\..*` arm because it contains a DOT, so the SDK loaded normally and only
// the dot-less capture endpoint was swallowed. Analytics that loads but never
// records is indistinguishable from a product nobody uses.
//
// Asserting on the real exported matcher, so editing the regex in proxy.ts
// without thinking about /ingest fails here.
// =============================================================================

const isClaimedByIntl = isLocalisedPath;

describe("the intl matcher must not claim the analytics proxy", () => {
  // Next STATICALLY ANALYSES src/proxy.ts, so its matcher cannot be an imported
  // constant — doing that made the middleware match every path and 307 the
  // whole app while these tests still passed. The literal is therefore
  // duplicated there, and this asserts the copy has not drifted: everything
  // below only means something if the string here is the string that ships.
  it("the shipped literal in proxy.ts is byte-identical to INTL_MATCHER", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(new URL("../../src/proxy.ts", import.meta.url), "utf8");

    // Scope to the `export const config` declaration. The surrounding comments
    // deliberately quote the BROKEN form (`matcher: [INTL_MATCHER]`) as a
    // warning, and a naive whole-file scan matches that instead of the code.
    const decl = raw.slice(raw.indexOf("export const config"));
    expect(decl, "export const config not found in proxy.ts").toBeTruthy();

    const m = decl.match(/matcher:\s*\[\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/);
    expect(m, "config.matcher must be a single string LITERAL").not.toBeNull();

    // The file's source text is TS-escaped; unescape before comparing values.
    expect(JSON.parse(`"${m![1]}"`)).toBe(INTL_MATCHER);

    // ...and still a literal, not an identifier Next cannot statically resolve.
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
    // The failure mode on the other side: excluding too much silently disables
    // localisation for real routes.
    for (const p of ["/", "/dashboard/student", "/login", "/ar/dashboard", "/onboarding"]) {
      expect(isClaimedByIntl(p), `${p} must still be localised`).toBe(true);
    }
  });

  it("does not exclude a route merely because it STARTS with an excluded word", () => {
    // `ingestion-report` is a plausible future page and must stay localised —
    // this is why the alternation is anchored by the surrounding regex rather
    // than being a bare substring test.
    expect(isClaimedByIntl("/ingestion-report")).toBe(true);
    expect(isClaimedByIntl("/apifoo")).toBe(true);
    expect(isClaimedByIntl("/ingest-summary")).toBe(true);
  });
});
