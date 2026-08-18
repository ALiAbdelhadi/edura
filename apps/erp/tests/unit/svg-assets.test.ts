// Every SVG shipped from a `public/` directory must actually parse.
//
// THE BUG THIS EXISTS FOR, because it was invisible in every way a person
// normally checks. `public/edura-mark.svg` carried a comment reading
// "Colours are LITERAL, not var(<the ink property>)/var(<the gold property>)"
// — spelling out two CSS custom property names. A custom property's name
// begins with a double hyphen, and SVG is parsed as XML, where a comment may
// not contain one. So the file was not well-formed and Chrome refused it with
// `EncodingError: The source image cannot be decoded`.
//
// What made it survive:
//   - it fetched 200 with `content-type: image/svg+xml`, so the network tab
//     looked perfect;
//   - `img.complete` was `true`, because a decode failure still completes;
//   - `element.innerText` does not include `alt`, so reading the DOM for the
//     text the browser was painting found nothing;
//   - and the only visible symptom was the sidebar showing the word "Edura"
//     where the mark should be, which reads as a layout mistake rather than a
//     broken asset.
// The same file is the favicon, the manifest icons and the push-notification
// badge, so one unparseable comment took out the brand mark everywhere at once.
//
// A comment that explains why a file avoids custom properties, and breaks the
// file by naming them, is a good enough joke to be worth a permanent test.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");

// All three Next apps. `apps/www` is included even though it ships no SVG today
// (and no `<Image>` pointed at one): it is the PUBLIC marketing site, so it is
// the surface where a broken brand mark costs the most, and it has no vitest of
// its own — `package.json` declares no test script — so a guard placed beside it
// would simply never run. Hosting it here is the same arrangement
// `design-tokens.test.ts` already uses to police `packages/ui`.
// Two locations per app, because Next ships SVGs from BOTH and only one of
// them is obvious. `public/` is the one everybody thinks of; `src/app/` is
// where the App Router's file conventions live — `icon.svg`, `apple-icon.svg`,
// `opengraph-image.svg` — and `apps/www` serves its FAVICON from there
// (`○ /icon.svg` in its build output). Scanning only `public/` would have left
// the marketing site's favicon unchecked, which is precisely the asset the
// original bug took down.
const SHIPPED_SVG_DIRS = ["apps/erp", "apps/superadmin", "apps/www"].flatMap(
  (app) => [join(REPO, app, "public"), join(REPO, app, "src/app")],
);

function svgsIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    // A public directory may legitimately not exist, or hold no SVG at all.
    // That is not a failure — the app-level check below is what would catch a
    // missing directory that should be there.
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
    // Without this the suite below passes vacuously the day someone moves a
    // public directory.
    expect(FILES.length).toBeGreaterThan(0);

    // Test fixtures are deliberately excluded, and that is not tidiness:
    // `tests/db/fixtures/images/evil.svg` is a hostile file that exists to be
    // REJECTED by the M6 magic-byte check. A guard that demanded it be
    // well-formed would be asking someone to repair the very thing a security
    // proof depends on being broken. Scanning only `public/` and `src/app/`
    // keeps fixtures out by construction rather than by a denylist.
    expect(FILES.filter((f) => f.includes("/tests/"))).toEqual([]);
  });

  it.each(FILES.map((f) => [relative(REPO, f), f] as const))(
    "%s has no double hyphen inside a comment",
    (_label, file) => {
      const src = readFileSync(file, "utf8");
      const offenders: string[] = [];

      for (const match of src.matchAll(/<!--([\s\S]*?)-->/g)) {
        const body = match[1]!;
        // The XML rule is exactly this: `--` may not appear in a comment, and
        // a comment may not end in `-` (which would make `--->`).
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

/* ────────────────────────────────────────────────────────────────────────────
 * The OTHER half of the same bug.
 *
 * Fixing the unparseable comment above made the mark decodable, and four call
 * sites STILL rendered it broken — because `next/image` refuses an SVG outright
 * unless `images.dangerouslyAllowSVG` is set, which neither app sets. Measured
 * on dev: `/_next/image?url=%2Fedura-mark.svg&w=48&q=75` → 400, while
 * `/edura-mark.svg` → 200 `image/svg+xml`.
 *
 * The four were the marketing header and footer (every public page), the legal
 * pages, and the invite-accept page — the screen a family opens from the link
 * in their WhatsApp message. All four had been shipping a broken logo.
 *
 * THE FIX IS NOT TO SET THE FLAG. `dangerouslyAllowSVG` opens the optimizer to
 * SVG generally, and an SVG is an executable document: the flag exists to stop
 * a user-supplied file being served as active content from this origin, and
 * this product takes uploads. There is also nothing to gain — these marks are
 * 1–2 KB of vector at a fixed pixel size, so the optimizer has no work to do.
 * A plain <img> is both safer and correct.
 * ──────────────────────────────────────────────────────────────────────────── */
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

  /**
   * Comments stripped FIRST. Without this the check reported a false positive
   * on its own documentation: `dashboard-shell.tsx` carries a comment
   * explaining why `<Image src="/edura-mark.svg">` was replaced, and a plain
   * substring scan read the explanation as the offence. The same trap once let
   * `portal-bottom-nav-parity.test.ts` count a commented-out nav entry as a
   * live destination — a scan of source text has to agree with the compiler
   * about what is code.
   */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  it("across both apps", () => {
    const offenders: string[] = [];

    for (const file of SRC_DIRS.flatMap(tsxIn)) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!src.includes("<Image")) continue;
      // Each <Image …> element, opening tag only.
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
    // A guard that silently stops scanning an app is worse than no guard: it
    // reads as coverage. Named explicitly so dropping one fails here rather
    // than passing quietly.
    expect(SRC_DIRS.map((d) => relative(REPO, d)).sort()).toEqual([
      "apps/erp/src",
      "apps/superadmin/src",
      "apps/www/src",
    ]);
    expect(SRC_DIRS.flatMap(tsxIn).length).toBeGreaterThan(100);
  });

  /**
   * THE LIMIT OF A STATIC SCAN, closed where it can be closed.
   *
   * The check above reads the literal `src` on an `<Image>` tag, so it cannot
   * see a dynamic one. `apps/www` has exactly one `<Image>` and its src IS
   * dynamic (`plate.tsx` renders `slot.src`) — which would leave the marketing
   * site, the surface this guard was extended to cover, effectively unchecked.
   *
   * But that value is not arbitrary: every slot comes from ONE static table,
   * `apps/www/src/media/manifest.ts`. So the manifest is what gets checked, and
   * the coverage is real rather than nominal.
   */
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
