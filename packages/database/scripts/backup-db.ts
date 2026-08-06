/* eslint-disable no-console */
/**
 * ============================================================================
 * LOGICAL BACKUP — encrypted pg_dump to S3-compatible offsite storage
 * ============================================================================
 *
 * WHY THIS EXISTS WHEN NEON ALREADY HAS PITR.
 * Neon's point-in-time restore is excellent at one thing: undoing a change
 * inside its retention window, on Neon. It does not help with
 *   - retention past the window (7 days on the paid tiers we are on),
 *   - the account itself — a billing lapse, a lockout, a deleted project,
 *   - a provider-side incident,
 *   - reading the data with anything that is not Neon.
 * A logical dump is portable, verifiable, and outlives the vendor. Both are
 * kept, and `docs/runbooks/backup-restore.md` says which to reach for.
 *
 * WHAT THIS PRODUCES, and why each choice:
 *   * `pg_dump -Fc` (custom format) — compressed, and `pg_restore` can do a
 *     SELECTIVE restore from it ("just the payments table"), which a plain SQL
 *     file cannot. During an incident that is the difference between a
 *     five-minute fix and a full restore.
 *   * age/OpenSSL encryption — the dump contains every user row, every phone
 *     number, and a minor's name and grades. It may not sit in a bucket in
 *     the clear, however private the bucket is believed to be.
 *   * SHA-256 alongside — a truncated upload is the classic silent backup
 *     failure. The checksum is what makes "the file exists" into "the file is
 *     the file".
 *
 * SAFETY: this script only READS. It never connects with intent to write, and
 * it refuses to run without knowing which environment it is dumping (the same
 * `edura-env:` label guard the rest of the tooling uses), so a backup can
 * never be filed under the wrong environment's prefix.
 *
 * Usage:
 *   bun run db:backup production
 *   bun run db:backup dev --local-only        # dump to disk, skip upload
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import "./load-env";
import { pinSslMode } from "../src/pg-ssl";
import { assertDbEnv, type DbEnv } from "./db-guard";
import { pg, pgToolsMajor } from "./pg-tools";

// ---------------------------------------------------------------------------
// Retention. 7 daily + 4 weekly, as specified.
// ---------------------------------------------------------------------------
const KEEP_DAILY = Number(process.env.BACKUP_KEEP_DAILY ?? 7);
const KEEP_WEEKLY = Number(process.env.BACKUP_KEEP_WEEKLY ?? 4);

/** Sunday is the weekly. A dump made on Sunday is filed under BOTH prefixes. */
function isWeekly(d: Date): boolean {
  return d.getUTCDay() === 0;
}

type Args = {
  env: DbEnv;
  localOnly: boolean;
  outDir: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const env = argv.find((a) => !a.startsWith("--")) as DbEnv | undefined;
  if (!env || !["dev", "test", "production"].includes(env)) {
    throw new Error(
      "usage: backup-db.ts <dev|test|production> [--local-only] [--out <dir>]\n" +
        "The environment is REQUIRED and is verified against the label inside " +
        "the database, so a stale connection string cannot file a production " +
        "dump under 'dev'.",
    );
  }
  const outIdx = argv.indexOf("--out");
  return {
    env,
    localOnly: argv.includes("--local-only"),
    outDir: outIdx >= 0 ? argv[outIdx + 1]! : path.resolve(".backups"),
  };
}

/**
 * The connection to dump FROM.
 *
 * DIRECT_URL, not DATABASE_URL: pg_dump wants a real session, and Neon's
 * pooled endpoint (PgBouncer in transaction mode) does not support the
 * long-lived transaction and session-level settings a consistent dump needs.
 * Using the pooler here produces dumps that fail in confusing ways under load.
 */
function dumpUrl(): string {
  const url = process.env.ADMIN_URL ?? process.env.DIRECT_URL;
  if (!url) {
    throw new Error(
      "backup: need ADMIN_URL or DIRECT_URL (an unpooled connection). " +
        "DATABASE_URL points at the Neon pooler, which cannot produce a " +
        "consistent dump.",
    );
  }
  return url;
}

/** Ask the server what major version it is, for the pg_dump pre-flight below. */
async function serverMajorVersion(): Promise<number> {
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: pinSslMode(dumpUrl()), max: 1 });
  try {
    // `SELECT current_setting(...)`, not `SHOW server_version`: SHOW does not
    // support a column alias, so the result key is `server_version` and a
    // `rows[0].v` read silently yields undefined -> 0 -> a guard that can
    // never fire. That exact bug shipped for one commit.
    const { rows } = await pool.query<{ v: string }>(
      "SELECT current_setting('server_version') AS v",
    );
    return Number(String(rows[0]?.v ?? "0").split(".")[0]);
  } finally {
    await pool.end();
  }
}

function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...opts.env },
    });
    child.on("error", (err) =>
      reject(
        new Error(
          `${cmd} could not be started (${err.message}). ` +
            `Install the PostgreSQL client tools (major >= the server's) — see docs/runbooks/backup-restore.md.`,
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
  });
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Encrypt with `age` when available, else OpenSSL AES-256.
 *
 * `age` is preferred because it is public-key: the machine taking backups
 * holds only the RECIPIENT key, so a compromised backup host cannot decrypt
 * its own history. OpenSSL with a shared passphrase is the fallback and is
 * documented as the weaker option, not presented as equivalent.
 */
async function encrypt(input: string): Promise<string | null> {
  const recipient = process.env.BACKUP_AGE_RECIPIENT;
  const passphrase = process.env.BACKUP_ENCRYPTION_KEY;
  const output = `${input}.enc`;

  if (recipient) {
    await run("age", ["-r", recipient, "-o", output, input]);
    return output;
  }
  if (passphrase) {
    await run("openssl", [
      "enc",
      "-aes-256-cbc",
      "-pbkdf2",
      "-iter",
      "600000",
      "-salt",
      "-in",
      input,
      "-out",
      output,
      "-pass",
      "env:BACKUP_ENCRYPTION_KEY",
    ]);
    return output;
  }
  return null;
}

/**
 * Upload via the AWS CLI, which speaks to ANY S3-compatible endpoint
 * (Cloudflare R2, Backblaze B2, Wasabi, MinIO, S3 itself) through
 * `--endpoint-url`. Deliberately not the AWS SDK: this keeps the backup path
 * free of a vendor dependency, and R2/B2 are the realistic choices here
 * because they need no international card and have no egress fee.
 */
async function upload(file: string, key: string): Promise<void> {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) throw new Error("BACKUP_S3_BUCKET is not set");
  const endpoint = process.env.BACKUP_S3_ENDPOINT;

  await run(
    "aws",
    [
      "s3",
      "cp",
      file,
      `s3://${bucket}/${key}`,
      ...(endpoint ? ["--endpoint-url", endpoint] : []),
      "--only-show-errors",
    ],
    {
      env: {
        // AWS CLI v2.23+ sends an `x-amz-checksum-*` header on every upload by
        // default. Several S3-COMPATIBLE providers (Backblaze B2 among them)
        // reject or mishandle it, and the failure looks like an opaque 400 or
        // XAmzContentSHA256Mismatch that reads as a credentials problem.
        //
        // `when_required` restores the pre-2.23 behaviour: checksums are still
        // sent where the API demands them, just not unconditionally. This is a
        // no-op against real AWS S3 and against R2, so it is set always rather
        // than branching on the endpoint — one code path, no provider sniffing.
        AWS_REQUEST_CHECKSUM_CALCULATION: "when_required",
      },
    },
  );
}

/** Delete local dumps past the retention window. Remote lifecycle is the bucket's job. */
async function pruneLocal(dir: string, env: DbEnv): Promise<string[]> {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return removed;
  }

  for (const kind of ["daily", "weekly"] as const) {
    const keep = kind === "daily" ? KEEP_DAILY : KEEP_WEEKLY;
    const matching = entries
      .filter((f) => f.startsWith(`${env}-${kind}-`))
      .sort()
      .reverse(); // ISO timestamps sort lexicographically = chronologically
    for (const stale of matching.slice(keep)) {
      await rm(path.join(dir, stale), { force: true });
      removed.push(stale);
    }
  }
  return removed;
}

/**
 * Fail LOUDLY. A backup that fails quietly is worse than no backup, because it
 * buys confidence it has not earned. Every failure path routes through here.
 */
async function alert(subject: string, body: string): Promise<void> {
  console.error(`\n❌ ${subject}\n${body}`);
  const to = process.env.BACKUP_ALERT_EMAIL;
  if (!to) {
    console.error(
      "   (BACKUP_ALERT_EMAIL is not set — this failure was logged but nobody was told.)",
    );
    return;
  }
  try {
    // Imported lazily: a broken mail layer must not stop a backup from running.
    const { sendMail } = await import("@repo/notifications/transport/smtp");
    await sendMail({ to, subject: `[Edura backup] ${subject}`, text: body });
  } catch (err) {
    console.error(`   (alert email also failed: ${err instanceof Error ? err.message : err})`);
  }
}

async function main() {
  const args = parseArgs();

  // The same structural guard the rest of the tooling uses: the environment is
  // read from INSIDE the database, so a copied connection string cannot file a
  // production dump under a dev prefix.
  await assertDbEnv([args.env], { intent: "backup" });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  await mkdir(args.outDir, { recursive: true });

  const base = `${args.env}-daily-${stamp}.dump`;
  const dumpPath = path.join(args.outDir, base);

  // PRE-FLIGHT: pg_dump aborts outright against a NEWER server, and its error
  // ("aborting because of server version mismatch") is easy to mistake for a
  // connection problem. Say it plainly and early instead. Neon was on 18.4 when
  // this was written; a PostgreSQL 17 client could not dump it at all.
  const serverMajor = await serverMajorVersion();
  const toolsMajor = pgToolsMajor();
  if (toolsMajor < serverMajor) {
    throw new Error(
      `pg_dump is ${toolsMajor}.x but the server is ${serverMajor}.x — pg_dump ` +
        `refuses to dump a newer server. Install postgresql@${serverMajor}, or ` +
        `set PG_BIN. See docs/runbooks/backup-restore.md.`,
    );
  }

  console.log(
    `\n▶ pg_dump ${args.env} (server ${serverMajor}.x, tools ${toolsMajor}.x) → ${dumpPath}`,
  );
  await run(
    pg("pg_dump"),
    [
      "--format=custom",
      "--compress=9",
      // Neon manages roles and tablespaces; restoring them into a scratch or
      // local server fails noisily and helps nobody.
      "--no-owner",
      "--no-privileges",
      "--no-tablespaces",
      "--file",
      dumpPath,
      dumpUrl(),
    ],
    // Belt and braces against a hung network dump on a cron.
    { env: { PGCONNECT_TIMEOUT: "30" } },
  );

  const { size } = await stat(dumpPath);
  if (size < 1024) {
    throw new Error(`dump is only ${size} bytes — that is not a real backup`);
  }
  const digest = await sha256(dumpPath);
  console.log(`  ${(size / 1024 / 1024).toFixed(2)} MiB  sha256=${digest.slice(0, 16)}…`);

  // Encrypt BEFORE upload, always — the plaintext never leaves this machine.
  const encrypted = await encrypt(dumpPath);
  if (!encrypted) {
    const msg =
      "no BACKUP_AGE_RECIPIENT or BACKUP_ENCRYPTION_KEY is set — refusing to " +
      "upload an UNENCRYPTED dump containing every user, phone number and " +
      "minor's record.";
    if (!args.localOnly) throw new Error(msg);
    console.warn(`  ⚠ ${msg} (kept local only)`);
  }

  const payload = encrypted ?? dumpPath;

  if (!args.localOnly) {
    const keys = [`${args.env}/daily/${path.basename(payload)}`];
    // Sunday's dump is ALSO the weekly. Uploading the same bytes twice is
    // cheaper and far simpler to reason about than promoting a file later.
    if (isWeekly(now)) {
      keys.push(`${args.env}/weekly/${path.basename(payload).replace("-daily-", "-weekly-")}`);
    }
    for (const key of keys) {
      console.log(`▶ upload → s3://${process.env.BACKUP_S3_BUCKET}/${key}`);
      await upload(payload, key);
    }
    console.log(
      `\n  Remote retention (${KEEP_DAILY} daily / ${KEEP_WEEKLY} weekly) is enforced by the ` +
        `bucket's lifecycle rules — see docs/runbooks/backup-restore.md §Retention.`,
    );
  }

  const pruned = await pruneLocal(args.outDir, args.env);
  if (pruned.length) console.log(`  pruned ${pruned.length} local file(s) past retention`);

  console.log(`\n✅ backup complete: ${path.basename(payload)}  sha256=${digest}`);
  console.log(
    `   Keep this checksum. docs/runbooks/backup-restore.md explains how to verify a ` +
      `download against it BEFORE trusting it in an incident.`,
  );
}

main().catch(async (err) => {
  await alert(
    "backup FAILED",
    `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n\n` +
      `Host: ${process.env.HOSTNAME ?? "unknown"}\nTime: ${new Date().toISOString()}`,
  );
  process.exit(1);
});
