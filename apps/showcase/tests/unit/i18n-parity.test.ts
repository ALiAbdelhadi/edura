import { describe, expect, it } from "vitest";
import ar from "../../src/messages/ar.json";
import en from "../../src/messages/en.json";

/**
 * `CONSTITUTION.md` §8 lists "ar and en at string parity" under **Done means**,
 * but the requirement was never automated anywhere in this repo — apps/www has
 * sixteen unit tests and none of them check it. This is that test.
 *
 * The TYPE system already catches one direction: `Messages` is derived from the
 * English dictionary and the Arabic one is asserted against it, so a key that
 * exists in `en` and is missing from `ar` fails `check-types`. It cannot catch:
 *
 *   - a key in `ar` that never reached `en` (structurally invisible to a cast);
 *   - a key present in both but left as the English string in `ar`, which is
 *     untranslated copy shipping silently in the product's PRIMARY language;
 *   - an empty string, which renders as a blank element rather than an error.
 *
 * The runtime merge in `src/i18n/request.ts` deep-merges Arabic over English,
 * so every one of those failures degrades quietly to English rather than
 * throwing. That is the right runtime behaviour and exactly why it needs a test.
 */

type Dict = Record<string, unknown>;

function flatten(obj: Dict, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Dict, path)) out.set(k, v);
    } else {
      out.set(path, String(value));
    }
  }
  return out;
}

const arFlat = flatten(ar as Dict);
const enFlat = flatten(en as Dict);

/**
 * Strings that are legitimately identical across locales. Each needs a reason —
 * the point of the allowlist is that adding to it is a decision, not a way to
 * silence the test.
 */
const IDENTICAL_BY_DESIGN = new Set<string>([
  // The language switcher labels each language in its OWN script, so the
  // Arabic dictionary's "English" and the English dictionary's "العربية" are
  // supposed to match across files.
  "nav.switchToArabic",
  "nav.switchToEnglish",
]);

describe("i18n parity", () => {
  it("every English key exists in Arabic", () => {
    const missing = [...enFlat.keys()].filter((k) => !arFlat.has(k));
    expect(missing, `missing from ar.json:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every Arabic key exists in English", () => {
    const extra = [...arFlat.keys()].filter((k) => !enFlat.has(k));
    expect(extra, `present in ar.json but not en.json:\n${extra.join("\n")}`).toEqual([]);
  });

  it("no value is empty in either locale", () => {
    const blanks = [
      ...[...enFlat].filter(([, v]) => v.trim() === "").map(([k]) => `en:${k}`),
      ...[...arFlat].filter(([, v]) => v.trim() === "").map(([k]) => `ar:${k}`),
    ];
    expect(blanks, `empty strings:\n${blanks.join("\n")}`).toEqual([]);
  });

  it("no Arabic value is still the English string", () => {
    const untranslated = [...arFlat]
      .filter(([k, v]) => !IDENTICAL_BY_DESIGN.has(k) && enFlat.get(k) === v)
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    expect(
      untranslated,
      `identical in both locales — translate it, or add it to IDENTICAL_BY_DESIGN with a reason:\n${untranslated.join("\n")}`,
    ).toEqual([]);
  });

  it("no Arabic value contains Latin-script letters outside an allowlisted key", () => {
    // Catches copy that was half-translated — an Arabic sentence with an
    // English word left inside it.
    //
    // Technical identifiers are removed BEFORE the check rather than the whole
    // string being allowlisted, so a genuine untranslated sentence around a
    // legitimate term is still caught. CONSTITUTION.md §6.1 covers this case
    // directly: a genuinely Latin string inside an Arabic page keeps the Latin
    // form, "because the reason for the Latin form is the SCRIPT, not the
    // language setting". Translating `PostgreSQL` or `REVOKE UPDATE, DELETE`
    // would make the copy WRONG, not more Arabic.
    const TECHNICAL = [
      /REVOKE\s+UPDATE,\s*DELETE/g, // the actual SQL grant the claim rests on
      /PostgreSQL/g,
      /\bSQL\b/g,
      /\bAPI\b/g,
    ];
    const stripTechnical = (v: string) =>
      TECHNICAL.reduce((acc, re) => acc.replace(re, ""), v);

    const suspicious = [...arFlat]
      .filter(([k]) => !IDENTICAL_BY_DESIGN.has(k))
      .filter(([, v]) => /[A-Za-z]{3,}/.test(stripTechnical(v)))
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    expect(
      suspicious,
      `Latin words inside Arabic copy:\n${suspicious.join("\n")}`,
    ).toEqual([]);
  });
});
