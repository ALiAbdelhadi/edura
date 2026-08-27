/* eslint-disable no-console */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const GRACE_MINUTES = Number(process.env.DRIFT_GRACE_MINUTES ?? 90);

export type Deployment = {
  sha?: string;
  createdAt: number;
} | null;

export type DriftVerdict =
  | { drifted: false; reason: string }
  | { drifted: true; reason: string };

export function assessDrift(args: {
  mainSha: string;
  mainCommittedAt: number;
  latest: Deployment;
  now: number;
  graceMinutes: number;
}): DriftVerdict {
  const { mainSha, mainCommittedAt, latest, now, graceMinutes } = args;
  const aheadMin = Math.floor((now - mainCommittedAt) / 60_000);

  if (!latest) {
    return aheadMin <= graceMinutes
      ? { drifted: false, reason: `no production deployment yet, but main's HEAD is only ${aheadMin}m old` }
      : { drifted: true, reason: `no READY production deployment exists at all` };
  }

  if (latest.sha) {
    if (latest.sha === mainSha) {
      return { drifted: false, reason: `production is serving main (${mainSha.slice(0, 7)})` };
    }
    return aheadMin <= graceMinutes
      ? { drifted: false, reason: `main ${mainSha.slice(0, 7)} is ${aheadMin}m old — inside the ${graceMinutes}m grace, a deploy may be in flight` }
      : {
          drifted: true,
          reason: `production is serving ${latest.sha.slice(0, 7)}, main is ${mainSha.slice(0, 7)} — ${aheadMin}m and counting`,
        };
  }

  if (latest.createdAt >= mainCommittedAt) {
    return { drifted: false, reason: `last production deploy is newer than main's HEAD commit` };
  }
  return aheadMin <= graceMinutes
    ? { drifted: false, reason: `main's HEAD is ${aheadMin}m old — inside the ${graceMinutes}m grace` }
    : {
        drifted: true,
        reason: `last production deploy predates main's HEAD commit by ${Math.floor((mainCommittedAt - latest.createdAt) / 60_000)}m (main ${aheadMin}m old)`,
      };
}

function selfTest(): void {
  const MIN = 60_000;
  const now = 1_000_000_000_000;
  const grace = 90;
  const cases: Array<[string, Parameters<typeof assessDrift>[0], boolean]> = [
    [
      "sha matches -> no drift, however old",
      { mainSha: "aaa", mainCommittedAt: now - 900 * MIN, latest: { sha: "aaa", createdAt: now }, now, graceMinutes: grace },
      false,
    ],
    [
      "sha differs but main is fresh -> grace, no drift (deploy may be in flight)",
      { mainSha: "aaa", mainCommittedAt: now - 10 * MIN, latest: { sha: "bbb", createdAt: now - 20 * MIN }, now, graceMinutes: grace },
      false,
    ],
    [
      "sha differs and main is stale -> DRIFT (the 2026-08-03 case)",
      { mainSha: "aaa", mainCommittedAt: now - 510 * MIN, latest: { sha: "bbb", createdAt: now - 600 * MIN }, now, graceMinutes: grace },
      true,
    ],
    [
      "no sha, deploy newer than commit -> no drift",
      { mainSha: "aaa", mainCommittedAt: now - 300 * MIN, latest: { createdAt: now - 10 * MIN }, now, graceMinutes: grace },
      false,
    ],
    [
      "no sha, deploy older than commit but within grace -> no drift",
      { mainSha: "aaa", mainCommittedAt: now - 30 * MIN, latest: { createdAt: now - 40 * MIN }, now, graceMinutes: grace },
      false,
    ],
    [
      "no sha, deploy older than commit and past grace -> DRIFT",
      { mainSha: "aaa", mainCommittedAt: now - 500 * MIN, latest: { createdAt: now - 900 * MIN }, now, graceMinutes: grace },
      true,
    ],
    [
      "nothing deployed, main fresh -> no drift (a brand-new project)",
      { mainSha: "aaa", mainCommittedAt: now - 5 * MIN, latest: null, now, graceMinutes: grace },
      false,
    ],
    [
      "nothing deployed, main stale -> DRIFT",
      { mainSha: "aaa", mainCommittedAt: now - 500 * MIN, latest: null, now, graceMinutes: grace },
      true,
    ],
    [
      "exactly at the grace boundary -> still no drift (boundary is inclusive)",
      { mainSha: "aaa", mainCommittedAt: now - 90 * MIN, latest: { sha: "bbb", createdAt: now }, now, graceMinutes: grace },
      false,
    ],
  ];

  let failed = 0;
  for (const [name, input, expected] of cases) {
    const got = assessDrift(input).drifted;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}  (expected drifted=${expected}, got ${got})`);
  }
  console.log(failed === 0 ? `\n${cases.length}/${cases.length} passed` : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

async function latestProductionDeployment(projectId: string): Promise<Deployment> {
  const params = new URLSearchParams({
    projectId,
    target: "production",
    state: "READY",
    limit: "1",
  });
  const teamId = process.env.VERCEL_ORG_ID;
  if (teamId) params.set("teamId", teamId);

  const res = await fetch(`https://api.vercel.com/v7/deployments?${params}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status} ${res.statusText} for project ${projectId}`);
  }
  const body = (await res.json()) as { deployments?: Array<Record<string, unknown>> };
  const d = body.deployments?.[0];
  if (!d) return null;

  const meta = (d.meta ?? {}) as Record<string, unknown>;
  const sha = [meta.githubCommitSha, meta.gitCommitSha, meta.commitSha].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return { sha, createdAt: Number(d.createdAt) };
}

async function main(): Promise<void> {
  if (process.argv.includes("--self-test")) return selfTest();

  const missing = [
    "VERCEL_TOKEN",
    "VERCEL_PROJECT_ID_ERP",
    "VERCEL_PROJECT_ID_WWW",
    "VERCEL_PROJECT_ID_SUPERADMIN",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `::error title=Deploy-drift check cannot run::Missing secrets: ${missing.join(", ")}. ` +
        `It fails rather than skipping — a green tick on a check that never ran is the problem it exists to solve.`,
    );
    process.exit(1);
  }

  const mainSha = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
  const mainCommittedAt =
    Number(execFileSync("git", ["log", "-1", "--format=%ct", "origin/main"], { encoding: "utf8" }).trim()) * 1000;
  const now = Date.now();

  const apps = [
    { name: "erp", projectId: process.env.VERCEL_PROJECT_ID_ERP! },
    { name: "www", projectId: process.env.VERCEL_PROJECT_ID_WWW! },
    { name: "superadmin", projectId: process.env.VERCEL_PROJECT_ID_SUPERADMIN! },
  ];

  let drifted = false;
  for (const app of apps) {
    const latest = await latestProductionDeployment(app.projectId);
    const verdict = assessDrift({ mainSha, mainCommittedAt, latest, now, graceMinutes: GRACE_MINUTES });
    if (verdict.drifted) {
      drifted = true;
      console.error(`::error title=${app.name}: main is ahead of production::${verdict.reason}`);
    } else {
      console.log(`ok — ${app.name}: ${verdict.reason}`);
    }
  }

  if (drifted) {
    console.error(
      "Main carries commits production is not serving. Usually this means CI is red on main " +
        "(deploy.yml only runs after a SUCCESSFUL CI run), or the deploy job itself failed. " +
        "Check the Actions tab filtered to branch:main.",
    );
    process.exit(1);
  }
  console.log("No deploy drift.");
}

const invokedDirectly =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`::error title=Deploy-drift check failed::${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
