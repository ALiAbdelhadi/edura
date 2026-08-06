// Proof that every utility-looking class written in the source ACTUALLY
// produces CSS.
//
// Why this exists: a Tailwind class that does not exist is not an error
// anywhere. It is not a type error, it is not a lint error, and the build stays
// green — Tailwind simply emits nothing and the element renders unstyled. The
// symptom reaches you as "the padding isn't applied and I don't know why".
//
// Two real ones this test was written from:
//
//   • `inset-inline-start-3` on the walk-in check-in search icon. That is a CSS
//     *property* name, not a Tailwind utility (the utility is `start-3`), so the
//     absolutely-positioned icon had no inset at all and sat flush against the
//     field's edge while the input's `ps-9` held the text 36px away.
//   • `text-red-foreground` on the group unread badge. The theme defines
//     `--color-red` but never `--color-red-foreground`, so the badge's text
//     colour was whatever it inherited.
//
// The check is empirical, not a hand-maintained list of legal names: it runs the
// real Tailwind compiler over the real stylesheet and asserts that every
// candidate it found in the source turns into a selector.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "tailwindcss";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = resolve(APP, "../..");
const UI_GLOBALS = join(REPO, "packages/ui/src/styles/globals.css");

// Both portals are covered from here. apps/superadmin has no unit-test harness
// of its own (only live-DB suites), and the same precedent already exists in
// this directory — bottom-nav-slots.test.ts asserts packages/ui from here. The
// two apps share one theme (both `@import` the packages/ui globals), so a token
// that is dead in one is dead in the other; what differs is which source tree
// each stylesheet scans, which is exactly what this table encodes.
const PORTALS = [
  {
    name: "apps/www",
    app: APP,
    // packages/ui rides along here: www's stylesheet is what compiles it.
    sources: [join(APP, "src"), join(REPO, "packages/ui/src")],
    css: [
      UI_GLOBALS,
      join(APP, "src/app/[locale]/globals.css"),
      join(APP, "src/features/admin/ledger/ledger.css"),
      join(APP, "src/features/landing/landing.module.css"),
      join(APP, "src/features/marketing/marketing.module.css"),
      join(APP, "src/components/ledger/ledger.module.css"),
    ],
  },
  {
    name: "apps/superadmin",
    app: join(REPO, "apps/superadmin"),
    sources: [join(REPO, "apps/superadmin/src")],
    css: [UI_GLOBALS, join(REPO, "apps/superadmin/src/app/[locale]/globals.css")],
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * First segment of every Tailwind utility/variant family this codebase uses. A
 * token whose first segment is one of these was *meant* to be a utility, so if
 * the compiler emits nothing for it that is a genuine dead class. Anything else
 * (a `data-slot` value, an API path, an i18n key) is not our business.
 */
const UTILITY_PREFIXES = new Set(
  `p px py pt pb pl pr ps pe m mx my mt mb ml mr ms me space gap
   w h size min max basis grow shrink flex grid col row order place items justify
   content self aspect object top bottom left right inset start end z
   bg text font leading tracking indent align whitespace break truncate line list
   border divide outline ring shadow rounded opacity mix isolate
   translate rotate scale skew transform origin transition duration delay ease animate will
   cursor select resize scroll snap touch appearance caret accent pointer
   overflow overscroll fill stroke
   blur brightness contrast drop grayscale hue invert saturate sepia backdrop filter
   table caption sr underline overline decoration italic float clear
   visible invisible collapse static fixed absolute relative sticky
   block inline hidden contents flow from via to placeholder file marker selection
   container mask`
    .trim()
    .split(/\s+/),
);

/** Does this token look like somebody intended a Tailwind utility? */
function looksLikeUtility(token: string): boolean {
  if (!/^[!-]?[a-z]/.test(token)) return false;
  if (/[A-Z\s"'`{}=]/.test(token)) return false;
  if (!/[-[]/.test(token)) return false; // bare words are never utilities here
  const bare = token.replace(/^!/, "").split(":").pop()!.replace(/^-/, "");
  return UTILITY_PREFIXES.has(bare.split(/[-[/]/)[0]);
}

/**
 * Pull class tokens out of the one place a class name is unambiguously a class:
 * a `className=` / `class=` attribute. Scanning every string literal instead
 * sweeps up API paths ("me/wallet"), `data-slot` values ("select-trigger") and
 * cva variant keys ("lg") — none of which are classes, all of which would then
 * look "dead". Combined with `looksLikeUtility` this yields no false positives.
 */
function candidatesFrom(source: string): Set<string> {
  // Comments hold prose that would otherwise be read as class text.
  const src = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const found = new Set<string>();

  const take = (lit: string) => {
    for (const tok of lit.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) {
      if (tok && looksLikeUtility(tok)) found.add(tok);
    }
  };

  for (const m of src.matchAll(/\bclassNames?\s*=\s*|\bclass\s*=\s*/g)) {
    let i = m.index! + m[0].length;
    const opener = src[i];

    if (opener === '"' || opener === "'") {
      const end = src.indexOf(opener, i + 1);
      if (end !== -1) take(src.slice(i + 1, end));
      continue;
    }
    if (opener !== "{") continue;

    // Balanced `{ … }`, skipping over string bodies so a brace inside a literal
    // does not unbalance the scan. Every literal found inside is class text.
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        let lit = "";
        for (; j < src.length && src[j] !== ch; j++) {
          if (src[j] === "\\") j++;
          else lit += src[j];
        }
        take(lit);
        i = j;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) break;
    }
  }
  return found;
}

/** Class names defined by the project's own CSS (`.led`, `.lg-card`, …). */
function projectClassNames(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1]);
    // `@utility num { … }` declares a utility whose name is not a selector.
    for (const m of css.matchAll(/@utility\s+([\w-]+)/g)) names.add(m[1]);
  }
  return names;
}

const cssEscape = (t: string) => t.replace(/[^A-Za-z0-9_-]/g, (c) => "\\" + c);

/** True when `token` appears in `css` as a complete class selector. */
function isEmitted(css: string, token: string): boolean {
  const sel = "." + cssEscape(token);
  for (let from = 0; ; ) {
    const i = css.indexOf(sel, from);
    if (i === -1) return false;
    const next = css[i + sel.length];
    // A class name continues only through [A-Za-z0-9_-] or a "\" escape; any
    // other char (`{`, `[`, `:`, `,`, whitespace, …) terminates it.
    if (next === undefined || !/[A-Za-z0-9_\\-]/.test(next)) return true;
    from = i + 1;
  }
}

describe.each(PORTALS)("Tailwind classes in $name all produce CSS", (portal) => {
  it("has no dead utility classes", async () => {
    const entry = join(portal.app, "src/app/[locale]/globals.css");
    const compiler = await compile(readFileSync(entry, "utf8"), {
      base: dirname(entry),
      loadStylesheet: async (id: string, basedir: string) => {
        const path =
          id === "tailwindcss"
            ? join(portal.app, "node_modules/tailwindcss/index.css")
            : id === "tw-animate-css"
              ? join(portal.app, "node_modules/tw-animate-css/dist/tw-animate.css")
              : resolve(basedir, id);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
      loadModule: async () => {
        throw new Error("this stylesheet uses no JS plugins");
      },
    });

    const known = projectClassNames(portal.css);
    const candidates = new Set<string>();
    for (const dir of portal.sources) {
      for (const file of walk(dir)) {
        for (const tok of candidatesFrom(readFileSync(file, "utf8"))) candidates.add(tok);
      }
    }

    // Anything the project's own CSS defines is a real class even though
    // Tailwind will not emit it. Everything else must compile.
    const mustCompile = [...candidates].filter((t) => !known.has(t));
    const css = compiler.build(mustCompile);
    const dead = mustCompile.filter((t) => !isEmitted(css, t)).sort();

    expect(
      dead,
      `${portal.name}: these classes are written in the source but Tailwind ` +
        `emits nothing for them, so they have no effect at runtime. Either ` +
        `they are misspelled (a CSS property name such as ` +
        `\`inset-inline-start-3\` instead of the utility \`start-3\`), or they ` +
        `reference a theme token that the @theme block in ` +
        `packages/ui/src/styles/globals.css does not define (such as ` +
        `\`text-red-foreground\`).\n\n` +
        dead.map((d) => `  - ${d}`).join("\n"),
    ).toEqual([]);
  });
});
