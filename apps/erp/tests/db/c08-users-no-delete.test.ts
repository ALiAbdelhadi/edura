// DB-04 (SECURITY_AUDIT.md 2026-09-11) — the application role cannot DELETE a
// users row. Soft-delete (`status='deleted'`) is the only deletion the app
// performs; a hard delete would cascade two_factors, sessions and accounts
// away with no ledger of it. Asserted by PRIVILEGE (has_table_privilege) and by
// ATTEMPT (an app-role delete inside a transaction is refused), so a
// re-granted privilege under the same migration name is still a red test.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext } from "@repo/database";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

const admin = testPool();
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };
const tag = "c08-" + Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  console.log("users: no DELETE for edura_app (DB-04) —", tag);
  const userId = (await admin.query(
    `INSERT INTO users (email, role, name, status, updated_at) VALUES ($1,'student',$2,'active',now()) RETURNING id`,
    [`${tag}@x.io`, tag],
  )).rows[0].id as string;
  try {
    const privs = (await admin.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'edura_app' AND table_schema = 'public' AND table_name = 'users' ORDER BY 1`,
    )).rows.map((r) => r.privilege_type as string);
    ok(!privs.includes("DELETE"), `edura_app holds no DELETE on users (grants: ${privs.join(",")})`);
    ok(["INSERT", "SELECT", "UPDATE"].every((p) => privs.includes(p)), "…and still INSERT/SELECT/UPDATE");

    // `tx.user.delete` never reaches the database as a DELETE — the soft-delete
    // extension rewrites it to an UPDATE — so the attempt is a raw statement,
    // which is exactly the shape a bug, an injection or a leaked credential
    // would use.
    let refusal = "<<SUCCEEDED>>";
    try {
      await withPlatformContext((tx) => tx.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`);
    } catch (e) {
      refusal = (e as Error).message;
    }
    ok(/permission denied/i.test(refusal), `a raw app-role DELETE is refused by the database (${refusal.slice(0, 60)})`);
    const still = await admin.query(`SELECT status FROM users WHERE id = $1`, [userId]);
    ok(still.rows.length === 1, "the row is still there");

    await withPlatformContext((tx) =>
      tx.user.update({ where: { id: userId }, data: { status: "deleted", deletedAt: new Date() } }),
    );
    const soft = await admin.query(`SELECT status, deleted_at FROM users WHERE id = $1`, [userId]);
    ok(soft.rows[0].status === "deleted" && soft.rows[0].deleted_at !== null, "soft delete (the sanctioned path) still works");
  } finally {
    await admin.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await admin.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite c08-users-no-delete.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
