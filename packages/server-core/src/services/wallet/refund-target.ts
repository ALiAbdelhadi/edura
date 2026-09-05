import type { TenantTx } from "../../db/scope";
import { walletCredit, type WalletMovementOpts } from "./wallet";
import { parentWalletCredit } from "./parent-wallet";

export type RefundTarget = {
  kind: "parent" | "student";
  userId: string;
  studentId: string;
};

export function studentRefundTarget(studentId: string): RefundTarget {
  return { kind: "student", userId: studentId, studentId };
}

async function payerOfPayment(tx: TenantTx, paymentId: string): Promise<string | null> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    select: { payerUserId: true },
  });
  return payment?.payerUserId ?? null;
}

// "Who funded this lesson for this student", which is NOT the same question as
// coverage.ts's "is this student covered". Coverage requires status 'active';
// a refund is often issued after the subscription has expired or been
// cancelled, and the person who paid is unchanged by that. Only
// pending_payment is excluded — it funded nothing.
async function fundingSubscription(
  tx: TenantTx,
  session: { id: string; courseId: string; date: Date },
  studentId: string,
) {
  const subs = await tx.subscription.findMany({
    where: {
      studentId,
      status: { not: "pending_payment" },
      OR: [
        { plan: "per_session", sessionId: session.id },
        {
          plan: "monthly",
          courseId: session.courseId,
          periodStart: { lte: session.date },
          periodEnd: { gte: session.date },
        },
      ],
    },
    select: { id: true, plan: true, sessionId: true, paymentId: true, createdBy: true },
  });
  return (
    subs.find((s) => s.plan === "per_session" && s.sessionId === session.id) ??
    subs.find((s) => s.plan === "monthly") ??
    null
  );
}

// A parent is only a valid refund target if all three hold: they are a parent
// account, they have a parent wallet row to credit, and the child is theirs.
// Any of them missing falls back to the student rather than throwing, because
// a refund must never be blocked by a broken link on the payer's side.
async function parentTargetIsUsable(
  tx: TenantTx,
  parentId: string,
  studentId: string,
): Promise<boolean> {
  if (parentId === studentId) return false;
  const [user, profile, link] = await Promise.all([
    tx.user.findUnique({ where: { id: parentId }, select: { role: true } }),
    tx.parentProfile.findUnique({ where: { userId: parentId }, select: { userId: true } }),
    tx.parentStudentLink.findFirst({
      where: { parentId, studentId, status: "approved" },
      select: { id: true },
    }),
  ]);
  return user?.role === "parent" && profile !== null && link !== null;
}

/**
 * The single definition of whose wallet a refund is owed to.
 *
 * Money returns to the person who parted with it. Where a parent paid for a
 * child, the refund is theirs; otherwise it is the student's. Deliberately
 * divergent from the original refundLessonForStudent, which always credited
 * the student. See docs/decisions/refund-credits-the-payer.md.
 *
 * This does NOT change the ledger direction invariant: the `transactions` row
 * still records student -> centre and is untouched by this resolution.
 */
export async function resolveRefundTarget(
  tx: TenantTx,
  args: {
    studentId: string;
    paymentId?: string | null;
    session?: { id: string; courseId: string; date: Date } | null;
  },
): Promise<RefundTarget> {
  const fallback = studentRefundTarget(args.studentId);

  let payerId: string | null = args.paymentId ? await payerOfPayment(tx, args.paymentId) : null;

  if (!payerId && args.session) {
    const sub = await fundingSubscription(tx, args.session, args.studentId);
    if (sub) {
      payerId = sub.paymentId ? await payerOfPayment(tx, sub.paymentId) : null;
      payerId = payerId ?? sub.createdBy ?? null;
    }
  }

  if (!payerId) return fallback;
  if (!(await parentTargetIsUsable(tx, payerId, args.studentId))) return fallback;

  return { kind: "parent", userId: payerId, studentId: args.studentId };
}

/**
 * The same rule, for money that has a known payer but no `payments` row yet —
 * a gateway capture whose subscription is gone (SECURITY_AUDIT.md H-03). A
 * parent who paid gets their own wallet; anyone else, the student's.
 */
export async function resolvePayerTarget(
  tx: TenantTx,
  args: { studentId: string; payerUserId: string | null },
): Promise<RefundTarget> {
  const fallback = studentRefundTarget(args.studentId);
  if (!args.payerUserId) return fallback;
  if (!(await parentTargetIsUsable(tx, args.payerUserId, args.studentId))) return fallback;
  return { kind: "parent", userId: args.payerUserId, studentId: args.studentId };
}

/**
 * Credit a resolved refund target. Both branches write their balance and their
 * ledger row in the caller's transaction, so the counter and the ledger commit
 * together or not at all.
 */
export async function creditRefundTarget(
  tx: TenantTx,
  target: RefundTarget,
  amount: number,
  opts: WalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (target.kind === "parent") {
    // Mapped field by field rather than spread: the parent ledger has no
    // centerId column, and a silent extra key would be dropped rather than
    // rejected.
    return parentWalletCredit(tx, target.userId, amount, {
      type: opts.type,
      beneficiaryStudentId: target.studentId,
      method: opts.method ?? null,
      refNumber: opts.refNumber ?? null,
      paymentId: opts.paymentId ?? null,
      paymentIntentId: opts.paymentIntentId ?? null,
      subscriptionId: opts.subscriptionId ?? null,
      relatedTxnId: opts.relatedTxnId ?? null,
      reason: opts.reason ?? null,
      recordedBy: opts.recordedBy ?? null,
    });
  }
  return walletCredit(tx, target.userId, amount, opts);
}
