/**
 * ============================================================================
 * SEED LEDGER SCAN — proves demo seeds never hand-write the money ledger
 * ============================================================================
 * The room suites used to prove "the demo seed wrote NO ledger" by counting
 * `transactions` rows across every is_demo center and asserting zero. That
 * census was sound only while no demo money existed anywhere. Since
 * 2026-08-16 the showcase seeds deliberately settle lessons and record
 * counter payments THROUGH THE REAL ENGINE (`POST /center/subscriptions` →
 * `createWalkInSubscription`, `completeSession` → `distributeSessionRevenue`),
 * so a shared dev database legitimately holds engine-written demo ledger rows
 * — measured 2026-08-26: 434 rows, every one `data_source='system'` and the
 * settlement ones lesson-linked, zero raw inserts. A zero-count over entities
 * a suite never wrote can therefore fail (and pass) on data that has nothing
 * to do with the seed under test.
 *
 * The invariant those proofs actually protect — a demo seed must never write
 * `transactions` or `session_settlements` with its own hands — is a property
 * of the SEED SOURCE, not of shared DB state, so it is asserted here at the
 * source. NO SECOND MONEY ENGINE cuts both ways: a seed that wants demo money
 * must route it through the real engine (as settled-lessons-demo-seed and
 * showcase-payments-demo-seed do, over HTTP), and a seed that reaches for
 * `tx.transaction.create` / raw `INSERT INTO transactions` turns this scan
 * red no matter what the database happens to contain.
 *
 * Deliberately NOT scanned: `payment` (cleanup seeds re-run via
 * `payment.deleteMany` on their own fixtures), wallet models (the student /
 * parent wallet demos are approved money features that seed opening balances
 * directly). The two models here are exactly the two the old censuses
 * counted.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRISMA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prisma");

/** A prisma write call on the two append-only settlement models. */
const WRITE_CALL =
  /\.(transaction|sessionSettlement)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
/** The same reach expressed as raw SQL. */
const RAW_SQL = /insert\s+into\s+(transactions|session_settlements)\b/gi;

export type SeedLedgerWrite = { file: string; line: number; match: string };

export function scanSeedsForDirectLedgerWrites(): SeedLedgerWrite[] {
  const files = readdirSync(PRISMA_DIR).filter((f) => f.endsWith(".ts") && f.includes("seed"));
  const hits: SeedLedgerWrite[] = [];
  for (const file of files) {
    const src = readFileSync(path.join(PRISMA_DIR, file), "utf8");
    const lines = src.split("\n");
    for (const re of [WRITE_CALL, RAW_SQL]) {
      re.lastIndex = 0;
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split("\n").length;
        // The seeds' header comments narrate the very reach this scan hunts
        // ("no INSERT into transactions…"), so a match on a comment line is
        // prose, not code.
        const text = (lines[line - 1] ?? "").trimStart();
        if (text.startsWith("//") || text.startsWith("*") || text.startsWith("/*")) continue;
        hits.push({ file, line, match: m[0].trim() });
      }
    }
  }
  return hits;
}

/**
 * The centers the ROOM demo seeds own, pinned by short id — the positive half
 * of the room suites' seed checks ("demo rooms have photos / a price / offer
 * the per-student method") must look at THESE centers, not at every is_demo
 * center, or an unrelated demo center's rooms can satisfy the assertion while
 * the seed under test was never even run (which is exactly what happened:
 * RATEDEMO01/02 have been absent from dev since the 2026-07-31 wipe and
 * nobody noticed, because the showcase rooms kept the census green).
 *  - RATEDEMO01/02 — room-rate-demo-seed.ts
 *  - NILE/ANDL/FUTR/BRGT — preview-seed.ts (M2 halls: NILE both methods,
 *    ANDL forced per-student; the frozen-snapshot M2 course lives on ANDL)
 */
export const ROOM_SEED_CENTER_SHORT_IDS = [
  "RATEDEMO01",
  "RATEDEMO02",
  "NILE",
  "ANDL",
  "FUTR",
  "BRGT",
] as const;
