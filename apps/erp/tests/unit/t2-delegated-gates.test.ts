import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * T-2 — the two GET/PATCH gate inversions, locked down (API session 2, B.1#6).
 *
 * The defect: `teacher/attendance-mode` had a `requireRole("teacher")` GET
 * under a `delegated()` PATCH, so an assistant could CHANGE the attendance
 * mode but not READ it — the assistant settings card could not show the value
 * it may edit, and the door screen's counter-only notice never rendered for
 * the person standing at the door. `teacher/blacklist` had the identical
 * shape on GET vs POST.
 *
 * Static, like route-conventions.test.ts, because the property IS static: a
 * route whose read gate is narrower than its own write gate. This test fails
 * if either GET regresses to `requireRole`, and fails loudly if the files
 * move (readFileSync throws), so it cannot rot silently.
 */

const API = path.resolve(__dirname, "../../src/app/api/v1");

const ROUTES = ["teacher/attendance-mode/route.ts", "teacher/blacklist/route.ts"];

/** The GET export's source, up to the next export (or EOF). */
function getBlock(source: string): string {
  const start = source.indexOf("export const GET");
  expect(start, "route must export GET").toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const next = rest.search(/export const (PATCH|POST|PUT|DELETE)/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("T-2: teacher read gates are as wide as their own write gates", () => {
  for (const route of ROUTES) {
    it(`${route} — GET is delegated(), not requireRole("teacher")`, () => {
      const source = readFileSync(path.join(API, route), "utf8");
      const get = getBlock(source);
      expect(get).toContain("delegated(");
      expect(get).not.toContain('requireRole("teacher")');
    });
  }
});
