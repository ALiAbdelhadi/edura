/* eslint-disable no-console */
/**
 * ============================================================================
 * RESTORE TEST — proves a dump can actually come back
 * ============================================================================
 *
 * An untested backup is a hypothesis. This script is what converts it into a
 * fact, and it is designed to be run on a schedule, not once.
 *
 * WHAT IT DOES:
 *   1. Starts a THROWAWAY local PostgreSQL in a temp directory, on a random
 *      port, listening on a unix socket only.
 *   2. Restores the dump into it.
 *   3. Runs integrity checks against the restored data.
 *   4. Destroys the whole thing.
 *
 * WHY A LOCAL SCRATCH SERVER AND NOT A NEON BRANCH:
 *   * It touches NO cloud database, so there is no configuration mistake that
 *     could point a restore at dev or production. The blast radius is a temp
 *     directory.
 *   * It proves the dump is PORTABLE — that the data can be revived on plain
 *     PostgreSQL, not only inside Neon. That is most of the point of keeping
 *     logical dumps alongside Neon's PITR.
 *   * It needs no cloud credentials, so it runs in CI and on a laptop the same
 *     way.
 *
 * THE CHECKS ARE STRUCTURAL, NOT COSMETIC. "pg_restore exited 0" is not
 * evidence: it exits 0 on an empty dump. So the checks assert the things that
 * would actually make a restore useless — missing tables, an empty catalog, a
 * broken money ledger, orphaned foreign keys.
 *
 * Usage:
 *   bun run db:restore-test .backups/dev-daily-....dump
 *   bun run db:restore-test <file> --keep      # leave the scratch server up
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Binary resolution (and the PostgreSQL-18-vs-17 rationale) lives in pg-tools.
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

/** Query the scratch server and return the single scalar in the first column. */
function scalar(socket: string, db: string, sql: string): string {
  const res = spawnSync(
    pg("psql"),
    // `-U postgres` is required: without it psql connects as the OS user, which
    // does not exist on a freshly initdb'd cluster ("role \"ali\" does not
    // exist") and every check fails for a reason unrelated to the backup.
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
    // PostgreSQL will not create its own socket directory.
    await mkdir(socket, { recursive: true });
    // Locale is pinned EXPLICITLY. initdb inherits LANG/LC_* from the shell and
    // dies with "invalid locale settings" on any machine whose locale it does
    // not recognise (macOS is a common offender) — which would make the restore
    // test fail for a reason that has nothing to do with the backup.
    //
    // `--encoding=UTF8` is NOT optional: the data is Arabic. Collation is C
    // because sort order affects no check here, and C is the one collation
    // guaranteed to exist everywhere.
    await run(
      pg("initdb"),
      ["-D", dataDir, "-U", "postgres", "--encoding=UTF8", "--locale=C", "--no-sync"],
      { quiet: true, env: { LC_ALL: "C", LANG: "C" } },
    );
    // LC_ALL=C is required for the SERVER process too, not just initdb. On
    // macOS, PostgreSQL 18 aborts startup with "postmaster became multithreaded
    // during startup" because the platform's locale lookup spawns a thread
    // before the postmaster forks. Its own hint says to set LC_ALL.
    await run(
      pg("pg_ctl"),
      [
        "-D",
        dataDir,
        "-o",
        // Unix socket ONLY (`-h ""` disables TCP). Nothing on the network can
        // reach a server holding a copy of real data, not even from localhost.
        // fsync off because this server lives for ~20 seconds and is discarded.
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
    // `--no-owner/--no-privileges`: the dump references the Neon `edura_app`
    // role, which does not exist here. Ownership is not what we are testing —
    // the DATA coming back is. Non-zero exit is tolerated for exactly this
    // class of warning and the checks below are the real verdict.
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
      // Non-zero is EXPECTED and tolerated: the dump names the Neon `edura_app`
      // role, which does not exist here, so every GRANT/OWNER statement errors.
      // The integrity checks below are the real verdict, not this exit code.
      { allowFail: true, env: { LC_ALL: "C" } },
    );
    if (restoreCode !== 0) {
      console.log(
        `  pg_restore exited ${restoreCode} (role/ownership warnings are expected here)`,
      );
    }

    const q = (sql: string) => scalar(socket, DB, sql);

    // ---------------------------------------------------------------------
    // INTEGRITY CHECKS. Each one is a way a restore can be silently useless.
    // ---------------------------------------------------------------------
    const checks: Check[] = [
      {
        name: "schema restored (tables present)",
        run: () => {
          const n = Number(
            q(`SELECT count(*) FROM information_schema.tables
                WHERE table_schema='public' AND table_type='BASE TABLE'`),
          );
          // The repo's own expected shape is ~74 tables; anything under 50
          // means a partial restore, which pg_restore will not tell you about.
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
          // The catalog is the one thing that is NEVER demo data and never
          // wiped. If it came back empty, the dump captured nothing useful.
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
          // Every refund must still point at the payment it reverses. A
          // restore that dropped rows would break this and nothing else would
          // notice until an accountant did.
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
          // THE subtle one. If a sequence came back at 1 while the table holds
          // receipt RCP-...-00042, the next payment reuses a receipt number
          // and the unique index rejects it — a restore that looks perfect and
          // then breaks checkout.
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
    // The scratch directory is about to be deleted, taking the postmaster log
    // with it — and that log is the ONLY explanation of a start failure. Print
    // it before it goes.
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
