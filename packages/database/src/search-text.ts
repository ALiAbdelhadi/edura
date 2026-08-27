const STRIP = new RegExp(
  "[" +
    "\\u064B-\\u0652" + // ً ٌ ٍ َ ُ ِ ّ ْ  — the tashkeel
    "\\u0653-\\u0655" + // آ ٓ  madda/hamza above and below
    "\\u0670" + //          ٰ  dagger alef
    "\\u06D6-\\u06ED" + // Quranic annotation, which a scripture paste carries
    "\\u0640" + //          ـ  tatweel — a typographic stretch, never a letter
    "\\u200B-\\u200F" + // ZWSP/ZWNJ/ZWJ and the LRM/RLM marks
    "\\u202A-\\u202E" + // bidi embedding/override, dragged in by copy-paste
    "\\u2066-\\u2069" + // bidi isolates, ditto
    "\\u061C" + //          Arabic letter mark
    "\\uFEFF" + //          BOM
    "]",
  "g",
);

const FOLD: Record<string, string> = {
  "أ": "ا", // أ
  "إ": "ا", // إ
  "آ": "ا", // آ
  "ٱ": "ا", // ٱ
  "ة": "ه", // ة
  "ى": "ي", // ى
  "ؤ": "و", // ؤ
  "ئ": "ي", // ئ
  "ء": "", // ء standing alone: dropped, never typed mid-name
  "ک": "ك", // ک
  "ی": "ي", // ی
  "ھ": "ه", // ھ
};

function foldDigit(code: number): string | null {
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return null;
}

export function normalizeSearchText(input: string): string {
  if (!input) return "";

  const source = input.normalize("NFKC").replace(STRIP, "");

  let out = "";
  for (const ch of source) {
    const digit = foldDigit(ch.codePointAt(0) ?? 0);
    if (digit !== null) {
      out += digit;
      continue;
    }
    const folded = FOLD[ch];
    if (folded !== undefined) {
      out += folded;
      continue;
    }
    out += /[\p{L}\p{N}]/u.test(ch) ? ch : " ";
  }

  return (
    out
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function searchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

export function matchesSearchTerms(
  parts: (string | null | undefined)[],
  terms: string[],
): boolean {
  if (!terms.length) return false;
  const haystack = normalizeSearchText(
    parts.filter((p): p is string => Boolean(p)).join(" "),
  );
  const dense = haystack.replace(/ /g, "");
  return terms.every((term) => haystack.includes(term) || dense.includes(term));
}

export function matchesSearchQuery(
  parts: (string | null | undefined)[],
  query: string,
): boolean {
  return matchesSearchTerms(parts, searchTerms(query));
}

const FOLD_TARGETS = new Set(Object.values(FOLD).filter(Boolean));

const MIN_FRAGMENT = 2;

export function fragmentVariants(fragment: string): string[] {
  if (!/[0-9]/.test(fragment)) return [fragment];
  const arabicIndic = fragment.replace(/[0-9]/g, (d) =>
    String.fromCharCode(0x0660 + Number(d)),
  );
  return [fragment, arabicIndic];
}

export function literalFragment(term: string): string | null {
  let best = "";
  let run = "";
  for (const ch of term) {
    if (FOLD_TARGETS.has(ch)) {
      run = "";
      continue;
    }
    run += ch;
    if (run.length > best.length) best = run;
  }
  return best.length >= MIN_FRAGMENT ? best : null;
}

export function literalFragments(query: string): string[] {
  return searchTerms(query)
    .map(literalFragment)
    .filter((f): f is string => f !== null);
}

export function narrowFragments<W>(
  frags: string[],
  on: (needle: string) => W[],
): { OR: W[] }[] {
  return frags.map((f) => ({ OR: fragmentVariants(f).flatMap(on) }));
}

export function narrowQuery<W>(
  query: string,
  on: (needle: string) => W[],
): { OR: W[] }[] {
  const frags = literalFragments(query);
  return frags.length ? narrowFragments(frags, on) : [{ OR: on(query.trim()) }];
}

export function exactQuery<W>(
  query: string,
  on: (needle: string) => W,
): W[] {
  return searchTerms(query).map(on);
}

export const SEARCH_SCAN_LIMIT = 120;

export function normalizeIdentifier(input: string): string {
  return normalizeSearchText(input).replace(/[^a-z0-9]/g, "").toUpperCase();
}
