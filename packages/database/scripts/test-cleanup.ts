/* eslint-disable no-console */
/**
 * ============================================================================
 * TAG-SCOPED TEST CLEANUP — one sweeper, every suite
 * ============================================================================
 * The problem this exists for: on 2026-07-26 an audit found 472 of 535 users in
 * the DEV database were `@x.io` test fixtures, attributable by email tag to
 * specific suites that create fixtures and never remove them:
 *
 *     m2-*   156 users (13 super_admin)   room-pricing-methods.test.ts
 *     split-* 65 users (11 super_admin)   room-revenue-split.test.ts
 *     wallet-*63 users                    wallet.test.ts
 *     wref-*  30 users ( 6 super_admin)   wallet-refund.test.ts
 *     shadm-* 12 users ( 4 super_admin)   center-share-admin.test.ts
 *     nocap-* 12 users                    wallet-no-cap.test.ts
 *     share-* 10 users                    center-share-governance.test.ts
 *     roomown-*8 users                    room-ownership.test.ts
 *     msgtest-*105 users                  messaging-scope.test.ts (HAS cleanup —
 *                                         it is simply incomplete)
 *
 * Nine bespoke `finally` blocks would be nine chances to miss a table. Instead
 * this walks the RELATION GRAPH at runtime: seed from the rows carrying the
 * suite's tag, expand transitively to everything that references them, then
 * delete children-before-parents. A new table is swept the day it is added —
 * nobody has to remember to update a delete list.
 *
 * "Relation graph", not "FK graph": this schema declares only 40 FK constraints
 * and 44 of its 68 tables have none (see CONVENTION_EDGES below). The edge set
 * is therefore declared FKs UNION column-name convention. The first version of
 * this file walked FKs alone and would have deleted 470 tagged users while
 * leaving their 427 transactions and 558 audit rows orphaned — see FINDING 0b.
 *
 * Every suite already names its fixtures `const tag = "<prefix>-" + rid()`, so
 * the tag is the only input needed.
 *
 * SAFETY
 *   - FAILS CLOSED on the database label: dev/test only, never production.
 *     Reuses db-guard, so a copied or hand-edited connection string cannot
 *     defeat it — the label is read out of the database itself.
 *   - Refuses a tag short or generic enough to match real rows.
 *   - PROTECTED_TABLES (the permanent Egyptian education catalog and the global
 *     reference rows) are never touched, at any depth.
 *   - Connects on ADMIN_URL: the money ledgers have UPDATE/DELETE REVOKEd from
 *     `edura_app`, so app-role cleanup of `transactions` / `points_ledger` /
 *     `session_settlements` / `audit_logs` is impossible by design.
 *
 * USAGE (in a suite, always in a `finally` so a thrown assertion still cleans):
 *
 *     import { sweepTag } from "../../../../packages/database/scripts/test-cleanup";
 *     const tag = "wallet-" + rid();
 *     try { ...proofs... } finally { await sweepTag(tag); }
 *
 * Or from the CLI, to clear historical residue one tag at a time:
 *
 *     tsx --env-file=.env.test scripts/test-cleanup.ts wallet-a1b2c
 *     tsx --env-file=.env.test scripts/test-cleanup.ts --dry-run m2-
 * ============================================================================
 */
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";
import { assertDbEnv } from "./db-guard";

/**
 * Never swept, at any depth. The Egyptian education catalog is permanent
 * reference data (CLAUDE.md Conventions) and `points_rules` is global config;
 * a test that seeds them is misusing them. `_prisma_migrations` is obvious.
 *
 * NOTE: `commission_settings` and `wallet_settings` are deliberately NOT here.
 * Their GLOBAL rows carry a NULL center/teacher id, so the FK walk never
 * reaches them, while a per-center row created by a test IS reachable and
 * should go. Protecting the table wholesale would leave that residue behind.
 */
const PROTECTED_TABLES = new Set([
  "_prisma_migrations",
  "education_systems",
  "stages",
  "grade_levels",
  "tracks",
  "grade_level_tracks",
  "subjects",
  "subject_offerings",
  "points_rules",
]);

/**
 * Where a tag is written by the suites. Each entry is a table plus the text
 * columns that carry the tag. These are the roots of the FK walk.
 */
const SEEDS: { table: string; columns: string[] }[] = [
  { table: "users", columns: ["email", "name"] },
  { table: "centers", columns: ["name", "short_id"] },
  { table: "courses", columns: ["title"] },
  { table: "rooms", columns: ["name"] },
];

/**
 * ---------------------------------------------------------------------------
 * CONVENTION EDGES — why the FK graph alone is not enough
 * ---------------------------------------------------------------------------
 * Measured 2026-07-26: this schema declares only 40 FOREIGN KEY constraints
 * across 23 of its 68 tables. **44 tables have none**, including every money
 * table (`transactions`, `payments`, `wallet_ledger`, `session_settlements`,
 * `payment_intents`, `subscriptions`, `invoices`, `payouts`) and `audit_logs`.
 * Referential integrity there is application-level only.
 *
 * A pure FK walk therefore found 1,492 of 3,427 tagged rows — it missed 1,935,
 * including all 692 money-ledger rows and 558 audit rows. Worse than
 * incomplete: deleting the 470 tagged USERS (which the FK walk does reach)
 * while leaving their 427 transactions and 558 audit rows behind would have
 * manufactured ~1,750 new orphans in tables that are REVOKEd UPDATE/DELETE and
 * so can never be repaired. Dev already carries 958 such orphans from exactly
 * this pattern.
 *
 * So the edge set is FK constraints UNION column-name convention. The schema
 * names relational columns `<entity>_id` consistently, which makes the name a
 * reliable edge where the constraint is absent. Any column below is treated as
 * pointing at the named parent when it exists on a table AND is of type uuid.
 */
const CONVENTION_EDGES: Record<string, readonly string[]> = {
  users: [
    "user_id", "student_id", "teacher_id", "parent_id", "actor_id", "target_id",
    "staff_user_id", "assistant_id", "owner_id", "owner_user_id", "beneficiary_id",
    "issued_to_id", "imposed_by_id", "requested_by_id", "reporter_id",
    "reported_user_id", "blocker_id", "blocked_id", "user_a_id", "user_b_id",
    "last_message_sender_id", "from_entity_id", "to_entity_id",
    "counter_by", "door_by", "marked_by", "created_by", "edited_by", "adjusted_by",
  ],
  centers: ["center_id"],
  courses: ["course_id"],
  // transactions.lesson_id is a session reference — the schema even says so
  // ("loose ref (no FK), like transactions.lesson_id").
  sessions: ["session_id", "lesson_id"],
  rooms: ["room_id", "default_room_id"],
} as const;

/**
 * A tag must be specific enough that it cannot match a real row. Suites build
 * `"<prefix>-" + rid()`; a bare prefix is allowed for CLI cleanup of history,
 * but nothing shorter than 3 characters and never a lone separator.
 */
function assertTagIsSafe(tag: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(tag)) {
    throw new Error(
      `test-cleanup: refusing tag ${JSON.stringify(tag)} — must be 3-64 chars ` +
        `of [A-Za-z0-9_-] starting alphanumeric. A loose tag could match real rows.`,
    );
  }
}

function adminUrl(): string {
  // OWNER ONLY, no fallback — the money ledgers and audit_logs have
  // UPDATE/DELETE REVOKEd from edura_app, so teardown cannot use the app role.
  const url = process.env.ADMIN_URL;
  if (!url) {
    throw new Error(
      "test-cleanup: ADMIN_URL is required (the database OWNER connection string).\nThe DIRECT_URL fallback was removed on 2026-07-26: it let an app-role URL be\nsilently accepted here, and it created pressure to put an owner string into\nDIRECT_URL — which is how an owner credential reaches a serving environment.\nSee docs/reports/feature-completeness.md \"FINDING 0\".",
    );
  }
  return url;
}

type FkEdge = { child: string; childCol: string; parent: string; parentCol: string };

async function introspect(c: pg.PoolClient): Promise<{
  tables: string[];
  pk: Map<string, string>;
  edges: FkEdge[];
  /** How many edges came from the naming convention rather than a constraint. */
  conventionEdges: number;
  uuidCols: Map<string, Set<string>>;
}> {
  const tables = (
    await c.query<{ t: string }>(
      `SELECT table_name AS t FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'`,
    )
  ).rows.map((r) => r.t);

  const pkRows = (
    await c.query<{ t: string; col: string }>(
      `SELECT tc.table_name AS t, kcu.column_name AS col
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema    = tc.table_schema
        WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'`,
    )
  ).rows;
  // Composite PKs (join tables) are not usable as a doomed-id key; those tables
  // are still swept, just by their FK columns rather than by their own id.
  const pkCount = new Map<string, number>();
  for (const r of pkRows) pkCount.set(r.t, (pkCount.get(r.t) ?? 0) + 1);
  const pk = new Map<string, string>();
  for (const r of pkRows) if (pkCount.get(r.t) === 1) pk.set(r.t, r.col);

  const edges = (
    await c.query<FkEdge>(
      `SELECT tc.table_name        AS child,
              kcu.column_name      AS "childCol",
              ccu.table_name       AS parent,
              ccu.column_name      AS "parentCol"
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`,
    )
  ).rows.filter((e) => e.child !== e.parent);

  // ---- convention edges, for the 44 tables with no FK constraint -----------
  // Only uuid columns qualify: a same-named text column (e.g. a Cloudinary
  // public_id) must never be mistaken for a relation.
  const uuidCols = new Map<string, Set<string>>();
  for (const r of (
    await c.query<{ t: string; col: string }>(
      `SELECT table_name AS t, column_name AS col
         FROM information_schema.columns
        WHERE table_schema='public' AND data_type='uuid'`,
    )
  ).rows) {
    if (!uuidCols.has(r.t)) uuidCols.set(r.t, new Set());
    uuidCols.get(r.t)!.add(r.col);
  }

  const declared = new Set(edges.map((e) => `${e.child}.${e.childCol}`));
  let added = 0;
  for (const [parent, cols] of Object.entries(CONVENTION_EDGES)) {
    if (!tables.includes(parent)) continue;
    for (const t of tables) {
      if (t === parent || PROTECTED_TABLES.has(t)) continue;
      for (const col of cols) {
        if (!uuidCols.get(t)?.has(col)) continue;
        if (declared.has(`${t}.${col}`)) continue; // a real FK already covers it
        edges.push({ child: t, childCol: col, parent, parentCol: "id" });
        declared.add(`${t}.${col}`);
        added++;
      }
    }
  }

  return { tables, pk, edges, conventionEdges: added, uuidCols };
}

/** Children strictly before parents, so a DELETE never trips an FK. */
function deletionOrder(tables: string[], edges: FkEdge[]): string[] {
  const referencedBy = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const e of edges) referencedBy.get(e.parent)?.add(e.child);

  const order: string[] = [];
  const done = new Set<string>();
  for (let pass = 0; pass < tables.length + 2 && order.length < tables.length; pass++) {
    for (const t of tables) {
      if (done.has(t)) continue;
      const kids = referencedBy.get(t) ?? new Set();
      if ([...kids].every((k) => done.has(k))) {
        order.push(t);
        done.add(t);
      }
    }
  }
  // Any table left is in an FK cycle; append it — the per-table DELETEs below
  // are id-scoped, so a cycle at worst needs the retry loop in sweep().
  for (const t of tables) if (!done.has(t)) order.push(t);
  return order;
}

export type SweepResult = {
  tag: string;
  dbEnv: string;
  /** Rows deleted per table, only tables with a non-zero count. */
  deleted: Record<string, number>;
  total: number;
  dryRun: boolean;
};

/**
 * Delete every row belonging to `tag`, children first. Idempotent: a second
 * call finds nothing and reports zero. Never throws for "nothing matched".
 */
export async function sweepTag(
  tag: string,
  opts: { dryRun?: boolean; quiet?: boolean } = {},
): Promise<SweepResult> {
  assertTagIsSafe(tag);
  const dbEnv = await assertDbEnv(["dev", "test"], { intent: `test-cleanup ${tag}` });

  const pool = new pg.Pool({ connectionString: pinSslMode(adminUrl()), max: 1 });
  const c = await pool.connect();
  const deleted: Record<string, number> = {};
  try {
    const { tables, pk, edges, conventionEdges } = await introspect(c);
    const fkEdges = edges.length - conventionEdges;
    const sweepable = tables.filter((t) => !PROTECTED_TABLES.has(t));
    const like = `%${tag}%`;

    // --- 1. seed: rows that literally carry the tag ---------------------------
    const doomed = new Map<string, Set<string>>();
    const add = (t: string, ids: string[]) => {
      if (!ids.length) return;
      const set = doomed.get(t) ?? new Set<string>();
      for (const id of ids) set.add(id);
      doomed.set(t, set);
    };

    for (const seed of SEEDS) {
      if (!sweepable.includes(seed.table)) continue;
      const idCol = pk.get(seed.table);
      if (!idCol) continue;
      const where = seed.columns.map((col, i) => `${col} ILIKE $${i + 1}`).join(" OR ");
      const rows = (
        await c.query<{ id: string }>(
          `SELECT ${idCol} AS id FROM ${seed.table} WHERE ${where}`,
          seed.columns.map(() => like),
        )
      ).rows;
      add(seed.table, rows.map((r) => r.id));
    }

    // --- 2. expand: anything referencing a doomed row is itself doomed --------
    // Fixed point over the FK graph, so grandchildren (attendance -> sessions ->
    // courses) are reached without naming the path.
    for (let pass = 0; pass < 32; pass++) {
      let grew = false;
      for (const e of edges) {
        if (PROTECTED_TABLES.has(e.child)) continue;
        const parentIds = doomed.get(e.parent);
        if (!parentIds?.size) continue;
        const childIdCol = pk.get(e.child);
        if (!childIdCol) continue; // composite-PK join table: handled in step 3
        const before = doomed.get(e.child)?.size ?? 0;
        const rows = (
          await c.query<{ id: string }>(
            `SELECT ${childIdCol} AS id FROM ${e.child} WHERE ${e.childCol} = ANY($1::uuid[])`,
            [[...parentIds]],
          )
        ).rows;
        add(e.child, rows.map((r) => r.id));
        if ((doomed.get(e.child)?.size ?? 0) > before) grew = true;
      }
      if (!grew) break;
    }

    if (opts.dryRun) {
      for (const [t, ids] of doomed) if (ids.size) deleted[t] = ids.size;
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      if (!opts.quiet) {
        console.log(
          `test-cleanup [dry-run] ${tag} on '${dbEnv}': ${total} rows would go ` +
            `(edges: ${fkEdges} declared FK + ${conventionEdges} by naming convention)`,
        );
        for (const [t, n] of Object.entries(deleted).sort((a, b) => b[1] - a[1])) {
          console.log(`   ${String(n).padStart(6)}  ${t}`);
        }
      }
      return { tag, dbEnv, deleted, total, dryRun: true };
    }

    // --- 3. delete, children before parents ---------------------------------
    const order = deletionOrder(sweepable, edges);
    await c.query("BEGIN");
    try {
      // Composite-PK tables first, keyed by their FK columns.
      for (const t of order) {
        if (pk.has(t)) continue;
        for (const e of edges.filter((x) => x.child === t)) {
          const parentIds = doomed.get(e.parent);
          if (!parentIds?.size) continue;
          const res = await c.query(
            `DELETE FROM ${t} WHERE ${e.childCol} = ANY($1::uuid[])`,
            [[...parentIds]],
          );
          if (res.rowCount) deleted[t] = (deleted[t] ?? 0) + res.rowCount;
        }
      }
      for (const t of order) {
        const ids = doomed.get(t);
        const idCol = pk.get(t);
        if (!ids?.size || !idCol) continue;
        const res = await c.query(
          `DELETE FROM ${t} WHERE ${idCol} = ANY($1::uuid[])`,
          [[...ids]],
        );
        if (res.rowCount) deleted[t] = (deleted[t] ?? 0) + res.rowCount;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }

    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    if (!opts.quiet && total > 0) {
      console.log(`  ↳ test-cleanup ${tag}: removed ${total} rows`);
    }
    return { tag, dbEnv, deleted, total, dryRun: false };
  } finally {
    c.release();
    await pool.end();
  }
}

/**
 * `finally`-safe wrapper: never lets a cleanup failure mask the assertion
 * failure that actually matters. Logs loudly instead, so residue is visible.
 */
export async function sweepTagQuietly(tag: string): Promise<void> {
  try {
    await sweepTag(tag);
  } catch (e) {
    console.error(
      `  ↳ test-cleanup ${tag} FAILED (rows left behind): ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// --- CLI ---------------------------------------------------------------------
const isCli =
  process.argv[1] !== undefined && /test-cleanup\.(ts|mts|js|mjs)$/.test(process.argv[1]);

if (isCli) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const tags = args.filter((a) => !a.startsWith("--"));
  if (!tags.length) {
    console.error(
      "test-cleanup: usage: test-cleanup.ts [--dry-run] <tag> [tag ...]\n" +
        "  e.g. tsx --env-file=.env.test scripts/test-cleanup.ts --dry-run m2- split- wallet-",
    );
    process.exit(2);
  }
  (async () => {
    let total = 0;
    for (const tag of tags) {
      const r = await sweepTag(tag, { dryRun });
      total += r.total;
    }
    console.log(`\ntest-cleanup: ${total} rows ${dryRun ? "would be " : ""}removed.`);
    process.exit(0);
  })().catch((e: unknown) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
