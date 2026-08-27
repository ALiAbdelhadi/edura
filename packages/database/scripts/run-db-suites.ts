/* eslint-disable no-console */
import "./load-env";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertDbEnv, type DbEnv } from "./db-guard";

export async function guardSuite(name: string): Promise<DbEnv> {
  return assertDbEnv(["test"], { intent: `suite ${name}` });
}

const EXTRA_SUITES = ["run-db-tests.ts"];

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
  unparsed: boolean;
  retried?: boolean;
};

function parseCounts(out: string): { pass: number; fail: number } | null {
  const matches = [...out.matchAll(/(\d+)\s+passed,\s*(\d+)\s+failed/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return { pass: Number(last[1]), fail: Number(last[2]) };
}

function indent(out: string): string {
  const lines = out.trimEnd().split("\n");
  const tail = lines.slice(-25);
  const cutoff = lines.length - tail.length;
  const missedFailures = lines.filter((l, i) => i < cutoff && l.includes("✗"));
  return [...missedFailures.map((l) => `        │ ${l}   [above the window]`), ...tail.map((l) => `        │ ${l}`)].join(
    "\n",
  );
}

type Attempt = { res: SuiteResult; out: string };

function spawnSuite(
  tsx: { cmd: string; pre: string[] },
  cwd: string,
  file: string,
): Promise<Attempt> {
  const started = Date.now();
  return new Promise((resolve) => {
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
  const noRetry = args.includes("--no-retry");
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
