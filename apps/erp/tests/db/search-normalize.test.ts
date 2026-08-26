// ONE NORMALIZER, TWO IMPLEMENTATIONS — and this is what keeps them one.
//
// `edura_search_normalize(text)` (migration 20260820120000_search_normalize)
// and `normalizeSearchText` (packages/database/src/search-text.ts) must produce
// BYTE-IDENTICAL output. They exist separately because neither can do the
// other's job: the SQL one can be indexed and used inside a paginated `WHERE`,
// and the JS one runs in the browser, where the palette matches its own
// destination list. Two normalizers that disagree are two search engines — a
// reader would learn one rule on the palette and a different one on the list
// below it, and neither would be wrong on its own screen.
//
// So the agreement is MEASURED, not asserted by reading the two side by side:
//
//   1. Hand-picked cases, one per rule, so a failure names the rule.
//   2. EVERY DISTINCT VALUE in every searchable column on the live database.
//      This is the one that would catch a real row nobody thought of.
//   3. A fuzz pass over Arabic, Latin-with-diacritics, Cyrillic, CJK, Hangul,
//      emoji, Arabic presentation forms, full-width Latin, Unicode digraphs and
//      the invisible bidi/joiner controls a paste carries. The corpus is Arabic
//      and Latin because that is what this product holds; the divergence risk
//      lives in everything it does not hold YET.
//   4. The function's own properties: IMMUTABLE (an expression index cannot be
//      built on anything less), STRICT, and the five indexes actually present.
//
// Nothing is mocked and nothing is written: every query here is a SELECT.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import {
  matchesSearchQuery,
  normalizeSearchText,
  searchTerms,
} from "@repo/database/search-text";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);
}

/** One per rule, so a red line names the rule that broke. */
const RULES: [string, string][] = [
  ["أحمد", "hamza above alef"],
  ["إيهاب", "hamza below alef"],
  ["آمال", "madda"],
  ["ٱلله", "wasla, from an Uthmani paste"],
  ["فاطمة", "ta marbuta"],
  ["مصطفى", "alef maqsura"],
  ["رؤوف", "hamza on waw"],
  ["مسئول", "hamza on yeh"],
  ["هناء", "bare hamza, which is dropped"],
  ["کریم", "Persian kaf and yeh"],
  ["ھنا", "Urdu heh"],
  ["مُحَمَّد", "tashkeel"],
  ["مـحـمـد", "tatweel"],
  ["٠١١١١٣٦٧١٥٠", "Arabic-Indic digits"],
  ["۰۱۲۳", "Eastern Arabic-Indic digits"],
  ["RCP-NILE-2026-00004", "punctuation becomes a word boundary"],
  ["  a   b  ", "whitespace collapses and trims"],
  ["café", "Latin diacritics"],
  ["MŞÇ ABC", "case folding beyond ASCII"],
  ["ﻻ", "Arabic presentation forms, via NFKC"],
  ["ＡＢＣ１２３", "full-width Latin, via NFKC"],
  ["​محمد‪", "zero-width and bidi controls"],
];

/** Fuzz alphabet — deliberately far wider than anything the product holds. */
const POOL = [
  ..."abcxyzABCXYZ0123456789",
  ..."أإآٱةىؤئءکیھ",
  ..."محمد علي فاطمة",
  ..."٠١٢٣٤٥٦٧٨٩۰۱۲۳",
  ..."ًٌٍَُِّْـٰ",
  ..."éàçÑÜßœÆ",
  ..."ПриветЖЩ",
  ..."日本語漢字",
  ..."ㄱ한글",
  ..."🙂👍",
  ..."-_/:.,'\"()[]{}@#%&*+=|\\~`^$",
  ..."​‏‪﻿ـ  ",
  ..."  \t\n",
  ..."ﻻﺍﷲ",
  ..."ＡＢＣ１２３",
  ..."ǆǅǄŉ",
];

/** Every free-text column a human searches, across both apps. */
const CORPUS: [string, string][] = [
  ["users", "name"],
  ["users", "email"],
  ["centers", "name"],
  ["centers", "area"],
  ["courses", "title"],
  ["student_profiles", "full_name"],
  ["rooms", "name"],
  ["payments", "receipt_number"],
];

const EXPECTED_INDEXES = [
  "users_search_text_trgm",
  "centers_search_text_trgm",
  "courses_search_text_trgm",
  "contact_submissions_search_text_trgm",
  "student_profiles_search_text_trgm",
  "rooms_search_text_trgm",
];

/** The tables carrying `search_text`, and the fields each one's column joins. */
const GENERATED: { table: string; fields: string[] }[] = [
  { table: "users", fields: ["name", "email", "phone"] },
  {
    table: "centers",
    fields: ["name", "short_id", "area", "governorate", "description"],
  },
  { table: "courses", fields: ["title", "subject", "description"] },
  {
    table: "contact_submissions",
    fields: ["name", "email", "phone", "subject", "message"],
  },
  // `student_code` and the guardian columns are DELIBERATELY absent — see the
  // header of migration 20260820180000. Both would widen reach: the code is
  // matched through `readStudentScan`, whose check character means a mistype
  // resolves to nobody, and a guardian's contact details would make a CHILD
  // findable by their parent's email. If either is ever added to the column,
  // this list disagrees with the database and the desync check below goes red —
  // which is the point.
  { table: "student_profiles", fields: ["full_name", "phone"] },
  { table: "rooms", fields: ["name", "description"] },
];

/** Queries chosen so each one exercises a different fold. */
const PARITY_QUERIES = [
  "احمد",
  "فاطمه",
  "ندي",
  "عبدالرحمن",
  "مصطفي كامل",
  "0111",
  "zzzz-no-such-thing",
];

async function main() {
  try {
    /* ── 0) the function is there, and is what an index needs ───────────── */
    section("0. The function exists, and has the properties an index requires");
    const meta = await admin.query(
      `SELECT provolatile, proisstrict, proparallel
         FROM pg_proc WHERE proname = 'edura_search_normalize'`,
    );
    // A missing function means the migration has not been applied to THIS
    // database. Every assertion below would then fail with a confusing error,
    // so say the true thing once and stop.
    if (meta.rowCount === 0) {
      console.error(
        "  ✗ edura_search_normalize is ABSENT — migration " +
          "20260820120000_search_normalize has not been applied here",
      );
      console.log("\n0 passed, 1 failed");
      process.exit(1);
    }
    assert(
      meta.rows[0].provolatile === "i",
      "IMMUTABLE — anything less and the expression indexes cannot exist",
    );
    assert(
      meta.rows[0].proisstrict === true,
      "STRICT — NULL in, NULL out, so `WHERE f(col) LIKE …` stays false on a NULL column",
    );
    assert(meta.rows[0].proparallel === "s", "PARALLEL SAFE — it touches nothing outside itself");

    /* ── 1) one case per rule ───────────────────────────────────────────── */
    section("1. Every fold, one case each");
    for (const [input, rule] of RULES) {
      const { rows } = await admin.query(`SELECT edura_search_normalize($1) AS r`, [input]);
      const js = normalizeSearchText(input);
      assert(
        rows[0].r === js,
        `${rule}: «${input}» → «${js}»` +
          (rows[0].r === js ? "" : `  (SQL said «${rows[0].r}»)`),
      );
    }

    /* ── 2) the real corpus ─────────────────────────────────────────────── */
    section("2. Every distinct value in every searchable column");
    let checked = 0;
    const mismatches: string[] = [];
    for (const [table, column] of CORPUS) {
      const { rows } = await admin.query(
        `SELECT DISTINCT ${column} AS v, edura_search_normalize(${column}) AS r
           FROM ${table} WHERE ${column} IS NOT NULL`,
      );
      for (const row of rows) {
        checked++;
        if (row.r !== normalizeSearchText(row.v)) {
          mismatches.push(`${table}.${column}=${JSON.stringify(row.v)}`);
        }
      }
    }
    if (mismatches.length) console.error("    first mismatches:", mismatches.slice(0, 5));
    assert(
      mismatches.length === 0,
      `SQL and JS agree on all ${checked} distinct values across ${CORPUS.length} columns`,
    );

    /* ── 3) fuzz, well past what the product holds ──────────────────────── */
    section("3. Fuzz — scripts this product does not hold yet");
    const ROUNDS = 1500;
    let fuzzBad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const n = 1 + Math.floor(Math.random() * 12);
      let s = "";
      for (let k = 0; k < n; k++) s += POOL[Math.floor(Math.random() * POOL.length)];
      const { rows } = await admin.query(`SELECT edura_search_normalize($1) AS r`, [s]);
      if (rows[0].r !== normalizeSearchText(s)) fuzzBad.push(JSON.stringify(s));
    }
    if (fuzzBad.length) console.error("    first mismatches:", fuzzBad.slice(0, 5));
    assert(fuzzBad.length === 0, `SQL and JS agree on all ${ROUNDS} fuzzed strings`);

    /* ── 4) the indexes ─────────────────────────────────────────────────── */
    section("4. The indexes the paginated lists depend on");
    const idx = await admin.query(
      `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])`,
      [EXPECTED_INDEXES],
    );
    const found = new Set(idx.rows.map((r) => r.indexname));
    for (const name of EXPECTED_INDEXES) {
      assert(found.has(name), `${name} exists`);
    }
    const ext = await admin.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
    assert(
      (ext.rowCount ?? 0) > 0,
      "pg_trgm is installed — a GIN trigram index is the only kind that serves LIKE '%…%'",
    );

    /* ── 5) the generated columns ───────────────────────────────────────── */
    section("5. search_text — generated, and equal to the JS matcher");
    for (const { table } of GENERATED) {
      const meta = await admin.query(
        `SELECT is_generated FROM information_schema.columns
          WHERE table_name = $1 AND column_name = 'search_text'`,
        [table],
      );
      assert(
        meta.rows[0]?.is_generated === "ALWAYS",
        `${table}.search_text is GENERATED ALWAYS — not an ordinary column ` +
          `a write could desynchronize`,
      );
    }

    // THE DESYNC CHECK, and it is the one that earns its place. A STORED
    // generated column is computed on WRITE. `CREATE OR REPLACE FUNCTION` on
    // `edura_search_normalize` with a different body would NOT recompute the
    // rows already stored, and the database would then hold two definitions of
    // the same word with nothing to say so. Comparing every stored value
    // against a live call turns that silent divergence into a red line here.
    for (const { table, fields } of GENERATED) {
      const expr = fields.map((f) => `coalesce(${f}, '')`).join(` || ' ' || `);
      const stale = await admin.query(
        `SELECT count(*)::int AS n FROM ${table}
          WHERE search_text IS DISTINCT FROM edura_search_haystack(${expr})`,
      );
      assert(
        stale.rows[0].n === 0,
        `${table}.search_text: every stored value equals a live call — ` +
          `the normalizer has not been edited without a rebuild`,
      );
    }

    // PARITY. `search_text LIKE '%term%'` for every term, ANDed, must return
    // exactly what `matchesSearchTerms` returns over the same fields. This is
    // the property the paginated list screens now depend on: it is what lets
    // them be exact AND counted, which a JS filter after the page is cut cannot
    // be.
    {
      const rows = await admin.query(
        `SELECT name, email, phone, search_text FROM users LIMIT 500`,
      );
      let compared = 0;
      const disagreements: string[] = [];
      for (const row of rows.rows) {
        for (const query of PARITY_QUERIES) {
          const bySql = searchTerms(query).every((t) =>
            String(row.search_text).includes(t),
          );
          const byJs = matchesSearchQuery([row.name, row.email, row.phone], query);
          compared++;
          if (bySql !== byJs) {
            disagreements.push(
              `q=${JSON.stringify(query)} name=${JSON.stringify(row.name)} sql=${bySql} js=${byJs}`,
            );
          }
        }
      }
      if (disagreements.length) console.error("    first:", disagreements.slice(0, 5));
      assert(
        disagreements.length === 0,
        `search_text agrees with matchesSearchTerms on all ${compared} ` +
          `comparisons (${rows.rowCount} rows x ${PARITY_QUERIES.length} queries)`,
      );
    }

    /* ── 6) THE INVARIANT: every searched table has the column ──────────── */
    section("6. No free-text search without a search_text column");
    // The rule this whole line of work converges on is one sentence: EVERY TABLE
    // A FREE-TEXT SEARCH REACHES CARRIES `search_text`. Measured 2026-08-20, the
    // database has 79 tables and 58 carry a candidate free-text column, but only
    // these SIX are reached by a search — the other 52 have no code searching
    // them, and a generated column there would be write cost on every row with
    // no reader.
    //
    // This assertion is what stops that drifting. A future search written
    // against a seventh table will not fail here — nothing can detect that from
    // SQL alone — but the day somebody ADDS a `search_text` column without
    // adding it to `GENERATED` above, or removes one this list expects, they
    // find out here instead of in production.
    {
      const present = await admin.query(
        `SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'search_text'
          ORDER BY table_name`,
      );
      const actual = present.rows.map((r) => r.table_name).sort();
      const expected = GENERATED.map((g) => g.table).sort();
      assert(
        JSON.stringify(actual) === JSON.stringify(expected),
        `exactly ${expected.length} tables carry search_text, and they are the ` +
          `ones this suite knows how to check` +
          (JSON.stringify(actual) === JSON.stringify(expected)
            ? ""
            : `  (found: ${actual.join(", ")})`),
      );
    }

    /* ── 7) it actually finds the row ILIKE could not ───────────────────── */
    section("7. The point of the whole thing");
    const probe = await admin.query(
      `SELECT
         (SELECT count(*)::int FROM (VALUES ('أحمد على')) AS t(n)
            WHERE n ILIKE '%' || 'احمد علي' || '%')                       AS by_ilike,
         (SELECT count(*)::int FROM (VALUES ('أحمد على')) AS t(n)
            WHERE edura_search_normalize(n)
                  LIKE '%' || edura_search_normalize('احمد علي') || '%')  AS by_normalize`,
    );
    assert(probe.rows[0].by_ilike === 0, "ILIKE still cannot match «احمد علي» against «أحمد على»");
    assert(probe.rows[0].by_normalize === 1, "…and the normalized comparison does");
  } finally {
    await admin.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// Read-only throughout, but the guard runs anyway: it is what stops this file
// being pointed at production by an env edit nobody reviewed.
assertDbEnv(["test"], { intent: "suite search-normalize.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
