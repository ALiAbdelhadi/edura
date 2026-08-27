import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext } from "@repo/database";
import { processWebhookEvent } from "@/lib/services/payments/payment-intents";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

async function main() {
  const tag = "m1-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("M1 webhook atomicity —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const center = await tx.center.create({ data: { name: tag + "-c", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 } });
    const su = await tx.user.create({ data: { name: tag + "-s", role: "student", email: tag + "-s@x.io", status: "active" } });
    await tx.studentProfile.create({ data: { userId: su.id, fullName: tag + "-s", familyLinkCode: (tag + "0").slice(0, 18), pointsBalance: 0 } });
    return { center: center.id, student: su.id };
  });

  const orderId = `mock_${tag}`;
  const intentId = (await admin.query(
    `INSERT INTO payment_intents (student_id, course_id, center_id, amount, currency, method, gateway, status, idempotency_key, gateway_order_id, expires_at)
     VALUES ($1, NULL, NULL, 20000, 'EGP', 'card', 'mock', 'pending', $2, $3, now() + interval '1 hour') RETURNING id`,
    [fx.student, tag + "-idem", orderId],
  )).rows[0].id as string;

  const event = { gatewayOrderId: orderId, success: true, gatewayRef: "reftxn-" + tag, reason: null };

  console.log("\n(1) settlement throws after the claim:");
  let threw = false;
  try { await processWebhookEvent(event, { mock: true }); } catch { threw = true; }
  const afterFail = (await admin.query(
    `SELECT status, payment_id, transaction_id FROM payment_intents WHERE id=$1`, [intentId])).rows[0];
  const payCount1 = (await admin.query(`SELECT count(*)::int n FROM payments WHERE student_id=$1`, [fx.student])).rows[0].n;
  const txCount1 = (await admin.query(`SELECT count(*)::int n FROM transactions WHERE gateway_ref=$1`, [event.gatewayRef])).rows[0].n;
  ok(threw, "processWebhookEvent rejected (settlement failed)");
  ok(afterFail.status === "pending", `intent rolled back to 'pending' (got '${afterFail.status}') — NOT charged-but-empty`);
  ok(afterFail.payment_id === null && afterFail.transaction_id === null, "no payment/transaction linked");
  ok(payCount1 === 0 && txCount1 === 0, `no Payment or Transaction rows created (payments=${payCount1}, txns=${txCount1})`);

  console.log("\n(2) webhook redelivery self-heals:");
  await admin.query(`UPDATE payment_intents SET center_id=$2 WHERE id=$1`, [intentId, fx.center]);
  const r2 = await processWebhookEvent(event, { mock: true });
  const afterHeal = (await admin.query(
    `SELECT status, payment_id, transaction_id FROM payment_intents WHERE id=$1`, [intentId])).rows[0];
  const payCount2 = (await admin.query(`SELECT count(*)::int n FROM payments WHERE student_id=$1`, [fx.student])).rows[0].n;
  const txCount2 = (await admin.query(`SELECT count(*)::int n FROM transactions WHERE gateway_ref=$1`, [event.gatewayRef])).rows[0].n;
  ok(r2.handled === true && (r2 as { result: string }).result === "paid", `redelivery settled (result='${(r2 as any).result}')`);
  ok(afterHeal.status === "paid" && afterHeal.payment_id && afterHeal.transaction_id, "intent now paid with linked payment + transaction");
  ok(payCount2 === 1 && txCount2 === 1, `exactly one Payment + one Transaction (payments=${payCount2}, txns=${txCount2})`);

  console.log("\n(3) webhook replay is idempotent:");
  const r3 = await processWebhookEvent(event, { mock: true });
  const payCount3 = (await admin.query(`SELECT count(*)::int n FROM payments WHERE student_id=$1`, [fx.student])).rows[0].n;
  const txCount3 = (await admin.query(`SELECT count(*)::int n FROM transactions WHERE gateway_ref=$1`, [event.gatewayRef])).rows[0].n;
  ok((r3 as { result: string }).result === "replay", `replay returned 'replay' (got '${(r3 as any).result}')`);
  ok(payCount3 === 1 && txCount3 === 1, `still exactly one Payment + one Transaction — no double settle (payments=${payCount3}, txns=${txCount3})`);

  await admin.query(`DELETE FROM notifications WHERE user_id=$1`, [fx.student]);
  await admin.query(`DELETE FROM points_ledger WHERE user_id=$1`, [fx.student]).catch(() => {});
  await admin.query(`DELETE FROM payment_intents WHERE id=$1`, [intentId]);
  await admin.query(`DELETE FROM payments WHERE student_id=$1`, [fx.student]);
  await admin.query(`DELETE FROM student_profiles WHERE user_id=$1`, [fx.student]);
  await admin.query(`DELETE FROM users WHERE id=$1`, [fx.student]);
  await admin.query(`DELETE FROM centers WHERE id=$1`, [fx.center]);
  await admin.end();

  console.log(`\n${fail === 0 ? "M1 PROOF PASS ✔" : "M1 PROOF FAIL ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite m1-webhook-atomicity.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
