import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY BACK-OFFICE PORTAL MUST ACTUALLY MOUNT A TOUR.
 *
 * The www twin of this test exists because a tour had already been orphaned
 * there — written, translated, tested, and rendered by nothing. This app has
 * the same exposure and no browser walk to fall back on (2FA is mandatory), so
 * reachability is asserted rather than assumed.
 */

const ROOT = path.join(process.cwd(), "src");
const DASHBOARD = path.join(ROOT, "app", "[locale]", "dashboard");

/** Both portals in this app: the super admin's and the accountant's. */
const PORTALS = ["superadmin", "finance"];

/** Depth ONE — see the www twin for why a deeper search proves nothing. */
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
    // A new portal added without a tour fails here rather than shipping silent.
    expect(onDisk.sort()).toEqual([...PORTALS].sort());
  });
});
