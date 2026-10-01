import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const API = path.resolve(__dirname, "../../src/routes/v1");

const ROUTES = ["teacher/attendance-mode/route.ts", "teacher/blacklist/route.ts"];

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
