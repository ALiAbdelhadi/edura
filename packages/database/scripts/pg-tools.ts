import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Locate the PostgreSQL client/server binaries.
 *
 * MAJOR VERSION MATTERS, and getting it wrong fails in two different ways:
 *
 *   * `pg_dump` REFUSES to dump a server newer than itself — "aborting because
 *     of server version mismatch". Neon currently serves **18.4**, so a
 *     PostgreSQL 17 install (the Homebrew default at the time of writing)
 *     cannot back this database up at all. That is not a warning; it is a hard
 *     stop, and it is how this was discovered.
 *   * `pg_restore` is looser and will often appear to work across a major
 *     boundary, which is worse: the failure surfaces later, in the data.
 *
 * So the search is newest-first and the runbook says to keep the client major
 * at or above whatever Neon is running. Check with:
 *     SELECT version();
 */
const CANDIDATES = [
  process.env.PG_BIN,
  "/opt/homebrew/opt/postgresql@18/bin",
  "/usr/lib/postgresql/18/bin",
  "/usr/local/opt/postgresql@18/bin",
  "/opt/homebrew/opt/postgresql@17/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/local/opt/postgresql@17/bin",
  "", // fall back to PATH
].filter((p): p is string => p !== undefined);

let cached: string | null = null;

export function pgBinDir(): string {
  if (cached !== null) return cached;
  for (const dir of CANDIDATES) {
    const probe = dir ? path.join(dir, "pg_dump") : "pg_dump";
    if (spawnSync(probe, ["--version"], { stdio: "ignore" }).status === 0) {
      cached = dir;
      return dir;
    }
  }
  throw new Error(
    "PostgreSQL client tools not found.\n" +
      "  macOS:  brew install postgresql@18\n" +
      "  Debian: apt-get install postgresql-client-18\n" +
      "  Or set PG_BIN to the directory containing pg_dump.\n" +
      "  The major version must be >= the server's (Neon runs 18.x).\n" +
      "  See docs/runbooks/backup-restore.md.",
  );
}

export function pg(name: string): string {
  const dir = pgBinDir();
  return dir ? path.join(dir, name) : name;
}

/** Major version of the located tools, for the mismatch pre-flight. */
export function pgToolsMajor(): number {
  const out = spawnSync(pg("pg_dump"), ["--version"], { encoding: "utf8" }).stdout ?? "";
  const m = out.match(/(\d+)\./);
  return m ? Number(m[1]) : 0;
}
