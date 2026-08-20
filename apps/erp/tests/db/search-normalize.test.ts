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
import { normalizeSearchText } from "@repo/database/search-text";

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
  "users_name_search_trgm",
  "centers_name_search_trgm",
  "courses_title_search_trgm",
  "contact_submissions_name_search_trgm",
  "contact_submissions_subject_search_trgm",
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

    /* ── 5) it actually finds the row ILIKE could not ───────────────────── */
    section("5. The point of the whole thing");
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
