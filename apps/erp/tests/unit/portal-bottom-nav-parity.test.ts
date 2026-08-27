import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PORTALS = ["admin", "assistant", "parent", "student", "teacher"] as const;

function chromeSource(portal: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../src/app/[locale]/dashboard/${portal}/portal-chrome.tsx`, import.meta.url),
    ),
    "utf8",
  );
}

function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks
    .split("\n")
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "\\") { i++; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (!inString && c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function navHrefs(src: string): string[] {
  return [...stripComments(src).matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

function barHrefs(src: string): string[] {
  const block = /BAR_ORDER\s*=\s*\[([\s\S]*?)\]/.exec(stripComments(src));
  if (!block) throw new Error("no BAR_ORDER literal found");
  return [...block[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

describe.each(PORTALS)("portal %s", (portal) => {
  const src = chromeSource(portal);
  const nav = navHrefs(src);
  const bar = barHrefs(src);

  it("declares both nav and bar literally", () => {
    expect(nav.length).toBeGreaterThan(0);
    expect(bar.length).toBeGreaterThan(0);
  });

  it("puts every sidebar destination in the phone bar", () => {
    expect(nav.filter((href) => !bar.includes(href))).toEqual([]);
  });

  it("names no phone-bar destination that the sidebar lacks", () => {
    expect(bar.filter((href) => !nav.includes(href))).toEqual([]);
  });

  it("lists each destination exactly once in the bar", () => {
    expect(new Set(bar).size).toBe(bar.length);
  });
});
