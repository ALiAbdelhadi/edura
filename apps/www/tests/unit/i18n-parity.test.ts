import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { HELP_ARTICLES } from "@/features/marketing/help/articles";
import { MARKETING_LINKS } from "@/features/marketing/nav";
import { CHANGELOG } from "@/features/marketing/changelog/entries";
import { routing } from "@/i18n/routing";

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
