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
  { table: "student_profiles", fields: ["full_name", "phone"] },
  { table: "rooms", fields: ["name", "description"] },
];

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
    section("0. The function exists, and has the properties an index requires");
    const meta = await admin.query(
      `SELECT provolatile, proisstrict, proparallel
         FROM pg_proc WHERE proname = 'edura_search_normalize'`,
    );
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

    section("3. Fuzz — scripts this product does not hold yet");
    const ROUNDS = 1500;
    const fuzzBad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const n = 1 + Math.floor(Math.random() * 12);
      let s = "";
      for (let k = 0; k < n; k++) s += POOL[Math.floor(Math.random() * POOL.length)];
      const { rows } = await admin.query(`SELECT edura_search_normalize($1) AS r`, [s]);
      if (rows[0].r !== normalizeSearchText(s)) fuzzBad.push(JSON.stringify(s));
    }
    if (fuzzBad.length) console.error("    first mismatches:", fuzzBad.slice(0, 5));
    assert(fuzzBad.length === 0, `SQL and JS agree on all ${ROUNDS} fuzzed strings`);

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

    section("6. No free-text search without a search_text column");
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

assertDbEnv(["test"], { intent: "suite search-normalize.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
