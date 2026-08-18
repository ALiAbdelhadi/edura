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
  /**
   * THE RULE: this page is served when the network is gone, so every byte it
   * needs must already be in it. A subresource is a request, and a request
   * offline is a broken image — which is exactly what `/edura-mark.svg` was,
   * because an <img> request is claimed by the runtime image-cache route
   * before the precache is consulted, precached or not.
   */
  it("references no external subresource", () => {
    // Comments are stripped first — the markup explaining why there is no
    // <img> here would otherwise read as one.
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

  /**
   * The inline copy is the mark's fourth. Nothing stops the four drifting
   * except this: every path the svg file draws must appear here verbatim.
   */
  it("draws the same geometry as edura-mark.svg", () => {
    const paths = [...MARK.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    expect(paths.length).toBe(3);
    for (const d of paths) expect(OFFLINE).toContain(`d="${d}"`);
  });

  it("keeps both languages on the page", () => {
    // A center's staff and its families do not share one language, and this
    // page cannot ask which is theirs — it has no session to read.
    expect(OFFLINE).toContain("أنت غير متصل بالإنترنت");
    expect(OFFLINE).toMatch(/You'?re offline/i);
  });

  it("offers a way out that does not need a route", () => {
    expect(OFFLINE).toContain("location.reload()");
    expect(OFFLINE).toContain('addEventListener("online"');
  });
});
