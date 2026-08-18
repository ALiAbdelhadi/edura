import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY PORTAL MUST ACTUALLY MOUNT A TOUR.
 *
 * This exists because it had already stopped being true. `AssistantFirstRun`
 * was written, imported nowhere, and orphaned by a later edit to the assistant
 * landing page — the tour was complete, tested, translated, and unreachable.
 * Nothing failed: not the typecheck (the component is valid), not the unit
 * suite (its copy is present), not even the Playwright walk, which had passed
 * before the mount was removed.
 *
 * So the assertion is deliberately about REACHABILITY rather than existence:
 * for each portal, some file under its own feature folder or its landing page
 * renders a tour. A tour nobody renders is a tour nobody sees.
 *
 * Scoped to `apps/www`; the back office has its own equivalent next door.
 */

const ROOT = path.join(process.cwd(), "src");
const DASHBOARD = path.join(ROOT, "app", "[locale]", "dashboard");

/** Portals and where each one's first-run surface may legitimately live. */
const PORTALS: { portal: string; features: string[] }[] = [
  { portal: "student", features: ["student"] },
  { portal: "parent", features: ["parent"] },
  { portal: "teacher", features: ["teacher"] },
  { portal: "assistant", features: ["assistant"] },
  { portal: "admin", features: ["admin"] },
  // The staff portal's home lives in the admin feature folder.
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

/** Every file that renders the tour component, anywhere in the app. */
const MOUNTERS = walk(ROOT).filter((f) => {
  const src = readFileSync(f, "utf8");
  // `<GuidedTour` is the direct mount; the wrappers are the indirect one.
  return /<GuidedTour[\s/>]/.test(src) || /<\w*FirstRun[\s/>]/.test(src);
});

/**
 * Does this page mount a tour — the page itself, or ONE of the components it
 * directly imports?
 *
 * DEPTH ONE, DELIBERATELY. The first version recursed the whole import graph
 * and passed even with the mount deleted: from the assistant page it wandered
 * through the chat screen into some unrelated module that happens to render a
 * tour, and reported success. A coverage test that cannot fail is worse than no
 * coverage test, so the search is now exactly as deep as the real pattern is —
 * `<GuidedTour>` on the page, or a `<XFirstRun>` wrapper the page imports.
 */
function mountsTour(pageFile: string): boolean {
  let src: string;
  try {
    src = readFileSync(pageFile, "utf8");
  } catch {
    return false;
  }
  if (/<GuidedTour[\s/>]/.test(src)) return true;

  // Which components does the page actually RENDER? An import that is never
  // rendered mounts nothing — that is precisely how the assistant's tour went
  // missing while its import would still have been there.
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
    // A NEW portal added without a tour fails here rather than shipping silent.
    expect(onDisk.sort()).toEqual(known);
  });
});
