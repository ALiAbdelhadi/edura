// BIZ-02 (SECURITY_AUDIT.md 2026-09-11) — a centre credit top-up captured by
// the gateway must SETTLE through the real claim path. The settler used to
// link only the Transaction; H-03 rule 2 re-reads `paymentId` after
// settlement and throws when it is null, so every real capture rolled back —
// money taken, nothing credited, a 500 on every retry. The only prior test
// inserted the intent already `paid` and called the settler directly, which
// is why nothing was red. This one drives the webhook.
// Runs with PAYMENTS_MODE=mock.
import { withPlatformContext } from "@repo/database";
import { initiateCenterCreditTopUp } from "@/lib/services/wallet/center-credit-topup";
import { processWebhookEvent } from "@/lib/services/payments/payment-intents";
import { signMockWebhook, resolveDriver } from "@/lib/services/payments/gateway";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "biz02-center-credit-claim.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const AMOUNT = 100000; // 1000 EGP

async function webhook(gatewayOrderId: string, tag: string) {
  const rawBody = JSON.stringify({ gateway_order_id: gatewayOrderId, success: true, gateway_ref: `b02_${tag}_${rid()}`, amount_cents: AMOUNT, currency: "EGP" });
  const v = resolveDriver().verifyWebhook(rawBody, { hmac: signMockWebhook(rawBody) });
  if (!v.valid) throw new Error("mock signature failed: " + v.error);
  return processWebhookEvent(v.event, JSON.parse(rawBody)) as Promise<{ handled: boolean; result?: string }>;
}

async function main() {
  const tag = "b02s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id, creditBalance: 0 } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    return { owner: owner.id, center: center.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center, locale: "en" } as SessionUser;
  const creditOf = () => withPlatformContext((tx) => tx.center.findUniqueOrThrow({ where: { id: fx.center }, select: { creditBalance: true } }));

  console.log("\n[1] the owner starts an online credit top-up");
  const intent = await initiateCenterCreditTopUp({ amount: AMOUNT, method: "card", idempotencyKey: `${tag}-${rid()}` }, owner);
  const row = await withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }));
  assert(row.status === "pending" && row.purpose === "center_credit_topup" && !!row.gatewayOrderId, "a pending center_credit_topup intent with a gateway order exists");
  const before = await creditOf();

  console.log("\n[2] the gateway captures it → the claim path settles WITHOUT throwing");
  const out = await webhook(row.gatewayOrderId!, tag);
  assert(out.handled && out.result === "paid", `webhook result is paid (got ${out.result})`);
  const after = await withPlatformContext((tx) => tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }));
  assert(after.status === "paid" && !!after.paymentId && !!after.transactionId, "the intent is paid and links BOTH a payments row and a Transaction");
  const receipt = after.paymentId
    ? await withPlatformContext((tx) => tx.payment.findUnique({ where: { id: after.paymentId! } }))
    : null;
  assert(
    !!receipt && receipt.amount === AMOUNT && receipt.payerUserId === fx.owner && receipt.studentId === null && receipt.centerId === null && receipt.paymentMethod === "online_paymob",
    "the receipt is platform-held: owner as payer, no student, no centre on the row",
  );
  const credited = await creditOf();
  assert(credited.creditBalance - before.creditBalance === AMOUNT, `credit_balance += 1000 EGP (was ${before.creditBalance}, now ${credited.creditBalance})`);
  const ledger = await withPlatformContext((tx) => tx.centerWalletLedger.findFirst({ where: { centerId: fx.center, type: "topup", paymentIntentId: intent.id } }));
  assert(ledger?.delta === AMOUNT && ledger.balanceAfter === credited.creditBalance, "the centre ledger carries the top-up with the running balance");

  console.log("\n[3] a redelivery is a replay, not a second credit");
  const again = await webhook(row.gatewayOrderId!, tag);
  const still = await creditOf();
  assert(again.result === "replay" && still.creditBalance === credited.creditBalance, `redelivery → ${again.result}, balance unchanged`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
