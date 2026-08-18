import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { HELP_ARTICLES } from "@/features/marketing/help/articles";
import { MARKETING_LINKS } from "@/features/marketing/nav";
import { CHANGELOG } from "@/features/marketing/changelog/entries";
import { routing } from "@/i18n/routing";
import { getMessages } from "@/lib/i18n";

/**
 * Translation parity.
 *
 * The app renders Arabic by default and falls back to English key-by-key
 * (i18n/request.ts deep-merges en under ar), which is a good runtime behaviour
 * and a terrible way to FIND a missing translation: a key that exists only in
 * English silently renders English inside an Arabic page and nobody notices
 * until a user does. These tests make that a failing build instead.
 *
 * They check three surfaces that can each drift independently:
 *   1. the JSON dictionaries (ar/*.json vs en/*.json, and ar.json vs en.json)
 *   2. the MDX help articles (every article exists in every locale)
 *   3. the typed content modules (changelog entries carry every locale)
 * plus the nav table, which is what the header, footer and sitemap all read.
 */

const MESSAGES = path.join(__dirname, "..", "..", "src", "messages");
const CONTENT = path.join(__dirname, "..", "..", "src", "content", "help");

type Json = Record<string, unknown>;

/** Every leaf path in an object, as "a.b.c". Arrays are treated as leaves. */
function leafKeys(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const at = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? leafKeys(value as Json, at)
      : [at];
  });
}

function read(file: string): Json {
  return JSON.parse(readFileSync(file, "utf8")) as Json;
}

/**
 * COVERAGE — does every key the code asks for actually exist?
 *
 * WHY THIS EXISTS: parity and coverage are different properties, and only parity
 * was ever checked. Parity compares the two dictionaries to EACH OTHER, so a key
 * absent from both is invisible to it — ar and en agree perfectly about a string
 * neither of them has. This one compares the dictionaries to the CODE, which is
 * the only way that class of gap shows up.
 *
 * It also settles a question by construction. Messages live in TWO places: the
 * root `ar.json`/`en.json`, and the per-area files under `messages/{ar,en}/*`
 * that `getMessages()` spreads in under their own keys. Reading only the root
 * file makes a namespace that lives in the other half look MISSING when it is
 * present and working — a false alarm that costs real time, and did. Resolving
 * against `getMessages()` (the actual runtime assembly, not a re-implementation
 * of the merge) is what makes the answer trustworthy in both directions.
 *
 * It resolves against `getMessages()`, the real runtime assembly (root JSON plus
 * the namespaced files merged under their own keys), rather than re-implementing
 * that merge here — a second copy of the merge could agree with itself and still
 * be wrong about what the app serves.
 *
 * Bindings are matched by VARIABLE, so a file holding several hooks
 * (`const t = useTranslations("a"); const tc = useTranslations("common")`)
 * resolves each call against its own namespace instead of being skipped.
 *
 * Dynamic keys (`t(\`x.${y}\`)`, `t(someVar)`) are NOT checkable this way and are
 * counted and reported rather than silently passed over — a skip nobody can see
 * is how the gap above survived in the first place.
 */
describe("i18n coverage — every key the code calls exists", () => {
  const SRC = path.join(__dirname, "..", "..", "src");

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  /** Resolve "a.b.c" against a dictionary; undefined when any hop is missing. */
  function lookup(dict: unknown, dotted: string): unknown {
    return dotted
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          node !== null && typeof node === "object"
            ? (node as Record<string, unknown>)[part]
            : undefined,
        dict,
      );
  }

  // `use` and `get` BOTH matter: client components call `useTranslations`,
  // server components `await getTranslations`. An earlier version of this
  // pattern omitted `use` and matched only the server half — 145 calls instead
  // of ~700. It looked like a working test. The count sentinel below is what
  // caught it, which is the entire reason that assertion exists.
  const BINDING =
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:use|get)?[tT]ranslations\(\s*(?:"([^"]*)")?\s*\)/g;

  type Call = { file: string; key: string };
  const calls: Call[] = [];
  let dynamic = 0;

  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    const rel = path.relative(SRC, file);

    BINDING.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BINDING.exec(src))) {
      const [, variable, ns = ""] = m;
      // `t("a.b")`, and next-intl's `t.rich(…)` / `t.raw(…)` / `t.markup(…)`.
      const literal = new RegExp(`\\b${variable}(?:\\.(?:rich|raw|markup))?\\(\\s*"([^"]+)"`, "g");
      let c: RegExpExecArray | null;
      while ((c = literal.exec(src))) {
        calls.push({ file: rel, key: ns ? `${ns}.${c[1]}` : c[1] });
      }
      const dyn = new RegExp(`\\b${variable}(?:\\.(?:rich|raw|markup))?\\(\\s*[\`a-zA-Z_$]`, "g");
      dynamic += (src.match(dyn) ?? []).length;
    }
  }

  it("finds translation calls to check (guards against the regex silently matching nothing)", () => {
    // Without this, a refactor that changes how the hook is named would make
    // every assertion below vacuously true and nobody would notice.
    expect(calls.length).toBeGreaterThan(200);
  });

  it.each(routing.locales)("every literal key resolves in %s", (locale) => {
    const dict = getMessages(locale);
    const missing = calls
      .filter(({ key }) => lookup(dict, key) === undefined)
      .map(({ file, key }) => `${key}  (${file})`);

    expect([...new Set(missing)].sort()).toEqual([]);
  });

  it("reports how many keys are built dynamically and cannot be checked here", () => {
    // Not a failure — a number, so the blind spot has a visible size. If this
    // climbs, the guarantee above is covering proportionally less of the app.
    expect(dynamic).toBeGreaterThanOrEqual(0);
    console.info(`[i18n coverage] ${calls.length} literal keys checked · ${dynamic} dynamic call sites not checkable`);
  });
});

describe("i18n parity — JSON dictionaries", () => {
  const namespaced = readdirSync(path.join(MESSAGES, "en")).filter((f) => f.endsWith(".json"));

  it("has the same namespace files in ar and en", () => {
    const ar = readdirSync(path.join(MESSAGES, "ar")).filter((f) => f.endsWith(".json")).sort();
    expect(ar).toEqual(namespaced.slice().sort());
  });

  it.each(namespaced)("%s has identical keys in ar and en", (file) => {
    const en = leafKeys(read(path.join(MESSAGES, "en", file))).sort();
    const ar = leafKeys(read(path.join(MESSAGES, "ar", file))).sort();

    expect(
      { missingInAr: en.filter((k) => !ar.includes(k)), missingInEn: ar.filter((k) => !en.includes(k)) },
    ).toEqual({ missingInAr: [], missingInEn: [] });
  });

  it("root en.json and ar.json have identical keys", () => {
    const en = leafKeys(read(path.join(MESSAGES, "en.json"))).sort();
    const ar = leafKeys(read(path.join(MESSAGES, "ar.json"))).sort();
    expect(
      { missingInAr: en.filter((k) => !ar.includes(k)), missingInEn: ar.filter((k) => !en.includes(k)) },
    ).toEqual({ missingInAr: [], missingInEn: [] });
  });

  it("has no empty string values in either locale", () => {
    for (const locale of routing.locales) {
      for (const file of namespaced) {
        const dict = read(path.join(MESSAGES, locale, file));
        const empties = leafKeys(dict).filter((k) => {
          const value = k.split(".").reduce<unknown>((o, part) => (o as Json)?.[part], dict);
          return typeof value === "string" && value.trim() === "";
        });
        expect(`${locale}/${file}: ${empties.join(", ")}`).toBe(`${locale}/${file}: `);
      }
    }
  });
});

describe("i18n parity — help articles", () => {
  it.each(HELP_ARTICLES.map((a) => a.slug))("%s exists in every locale with a title", (slug) => {
    for (const locale of routing.locales) {
      const raw = readFileSync(path.join(CONTENT, locale, `${slug}.mdx`), "utf8");
      // Frontmatter is what the index cards and <title> read; an article whose
      // block is malformed renders a card with no name.
      expect(raw, `${locale}/${slug}.mdx frontmatter`).toMatch(/^---\r?\n[\s\S]*?\r?\n---/);
      expect(raw, `${locale}/${slug}.mdx title`).toMatch(/\ntitle:\s*\S/);
      expect(raw, `${locale}/${slug}.mdx summary`).toMatch(/\nsummary:\s*\S/);
    }
  });

  it("has no .mdx file that the index does not list", () => {
    const known = new Set(HELP_ARTICLES.map((a) => a.slug));
    for (const locale of routing.locales) {
      const onDisk = readdirSync(path.join(CONTENT, locale))
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => f.replace(/\.mdx$/, ""));
      // An unlisted article is unreachable AND absent from the sitemap — it
      // reads as "written" to whoever wrote it and does not exist to anyone else.
      expect(onDisk.filter((s) => !known.has(s)), `orphans in ${locale}`).toEqual([]);
    }
  });
});

describe("i18n parity — typed content", () => {
  it("every changelog entry has both locales and a valid date", () => {
    for (const entry of CHANGELOG) {
      for (const locale of routing.locales) {
        expect(entry.title[locale]?.trim(), `title.${locale} of ${entry.date}`).toBeTruthy();
        expect(entry.body[locale]?.trim(), `body.${locale} of ${entry.date}`).toBeTruthy();
      }
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the changelog is newest-first", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("marketing nav table", () => {
  const dict = read(path.join(MESSAGES, "en", "marketing.json"));

  it("every link has a label in both locales", () => {
    for (const locale of routing.locales) {
      const d = read(path.join(MESSAGES, locale, "marketing.json")) as {
        nav: Record<string, string>;
      };
      for (const link of MARKETING_LINKS) {
        expect(d.nav[link.labelKey], `${locale} nav.${link.labelKey}`).toBeTruthy();
      }
    }
    expect(dict).toBeTruthy();
  });

  it("has no duplicate hrefs", () => {
    const hrefs = MARKETING_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("puts every navigable page in the sitemap", () => {
    // A page good enough to link to from the chrome is a page search should see.
    const notIndexed = MARKETING_LINKS.filter((l) => !l.inSitemap).map((l) => l.href);
    expect(notIndexed).toEqual([]);
  });
});
