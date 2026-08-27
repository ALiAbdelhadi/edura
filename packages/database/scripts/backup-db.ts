/* eslint-disable no-console */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import "./load-env";
import { pinSslMode } from "../src/pg-ssl";
import { assertDbEnv, type DbEnv } from "./db-guard";
import { pg, pgToolsMajor } from "./pg-tools";

const KEEP_DAILY = Number(process.env.BACKUP_KEEP_DAILY ?? 7);
const KEEP_WEEKLY = Number(process.env.BACKUP_KEEP_WEEKLY ?? 4);

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

async function serverMajorVersion(): Promise<number> {
  const pg = await import("pg");
  const pool = new pg.default.Pool({ connectionString: pinSslMode(dumpUrl()), max: 1 });
  try {
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
        AWS_REQUEST_CHECKSUM_CALCULATION: "when_required",
      },
    },
  );
}

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
    const { sendMail } = await import("@repo/notifications/transport/smtp");
    await sendMail({ to, subject: `[Edura backup] ${subject}`, text: body });
  } catch (err) {
    console.error(`   (alert email also failed: ${err instanceof Error ? err.message : err})`);
  }
}

async function main() {
  const args = parseArgs();

  await assertDbEnv([args.env], { intent: "backup" });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  await mkdir(args.outDir, { recursive: true });

  const base = `${args.env}-daily-${stamp}.dump`;
  const dumpPath = path.join(args.outDir, base);

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
      "--no-owner",
      "--no-privileges",
      "--no-tablespaces",
      "--file",
      dumpPath,
      dumpUrl(),
    ],
    { env: { PGCONNECT_TIMEOUT: "30" } },
  );

  const { size } = await stat(dumpPath);
  if (size < 1024) {
    throw new Error(`dump is only ${size} bytes — that is not a real backup`);
  }
  const digest = await sha256(dumpPath);
  console.log(`  ${(size / 1024 / 1024).toFixed(2)} MiB  sha256=${digest.slice(0, 16)}…`);

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
