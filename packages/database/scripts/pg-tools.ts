import { spawnSync } from "node:child_process";
import path from "node:path";

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

export function pgToolsMajor(): number {
  const out = spawnSync(pg("pg_dump"), ["--version"], { encoding: "utf8" }).stdout ?? "";
  const m = out.match(/(\d+)\./);
  return m ? Number(m[1]) : 0;
}
