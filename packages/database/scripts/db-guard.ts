/* eslint-disable no-console */
import "./load-env";
import pg from "pg";
import { pinSslMode } from "../src/pg-ssl";

export type DbEnv = "dev" | "test" | "production";

const VALID: readonly DbEnv[] = ["dev", "test", "production"];
const MARKER_PREFIX = "edura-env:";

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

function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

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

export async function assertNotProduction(intent: string): Promise<DbEnv> {
  return assertDbEnv(["dev", "test"], { intent });
}

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
