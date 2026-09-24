import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// "use cache" memoises a function's result ACROSS requests and across users.
// CLAUDE.md forbids that for money, wallet balances, subscriptions, attendance,
// messaging, auth/session and any per-user or stateful data. This file makes
// the set of cached functions a deliberate, reviewed list rather than something
// that grows by copy-paste.
const ROOTS = [join(__dirname, "../../src"), join(__dirname, "../../../../packages/server-core/src")];
const REPO = join(__dirname, "../../../..");

const ALLOWED = new Set([
  // The Egyptian education catalog — permanent reference data.
  "apps/erp/src/lib/services/catalog/catalog-read.ts",
  // Discovery search ROWS only; seats and upcoming sessions stay live.
  "apps/erp/src/lib/services/discovery/discovery-cache.ts",
  // Public profiles for ANONYMOUS visitors only; enrollment counts stay live.
  "apps/erp/src/lib/services/public-handles/public-profiles-cache.ts",
]);

// Who may read the profile cache. The gate decides editor-vs-everyone-else for
// /p/[handle]; the centre API route reads no session at all and relies on
// invalidation plus the 60s bound (it previously sat on the CDN, which held the
// same data longer and could not be invalidated). Anything else importing it
// could hand an owner their pre-edit profile without either safeguard.
const PROFILE_CACHE_IMPORTERS = new Set([
  "apps/erp/src/lib/services/public-handles/public-profile-for-request.ts",
  "apps/erp/src/app/api/v1/centers/[id]/route.ts",
]);

// The only routes allowed to reach the discovery cache. Both read the session
// solely to decide a grade/track scope, before the cached call.
const DISCOVERY_CACHE_IMPORTERS = new Set([
  "apps/erp/src/app/api/v1/search/courses/route.ts",
  "apps/erp/src/app/api/v1/search/teacher-days/route.ts",
]);

function walk(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r, []));
const rel = (p: string) => relative(REPO, p).split("\\").join("/");

describe("use cache stays on reference and discovery data", () => {
  it("only the reviewed modules use the directive", () => {
    const users = files
      // A DIRECTIVE line, not a mention in a comment.
      .filter((f) => /^\s*["']use cache(?::[^"']*)?["'];?\s*$/m.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((u) => !ALLOWED.has(u))).toEqual([]);
  });

  it("no cached module can see who is asking", () => {
    for (const f of ALLOWED) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src, `${f} imports session or request state`).not.toMatch(
        /getSessionUser|requireSession|requireRole|from "next\/headers"|\bcookies\(|\bheaders\(\)/,
      );
    }
  });

  it("the discovery cache is reached only from the two search routes", () => {
    const importers = files
      .filter((f) => readFileSync(f, "utf8").includes("discovery/discovery-cache"))
      .map(rel);
    expect(new Set(importers)).toEqual(DISCOVERY_CACHE_IMPORTERS);
  });

  it("the profile cache is reached only through the editor gate or the centre route", () => {
    const importers = files
      .filter((f) => readFileSync(f, "utf8").includes("public-handles/public-profiles-cache") ||
        readFileSync(f, "utf8").includes('from "./public-profiles-cache"'))
      .map(rel);
    expect(new Set(importers)).toEqual(PROFILE_CACHE_IMPORTERS);
    const gate = readFileSync(join(REPO, [...PROFILE_CACHE_IMPORTERS][0]!), "utf8");
    // The gate must decide on the ONE definition of a session cookie, and must
    // send editors to the fresh read.
    expect(gate).toContain("presentedSessionTokens(");
    expect(gate).toContain("mayEditProfile(");
  });

  it("every cached value that carries enrollment counts re-reads them live", () => {
    for (const [file, overlay] of [
      ["apps/erp/src/lib/services/discovery/discovery-cache.ts", "LiveState("],
      ["apps/erp/src/lib/services/public-handles/public-profiles-cache.ts", "withLiveEnrollment("],
    ] as const) {
      expect(readFileSync(join(REPO, file), "utf8"), file).toContain(overlay);
    }
  });

  it("every cached module takes its tag from the shared vocabulary", () => {
    // The tag a cache is stored under and the tag a write expires must be the
    // same string; a literal in one place and a typo in the other would make
    // invalidation silently do nothing.
    for (const f of ALLOWED) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src, f).toMatch(/PUBLIC_DATA_TAGS|CATALOG_CACHE_TAG/);
      expect(src, `${f} tags with a string literal`).not.toMatch(/cacheTag\(\s*["'`]/);
    }
  });

  it("every public write route is wired to invalidate", () => {
    const WIRED = [
      "courses/route.ts",
      "courses/[id]/route.ts",
      "courses/[id]/cancel/route.ts",
      "courses/[id]/reassign-teacher/route.ts",
      "collaboration-requests/[id]/accept/route.ts",
      "centers/me/route.ts",
      "centers/me/logo/route.ts",
      "teachers/me/photo/route.ts",
      "me/route.ts",
      "me/onboarding/route.ts",
      "me/public-handle/route.ts",
      "reviews/route.ts",
      "reviews/[id]/route.ts",
      "center/external-teachers/route.ts",
      "center/external-teachers/[teacherId]/route.ts",
      "center/external-teachers/[teacherId]/restore/route.ts",
      "center/external-teachers/[teacherId]/convert/route.ts",
    ];
    const api = join(__dirname, "../../src/app/api/v1");
    for (const r of WIRED) {
      const src = readFileSync(join(api, r), "utf8");
      for (const m of src.matchAll(/export const (POST|PUT|PATCH|DELETE) = (.*);/g)) {
        expect(m[2], `${r} ${m[1]} is not wrapped`).toMatch(/^invalidatesPublicData\(/);
      }
    }
  });

  it("no DB suite imports the discovery cache (cacheTag throws outside Next)", () => {
    const dbTests = walk(join(__dirname, "../db"), []).filter((f) =>
      /discovery-cache|public-profiles-cache/.test(readFileSync(f, "utf8")),
    );
    expect(dbTests.map(rel)).toEqual([]);
  });
});
