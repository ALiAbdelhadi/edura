// Proof that the 2026 chrome reaches EVERY surface it is meant to, including
// the two that render through a Radix PORTAL and therefore inherit nothing from
// the shell's own subtree.
//
// This is a source-reading test, in the same style as
// `portal-bottom-nav-parity.test.ts` and `design-tokens.test.ts`, because the
// repo has no DOM test environment (vitest runs `environment: "node"` and
// neither app depends on testing-library). It cannot prove the pixels; it can
// prove the wiring, which is where this particular bug class lives.
//
// THE BUG IT LOCKS DOWN. `<Sidebar>` renders three ways: a desktop rail, a
// `collapsible="none"` panel, and — on mobile — a `<Sheet>`, which portals its
// content to <body>. The mobile branch used to drop `className` and `style`
// entirely, so a caller that styled <Sidebar> got its styling on the rail and
// silently NOT on the phone drawer. One component, two appearances, and the
// kind of split a user finds rather than we do. Every assertion below exists
// because that failure is invisible to typecheck, to lint and to a desktop
// screenshot.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");

const SIDEBAR = join(REPO, "packages/ui/src/components/sidebar.tsx");
const SHELL = join(REPO, "packages/ui/src/components/app-shell.tsx");
const PALETTE = join(REPO, "packages/ui/src/components/nav-command-palette.tsx");
const CHROME = join(REPO, "packages/ui/src/styles/chrome-2026.css");

const read = (file: string) => readFileSync(file, "utf8");

/** Source with comments stripped, so a mention in prose never satisfies a check. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the portal chrome reaches every surface", () => {
  it("the mobile drawer receives the caller's className and style", () => {
    const src = code(SIDEBAR);
    // The mobile branch, from `if (isMobile)` to the end of its <Sheet>.
    const start = src.indexOf("if (isMobile)");
    expect(start, "sidebar.tsx no longer has a mobile branch").toBeGreaterThan(
      -1,
    );
    const branch = src.slice(start, src.indexOf("</Sheet>", start));

    // The IDENTIFIER, not the attribute. `branch.includes("className")` was the
    // first version of this check and it passed with the forwarding deleted,
    // because the hardcoded `className="…"` attribute still contains the word.
    // A negative control is what found that; the lookahead is what fixes it.
    expect(
      /\bclassName\b(?!\s*=)/.test(branch),
      "The mobile <Sheet> branch of <Sidebar> does not forward `className`. " +
        "It renders through a Radix portal, so it inherits nothing from the " +
        "shell's subtree — dropping the class means the phone drawer silently " +
        "renders in a different skin from the desktop rail.",
    ).toBe(true);

    expect(
      branch.includes("...style"),
      "The mobile <Sheet> branch of <Sidebar> does not merge the caller's " +
        "`style`. Custom properties set by the caller would not reach the " +
        "drawer.",
    ).toBe(true);
  });

  it("all three <Sidebar> branches honour `style`", () => {
    const src = code(SIDEBAR);
    // `style` must be destructured out of props (otherwise it rides `...props`
    // onto <Sheet>, a Radix Root that renders no DOM and drops it).
    expect(src).toMatch(/collapsible = "offcanvas",\s*\n\s*className,\s*\n\s*style,/);
    // Two DOM branches beside the portal one, each applying it explicitly.
    expect(src.match(/style=\{style\}/g)?.length ?? 0).toBe(2);
  });

  it("the shell marks BOTH the provider and the sidebar as chrome", () => {
    const src = code(SHELL);
    expect(
      /<SidebarProvider[\s\S]{0,400}?className="chrome/.test(src),
      "SidebarProvider is not marked `chrome`, so the header and inset lose " +
        "the 2026 surface.",
    ).toBe(true);
    expect(
      /<Sidebar\b[\s\S]{0,600}?className="chrome"/.test(src),
      "<Sidebar> itself is not marked `chrome`. The provider's class cannot " +
        "reach the portalled phone drawer, so this second mark is what the " +
        "drawer actually gets.",
    ).toBe(true);
  });

  it("the palette dialog carries its own chrome class", () => {
    // Also a portal, and a Dialog rather than a Sheet — so it needs its own
    // hook into the chrome, not descent from anything.
    expect(code(PALETTE)).toMatch(/className="chrome-surface"/);
    expect(code(CHROME)).toMatch(/\.chrome-surface\s*\{/);
  });
});

describe("the sidebar names the brand exactly once", () => {
  // Ali spotted the sidebar showing "Edura" twice. TWO causes stacked, and the
  // fix for each is asserted separately below because either alone brings it
  // back — one visibly, one only for a screen-reader user.
  const WRAPPERS = [
    join(APP, "src/components/refine/dashboard-shell.tsx"),
    join(REPO, "apps/superadmin/src/components/refine/dashboard-shell.tsx"),
  ];

  it.each(WRAPPERS)("%s does not route the mark through next/image", (file) => {
    const src = code(file);
    const logo = src.slice(src.indexOf("logo={"), src.indexOf("headerSettings"));
    expect(
      /<Image\b/.test(logo),
      "The brand mark is rendered with next/image. Next's optimizer REFUSES " +
        "SVG unless `dangerouslyAllowSVG` is set — neither app sets it — so " +
        "the request 400s and the browser paints its broken-image icon TOGETHER " +
        "WITH the alt text, which is what made the sidebar read 'Edura' twice. " +
        "Measured on dev: /_next/image?url=%2Fedura-mark.svg -> 400, " +
        "/edura-mark.svg -> 200 image/svg+xml. Use a bare <img>; there is " +
        "nothing to optimise in 1.8 KB of vector at a fixed 36px.",
    ).toBe(false);
    expect(logo).toMatch(/<img\b/);
  });

  // THE RULE, and it is a pair — neither half is right on its own:
  //   the sidebar header names the brand EXACTLY ONCE.
  // The mark is the half that survives, because the collapsed rail is 48px and
  // hides a wordmark by design; a header built on the word would be empty in
  // half of this component's two states. So the wordmark goes, and the alt
  // comes back — an alt describes what the reader is missing, so it follows
  // what else is on screen rather than what the file contains.
  it("the shell renders no wordmark beside the mark", () => {
    const src = code(SHELL);
    expect(
      src.match(/>\s*Edura\s*</g)?.length ?? 0,
      "The shell renders the word 'Edura' as text. The mark already names the " +
        "brand in the header (each wrapper's logo carries alt=\"Edura\"), so " +
        "this is the second naming — visible to everyone, and announced twice " +
        "to a screen reader.",
    ).toBe(0);
  });

  it.each(WRAPPERS)("%s gives the mark a real alt", (file) => {
    const src = code(file);
    const logo = src.slice(src.indexOf("logo={"), src.indexOf("headerSettings"));
    expect(
      /alt="Edura"/.test(logo),
      "The brand mark has no accessible name. It was correctly `alt=\"\"` " +
        "while a wordmark sat beside it — a logo next to its own name is " +
        "decorative — but the wordmark is gone, so this mark is now the only " +
        "thing naming the product in the sidebar header. An empty alt leaves " +
        "it nameless. If a wordmark is ever restored, empty it again: the two " +
        "assertions in this block move together, always summing to one.",
    ).toBe(true);
  });
});

describe("the chrome layer stays a layer, not a second palette", () => {
  it("declares only --chrome-* custom properties", () => {
    const css = read(CHROME).replace(/\/\*[\s\S]*?\*\//g, "");
    const declared = new Set<string>();
    for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
      for (const decl of block[1]!.split(";")) {
        const name = decl.split(":")[0]?.trim();
        if (name?.startsWith("--")) declared.add(name);
      }
    }
    expect(declared.size, "no tokens found — the check would pass vacuously")
      .toBeGreaterThan(20);

    const strays = [...declared].filter((n) => !n.startsWith("--chrome-")).sort();
    expect(
      strays,
      "chrome-2026.css declares a custom property outside the `--chrome-*` " +
        "namespace. The whole reason this sheet is safe to import globally is " +
        "that it owns a namespace nothing else does: it restyles the sidebar " +
        "by setting PROPERTIES, never by re-pointing a shared token. A stray " +
        "name here is the first step back toward the palette drift that " +
        "design-tokens.test.ts exists to catch.",
    ).toEqual([]);
  });

  it("has no active-item edge rule", () => {
    // Removed 2026-08-14 (Ali): a hard square stroke on the start edge fought
    // the row's 10px radius, and needed mirroring in RTL, so one nav item had
    // two silhouettes depending on the script. Active state is a wash and a
    // colour. Asserted rather than remembered, because `box-shadow: inset` is
    // exactly the thing a later "restore the active indicator" commit adds back.
    const css = read(CHROME);
    const active = css.slice(css.indexOf('[data-active="true"]'));
    expect(active).not.toMatch(/box-shadow:\s*inset/);
  });

  it("kills the edge bar the shadcn primitive still draws", () => {
    // The rule above only ever governed THIS sheet, and for six days that was
    // half the story: `sidebar.tsx` is stock shadcn and its base class carries
    // `data-[active=true]:before:…before:start-0 before:w-0.5`, so the bar was
    // on screen the whole time the sheet said there was no bar. Both halves are
    // asserted here — the primitive is expected to keep carrying it (we do not
    // fork shadcn), so the override is what must not disappear.
    const primitive = code(SIDEBAR);
    const hasPseudoBar =
      /data-\[active=true\]:before:start-0/.test(primitive) &&
      /data-\[active=true\]:before:w-0\.5/.test(primitive);

    if (hasPseudoBar) {
      expect(
        /\[data-active="true"\]::before\s*\{[^}]*content:\s*none/.test(
          read(CHROME),
        ),
        "sidebar.tsx still draws a 2px ::before bar on the start edge of the " +
          "active row, and chrome-2026.css no longer cancels it. That bar was " +
          "removed by decision on 2026-08-14 — it fights the row's 10px radius " +
          "and mirrors in RTL, so one nav item gets two silhouettes depending " +
          "on the script. Restore the `content: none` override.",
      ).toBe(true);
    }
  });
});
