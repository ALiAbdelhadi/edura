/* eslint-disable no-console */
/**
 * ============================================================================
 * DATABASE ENVIRONMENT GUARD — structural, not conventional
 * ============================================================================
 * The problem this exists for: on 2026-07-23 dev, tests, and (as documented)
 * production all resolved to ONE Neon database, because every context read the
 * same `.env.local`. 330 `@x.io` users and 83 unflagged centers were written
 * into what was meant to be the launch database by test runs alone.
 *
 * A convention ("remember to point tests at the test branch") cannot prevent
 * that, because the failure mode IS a forgotten/copied connection string. So
 * the environment is recorded INSIDE each database, as a comment on the
 * database object:
 *
 *     COMMENT ON DATABASE neondb IS 'edura-env:production';
 *
 * A connection string that has been copied, stale, or edited by hand still
 * reports the truth of whatever database it actually reached. Nothing on the
 * caller's side can assert an environment it isn't connected to.
 *
 * FAIL CLOSED: an unlabelled database is a hard error, never "probably fine".
 * A new branch inherits its parent's label, so a forgotten relabel surfaces as
 * a loud failure ("expected test, found dev") rather than silent contamination.
 *
 * Usage as a CLI pre-step (see the `test:db*` scripts):
 *     tsx --env-file=.env.test scripts/db-guard.ts test
 *
 * Usage in-process (see the demo seeds):
 *     await assertDbEnv(["dev", "test"], { intent: "preview-seed" });
 */
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";

export type DbEnv = "dev" | "test" | "production";

const VALID: readonly DbEnv[] = ["dev", "test", "production"];
const MARKER_PREFIX = "edura-env:";

/** The connection string the guard checks — the most privileged one in scope. */
function guardUrl(): string {
  const url =
    process.env.ADMIN_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "db-guard: no ADMIN_URL / DIRECT_URL / DATABASE_URL in the environment. " +
        "Did you forget --env-file?",
    );
  }
  return url;
}

/** Host shown in errors so a failure names the database it actually reached. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

/** Reads the `edura-env:` marker from the database the URL actually reaches. */
export async function readDbEnv(url = guardUrl()): Promise<DbEnv | null> {
  const pool = new pg.Pool({ connectionString: pinSslMode(url), max: 1 });
  try {
    const { rows } = await pool.query<{ comment: string | null }>(
      `SELECT shobj_description(d.oid, 'pg_database') AS comment
         FROM pg_database d
        WHERE d.datname = current_database()`,
    );
    const comment = rows[0]?.comment ?? null;
    if (!comment || !comment.startsWith(MARKER_PREFIX)) return null;
    const value = comment.slice(MARKER_PREFIX.length).trim();
    return (VALID as readonly string[]).includes(value)
      ? (value as DbEnv)
      : null;
  } finally {
    await pool.end();
  }
}

/**
 * OPT-IN WIDENING — `EDURA_ALLOW_DB_ENVS=dev`.
 *
 * The 52 DB suites, the runner and `pretest:db` all name `["test"]` explicitly,
 * which is right: the default must be the narrow one, and it stays narrow for
 * everyone who does not opt in. But running the suites against the DEV database
 * is a legitimate local choice (Ali, 2026-08-03), and the alternative was
 * editing 54 call sites — a permanent repo-wide loosening, in git, to express
 * one person's local setup.
 *
 * So the widening lives in ONE place, is opt-in, and is set where it belongs:
 * a `.env.test` file, which is not in git.
 *
 * PRODUCTION CAN NEVER BE ADDED THIS WAY. Naming it here is not a wider
 * permission, it is a mistake or an attack, and it fails loudly rather than
 * being quietly dropped — a silently ignored `production` would leave someone
 * believing they had a permission they do not have.
 */
function widenedAllowList(allowed: readonly DbEnv[]): readonly DbEnv[] {
  const raw = (process.env.EDURA_ALLOW_DB_ENVS ?? "").trim();
  if (!raw) return allowed;

  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.includes("production")) {
    throw new Error(
      "db-guard: EDURA_ALLOW_DB_ENVS names 'production'. The production database " +
        "is never widenable — this variable exists to let the suites run against " +
        "dev, not to unlock the live database. Remove it.",
    );
  }

  const unknown = requested.filter((r) => !(VALID as readonly string[]).includes(r));
  if (unknown.length) {
    throw new Error(
      `db-guard: EDURA_ALLOW_DB_ENVS contains unknown value(s): ${unknown.join(", ")}. ` +
        `Valid: ${VALID.filter((v) => v !== "production").join(", ")}.`,
    );
  }

  const extra = requested as readonly DbEnv[];
  return [...new Set([...allowed, ...extra])];
}

/**
 * Throws unless the reached database is labelled as one of `allowed`.
 * `intent` is echoed in the error so the message names what was about to run.
 */
export async function assertDbEnv(
  allowedInput: readonly DbEnv[],
  opts: { intent?: string } = {},
): Promise<DbEnv> {
  const allowed = widenedAllowList(allowedInput);
  const url = guardUrl();
  const where = describe(url);
  const intent = opts.intent ? ` [${opts.intent}]` : "";
  const actual = await readDbEnv(url);

  if (actual === null) {
    throw new Error(
      `db-guard${intent}: REFUSING TO RUN — the database at ${where} carries no ` +
        `'${MARKER_PREFIX}<env>' label.\n` +
        `An unlabelled database is treated as unsafe. Label it (as the DB owner):\n` +
        `  COMMENT ON DATABASE <database> IS '${MARKER_PREFIX}dev';\n` +
        `Valid labels: ${VALID.join(", ")}.`,
    );
  }

  if (!allowed.includes(actual)) {
    throw new Error(
      `db-guard${intent}: REFUSING TO RUN against a '${actual}' database.\n` +
        `  reached:  ${where}\n` +
        `  labelled: ${actual}\n` +
        `  allowed:  ${allowed.join(", ")}\n` +
        (actual === "production"
          ? "This is the PRODUCTION database. It must only ever receive real user data."
          : "Point the connection string at the right database and re-run."),
    );
  }

  return actual;
}

/** Convenience for the demo seeds: anything but production. */
export async function assertNotProduction(intent: string): Promise<DbEnv> {
  return assertDbEnv(["dev", "test"], { intent });
}

// --- CLI ---------------------------------------------------------------------
// `tsx scripts/db-guard.ts test [dev ...]` — exits non-zero unless the reached
// database is labelled as one of the arguments.
const isCli =
  process.argv[1] !== undefined &&
  /db-guard\.(ts|mts|js|mjs)$/.test(process.argv[1]);

if (isCli) {
  const args = process.argv.slice(2);
  const allowed = args.filter((a): a is DbEnv =>
    (VALID as readonly string[]).includes(a),
  );
  if (allowed.length !== args.length || allowed.length === 0) {
    console.error(
      `db-guard: usage: db-guard.ts <${VALID.join("|")}> [...]\n` +
        `got: ${args.join(" ") || "(nothing)"}`,
    );
    process.exit(2);
  }
  assertDbEnv(allowed, { intent: "cli" })
    .then((env) => {
      console.log(`db-guard: ok — target database is labelled '${env}'.`);
      process.exit(0);
    })
    .catch((e: unknown) => {
      console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
}
