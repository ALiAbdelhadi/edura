import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(process.cwd(), "src");
const DASHBOARD = path.join(ROOT, "app", "[locale]", "dashboard");

const PORTALS: { portal: string; features: string[] }[] = [
  { portal: "student", features: ["student"] },
  { portal: "parent", features: ["parent"] },
  { portal: "teacher", features: ["teacher"] },
  { portal: "assistant", features: ["assistant"] },
  { portal: "admin", features: ["admin"] },
  { portal: "staff", features: ["admin"] },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const MOUNTERS = walk(ROOT).filter((f) => {
  const src = readFileSync(f, "utf8");
  return /<GuidedTour[\s/>]/.test(src) || /<\w*FirstRun[\s/>]/.test(src);
});

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

describe("guided tour coverage", () => {
  it("finds the tour mounted somewhere at all", () => {
    expect(MOUNTERS.length, "no file renders a guided tour").toBeGreaterThan(0);
  });

  it.each(PORTALS.map((p) => p.portal))(
    "the %s portal's landing page reaches a tour",
    (portal) => {
      const page = path.join(DASHBOARD, portal, "page.tsx");
      expect(
        mountsTour(page),
        `/dashboard/${portal} renders no guided tour — a tour that nothing mounts is a tour nobody sees`,
      ).toBe(true);
    },
  );

  it("has a portal folder for every dashboard route, and vice versa", () => {
    const onDisk = readdirSync(DASHBOARD).filter((e) =>
      statSync(path.join(DASHBOARD, e)).isDirectory(),
    );
    const known = PORTALS.map((p) => p.portal).sort();
    expect(onDisk.sort()).toEqual(known);
  });
});
