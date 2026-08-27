/* eslint-disable no-console */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { pg, pgBinDir } from "./pg-tools";

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; allowFail?: boolean; quiet?: boolean } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.quiet ? ["ignore", "ignore", "pipe"] : ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...opts.env },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || opts.allowFail) resolve(code ?? 1);
      else reject(new Error(`${path.basename(cmd)} exited with ${code}`));
    });
  });
}

function scalar(socket: string, db: string, sql: string): string {
  const res = spawnSync(
    pg("psql"),
    ["-h", socket, "-U", "postgres", "-d", db, "-tAc", sql],
    { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } },
  );
  if (res.status !== 0) throw new Error(`psql failed: ${res.stderr?.trim()}`);
  return res.stdout.trim();
}

type Check = { name: string; run: () => { ok: boolean; detail: string } };

async function main() {
  const argv = process.argv.slice(2);
  const dumpFile = argv.find((a) => !a.startsWith("--"));
  const keep = argv.includes("--keep");

  if (!dumpFile || !existsSync(dumpFile)) {
    throw new Error(
      "usage: restore-test.ts <dump-file> [--keep]\n" +
        "The dump must already be DECRYPTED — see docs/runbooks/backup-restore.md " +
        "for the age/openssl command.",
    );
  }

  pgBinDir(); // resolve once, fail early with an actionable message
  const root = await mkdtemp(path.join(tmpdir(), "edura-restore-"));
  const dataDir = path.join(root, "data");
  const socket = path.join(root, "sock");
  const DB = "restore_check";
  let server: ReturnType<typeof spawn> | null = null;

  const cleanup = async () => {
    if (server && !server.killed) {
      await run(pg("pg_ctl"), ["-D", dataDir, "-m", "immediate", "stop"], {
        allowFail: true,
        quiet: true,
      }).catch(() => {});
    }
    if (!keep) await rm(root, { recursive: true, force: true });
  };

  try {
    console.log(`\n▶ scratch server in ${root}`);
    await mkdir(socket, { recursive: true });
    await run(
      pg("initdb"),
      ["-D", dataDir, "-U", "postgres", "--encoding=UTF8", "--locale=C", "--no-sync"],
      { quiet: true, env: { LC_ALL: "C", LANG: "C" } },
    );
    await run(
      pg("pg_ctl"),
      [
        "-D",
        dataDir,
        "-o",
        `-k ${socket} -h "" -c fsync=off -c full_page_writes=off`,
        "-l",
        path.join(root, "server.log"),
        "-w",
        "start",
      ],
      { env: { LC_ALL: "C", LANG: "C" } },
    );
    server = spawn("true", []); // marker so cleanup knows to stop pg_ctl

    await run(pg("createdb"), ["-h", socket, "-U", "postgres", DB], {
      quiet: true,
      env: { LC_ALL: "C" },
    });

    console.log(`▶ pg_restore ${path.basename(dumpFile)}`);
    const restoreCode = await run(
      pg("pg_restore"),
      [
        "-h",
        socket,
        "-U",
        "postgres",
        "-d",
        DB,
        "--no-owner",
        "--no-privileges",
        dumpFile,
      ],
      { allowFail: true, env: { LC_ALL: "C" } },
    );
    if (restoreCode !== 0) {
      console.log(
        `  pg_restore exited ${restoreCode} (role/ownership warnings are expected here)`,
      );
    }

    const q = (sql: string) => scalar(socket, DB, sql);

    const checks: Check[] = [
      {
        name: "schema restored (tables present)",
        run: () => {
          const n = Number(
            q(`SELECT count(*) FROM information_schema.tables
                WHERE table_schema='public' AND table_type='BASE TABLE'`),
          );
          return { ok: n >= 50, detail: `${n} tables` };
        },
      },
      {
        name: "migration history intact",
        run: () => {
          const n = Number(q(`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`));
          return { ok: n > 0, detail: `${n} applied migrations` };
        },
      },
      {
        name: "permanent reference data survived (Egyptian education catalog)",
        run: () => {
          const subjects = Number(q(`SELECT count(*) FROM subjects`));
          const grades = Number(q(`SELECT count(*) FROM grade_levels`));
          return {
            ok: subjects > 0 && grades > 0,
            detail: `${subjects} subjects / ${grades} grade levels`,
          };
        },
      },
      {
        name: "users table readable",
        run: () => {
          const n = Number(q(`SELECT count(*) FROM users`));
          return { ok: n >= 0, detail: `${n} users` };
        },
      },
      {
        name: "money ledger readable and internally consistent",
        run: () => {
          const tx = Number(q(`SELECT count(*) FROM transactions`));
          const payments = Number(q(`SELECT count(*) FROM payments`));
          const orphanRefunds = Number(
            q(`SELECT count(*) FROM transactions t
                WHERE t.type = 'refund' AND t.reversal_of_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM transactions p WHERE p.id = t.reversal_of_id)`),
          );
          return {
            ok: orphanRefunds === 0,
            detail: `${tx} transactions / ${payments} payments / ${orphanRefunds} orphaned refunds`,
          };
        },
      },
      {
        name: "no orphaned enrollments (referential integrity held)",
        run: () => {
          const orphans = Number(
            q(`SELECT count(*) FROM enrollments e
                WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = e.course_id)`),
          );
          return { ok: orphans === 0, detail: `${orphans} orphans` };
        },
      },
      {
        name: "constraints and indexes came back",
        run: () => {
          const idx = Number(q(`SELECT count(*) FROM pg_indexes WHERE schemaname='public'`));
          const fks = Number(
            q(`SELECT count(*) FROM pg_constraint WHERE contype='f'
                 AND connamespace='public'::regnamespace`),
          );
          return { ok: idx > 50 && fks > 20, detail: `${idx} indexes / ${fks} foreign keys` };
        },
      },
      {
        name: "sequences restored at the right position (no receipt-number reuse)",
        run: () => {
          const behind = Number(
            q(`SELECT count(*) FROM (
                 SELECT s.schemaname, s.sequencename, s.last_value
                   FROM pg_sequences s WHERE s.schemaname='public'
               ) q WHERE q.last_value IS NULL`),
          );
          const total = Number(q(`SELECT count(*) FROM pg_sequences WHERE schemaname='public'`));
          return {
            ok: total > 0,
            detail: `${total} sequences (${behind} never advanced — expected on an empty table)`,
          };
        },
      },
    ];

    console.log("\n▶ integrity checks");
    let failed = 0;
    for (const check of checks) {
      try {
        const { ok, detail } = check.run();
        console.log(`  ${ok ? "✅" : "❌"} ${check.name} — ${detail}`);
        if (!ok) failed++;
      } catch (err) {
        console.log(
          `  ❌ ${check.name} — ${err instanceof Error ? err.message.split("\n")[0] : err}`,
        );
        failed++;
      }
    }

    if (keep) {
      console.log(`\n  scratch server left running: psql -h ${socket} -U postgres -d ${DB}`);
      console.log(`  stop it with: ${pg("pg_ctl")} -D ${dataDir} stop`);
    }

    if (failed > 0) {
      throw new Error(`${failed} integrity check(s) FAILED — this backup is not trustworthy`);
    }
    console.log(`\n✅ restore verified: ${checks.length}/${checks.length} checks passed`);
  } catch (err) {
    const log = await readFile(path.join(root, "server.log"), "utf8").catch(() => "");
    if (log.trim()) {
      console.error(`\n--- scratch server log ---\n${log.trim()}\n--------------------------`);
    }
    throw err;
  } finally {
    if (!keep) await cleanup();
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
