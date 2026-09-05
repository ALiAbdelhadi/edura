import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API_ROOT = path.resolve(__dirname, "../../src/app/api");

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function routeKey(file: string): string {
  return path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/");
}

const AUTH_TOKENS = ["withRole(", "requireRole(", "requireSession(", "getSessionUser("];

type PublicEntry = {
  reason: string;
  mustContain?: string[];
  getOnly?: boolean;
};

const PUBLIC_ROUTES: Record<string, PublicEntry> = {
  "v1/security/csp-report": {
    reason:
      "the BROWSER posts CSP violation reports, with no session and no CORS " +
      "preflight; requiring auth would collect violations only from signed-in " +
      "users and so miss the login page — the surface an injection attack " +
      "cares most about. Bounded by a per-IP bucket instead.",
    mustContain: ["withRateLimit"],
  },

  "auth/[...all]": {
    reason: "better-auth catch-all; auth IS the handler",
    mustContain: ["toNextJsHandler(auth)"],
  },
  health: {
    reason: "infra health check — status code is the signal, DB-only probe",
    getOnly: true,
  },
};

const WRITE_METHOD_RE = /export (?:async )?(?:function|const) (POST|PUT|PATCH|DELETE)\b/;
const ANY_METHOD_RE =
  /export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export const \{[^}]*(?:GET|POST)[^}]*\}/;

const files = collectRouteFiles(API_ROOT);
const sources = new Map(files.map((f) => [routeKey(f), readFileSync(f, "utf8")]));

describe("route conventions (all api routes)", () => {
  it("glob actually found the route surface", () => {
    expect(files.length).toBeGreaterThanOrEqual(190);
  });

  it("every route exports at least one HTTP method", () => {
    const missing = [...sources.entries()]
      .filter(([, src]) => !ANY_METHOD_RE.test(src))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("every route exports dynamic = 'force-dynamic'", () => {
    const missing = [...sources.entries()]
      .filter(([, src]) => !/export const dynamic\s*=\s*"force-dynamic"/.test(src))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("every route is auth-wrapped or explicitly public", () => {
    const unguarded = [...sources.entries()]
      .filter(
        ([key, src]) =>
          !AUTH_TOKENS.some((t) => src.includes(t)) && !(key in PUBLIC_ROUTES),
      )
      .map(([key]) => key);
    expect(unguarded).toEqual([]);
  });

  it("a role-guarded route declares the guard in its signature, not its body", () => {
    // withRole(role, handler) runs requireRole BEFORE the handler body exists.
    // A bare `withErrors` handler that calls requireRole as its first line is
    // the shape that wrapper replaced: equivalent today, but it puts the guard
    // one editable line away from being deleted without the signature changing.
    const inBody = [...sources.entries()]
      .filter(([, src]) => /=>\s*\{[\s\S]*?await requireRole\(/.test(src))
      .map(([key]) => key);
    expect(inBody).toEqual([]);
  });

  it("public allowlist entries are fresh and keep their gates", () => {
    for (const [key, entry] of Object.entries(PUBLIC_ROUTES)) {
      const src = sources.get(key);
      expect(src, `allowlisted route no longer exists: ${key}`).toBeDefined();
      expect(
        AUTH_TOKENS.some((t) => src!.includes(t)),
        `${key} now uses an auth wrapper — remove it from PUBLIC_ROUTES`,
      ).toBe(false);
      for (const marker of entry.mustContain ?? []) {
        expect(
          src!.includes(marker),
          `${key} lost its gate marker "${marker}" (${entry.reason})`,
        ).toBe(true);
      }
      if (entry.getOnly) {
        expect(
          WRITE_METHOD_RE.test(src!),
          `${key} is a public read surface but exports a write method`,
        ).toBe(false);
      }
    }
  });

  it("no raw body reads — all bodies go through parseJson", () => {
    const RAW_BODY_ALLOWED: Record<string, string> = {
      "v1/security/csp-report":
        "CSP reports arrive in two wire formats (application/csp-report and " +
        "application/reports+json), one of which BATCHES, so there is no single " +
        "schema to parse into. The body is size-capped before parsing and a " +
        "malformed one is DROPPED with 204 — parseJson would answer 400 to a " +
        "browser that cannot act on it, and some agents retry a non-2xx, " +
        "turning one violation into many.",
    };

    const offenders = [...sources.entries()]
      .filter(
        ([key, src]) =>
          (/\b(?:req|request)\.json\(\)/.test(src) ||
            /\b(?:req|request)\.text\(\)/.test(src) ||
            src.includes("formData()")) &&
          !(key in RAW_BODY_ALLOWED),
      )
      .map(([key]) => key);
    expect(offenders).toEqual([]);

    for (const key of Object.keys(RAW_BODY_ALLOWED)) {
      const src = sources.get(key);
      expect(src, `${key} is allow-listed but no longer exists`).toBeDefined();
      expect(
        /\b(?:req|request)\.(?:json|text)\(\)/.test(src ?? "") ||
          (src ?? "").includes("formData()"),
        `${key} no longer reads a raw body — remove it from RAW_BODY_ALLOWED`,
      ).toBe(true);
    }
  });
});
