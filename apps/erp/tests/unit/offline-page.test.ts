import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const OFFLINE = readFileSync(
  join(process.cwd(), "public/offline.html"),
  "utf8",
);
const MARK = readFileSync(
  join(process.cwd(), "public/edura-mark.svg"),
  "utf8",
);

describe("the offline page", () => {
  it("references no external subresource", () => {
    const markup = OFFLINE.replace(/<!--[\s\S]*?-->/g, "");
    const offenders = [
      ...markup.matchAll(/<img\b[^>]*>/gi),
      ...markup.matchAll(/<link\b[^>]*\brel=["']?stylesheet[^>]*>/gi),
      ...markup.matchAll(/<script\b[^>]*\bsrc=[^>]*>/gi),
      ...markup.matchAll(/url\(\s*["']?(?!data:)[^)"']+["']?\s*\)/gi),
    ].map((m) => m[0]);
    expect(offenders).toEqual([]);
  });

  it("still shows the mark, inline", () => {
    expect(OFFLINE).toContain("<svg");
    expect(OFFLINE).toContain('aria-label="Edura"');
  });

  it("draws the same geometry as edura-mark.svg", () => {
    const paths = [...MARK.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    expect(paths.length).toBe(3);
    for (const d of paths) expect(OFFLINE).toContain(`d="${d}"`);
  });

  it("keeps both languages on the page", () => {
    expect(OFFLINE).toContain("أنت غير متصل بالإنترنت");
    expect(OFFLINE).toMatch(/You'?re offline/i);
  });

  it("offers a way out that does not need a route", () => {
    expect(OFFLINE).toContain("location.reload()");
    expect(OFFLINE).toContain('addEventListener("online"');
  });
});
