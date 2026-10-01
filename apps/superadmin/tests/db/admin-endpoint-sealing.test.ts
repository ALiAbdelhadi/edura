import { testPool } from "../../../../packages/database/scripts/test-pool";
import { prisma } from "@repo/database";
import bcrypt from "bcryptjs";
import { admin as adminPlugin } from "better-auth/plugins";
import { auth } from "./helpers/bind-auth";
import { signInDoor } from "./helpers/auth-door";
import { twoFactorSatisfied } from "@repo/server-core/backoffice-auth/two-factor";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

const tag = "aes-" + Math.floor(Math.random() * 1e9).toString(36);
const PW = "SealTest!7xq";
// better-auth rejects a state-changing request whose Origin is not trusted, before
// any hook runs — so the probe must look like a real browser call.
const ORIGIN = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

// SECURITY_AUDIT.md (2026-09-11) ADMIN-01: the seal used to be a hand-written
// list of seven paths while the plugin shipped fifteen, and `update-user` —
// a free `data` object straight to the adapter, no 2FA gate, no audit — was
// one of the eight it missed. The list is now read from the plugin itself, so
// a version bump that adds a path shows up here as a red assertion, not as a
// silently open door.
const PLUGIN_ENDPOINTS = Object.values(adminPlugin().endpoints).map((e) => {
  const ep = e as { path: string; options?: { method?: string | string[] } };
  const m = ep.options?.method;
  return { path: ep.path, method: (Array.isArray(m) ? m[0] : m) ?? "POST" };
});

async function httpCall(path: string, method: string, cookie: string, body: unknown): Promise<number> {
  const isGet = method === "GET";
  const url = isGet ? `${ORIGIN}/api/auth${path}?limit=1&userId=x` : `${ORIGIN}/api/auth${path}`;
  const res = await auth.handler(
    new Request(url, {
      method,
      headers: {
        ...(isGet ? {} : { "content-type": "application/json" }),
        cookie,
        origin: ORIGIN,
        "x-forwarded-for": "198.51.77.7",
      },
      body: isGet ? undefined : JSON.stringify(body),
    }),
  );
  return res.status;
}

async function main() {
  console.log("Admin endpoint sealing + 2FA gate (M-D, M-B, ADMIN-01) —", tag);

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
    console.log("\n[ADMIN-01] the plugin's whole HTTP surface is sealed, read from the plugin itself");
    ok(PLUGIN_ENDPOINTS.length >= 15, `the admin plugin exposes ${PLUGIN_ENDPOINTS.length} endpoints (expected ≥ 15)`);
    ok(
      PLUGIN_ENDPOINTS.some((e) => e.path === "/admin/update-user"),
      "…and update-user, the path the old seven-entry list missed, is among them",
    );
    const door = await signInDoor(`${tag}-actor@x.io`, PW);
    ok(door.ok, "the super_admin signed in");
    const cookie = door.ok ? door.cookie : "";

    for (const { path, method } of PLUGIN_ENDPOINTS) {
      const status = await httpCall(path, method, cookie, {
        userId: victimId,
        newPassword: "Whatever!123",
        role: "super_admin",
        data: { twoFactorEnabled: true, role: "super_admin", status: "active" },
      });
      ok(status === 404, `${method} ${path} -> ${status} (sealed)`);
    }

    console.log("\n[ADMIN-01] the seal changed nothing in the database");
    const victim = await admin.query(`SELECT role, status FROM users WHERE id = $1`, [victimId]);
    ok(victim.rows[0].role === "teacher" && victim.rows[0].status === "active", "the victim is still a plain active teacher");
    const actor = await admin.query(`SELECT two_factor_enabled FROM users WHERE id = $1`, [actorId]);
    ok(actor.rows[0].two_factor_enabled === false, "the actor did not get to flip its own twoFactorEnabled");

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
