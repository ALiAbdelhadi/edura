import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(process.cwd(), "src");
const DASHBOARD = path.join(ROOT, "app", "[locale]", "dashboard");

const PORTALS = ["superadmin", "finance"];

function mountsTour(pageFile: string): boolean {
  let src: string;
  try {
    src = readFileSync(pageFile, "utf8");
  } catch {
    return false;
  }
  if (/<GuidedTour[\s/>]/.test(src)) return true;

  const rendered = new Set(Array.from(src.matchAll(/<([A-Z]\w*)[\s/>]/g), (m) => m[1]!));

  for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from\s+"@\/([^"]+)"/g)) {
    const names = m[1]!.split(",").map((n) => n.trim().split(/\s+as\s+/).pop()!.trim());
    if (!names.some((n) => rendered.has(n))) continue;
    for (const ext of [".tsx", ".ts"]) {
      const candidate = path.join(ROOT, m[2]! + ext);
      try {
        statSync(candidate);
      } catch {
        continue;
      }
      if (/<GuidedTour[\s/>]/.test(readFileSync(candidate, "utf8"))) return true;
      break;
    }
  }
  return false;
}

describe("back-office guided tour coverage", () => {
  it.each(PORTALS)("the %s portal's landing page mounts a tour", (portal) => {
    expect(
      mountsTour(path.join(DASHBOARD, portal, "page.tsx")),
      `/dashboard/${portal} renders no guided tour`,
    ).toBe(true);
  });

  it("has a portal folder for every dashboard route, and vice versa", () => {
    const onDisk = readdirSync(DASHBOARD).filter((e) =>
      statSync(path.join(DASHBOARD, e)).isDirectory(),
    );
    expect(onDisk.sort()).toEqual([...PORTALS].sort());
  });
});
