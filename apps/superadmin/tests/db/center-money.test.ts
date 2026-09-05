import { testPool } from "../../../../packages/database/scripts/test-pool";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "@repo/database";
import {
  adminRecordPayment,
  adminListPayments,
  adminTopUpWallet,
  adminCreateWalkInSubscription,
  adminCreateExpense,
  adminListExpenses,
  adminDeleteExpense,
  adminGetCenterWallet,
  adminRequestCenterPayout,
} from "@/lib/services/admin/center-money";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`);
}
async function rejects(fn: () => Promise<unknown>, expect: RegExp) {
  try {
    await fn();
    return { threw: false, matched: false, message: "(resolved — no error)" };
  } catch (e) {
    const message = (e as { message?: string })?.message ?? String(e);
    return { threw: true, matched: expect.test(message), message };
  }
}
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;

async function main() {
  const tag = "mny-" + Math.floor(Math.random() * 1e9).toString(36);
  const hash = await bcrypt.hash("Passw0rd!MNY", 10);
  const users: string[] = [];
  const centers: string[] = [];

  const mkUser = async (key: string, role: string) => {
    const id = (
      await q(
        `INSERT INTO users (email, role, name, status, password_hash, is_demo, updated_at)
         VALUES ($1,$2,$3,'active',$4,true,now()) RETURNING id`,
        [`${tag}-${key}@edura.test`, role, `${tag}-${key}`, hash],
      )
    )[0].id as string;
    users.push(id);
    return id;
  };
  const auditRows = (action: string, actorId: string) =>
    q(`SELECT * FROM audit_logs WHERE action=$1 AND actor_id=$2 ORDER BY created_at DESC`, [action, actorId]);

  try {
    console.log(`PHASE 4 — MONEY PARITY — ${tag}`);

    const superAdminId = await mkUser("super", "super_admin");
    const actor = { id: superAdminId, role: "super_admin" } as SessionUser;

    const centerA = (
      await q(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-A`, `${tag}A`.toUpperCase().slice(0, 20)],
      )
    )[0].id as string;
    centers.push(centerA);
    const centerB = (
      await q(
        `INSERT INTO centers (name, short_id, status, is_demo, updated_at)
         VALUES ($1,$2,'active',true,now()) RETURNING id`,
        [`${tag}-B`, `${tag}B`.toUpperCase().slice(0, 20)],
      )
    )[0].id as string;
    centers.push(centerB);

    const teacher = await mkUser("teacher", "teacher");
    const student = await mkUser("student", "student");
    const outsider = await mkUser("outsider", "student");

    await q(
      `INSERT INTO center_teacher_affiliations (center_id, teacher_id, status, center_share, expires_at, updated_at)
       VALUES ($1,$2,'active',0, now() + interval '1 year', now())`,
      [centerA, teacher],
    );
    for (const [i, sid] of [student, outsider].entries()) {
      await q(
        `INSERT INTO student_profiles (user_id, full_name, family_link_code, updated_at) VALUES ($1,$2,$3,now())`,
        [sid, `${tag}-s${i}`, `${i}${tag}`.toUpperCase().replace(/-/g, "").slice(0, 12)],
      );
    }
    await q(`INSERT INTO center_student_rosters (center_id, student_id, updated_at) VALUES ($1,$2,now())`, [centerA, student]);

    const courseId = (
      await q(
        `INSERT INTO courses (center_id, teacher_id, title, subject, days_of_week, start_time, end_time,
           start_date, price, price_per_month, price_per_session, max_students, status, is_demo, updated_at)
         VALUES ($1,$2,$3,$3,'{1}','16:00','18:00', now(), 60000, 60000, 20000, 30, 'active', true, now())
         RETURNING id`,
        [centerA, teacher, `${tag}-course`],
      )
    )[0].id as string;

    await q(
      `INSERT INTO enrollments (student_id, course_id, center_id, status, enrolled_by, updated_at)
       VALUES ($1,$2,$3,'active',$4,now())`,
      [student, courseId, centerA, superAdminId],
    );

    section("Recorded cash payment");
    const payResult = await adminRecordPayment(actor, centerA, {
      studentId: student,
      courseId,
      amount: 50_000,
      note: "Proof run",
    });
    const payment = (await q(`SELECT * FROM payments WHERE center_id=$1 AND student_id=$2`, [centerA, student]))[0];
    assert(!!payment, "a Payment row is written");
    assert(Number(payment.amount) === 50_000, "…for the exact amount");
    assert(!!payment.receipt_number, `…with a center receipt number (${payment.receipt_number})`);
    assert(payment.recorded_by === superAdminId, "…recorded_by names the SUPER ADMIN, the real actor");

    const mirrored = await q(
      `SELECT type, amount, payment_method FROM transactions WHERE center_id=$1 AND amount=50000`,
      [centerA],
    );
    assert(mirrored.length === 1, "the payment is MIRRORED to the ledger (Step 4 reconciliation)");
    assert(mirrored[0].payment_method === "cash", "…as a cash transaction");

    let rows = await auditRows("center.payment_recorded", superAdminId);
    assert(rows.length === 1, "audit: exactly one center.payment_recorded row");
    assert(rows[0].center_id === centerA, "audit: scoped to the center");
    assert(
      rows[0].after_state?.viaSanctionedFlow === "recordPayment",
      "audit: records that this went through the sanctioned flow",
    );

    const negative = await rejects(
      () => adminRecordPayment(actor, centerA, { studentId: student, amount: -5000 }),
      /must be positive|use the refund flow/i,
    );
    assert(negative.threw && negative.matched, "MONEY: a NEGATIVE payment is refused — refunds have their own flow");

    const offRoster = await rejects(
      () => adminRecordPayment(actor, centerA, { studentId: outsider, amount: 1000 }),
      /roster/i,
    );
    assert(offRoster.threw && offRoster.matched, "a student not on this center's roster cannot be charged");

    const list = await adminListPayments(actor, centerA, {});
    assert(!!list, "payments are listable for the center");

    section("Cash wallet top-up — credit only");
    const walletBefore = Number(
      (await q(`SELECT wallet_balance FROM student_profiles WHERE user_id=$1`, [student]))[0].wallet_balance,
    );
    const topup = await adminTopUpWallet(actor, centerA, { studentId: student, amount: 30_000 });
    const walletAfter = Number(
      (await q(`SELECT wallet_balance FROM student_profiles WHERE user_id=$1`, [student]))[0].wallet_balance,
    );
    assert(walletAfter === walletBefore + 30_000, "the wallet balance rises by exactly the amount");
    assert(topup.balanceAfter === walletAfter, "…and the service reports the same balance");

    const wl = await q(`SELECT type, delta, method, balance_after FROM wallet_ledger WHERE student_id=$1`, [student]);
    assert(wl.length === 1 && Number(wl[0].delta) === 30_000, "a WalletLedger entry records the credit");
    assert(wl[0].method === "cash", "…as cash");
    assert(
      Number(wl[0].balance_after) === walletAfter,
      "…and the running balance snapshot matches the cached balance",
    );
    assert(
      (await q(`SELECT count(*)::int c FROM payments WHERE student_id=$1 AND note LIKE '%top-up%'`, [student]))[0].c === 1,
      "the top-up also writes a Payment with a receipt (the trio)",
    );
    rows = await auditRows("center.wallet_topped_up", superAdminId);
    assert(
      rows.length === 1 && rows[0].after_state?.direction === "credit",
      "audit: one row, recorded as a CREDIT",
    );

    const moneyModule = (await import("@/lib/services/admin/center-money")) as Record<string, unknown>;
    const debitish = Object.keys(moneyModule).filter((k) =>
      /debit|withdraw|deduct|setBalance|adjustBalance/i.test(k),
    );
    assert(
      debitish.length === 0,
      `MONEY: the money surface exports NO debit/withdraw/balance-setter (found: ${debitish.join(", ") || "none"})`,
    );

    section("Walk-in subscription — the price is the course's, not the caller's");
    const sub = await adminCreateWalkInSubscription(actor, centerA, {
      studentId: student,
      courseId,
      plan: "monthly",
    });
    const subRow = (await q(`SELECT price, status, center_id FROM subscriptions WHERE course_id=$1`, [courseId]))[0];
    assert(!!subRow, "a Subscription row is created");
    assert(Number(subRow.price) === 60_000, "MONEY: charged the COURSE's configured plan price (60000)");
    assert(subRow.center_id === centerA, "…scoped to the acting center");
    rows = await auditRows("center.walk_in_subscription_created", superAdminId);
    assert(rows.length === 1, "audit: exactly one walk-in subscription row");
    assert(!!sub, "the service returned the subscription");

    section("Expenses + payout request");
    const exp = await adminCreateExpense(actor, centerA, {
      amount: 12_000,
      category: "utilities",
      description: "Proof run",
      expenseDate: new Date().toISOString().slice(0, 10),
    });
    const expId = (exp as { id: string }).id;
    assert(
      (await q(`SELECT count(*)::int c FROM expenses WHERE center_id=$1`, [centerA]))[0].c === 1,
      "an expense is recorded",
    );
    assert(!!(await adminListExpenses(actor, centerA, {})), "expenses are listable");

    const ledgerBeforeExpDelete = await q(
      `SELECT id FROM transactions WHERE center_id=$1 ORDER BY id`,
      [centerA],
    );
    await adminDeleteExpense(actor, centerA, expId);
    assert(
      (await q(`SELECT count(*)::int c FROM expenses WHERE id=$1`, [expId]))[0].c === 0,
      "an expense can be deleted (it is bookkeeping, not the ledger)",
    );
    assert(
      JSON.stringify(ledgerBeforeExpDelete) ===
        JSON.stringify(await q(`SELECT id FROM transactions WHERE center_id=$1 ORDER BY id`, [centerA])),
      "MONEY: deleting an expense reversed NOTHING in the transaction ledger",
    );

    const walletState = await adminGetCenterWallet(actor, centerA);
    assert(!!walletState, "the center wallet is readable");
    await q(`UPDATE centers SET wallet_balance = 40000 WHERE id=$1`, [centerA]);
    const payoutBeforeBalance = Number(
      (await q(`SELECT wallet_balance FROM centers WHERE id=$1`, [centerA]))[0].wallet_balance,
    );
    await adminRequestCenterPayout(actor, centerA, 10_000);
    const payout = (await q(`SELECT status, net_payable FROM payouts WHERE center_id=$1`, [centerA]))[0];
    assert(!!payout && payout.status === "pending", "a PENDING payout is raised");
    assert(
      Number((await q(`SELECT wallet_balance FROM centers WHERE id=$1`, [centerA]))[0].wallet_balance) ===
        payoutBeforeBalance,
      "MONEY: requesting a payout moved NO money — the wallet is unchanged",
    );
    rows = await auditRows("center.payout_requested", superAdminId);
    assert(
      rows.length === 1 && rows[0].after_state?.moneyMoved === false,
      "audit: one row, recording that nothing was paid",
    );

    section("THE BOUNDARY — still closed, for a super admin too");
    const viaApp = (fn: (tx: never) => Promise<unknown>) => () => withPlatformContext(fn as never);
    const ledger = await q(
      `SELECT id FROM transactions WHERE center_id=$1 ORDER BY id`,
      [centerA],
    );
    const txnId = ledger[0].id as string;

    for (const [label, model, id, data] of [
      ["Transaction.update", "transaction", txnId, { amount: 1 }],
      ["WalletLedger.update", "walletLedger", wl[0].id as string, { delta: 1 }],
    ] as const) {
      const r = await rejects(
        viaApp((tx: never) =>
          (tx as Record<string, { update: (a: unknown) => Promise<unknown> }>)[model].update({
            where: { id },
            data,
          }),
        ),
        /append-only/i,
      );
      assert(r.threw && r.matched, `runtime layer: ${label} is refused`);
    }

    const appPool = testPool(process.env.DATABASE_URL);
    const rawAsApp = async (sql: string, params: unknown[] = []) => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
        await client.query(sql, params);
        return { threw: false, message: "(succeeded — THE LEDGER IS WRITABLE)" };
      } catch (e) {
        return { threw: true, message: (e as { message?: string })?.message ?? String(e) };
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
    };
    assert(
      (await appPool.query(`SELECT current_user AS u`)).rows[0].u === "edura_app",
      "the money surface connects as the ordinary app role, not a privileged one",
    );
    for (const [label, sql, params] of [
      ["UPDATE transactions", `UPDATE transactions SET amount = 1 WHERE id = $1`, [txnId]],
      ["DELETE transactions", `DELETE FROM transactions WHERE id = $1`, [txnId]],
      ["UPDATE points_ledger", `UPDATE points_ledger SET delta = 1 WHERE student_id = $1`, [student]],
      ["DELETE payouts", `DELETE FROM payouts WHERE center_id = $1`, [centerA]],
      ["UPDATE audit_logs", `UPDATE audit_logs SET action='x' WHERE center_id = $1`, [centerA]],
    ] as [string, string, unknown[]][]) {
      const r = await rawAsApp(sql, params);
      assert(
        r.threw && /permission denied/i.test(r.message),
        `DB layer: ${label} → ${r.threw ? r.message.split("\n")[0] : r.message}`,
      );
    }
    const neg = await rawAsApp(`UPDATE centers SET wallet_balance = -1 WHERE id = $1`, [centerA]);
    assert(
      neg.threw && /wallet_balance|check constraint/i.test(neg.message),
      "DB layer: a negative center wallet balance is still rejected",
    );
    const negStudent = await rawAsApp(
      `UPDATE student_profiles SET wallet_balance = -1 WHERE user_id = $1`,
      [student],
    );
    assert(
      negStudent.threw && /wallet_balance|check constraint/i.test(negStudent.message),
      "DB layer: a negative STUDENT wallet balance is still rejected",
    );
    await appPool.end();
  } finally {
    const u = users;
    const c = centers;
    const courses = (await q(`SELECT id FROM courses WHERE center_id = ANY($1::uuid[])`, [c])).map((r) => r.id);
    await q(`DELETE FROM wallet_ledger WHERE student_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM points_ledger WHERE student_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM transactions WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM payments WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM payouts WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM expenses WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM subscriptions WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await q(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [c]);
    await q(`UPDATE student_profiles SET wallet_balance = 0, points_balance = 0 WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [u]);
    await q(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [u, c]);
    await q(`UPDATE centers SET wallet_balance = 0 WHERE id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [c]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [u]);
    await admin.end();
    await prisma.$disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite center-money.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
