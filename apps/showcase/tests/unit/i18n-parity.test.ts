import { describe, expect, it } from "vitest";
import ar from "../../src/messages/ar.json";
import en from "../../src/messages/en.json";


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

const IDENTICAL_BY_DESIGN = new Set<string>([
  "nav.switchToArabic",
  "nav.switchToEnglish",
  // The landing's three proof FIGURES. A figure is not prose: the system renders
  // every one in IBM Plex Mono with LATIN digits, tabular and bidi-isolated, in
  // both locales — so `7`, `100%` and `0` are identical by the same rule that
  // keeps `300.00` identical on a receipt. Their LABELS are translated, and this
  // test still holds them to it.
  "home.proof.tables.figure",
  "home.proof.isolation.figure",
  "home.proof.writes.figure",
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
    const TECHNICAL = [
      /REVOKE\s+UPDATE,\s*DELETE/g,
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
