// Proof that every sidebar destination is reachable on a phone.
//
// DashboardShell hides the sidebar toggle wherever a bottom bar exists, so an
// href in `navItems` that is missing from `bottomNav` is not a cosmetic
// ordering slip — it is a screen no phone can open. The shell already asserts
// this, but only at RUNTIME, only in dev, and only for the ONE portal the
// author happens to have open: `/dashboard/admin/audit` shipped missing and
// stayed missing until someone loaded the center portal in a dev browser.
//
// This is the same rule, checked for every portal at once, before the browser.
//
// It reads the layout SOURCE rather than importing it: these are client
// components that pull in the whole shell, and the two arrays are plain
// literals whose whole purpose is to be read side by side. A layout that stops
// declaring them literally will fail the guard below rather than pass silently.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `staff` is deliberately absent: it derives its bar from its nav
// (`bottomNav={barForItems(navItems)}`), so the two cannot disagree.
const PORTALS = ["admin", "assistant", "parent", "student", "teacher"] as const;

function layoutSource(portal: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../src/app/[locale]/dashboard/${portal}/layout.tsx`, import.meta.url),
    ),
    "utf8",
  );
}

function navHrefs(src: string): string[] {
  return [...src.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

function barHrefs(src: string): string[] {
  const block = /BAR_ORDER\s*=\s*\[([\s\S]*?)\]/.exec(src);
  if (!block) throw new Error("no BAR_ORDER literal found");
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe.each(PORTALS)("portal %s", (portal) => {
  const src = layoutSource(portal);
  const nav = navHrefs(src);
  const bar = barHrefs(src);

  it("declares both nav and bar literally", () => {
    expect(nav.length).toBeGreaterThan(0);
    expect(bar.length).toBeGreaterThan(0);
  });

  it("puts every sidebar destination in the phone bar", () => {
    expect(nav.filter((href) => !bar.includes(href))).toEqual([]);
  });

  // The other direction matters too: a bar entry with no sidebar row is a
  // destination desktop users cannot find, and DashboardShell silently drops
  // it (it resolves bar hrefs against `flatNav`).
  it("names no phone-bar destination that the sidebar lacks", () => {
    expect(bar.filter((href) => !nav.includes(href))).toEqual([]);
  });

  it("lists each destination exactly once in the bar", () => {
    expect(new Set(bar).size).toBe(bar.length);
  });
});
