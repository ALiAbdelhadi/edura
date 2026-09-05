import { withPlatformContext } from "@repo/database";
import {
  walletCredit,
  walletDebit,
  reconcileWallet,
} from "@repo/server-core/services/wallet/wallet";
import {
  initiateWalletTopUpIntent,
  topUpWalletCash,
  getWalletForStudent,
} from "@/lib/services/wallet/wallet";
import { processWebhookEvent } from "@/lib/services/payments/payment-intents";
import { createSubscriptionCheckout } from "@/lib/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent } from "@/lib/services/payments/payment-intents";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "wallet.test.ts";

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

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function mkStudent(tag: string, balance = 0) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: u.id,
        fullName: `${tag}-s`,
        familyLinkCode: (tag + rid() + "00").slice(0, 18),
        walletBalance: balance,
      },
    });
    return u.id;
  });
}
const balanceOf = (studentId: string) =>
  withPlatformContext(async (tx) => {
    const p = await tx.studentProfile.findUnique({
      where: { userId: studentId },
      select: { walletBalance: true },
    });
    return p!.walletBalance;
  });

async function main() {
  const tag = "wallet-" + rid();
  __sweepTag = tag;
  console.log("Student wallet money-safety DB tests —", tag);

  console.log("\nProof 1 — ledger-derived balance reconciles (topup/pay/refund)");
  const s1 = await mkStudent(tag + "1");
  await withPlatformContext((tx) =>
    walletCredit(tx, s1, 30000, { type: "topup", method: "online_paymob", reason: "topup" }),
  );
  await withPlatformContext((tx) =>
    walletDebit(tx, s1, 8000, { type: "payment", method: "wallet", reason: "pay" }),
  );
  await withPlatformContext((tx) =>
    walletCredit(tx, s1, 8000, { type: "refund", reason: "refund" }),
  );
  const rec = await withPlatformContext((tx) => reconcileWallet(tx, s1));
  assert(rec.cached === 30000, `balance = 30000 after +30000 -8000 +8000 (got ${rec.cached})`);
  assert(
    rec.ok && rec.cached === rec.ledgerSum && rec.cached === rec.lastBalanceAfter,
    `reconciles: cached(${rec.cached}) == SUM delta(${rec.ledgerSum}) == last balanceAfter(${rec.lastBalanceAfter})`,
  );

  console.log("\nProof 2 — replayed Paymob webhook credits the wallet ONCE");
  const s2 = await mkStudent(tag + "2");
  const s2user: SessionUser = { id: s2, role: "student" } as SessionUser;
  await initiateWalletTopUpIntent(
    { amount: 25000, method: "card", idempotencyKey: `wt-${tag}-${rid()}` },
    s2user,
  );
  const intent = await withPlatformContext((tx) =>
    tx.paymentIntent.findFirst({
      where: { studentId: s2, purpose: "wallet_topup" },
      orderBy: { createdAt: "desc" },
    }),
  );
  const event = {
    gatewayOrderId: intent!.gatewayOrderId as string,
    success: true,
    gatewayRef: `ref-${tag}`,
    reason: null,
    kind: "capture" as const,
    amountMinor: intent!.amount,
    currency: intent!.currency,
    integrationId: null,
    parentRef: null,
    occurredAt: null,
  };
  const r1 = await processWebhookEvent(event, { mock: true });
  const afterFirst = await balanceOf(s2);
  const r2 = await processWebhookEvent(event, { mock: true }); // replay
  const afterReplay = await balanceOf(s2);
  const topupRows = await withPlatformContext((tx) =>
    tx.walletLedger.count({ where: { studentId: s2, type: "topup", paymentIntentId: intent!.id } }),
  );
  assert(r1.handled && (r1 as { result: string }).result === "paid", "first webhook settled (paid)");
  assert(afterFirst === 25000, `wallet credited once (+25000, got ${afterFirst})`);
  assert((r2 as { result: string }).result === "replay", "replayed webhook = 'replay' (no re-settle)");
  assert(afterReplay === 25000, `balance UNCHANGED after replay (still ${afterReplay})`);
  assert(topupRows === 1, `exactly ONE top-up ledger row for the intent (got ${topupRows})`);

  console.log("\nProof 3 — concurrent double-spend: only one succeeds, never negative");
  const s3 = await mkStudent(tag + "3");
  await withPlatformContext((tx) =>
    walletCredit(tx, s3, 10000, { type: "topup", method: "cash", reason: "opening" }),
  );
  const results = await Promise.allSettled([
    withPlatformContext((tx) => walletDebit(tx, s3, 10000, { type: "payment", method: "wallet" })),
    withPlatformContext((tx) => walletDebit(tx, s3, 10000, { type: "payment", method: "wallet" })),
  ]);
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  const s3bal = await balanceOf(s3);
  assert(okCount === 1, `exactly ONE concurrent debit succeeded (got ${okCount})`);
  assert(
    rejected.length === 1 && String(rejected[0].reason?.message ?? rejected[0].reason).includes("Insufficient"),
    "the other was rejected with 'Insufficient'",
  );
  assert(s3bal === 0, `balance settled to 0, never negative (got ${s3bal})`);
  const rec3 = await withPlatformContext((tx) => reconcileWallet(tx, s3));
  assert(rec3.ok, "still reconciles after the concurrent race");

  console.log("\nProof 4 — insufficient-balance payment cleanly rejected (no partial debit)");
  const s4 = await mkStudent(tag + "4", 5000); // less than the 10000 price
  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: { name: `${tag}-c`, shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    const course = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        title: tag,
        subject: "Math",
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: 10000,
        pricePerMonth: 10000,
        maxStudents: 30,
        status: "active",
      },
    });
    return { centerId: center.id, courseId: course.id };
  });
  const s4user: SessionUser = { id: s4, role: "student" } as SessionUser;
  let threw = false;
  let errMsg = "";
  try {
    await createSubscriptionCheckout(
      { courseId: fx.courseId, plan: "monthly", payFrom: "wallet", method: "card", idempotencyKey: `w4-${rid()}` },
      s4user,
      initiateSubscriptionIntent,
    );
  } catch (e) {
    threw = true;
    errMsg = (e as Error).message;
  }
  const s4bal = await balanceOf(s4);
  const s4subs = await withPlatformContext((tx) =>
    tx.subscription.count({ where: { studentId: s4, status: "active" } }),
  );
  const s4payRows = await withPlatformContext((tx) =>
    tx.walletLedger.count({ where: { studentId: s4, type: "payment" } }),
  );
  assert(threw && errMsg.includes("Insufficient"), `checkout rejected with 'Insufficient' (${errMsg.slice(0, 50)})`);
  assert(s4bal === 5000, `balance UNCHANGED — no partial debit (still ${s4bal})`);
  assert(s4subs === 0, "no subscription activated on rejection");
  assert(s4payRows === 0, "no wallet payment ledger row written on rejection");

  console.log("\nProof 6 — cash top-up writes a traceable ledger entry attributed to the center");
  const cash = await withPlatformContext(async (tx) => {
    const admin = await tx.user.create({
      data: { name: `${tag}-ca`, role: "center_admin", email: `${tag}-ca@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: { name: `${tag}-cc`, shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(), status: "active", walletBalance: 0, receiptSeq: 0 },
    });
    await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: center.id } });
    const stu = await mkStudentInline(tx, `${tag}-cs`);
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: stu } });
    return { adminId: admin.id, centerId: center.id, studentId: stu };
  });
  const adminUser: SessionUser = { id: cash.adminId, role: "center_admin", centerId: cash.centerId } as SessionUser;
  await topUpWalletCash({ studentId: cash.studentId, amount: 12000 }, adminUser);
  const entry = await withPlatformContext((tx) =>
    tx.walletLedger.findFirst({
      where: { studentId: cash.studentId, type: "topup", method: "cash" },
      orderBy: { createdAt: "desc" },
    }),
  );
  const cashBal = await balanceOf(cash.studentId);
  assert(cashBal === 12000, `wallet credited by cash top-up (+12000, got ${cashBal})`);
  assert(!!entry, "a cash top-up ledger entry exists");
  assert(entry?.recordedBy === cash.adminId, "ledger entry is attributed to the crediting STAFF (recordedBy)");
  assert(entry?.centerId === cash.centerId, "ledger entry records the crediting CENTER");
  assert(entry?.delta === 12000 && entry?.balanceAfter === 12000, "delta + running balance recorded");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function mkStudentInline(tx: Parameters<Parameters<typeof withPlatformContext>[0]>[0], tag: string) {
  const u = await tx.user.create({
    data: { name: `${tag}`, role: "student", email: `${tag}-${rid()}@x.io`, status: "active" },
  });
  await tx.studentProfile.create({
    data: { userId: u.id, fullName: tag, familyLinkCode: (tag + rid() + "00").slice(0, 18), walletBalance: 0 },
  });
  return u.id;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
