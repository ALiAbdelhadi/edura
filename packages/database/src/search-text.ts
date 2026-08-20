/* ═══════════════════════════════════════════════════════════════════════════
 * SEARCH TEXT — one definition of "these two strings are the same word".
 *
 * WHY THIS EXISTS. Every search box in the product compared bytes: Prisma's
 * `contains` with `mode: "insensitive"` is `ILIKE`, and ILIKE folds ASCII case
 * and NOTHING else. Measured against the dev database on 2026-08-19, that is
 * not a rough edge — it is the search not working:
 *
 *     stored «أحمد» (3 rows)   typed «احمد»   → 0 results
 *     stored «إيهاب»           typed «ايهاب»  → 0 results
 *     stored «فريدة»           typed «فريده»  → 0 results
 *     stored «كنزي»            typed «كنزى»   → 0 results
 *     stored «ملك حسن»         typed «حسن ملك» → 0 results
 *
 * An Egyptian receptionist types أ as ا (the hamza needs Shift on the standard
 * layout and nobody at a counter reaches for it), writes ة as ه and ى as ي
 * interchangeably, and types the family name first about as often as last.
 * Every one of those returned an empty list from a search that was working
 * perfectly — which is worse than an error, because it reads as "this child is
 * not registered here".
 *
 * WHERE IT LIVES. `@repo/database` is the only package BOTH `@repo/server-core`
 * (the query side) and `@repo/ui` (the palette's own destination matcher) already
 * depend on, and this module imports nothing — no Prisma, no Node — so putting
 * it here costs the browser bundle nothing. It is the same reason `chat-policy`
 * lives here: one definition, reachable from both sides. A second copy of a
 * normalizer is a search that behaves differently depending on which box you
 * typed into, which is exactly the class of drift this codebase keeps refusing.
 *
 * WHAT IT IS NOT. Not fuzzy matching. `normalizeSearchText` collapses forms
 * that Egyptian typists genuinely treat as the same character; it does not
 * accept `wlt` for «wallet» or tolerate a wrong letter. On a counter,
 * predictable beats clever — the same rule the palette's destination matcher
 * already follows.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Marks that vanish: Arabic diacritics (تشكيل), the dagger alef, Quranic marks,
 * the tatweel (ـ, a pure typographic stretch), and the invisible bidi/joiner
 * controls a copy-paste out of a PDF or a WhatsApp message drags along.
 *
 * Diacritics are stripped rather than folded because a name is stored with them
 * roughly never and typed with them exactly never — but a name pasted out of an
 * official document carries them, and that paste has to find the row.
 */
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

/**
 * The letter folds. Each group is a set of shapes Egyptian typists use for one
 * another, mapped onto ONE canonical form.
 *
 * `ة → ه` and not the reverse, and `ى → ي` and not the reverse, are arbitrary
 * choices of direction — what matters is that both sides of every comparison
 * run through this same table, so the direction can never be observed.
 */
const FOLD: Record<string, string> = {
  // alef in all its hamza'd forms, plus the wasla an Uthmani paste carries
  "أ": "ا", // أ
  "إ": "ا", // إ
  "آ": "ا", // آ
  "ٱ": "ا", // ٱ
  // teh marbuta ↔ heh — «فاطمة» and «فاطمه» are the same child
  "ة": "ه", // ة
  // alef maqsura ↔ yeh — «مصطفى» and «مصطفي», «على» and «علي»
  "ى": "ي", // ى
  // hamza carriers, which a typist picks by feel rather than by rule
  "ؤ": "و", // ؤ
  "ئ": "ي", // ئ
  "ء": "", // ء standing alone: dropped, never typed mid-name
  // Persian/Urdu shapes that arrive from phone keyboards set to the wrong locale
  "ک": "ك", // ک
  "ی": "ي", // ی
  "ھ": "ه", // ھ
};

/**
 * Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits fold to ASCII.
 *
 * This is not cosmetic: a phone number or a student code typed on an Arabic
 * keyboard comes in as ٠١١١١٣٦٧١٥٠, and `asPhoneIdentifier` in the counter
 * lookup rejects anything holding a non-ASCII digit outright — so the card in
 * the reader's hand resolved to nothing at all.
 */
function foldDigit(code: number): string | null {
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return null;
}

/**
 * The canonical form of a string for searching.
 *
 * Punctuation becomes a SPACE rather than being deleted, so `RCP-NILE-2026-4`
 * and `RCP NILE 2026 4` produce the same term list and each finds the other.
 * Deleting it would instead have glued `RCPNILE20264` together, which matches
 * neither of the two ways a human writes a receipt number down.
 */
export function normalizeSearchText(input: string): string {
  if (!input) return "";

  // NFKC first: it resolves the Arabic presentation forms (ﻻ, ﺍ) that a paste
  // out of a PDF carries, and the full-width Latin a phone keyboard can emit.
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
    // Arabic letters, ASCII alphanumerics and CJK survive; everything else —
    // punctuation, symbols, every flavour of space — becomes one space.
    out += /[\p{L}\p{N}]/u.test(ch) ? ch : " ";
  }

  return (
    out
      // Latin diacritics: NFD splits é into e + ◌́, and the combining mark goes.
      // Arabic is untouched here, its own marks having already been stripped.
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * The query, as the list of words every candidate must contain.
 *
 * WORD-INDEPENDENT, ON PURPOSE. «حسن ملك» finds «ملك حسن». Egyptian names are
 * given-name-first in the register and family-name-first in speech, and a
 * receptionist reading a name off a card has no way to know which order the
 * row was created in. Requiring the typed order made the search fail on a name
 * the reader was holding in their hand.
 */
export function searchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

/**
 * Does this record match? `parts` are the record's own searchable fields — a
 * name, a phone, a code — joined and normalized once.
 *
 * EVERY term must appear (AND, not OR). Typing a second word must narrow the
 * list; a search where «محمد علي» returns more rows than «محمد» is one the
 * reader stops trusting after the first time.
 */
export function matchesSearchTerms(
  parts: (string | null | undefined)[],
  terms: string[],
): boolean {
  if (!terms.length) return false;
  const haystack = normalizeSearchText(
    parts.filter((p): p is string => Boolean(p)).join(" "),
  );
  // The SAME haystack with its spaces closed up. «عبد الرحمن» and «عبدالرحمن»
  // are one name written two ways — as are عبد الله, أبو بكر and every other
  // compound in the Egyptian register — and which way a row was created in is
  // not something the person reading the name off a card can know. Checked as
  // a SECOND chance rather than as the only one, so a term that matched a real
  // word boundary still ranks and reads as itself.
  const dense = haystack.replace(/ /g, "");
  return terms.every((term) => haystack.includes(term) || dense.includes(term));
}

/** Convenience for the single-field case. */
export function matchesSearchQuery(
  parts: (string | null | undefined)[],
  query: string,
): boolean {
  return matchesSearchTerms(parts, searchTerms(query));
}

/* ─────────────────────────────────────────────────────────────────────────
 * The SQL half — narrowing without lying.
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Characters that MORE THAN ONE character folds onto. They are the reason a
 * normalized query cannot simply be handed to `contains`: the database holds
 * the RAW text, so «ا» in a normalized term may be «أ» in the row, and asking
 * for «احمد» literally finds nothing.
 *
 * ASCII letters are deliberately absent: `mode: "insensitive"` is ILIKE, which
 * already folds ASCII case in the database. What ILIKE does NOT fold is
 * everything else in this file, which is the whole point.
 */
const FOLD_TARGETS = new Set(Object.values(FOLD).filter(Boolean));

/** Shortest fragment worth sending to the database. One character narrows nothing. */
const MIN_FRAGMENT = 2;

/**
 * ASCII digits are deliberately NOT fold targets, and the price is paid here
 * instead.
 *
 * Excluding them would have been the tidy choice — ٠ folds onto 0, so 0 is not
 * strictly safe as a literal — but it would have left every receipt number,
 * phone number and student code with NO usable fragment at all, and a receipt
 * search would then scan the center's payments up to `SEARCH_SCAN_LIMIT` and
 * silently miss the 121st. Missing the row is the bug this file exists to fix;
 * an extra OR branch is not.
 *
 * So a fragment holding a digit is sent twice, once in each numeral system.
 * The gap this leaves is a value written in MIXED numerals («٠0١») — which no
 * keyboard produces and which the dev database holds none of (measured
 * 2026-08-19: zero non-ASCII digits across users.phone, student_profiles.phone,
 * student_profiles.student_code and payments.receipt_number).
 */
export function fragmentVariants(fragment: string): string[] {
  if (!/[0-9]/.test(fragment)) return [fragment];
  const arabicIndic = fragment.replace(/[0-9]/g, (d) =>
    String.fromCharCode(0x0660 + Number(d)),
  );
  return [fragment, arabicIndic];
}

/**
 * The longest run of a term that is safe to hand to `contains` VERBATIM —
 * every character in it being one that nothing else folds onto, so it appears
 * in the raw column exactly as it appears in the normalized term.
 *
 *     «احمد»  → «حمد»   (ا is a fold target, so the run starts after it)
 *     «فاطمه» → «طم»    (both ا and ه are fold targets)
 *     «ندي»   → «ند»    (ي is)
 *
 * This is a PRE-filter and nothing more: it narrows the rows the database sends
 * back, and `matchesSearchTerms` then decides which of them actually matched.
 * A fragment can never exclude a row the full query would have accepted —
 * every character it drops is one that cannot be compared byte-wise anyway.
 */
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

/**
 * The database-side narrowing for a whole query: one fragment per term, ANDed.
 *
 * An EMPTY array is a legitimate answer, and callers must read it as "this
 * query cannot be narrowed in SQL" — a query made entirely of fold targets
 * («اي», «ىى») has nothing byte-comparable in it. The caller then scans its own
 * already-tenant-bounded set up to `SEARCH_SCAN_LIMIT` and lets the JS matcher
 * decide. It is the honest trade: such a query is unselective by nature, and
 * returning nothing for it would be the bug this file exists to fix.
 */
export function literalFragments(query: string): string[] {
  return searchTerms(query)
    .map(literalFragment)
    .filter((f): f is string => f !== null);
}

/**
 * The whole pre-filter, as an `AND` array a Prisma `where` can hold.
 *
 * `on` maps ONE needle onto the field clauses it should be compared against, so
 * a caller writes the fields once and this owns the rest: one clause per term,
 * ANDed (a second word must narrow), each holding an OR over the fields and
 * over both numeral systems.
 *
 * An EMPTY array is a legitimate answer and Prisma reads it as "no constraint" —
 * a query made entirely of fold targets («اي», «ىى») has nothing byte-comparable
 * in it. The caller then scans its own already-bounded set up to
 * `SEARCH_SCAN_LIMIT` and lets `matchesSearchTerms` decide. That is the honest
 * trade: such a query is unselective by nature, and returning NOTHING for it is
 * the bug this file exists to fix.
 *
 * Generic over the clause type on purpose — the Prisma input types differ per
 * model, and this module must not import Prisma to stay free for the browser.
 */
export function narrowFragments<W>(
  frags: string[],
  on: (needle: string) => W[],
): { OR: W[] }[] {
  return frags.map((f) => ({ OR: fragmentVariants(f).flatMap(on) }));
}

/**
 * `narrowFragments` WITH A FLOOR — for a caller that has no JS decide pass to
 * fall back on.
 *
 * `narrowFragments` returns `[]` for a query with nothing byte-comparable in it
 * («اي», «ىى»), and Prisma reads an empty `AND` as NO CONSTRAINT. A provider
 * that then filters in JS is fine — it scans its own bounded set and decides.
 * A PAGINATED list is not: an empty `AND` there would quietly return the whole
 * table for a query the operator typed to narrow it, which is a worse failure
 * than the empty result this whole module exists to fix.
 *
 * So when nothing can be narrowed, this falls back to comparing the raw query
 * exactly as the code did before any of this existed. For such a query — two
 * characters that are all fold targets — the old byte comparison is precisely
 * as good as it ever was, and it is never a wider read.
 */
export function narrowQuery<W>(
  query: string,
  on: (needle: string) => W[],
): { OR: W[] }[] {
  const frags = literalFragments(query);
  return frags.length ? narrowFragments(frags, on) : [{ OR: on(query.trim()) }];
}

/**
 * How many rows a provider may pull back before the JS matcher narrows them to
 * the handful the palette shows.
 *
 * Sized against the shape of the data, not guessed: every provider in the
 * search kernel is already bounded to ONE center's roster, ONE teacher's
 * courses or ONE parent's children before this cap applies, and no such set is
 * large. It exists so that the fragment pre-filter — which is deliberately
 * loose, «حمد» also matching «محمد» — cannot fill the page with near-misses and
 * push the real answer off the end.
 */
export const SEARCH_SCAN_LIMIT = 120;

/**
 * A student code or receipt number as typed: digits folded to ASCII, spaces and
 * dashes dropped, upper-cased.
 *
 * `q.toUpperCase()` was the whole of this, so a code read aloud and typed with
 * a dash — or typed on an Arabic numeric keypad — matched nothing.
 */
export function normalizeIdentifier(input: string): string {
  return normalizeSearchText(input).replace(/[^a-z0-9]/g, "").toUpperCase();
}
