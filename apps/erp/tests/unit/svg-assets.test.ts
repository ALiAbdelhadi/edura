import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");

const SHIPPED_SVG_DIRS = ["apps/erp", "apps/superadmin", "apps/www"].flatMap(
  (app) => [join(REPO, app, "public"), join(REPO, app, "src/app")],
);

function svgsIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".svg")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const FILES = SHIPPED_SVG_DIRS.flatMap(svgsIn);

describe("shipped SVG assets are well-formed XML", () => {
  it("finds SVGs to check, and only SHIPPED ones", () => {
    expect(FILES.length).toBeGreaterThan(0);

    expect(FILES.filter((f) => f.includes("/tests/"))).toEqual([]);
  });

  it.each(FILES.map((f) => [relative(REPO, f), f] as const))(
    "%s has no double hyphen inside a comment",
    (_label, file) => {
      const src = readFileSync(file, "utf8");
      const offenders: string[] = [];

      for (const match of src.matchAll(/<!--([\s\S]*?)-->/g)) {
        const body = match[1]!;
        if (body.includes("--") || body.endsWith("-")) {
          const at = body.indexOf("--");
          offenders.push(
            body.slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, " ").trim(),
          );
        }
      }

      expect(
        offenders,
        `${relative(REPO, file)} has a comment containing a double hyphen. ` +
          `SVG is parsed as XML, so this makes the ENTIRE FILE unparseable — ` +
          `the browser reports "EncodingError: The source image cannot be ` +
          `decoded" and paints the alt text instead of the graphic. It still ` +
          `serves 200 with the right content-type, so nothing else catches ` +
          `it. The usual cause is writing a CSS custom property's name in a ` +
          `comment, since those names begin with a double hyphen.\n\n` +
          offenders.map((o) => `  …${o}…`).join("\n"),
      ).toEqual([]);
    },
  );

  it.each(FILES.map((f) => [relative(REPO, f), f] as const))(
    "%s opens and closes an <svg> root",
    (_label, file) => {
      const src = readFileSync(file, "utf8").trim();
      expect(src.startsWith("<svg") || src.startsWith("<?xml")).toBe(true);
      expect(src.endsWith("</svg>")).toBe(true);
    },
  );
});

describe("no <Image> is pointed at an SVG", () => {
  const SRC_DIRS = [
    join(APP, "src"),
    join(REPO, "apps/superadmin/src"),
    join(REPO, "apps/www/src"),
  ];

  function tsxIn(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
      let entries: string[];
      try {
        entries = readdirSync(d);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(d, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".tsx")) out.push(full);
      }
    };
    walk(dir);
    return out;
  }

  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  it("across both apps", () => {
    const offenders: string[] = [];

    for (const file of SRC_DIRS.flatMap(tsxIn)) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!src.includes("<Image")) continue;
      for (const tag of src.matchAll(/<Image\b[^>]*>/g)) {
        if (/src=\{?["'`][^"'`]*\.svg/.test(tag[0])) {
          offenders.push(`${relative(REPO, file)} — ${tag[0].slice(0, 80)}`);
        }
      }
    }

    expect(
      offenders,
      `next/image cannot render an SVG in this repo: the optimizer refuses it ` +
        `unless \`images.dangerouslyAllowSVG\` is set, and neither app sets it ` +
        `(deliberately — see the note above this test). The request returns 400 ` +
        `and the browser paints the alt text instead of the graphic, while the ` +
        `file itself still serves 200 with the correct content-type, so nothing ` +
        `else catches it.\n\nUse a plain <img>. There is nothing for the ` +
        `optimizer to do with 1–2 KB of vector at a fixed size.\n\n` +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("covers all three Next apps", () => {
    expect(SRC_DIRS.map((d) => relative(REPO, d)).sort()).toEqual([
      "apps/erp/src",
      "apps/superadmin/src",
      "apps/www/src",
    ]);
    expect(SRC_DIRS.flatMap(tsxIn).length).toBeGreaterThan(100);
  });

  it("the www media manifest points at no SVG", () => {
    const manifest = join(REPO, "apps/www/src/media/manifest.ts");
    const src = stripComments(readFileSync(manifest, "utf8"));

    const paths = [...src.matchAll(/(?:src|poster):\s*"([^"]+)"/g)].map(
      (m) => m[1]!,
    );
    const svgs = paths.filter((p) => p.endsWith(".svg"));

    expect(
      svgs,
      `apps/www/src/media/manifest.ts declares an SVG asset. Every slot in it ` +
        `is rendered through next/image in plate.tsx and system-loop.tsx, ` +
        `which cannot render an SVG in this repo — the request 400s and the ` +
        `browser paints the alt text. Ship a raster for these slots, or render ` +
        `that slot with a plain <img>.`,
    ).toEqual([]);
  });
});
