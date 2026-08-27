import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { HELP_ARTICLES } from "@/features/marketing/help/articles";
import { MARKETING_LINKS } from "@/features/marketing/nav";
import { CHANGELOG } from "@/features/marketing/changelog/entries";
import { routing } from "@/i18n/routing";
import { getMessages } from "@/lib/i18n";

const MESSAGES = path.join(__dirname, "..", "..", "src", "messages");
const CONTENT = path.join(__dirname, "..", "..", "src", "content", "help");

type Json = Record<string, unknown>;

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
    const notIndexed = MARKETING_LINKS.filter((l) => !l.inSitemap).map((l) => l.href);
    expect(notIndexed).toEqual([]);
  });
});

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

  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

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
      if (!namespaces.has(key.split(".")[0]!)) continue;
      (held.get(key) ?? held.set(key, new Set()).get(key)!).add(rel);
    }
  }

  it("finds table-held keys to check (guards against the pattern matching nothing)", () => {
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
