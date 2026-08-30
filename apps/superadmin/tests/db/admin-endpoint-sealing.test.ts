import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma } from "@repo/database";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth/auth";
import { signInDoor } from "./helpers/auth-door";
import { twoFactorSatisfied } from "@/lib/auth/two-factor";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "aes-" + Math.floor(Math.random() * 1e9).toString(36);
const PW = "SealTest!7xq";
// better-auth rejects a state-changing request whose Origin is not trusted, before
// any hook runs — so the probe must look like a real browser call.
const ORIGIN = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

const SEALED = [
  "/admin/create-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/impersonate-user",
];

async function httpPost(path: string, cookie: string, body: unknown): Promise<number> {
  const res = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: ORIGIN, "x-forwarded-for": "198.51.77.7" },
      body: JSON.stringify(body),
    }),
  );
  return res.status;
}

async function main() {
  console.log("Admin endpoint sealing + 2FA gate (M-D, M-B) —", tag);

  const hash = await bcrypt.hash(PW, 10);
  const mk = async (local: string, role: string) =>
    (await admin.query(
      `INSERT INTO users (email, role, name, status, password_hash, updated_at)
       VALUES ($1,$2,$3,'active',$4, now()) RETURNING id`,
      [`${tag}-${local}@x.io`, role, `${tag}-${local}`, hash],
    )).rows[0].id as string;

  const actorId = await mk("actor", "super_admin");
  const victimId = await mk("victim", "teacher");
  const users = [actorId, victimId];

  try {
    console.log("\n[M-D] every sealed admin endpoint is unreachable over HTTP");
    const door = await signInDoor(`${tag}-actor@x.io`, PW);
    ok(door.ok, "the super_admin signed in");
    const cookie = door.ok ? door.cookie : "";

    for (const path of SEALED) {
      const status = await httpPost(path, cookie, { userId: victimId, newPassword: "Whatever!123", role: "super_admin" });
      ok(status === 404, `POST ${path} -> ${status} (sealed)`);
    }

    console.log("\n[M-D] the seal did not break the plugin itself");
    // list-users is a GET, and unsealed: it must still route.
    const listRes = await auth.handler(
      new Request(`${ORIGIN}/api/auth/admin/list-users?limit=1`, {
        method: "GET",
        headers: { cookie, origin: ORIGIN, "x-forwarded-for": "198.51.77.8" },
      }),
    );
    ok(listRes.status !== 404, `an unsealed admin endpoint still routes (${listRes.status})`);

    console.log("\n[M-D] server-side auth.api.* is NOT sealed — the audited route depends on it");
    let serverSideCode = "<<none>>";
    try {
      await auth.api.impersonateUser({ body: { userId: victimId }, headers: new Headers() });
      serverSideCode = "<<succeeded>>";
    } catch (e) {
      serverSideCode = (e as { status?: string; statusCode?: number }).status
        ?? String((e as { statusCode?: number }).statusCode ?? "");
    }
    ok(
      serverSideCode !== "NOT_FOUND" && serverSideCode !== "404",
      `a server-side call is refused on its own merits, not by the seal (${serverSideCode})`,
    );

    console.log("\n[M-B] the fields the 2FA gate reads are really delivered");
    const res = await auth.api.getSession({ headers: new Headers({ cookie }) });
    const u = res?.user as Record<string, unknown> | undefined;
    const s = res?.session as Record<string, unknown> | undefined;
    ok(typeof u?.twoFactorEnabled === "boolean", `twoFactorEnabled is a real boolean (${typeof u?.twoFactorEnabled})`);
    ok("impersonatedBy" in (s ?? {}), "impersonatedBy is present on the session");
    ok(
      u?.twoFactorEnabled === false,
      "a freshly created staff account is NOT enrolled — the case the gate must catch",
    );
    ok(
      twoFactorSatisfied({ twoFactorEnabled: u?.twoFactorEnabled, impersonatedBy: s?.impersonatedBy }) === false,
      "…and the gate refuses that session",
    );
  } finally {
    const c = await admin.connect();
    try {
      await c.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM auth_accounts WHERE user_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR target_id = ANY($1::uuid[])`, [users]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
      const left = await c.query(`SELECT count(*)::int n FROM users WHERE name LIKE $1`, [tag + "%"]);
      ok(left.rows[0].n === 0, "teardown: every fixture row removed");
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite admin-endpoint-sealing.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
