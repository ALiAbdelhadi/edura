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

/**
 * COVERAGE, PART TWO — the keys that reach `t()` through a LOOKUP TABLE.
 *
 * WHY THIS EXISTS, and it is not hypothetical: a nav entry rendered in the
 * sidebar as the raw string `nav.subscriptions`, because the entry was added to
 * the label table and the message was not.
 *
 * That one WAS caught by the coverage block above — but only by luck. These
 * keys are not written at a call site; they live as VALUES in a table:
 *
 *     const NAV_KEY = { Subscriptions: "nav.subscriptions", … }   // ← here
 *     …
 *     t(NAV_KEY[label])                                           // ← not here
 *
 * and at the call site the argument is a variable, i.e. exactly the "dynamic,
 * not checkable" case the block above counts and passes over. It saw that key
 * only because one screen happened ALSO to hardcode `t("nav.subscriptions")`
 * for its page title. Take that coincidence away and nothing was watching.
 *
 * Measured when this was written: of the shell's two tables, **50 keys** (41
 * nav/navGroup labels and group headings, 9 search-result headings) had no such
 * second reference anywhere in the app — reachable ONLY through a table, and so
 * entirely unguarded. This closes that.
 *
 * It scans for the OBJECT-PROPERTY form — `name: "namespace.key"` — anywhere in
 * the app rather than naming the two tables in the shell, so a third table
 * added tomorrow is covered without anyone remembering to come back here.
 * Comments are stripped first: this file's own prose contains key-shaped
 * strings (a deliberately misspelled `marketing.nav.pricng` lives in a comment
 * explaining that very hazard) and matching those would be a permanent, useless
 * red.
 */
describe("i18n coverage — keys held in lookup tables", () => {
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

  /** Comments only — a strip can lose a candidate, never invent one. */
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

  /**
   * Property names whose dotted values are NOT translation keys.
   *
   * `action` is the audit log's verb (`action: "assistant.invited"`), which
   * shares both the dotted shape and — by coincidence — a first segment with a
   * real message namespace. It is the one collision in the app today, and
   * naming it here is honest in a way that narrowing the pattern until the
   * false positive vanished would not be.
   */
  const NOT_MESSAGE_KEYS = new Set(["action"]);

  const PROPERTY =
    /(?:^|[{,\n])\s*(?:"([^"]+)"|'([^']+)'|\[[^\]]+\]|([A-Za-z_$][\w$]*))\s*:\s*"([A-Za-z_$][\w$]*(?:\.[\w$]+)+)"/g;

  const namespaces = new Set(Object.keys(getMessages("en") as Record<string, unknown>));

  const held = new Map<string, Set<string>>();
  for (const file of sourceFiles(SRC)) {
    const src = stripComments(readFileSync(file, "utf8"));
    const rel = path.relative(SRC, file);
    PROPERTY.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROPERTY.exec(src))) {
      const name = m[1] ?? m[2] ?? m[3] ?? "";
      const key = m[4]!;
      if (NOT_MESSAGE_KEYS.has(name)) continue;
      // A dotted string is only a candidate if it actually starts at a
      // namespace the app serves; everything else is some other kind of id.
      if (!namespaces.has(key.split(".")[0]!)) continue;
      (held.get(key) ?? held.set(key, new Set()).get(key)!).add(rel);
    }
  }

  it("finds table-held keys to check (guards against the pattern matching nothing)", () => {
    // Same sentinel as the block above, for the same reason: a refactor of how
    // these tables are written must fail loudly, not quietly check zero keys.
    expect(held.size).toBeGreaterThan(60);
  });

  it.each(routing.locales)("every table-held key resolves in %s", (locale) => {
    const dict = getMessages(locale);
    const missing = [...held.entries()]
      .filter(([key]) => typeof lookup(dict, key) !== "string")
      .map(([key, files]) => `${key}  (${[...files].sort().join(", ")})`);

    expect(missing.sort()).toEqual([]);
  });
});
