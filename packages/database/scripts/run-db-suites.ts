/* eslint-disable no-console */
/**
 * ============================================================================
 * AGGREGATE DB SUITE RUNNER — runs ALL of them, and closes the guard hole
 * ============================================================================
 * Before this existed:
 *   apps/www        `test:db`  ran  1 of 23 suites
 *   apps/www        `test:db:all` ran 4 of 23
 *   apps/superadmin `test:db`  ran  1 of 18
 * The other 35 were reachable only by hand-typing a path — and 15 suites carry
 * a docblock instructing exactly that, with `--env-file=.env.local`, which
 * points at DEV and skips `pretest:db` entirely. So the guard's only enforcement
 * point was a script nobody used, and the documented procedure routed around it.
 *
 * TWO THINGS THIS FIXES
 *
 * 1. COVERAGE. Suites are DISCOVERED, not listed: every `*.test.ts` in the
 *    directory runs, so a new suite is included the day it lands and cannot be
 *    silently forgotten by a package.json that was never updated.
 *
 * 2. THE GUARD HOLE, for everything under this runner. `assertDbEnv(["test"])`
 *    runs IN-PROCESS here, before the first suite spawns — not in a sibling
 *    `pretest:db` step that a hand-typed command can skip. Children inherit this
 *    process's already-validated `process.env`, so they cannot be pointed
 *    somewhere else, and they need no `--env-file` of their own.
 *
 *    Direct invocation is covered too: as of 2026-07-26 all 41 suites call
 *    `assertDbEnv(["test"])` themselves, so
 *    `tsx --env-file=.env.local tests/db/x.test.ts` is refused before its first
 *    fixture. `guardSuite()` below is the helper a new suite should use.
 *
 *    HISTORICAL NOTE — the hole this could never have closed:
 *    19 `apps/www/tests/db/_*.{ts,mjs}` probe scripts used to write over HTTP
 *    (348 POST/PUT/PATCH calls) against a RUNNING dev server, authenticated with
 *    session cookies forged by `_mint.ts` from the real NextAuth secrets. Those
 *    writes travelled through the server's own connection, so no
 *    connection-string guard — this one or db-guard — could ever observe them.
 *    They were removed on 2026-07-26 rather than guarded, because the capability
 *    (mint a super_admin session for any email, no password) was the problem.
 *    Their coverage is being replaced by in-process suites; see
 *    docs/reports/feature-completeness.md §A6.
 *
 * USAGE
 *     tsx --env-file=.env.test ../../packages/database/scripts/run-db-suites.ts tests/db
 *     ... --only wallet,messaging     run just the suites whose name matches
 *     ... --bail                      stop at the first failing suite
 *     ... --list                       print the discovered suites and exit
 * ============================================================================
 */
import "./load-env";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertDbEnv, type DbEnv } from "./db-guard";

/**
 * Call this at the TOP of an individual suite to make the guard load-bearing
 * for direct invocation too:
 *
 *     import { guardSuite } from ".../scripts/run-db-suites";
 *     await guardSuite("wallet.test.ts");
 *
 * Until every suite does this, `--env-file=.env.local` remains a live bypass.
 */
export async function guardSuite(name: string): Promise<DbEnv> {
  return assertDbEnv(["test"], { intent: `suite ${name}` });
}

/** Suites that are real but do not match `*.test.ts`. */
const EXTRA_SUITES = ["run-db-tests.ts"];

/** `_`-prefixed files are probe scripts / shared fixtures, not suites. */
function discover(dir: string): string[] {
  const entries = fs.readdirSync(dir);
  const suites = entries
    .filter((f) => f.endsWith(".test.ts") && !f.startsWith("_"))
    .sort();
  for (const extra of EXTRA_SUITES) {
    if (entries.includes(extra)) suites.push(extra);
  }
  return suites;
}

/** Locate a runnable `tsx` without assuming a global install. */
function resolveTsx(fromDir: string): { cmd: string; pre: string[] } {
  let dir = path.resolve(fromDir);
  for (let i = 0; i < 8; i++) {
    const bin = path.join(dir, "node_modules", ".bin", "tsx");
    if (fs.existsSync(bin)) return { cmd: bin, pre: [] };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { cmd: "npx", pre: ["--no-install", "tsx"] };
}

type SuiteResult = {
  suite: string;
  pass: number | null;
  fail: number | null;
  exit: number;
  ms: number;
  /** Set when the suite printed no `N passed, M failed` line. */
  unparsed: boolean;
  /** Set when the suite was re-run after a countless non-zero exit. */
  retried?: boolean;
};

/**
 * 39 of 40 suites end with `${pass} passed, ${fail} failed`. The one that does
 * not (h1-payout-race.test.ts) is scored by exit code alone and flagged, so a
 * missing count is visible rather than silently counted as zero.
 */
function parseCounts(out: string): { pass: number; fail: number } | null {
  const matches = [...out.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return { pass: Number(last[1]), fail: Number(last[2]) };
}

function indent(out: string): string {
  return out
    .trimEnd()
    .split("\n")
    .slice(-25)
    .map((l) => `        │ ${l}`)
    .join("\n");
}

type Attempt = { res: SuiteResult; out: string };

function spawnSuite(
  tsx: { cmd: string; pre: string[] },
  cwd: string,
  file: string,
): Promise<Attempt> {
  const started = Date.now();
  return new Promise((resolve) => {
    // No --env-file: the child INHERITS this process's env, which assertDbEnv
    // has already validated. That inheritance is the whole point.
    const child = spawn(tsx.cmd, [...tsx.pre, file], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (code) => {
      const counts = parseCounts(out);
      resolve({
        out,
        res: {
          suite: path.basename(file),
          pass: counts?.pass ?? null,
          fail: counts?.fail ?? null,
          exit: code ?? 1,
          ms: Date.now() - started,
          unparsed: counts === null,
        },
      });
    });
    child.on("error", (err) => {
      resolve({
        out: `spawn error: ${err.message}`,
        res: {
          suite: path.basename(file),
          pass: null,
          fail: null,
          exit: 1,
          ms: Date.now() - started,
          unparsed: true,
        },
      });
    });
  });
}

/**
 * A suite that exits non-zero having printed NO count line did not fail an
 * assertion — it never reached its own summary. The observed cause is a
 * transport blip: the Neon WebSocket drops mid-batch and (before the fix in
 * packages/database/src/neon-ws.ts) took the process down with
 * ERR_UNHANDLED_REJECTION. It hit a different suite each time and every
 * affected suite passed 100% when re-run alone, so scoring it by exit code
 * alone reported a false FAIL on a money proof.
 *
 * THE RETRY IS DELIBERATELY NARROW:
 *   - only when there is NO count line at all. A suite that printed
 *     "40 passed, 1 failed" is a real regression and is NEVER re-run — that
 *     is the case where a retry would actually hide something.
 *   - once, not until green.
 *   - loudly: the badge becomes PASS* and the summary names every retried
 *     suite. A silent retry would turn a genuinely flaky money proof into an
 *     invisible one, which is worse than the false FAIL it replaces.
 */
function isInfraBlip(res: SuiteResult): boolean {
  return res.exit !== 0 && res.unparsed;
}

async function runSuite(
  tsx: { cmd: string; pre: string[] },
  cwd: string,
  file: string,
  allowRetry: boolean,
): Promise<SuiteResult> {
  let { res, out } = await spawnSuite(tsx, cwd, file);
  let retried = false;

  if (allowRetry && isInfraBlip(res)) {
    // Print the first attempt's tail NOW — it is the only record of what the
    // blip actually looked like, and a green retry would otherwise erase it.
    console.log(
      `  RETRY ${res.suite.padEnd(42)} no count line (exit ${res.exit}) — re-running once`,
    );
    console.log(indent(out));
    retried = true;
    const firstMs = res.ms;
    ({ res, out } = await spawnSuite(tsx, cwd, file));
    res.ms += firstMs;
  }

  res.retried = retried;

  const ok = res.exit === 0 && (res.fail ?? 0) === 0;
  const badge = ok ? (retried ? "PASS*" : "PASS ") : "FAIL ";
  const counted =
    res.pass !== null
      ? `${res.pass} passed, ${res.fail} failed`
      : `no count line (exit ${res.exit})`;
  console.log(
    `  ${badge} ${res.suite.padEnd(42)} ${counted.padEnd(26)} ${(res.ms / 1000).toFixed(1)}s`,
  );
  if (!ok) console.log(indent(out));
  return res;
}

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith("--")) ?? "tests/db";
  const bail = args.includes("--bail");
  const listOnly = args.includes("--list");
  // `--no-retry` — score every suite on its first attempt, for when you WANT
  // to see the raw flakiness rate rather than have it smoothed over.
  const noRetry = args.includes("--no-retry");
  // Accepts `--only=a,b` and `--only a,b`. Must stay undefined when the flag is
  // absent: an earlier version fell through to args[indexOf(...)+1], which with
  // indexOf === -1 read args[0] — the directory — and filtered every suite out.
  const split = (v: string | undefined) =>
    v?.split(",").map((s) => s.trim()).filter(Boolean);
  const onlyArg = args.find((a) => a === "--only" || a.startsWith("--only="));
  const only = !onlyArg
    ? undefined
    : onlyArg.includes("=")
      ? split(onlyArg.split("=").slice(1).join("="))
      : split(args[args.indexOf("--only") + 1]);

  const cwd = process.cwd();
  const dir = path.resolve(cwd, dirArg);
  if (!fs.existsSync(dir)) {
    console.error(`run-db-suites: no such directory: ${dir}`);
    process.exit(2);
  }

  // `--exclude a,b` — for suites that cannot pass in a given context at ANY
  // database state, so they are skipped EXPLICITLY and named in the output
  // rather than left permanently red. A red test nobody can fix trains people
  // to ignore red. See docs/reports/feature-completeness.md §A10.
  const excludeArg = args.find((a) => a === "--exclude" || a.startsWith("--exclude="));
  const exclude = !excludeArg
    ? undefined
    : excludeArg.includes("=")
      ? split(excludeArg.split("=").slice(1).join("="))
      : split(args[args.indexOf("--exclude") + 1]);

  let suites = discover(dir);
  if (only?.length) {
    suites = suites.filter((s) => only.some((o) => s.includes(o)));
  }
  let skipped: string[] = [];
  if (exclude?.length) {
    skipped = suites.filter((s) => exclude.some((e) => s.includes(e)));
    suites = suites.filter((s) => !exclude.some((e) => s.includes(e)));
  }
  if (skipped.length) {
    console.log(`\nEXCLUDED (${skipped.length}): ${skipped.join(", ")}`);
  }

  if (listOnly) {
    console.log(`${suites.length} suite(s) in ${dirArg}:`);
    for (const s of suites) console.log(`  ${s}`);
    process.exit(0);
  }

  if (!suites.length) {
    console.error(`run-db-suites: no suites matched in ${dirArg}`);
    process.exit(2);
  }

  // ---- THE GUARD, in-process, before anything spawns ----------------------
  const env = await assertDbEnv(["test"], { intent: `run-db-suites ${dirArg}` });

  const app = path.basename(cwd);
  console.log(
    `\nrun-db-suites — ${suites.length} suite(s) in ${app}/${dirArg} against a '${env}' database\n`,
  );

  const tsx = resolveTsx(cwd);
  const results: SuiteResult[] = [];
  for (const s of suites) {
    const r = await runSuite(tsx, cwd, path.join(dirArg, s), !noRetry);
    results.push(r);
    if (bail && (r.exit !== 0 || (r.fail ?? 0) > 0)) {
      console.log(`\nrun-db-suites: --bail after ${r.suite}`);
      break;
    }
  }

  const totalPass = results.reduce((a, r) => a + (r.pass ?? 0), 0);
  const totalFail = results.reduce((a, r) => a + (r.fail ?? 0), 0);
  const badSuites = results.filter((r) => r.exit !== 0 || (r.fail ?? 0) > 0);
  const unparsed = results.filter((r) => r.unparsed);
  const secs = (results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(1);

  console.log(
    `\n${"─".repeat(78)}\n` +
      `${badSuites.length === 0 ? "ALL SUITES PASS ✔" : `${badSuites.length} SUITE(S) FAILED ✗`}` +
      `  —  ${results.length} suites, ${totalPass} assertions passed, ${totalFail} failed, ${secs}s\n` +
      `${"─".repeat(78)}`,
  );
  if (unparsed.length) {
    console.log(
      `note: ${unparsed.length} suite(s) printed no "N passed, M failed" line and were ` +
        `scored by exit code only: ${unparsed.map((r) => r.suite).join(", ")}`,
    );
  }
  // Never let a retry pass unremarked: a suite that needs one is flaky, and
  // that is a finding in its own right even when the second attempt is green.
  const retried = results.filter((r) => r.retried);
  if (retried.length) {
    console.log(
      `RETRIED (${retried.length}): ${retried
        .map((r) => `${r.suite} [${r.exit === 0 && (r.fail ?? 0) === 0 ? "green on retry" : "failed again"}]`)
        .join(", ")}`,
    );
    console.log(
      `  ↳ each exited non-zero with no count line on its first attempt, which is an\n` +
        `    infrastructure blip, not an assertion failure. Investigate if it recurs;\n` +
        `    re-run with --no-retry to see the raw first-attempt result.`,
    );
  }
  if (badSuites.length) {
    console.log(`failed: ${badSuites.map((r) => r.suite).join(", ")}`);
  }
  process.exit(badSuites.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
