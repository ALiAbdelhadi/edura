import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_PREFIXES, serviceRewrites, serviceUrl } from "@/lib/http/service-routes";

// The service's route tree: apps/erp holds no route files any more, so what the
// rewrite table must cover is what apps/api actually serves.
const API_ROUTES = path.resolve(__dirname, "../../../api/src/routes");

// Every route.ts under apps/api/src/routes, as the URL path the service serves
// it at (the ERP's /api/** is the same path through the rewrite).
function routeUrls(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") {
        out.push(`/api/${path.relative(API_ROUTES, dir).split(path.sep).join("/")}`);
      }
    }
  };
  walk(API_ROUTES);
  return out;
}

// The top-level area a rewrite prefix names: /api/auth, /api/health, or
// /api/v1/<area> (the first segment under v1).
const areaOf = (url: string) => {
  const parts = url.split("/").filter(Boolean);
  return parts[1] === "v1" ? `/api/v1/${parts[2]}` : `/api/${parts[1]}`;
};

describe("SERVICE_PREFIXES", () => {
  const urls = routeUrls();
  const areas = new Set(urls.map(areaOf));

  it("scans the whole service route tree, not a vacuous subset", () => {
    expect(urls.length).toBeGreaterThanOrEqual(240);
    expect(areas.size).toBeGreaterThanOrEqual(40);
    expect(areas.has("/api/auth")).toBe(true);
    expect(areas.has("/api/health")).toBe(true);
    expect(areas.has("/api/v1/me")).toBe(true);
  });

  it("covers every area the service serves — /api/health included (phase 4, R3)", () => {
    const uncovered = [...areas].filter((a) => !SERVICE_PREFIXES.includes(a)).sort();
    expect(uncovered).toEqual([]);
  });

  it("names no prefix that serves nothing", () => {
    const empty = SERVICE_PREFIXES.filter((p) => !areas.has(p));
    expect(empty).toEqual([]);
  });

  it("lists each prefix once", () => {
    expect(new Set(SERVICE_PREFIXES).size).toBe(SERVICE_PREFIXES.length);
  });

  it("leaves no route in the ERP: src/app/api is gone", () => {
    expect(existsSync(path.resolve(__dirname, "../../src/app/api"))).toBe(false);
  });
});

describe("serviceUrl", () => {
  it("is API_SERVICE_URL when set, without a trailing slash", () => {
    expect(serviceUrl({ API_SERVICE_URL: "https://api.example.test/" })).toBe("https://api.example.test");
  });

  it("defaults to the service's dev port outside production", () => {
    expect(serviceUrl({ NODE_ENV: "development" })).toBe("http://localhost:3006");
    expect(serviceUrl({ NODE_ENV: "development", API_PORT: "4010" })).toBe("http://localhost:4010");
  });

  it("refuses to guess on a production server, but lets a production build write its rewrites", () => {
    expect(() => serviceUrl({ NODE_ENV: "production" })).toThrow(/API_SERVICE_URL/);
    expect(serviceUrl({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBe(
      "http://localhost:3006",
    );
  });

  it("refuses a URL that is not http(s)", () => {
    expect(() => serviceUrl({ API_SERVICE_URL: "api.example.test" })).toThrow();
  });
});

describe("serviceRewrites", () => {
  it("is never empty: without API_SERVICE_URL it targets the dev service", () => {
    const rewrites = serviceRewrites({ NODE_ENV: "development" });
    expect(rewrites).toHaveLength(SERVICE_PREFIXES.length);
    expect(rewrites).toContainEqual({
      source: "/api/health/:path*",
      destination: "http://localhost:3006/api/health/:path*",
    });
  });

  it("rewrites each prefix to the same path on the service", () => {
    const rewrites = serviceRewrites({ API_SERVICE_URL: "https://api.example.test/" });
    expect(rewrites).toHaveLength(SERVICE_PREFIXES.length);
    expect(rewrites).toContainEqual({
      source: "/api/v1/me/:path*",
      destination: "https://api.example.test/api/v1/me/:path*",
    });
  });

  it("refuses a URL that is not http(s)", () => {
    expect(() => serviceRewrites({ API_SERVICE_URL: "api.example.test" })).toThrow();
  });
});
