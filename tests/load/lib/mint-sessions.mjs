#!/usr/bin/env bun
/**
 * Mint one better-auth session per load account, ONCE, slowly, and write the
 * cookies to tests/load/.sessions/<role>.json for k6 to reuse.
 *
 *   bun tests/load/lib/mint-sessions.mjs                  # every role
 *   bun tests/load/lib/mint-sessions.mjs student parent   # some roles
 *
 * Why not sign in from inside k6: sign-in is bcrypt plus three rate limits
 * (better-auth's own, a per-IP bucket and a per-email bucket). Signing 500 VUs in
 * at the start of a run measures bcrypt and the login limiter, not the portal.
 * A real user signs in once a month (30-day sessions), so reusing the cookie is
 * also the more honest model.
 *
 * Every sign-in carries its own X-Forwarded-For, the same header a real proxy
 * sets, so the per-IP login bucket sees distinct clients -- as it would for real
 * users on distinct networks. No limit is raised or disabled.
 *
 * SAFETY: refuses any base URL that is not localhost.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ERP = process.env.ERP_URL ?? "http://localhost:3003";
const SA = process.env.SA_URL ?? "http://localhost:3006";
const PASSWORD = process.env.LOAD_PASSWORD ?? "Load-Test-2026!";
const CENTERS = Number(process.env.CENTERS ?? 20);
const PER_CENTER = Number(process.env.SESSIONS_PER_CENTER ?? 25);
const CONCURRENCY = Number(process.env.MINT_CONCURRENCY ?? 4);

for (const u of [ERP, SA]) {
  const host = new URL(u).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(`refusing: ${u} is not localhost. Load sessions are minted locally only.`);
    process.exit(1);
  }
}

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const perCenter = (fn) => range(CENTERS).flatMap((c) => fn(c));

const ROLES = {
  center_admin: { base: ERP, cookie: "edura.session_token",
    accounts: perCenter((c) => [{ email: `load-owner-${c}@load.edura.test`, c, n: 1 }]) },
  center_staff: { base: ERP, cookie: "edura.session_token",
    accounts: perCenter((c) => range(3).map((n) => ({ email: `load-staff-${c}-${n}@load.edura.test`, c, n }))) },
  teacher: { base: ERP, cookie: "edura.session_token",
    accounts: perCenter((c) => range(10).map((n) => ({ email: `load-teacher-${c}-${n}@load.edura.test`, c, n }))) },
  assistant: { base: ERP, cookie: "edura.session_token",
    accounts: perCenter((c) => range(2).map((n) => ({ email: `load-assistant-${c}-${n}@load.edura.test`, c, n }))) },
  student: { base: ERP, cookie: "edura.session_token",
    accounts: perCenter((c) => range(PER_CENTER).map((n) => ({ email: `load-student-${c}-${n}@load.edura.test`, c, n }))) },
  parent: { base: ERP, cookie: "edura.session_token",
    accounts: perCenter((c) => range(PER_CENTER).map((n) => ({ email: `load-parent-${c}-${n}@load.edura.test`, c, n }))) },
  super_admin: { base: SA, cookie: "edura-superadmin.session_token",
    accounts: range(25).map((n) => ({ email: `load-sa-${n}@load.edura.test`, c: 0, n })) },
  accountant: { base: SA, cookie: "edura-superadmin.session_token",
    accounts: range(25).map((n) => ({ email: `load-acc-${n}@load.edura.test`, c: 0, n })) },
};

let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `10.250.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
};

async function signIn(base, cookieName, account) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify({ email: account.email, password: PASSWORD }),
      redirect: "manual",
    });
    if (res.status === 429) {
      await Bun.sleep(5000 * attempt);
      continue;
    }
    if (res.status !== 200) {
      throw new Error(`${account.email}: sign-in ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const setCookies = res.headers.getSetCookie();
    const hit = setCookies.map((c) => c.split(";")[0]).find((c) => c.startsWith(`${cookieName}=`));
    if (!hit) throw new Error(`${account.email}: no ${cookieName} in ${JSON.stringify(setCookies)}`);
    return { ...account, cookie: hit };
  }
  throw new Error(`${account.email}: still rate-limited after 4 attempts`);
}

async function pool(items, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    range(CONCURRENCY).map(async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

const wanted = process.argv.slice(2);
const outDir = path.join(import.meta.dir, "..", ".sessions");
mkdirSync(outDir, { recursive: true });

for (const [role, spec] of Object.entries(ROLES)) {
  if (wanted.length && !wanted.includes(role)) continue;
  const t0 = Date.now();
  const sessions = await pool(spec.accounts, (a) => signIn(spec.base, spec.cookie, a));
  writeFileSync(path.join(outDir, `${role}.json`), JSON.stringify(sessions), { mode: 0o600 });
  console.log(`${role.padEnd(13)} ${String(sessions.length).padStart(4)} sessions  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
