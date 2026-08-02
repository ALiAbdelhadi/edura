// =============================================================================
// CENTER <-> OFF-SYSTEM TEACHER: the statement, and the cash settlement.
//
// WHERE THE MONEY ALREADY IS, before this file does anything.
//
// An off-system teacher's group is an ordinary center course. A student pays at
// the counter through `createWalkInSubscription`, which writes a Payment, a
// `payment` Transaction (student -> center) and a receipt. When the lesson is
// completed, `distributeSessionRevenue` splits it exactly as it does for every
// other course — the center's cut is whatever the group's own pricing says
// (hall %, per-attending-student rate, or the flat affiliation share), the
// platform takes its commission, and the remainder is CREDITED TO THE
// TEACHER'S WALLET.
//
// So the teacher's wallet balance already IS "what the center owes them". This
// file adds no arithmetic to that and no second engine — it adds the two things
// that are genuinely missing:
//
//   1. A STATEMENT (`buildStatement`), derived entirely from the ledger. Pure
//      read: it imports nothing that mutates.
//   2. A CASH SETTLEMENT (`settleWithTeacher`). An on-platform teacher requests
//      a payout and the back office pays it. An off-system teacher has no
//      account to request with, so the center hands them cash across the desk
//      and records it here. The debit is the SAME H2 conditional decrement
//      every payout uses, and the movement is written to the SAME `transactions`
//      ledger as a `payout` row.
//
// WHY THIS IS NOT THE PAYOUT QUEUE. `payouts` is the platform paying a
// beneficiary out of platform-held funds, with a superadmin approval workflow.
// This is a center paying its own teacher out of cash in its own drawer. Routing
// it through the payout queue would ask a super admin to approve money they
// never held and cannot see.
// =============================================================================

import type { PaymentMethod } from "@repo/database";
import { scopedDb } from "../../db/scope";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { nextTxnRef } from "../finance/ref-numbers";
import { assertManagedExternalTeacher, writeExternalTeacherAudit } from "./external-teachers";

function centerOf(acting: SessionUser): string {
  if (!acting.centerId) throw new ForbiddenError("Actor has no center scope");
  return acting.centerId;
}

export type StatementPeriod = { from: Date; to: Date };

export type TeacherStatement = {
  teacherId: string;
  teacherName: string;
  period: StatementPeriod;
  /** Piasters students paid for this teacher's groups in the window. */
  grossCollected: number;
  /** The platform's commission on those lessons. */
  platformFees: number;
  /** The center's cut — hall rent / % / per-student rate. */
  centerShare: number;
  /** What the engine credited the teacher for lessons SETTLED in the window. */
  teacherEarned: number;
  /** Already handed over, this window. */
  alreadySettled: number;
  /**
   * The live wallet balance — the authoritative "owed right now", which is NOT
   * period-bounded and is what `settleWithTeacher` can actually pay against.
   */
  walletBalance: number;
  /**
   * Settled lessons whose split the engine did not record per-session — legacy
   * no-room groups, which split through flat fees and write no
   * session_settlements row. Surfaced rather than guessed at: for these the
   * `teacherEarned` / `centerShare` figures above are incomplete, while
   * `walletBalance` is not (the engine credited them like any other lesson).
   * Zero for every group created with a hall, which is the normal case.
   */
  lessonsWithoutSplitRecord: number;
  sessionsSettled: number;
  lessonsAwaitingCompletion: number;
  settlements: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    amountPaid: number;
    paymentMethod: PaymentMethod;
    txnRef: string | null;
    note: string | null;
    createdAt: Date;
  }[];
};

/**
 * The reconciliation statement for one off-system teacher over one window.
 *
 * READ-ONLY, and structurally so: every call below is findMany / aggregate /
 * count. Nothing in this function writes, and it imports nothing that writes —
 * the same posture as the superadmin oversight module.
 *
 * The figures come from the `transactions` ledger rather than from Payment
 * rows, because the ledger is where the split actually happened. Reading the
 * two sides from one source is what makes them add up.
 */
export async function buildStatement(
  acting: SessionUser,
  teacherId: string,
  period: StatementPeriod,
): Promise<TeacherStatement> {
  const centerId = centerOf(acting);
  if (period.to <= period.from) {
    throw new BusinessRuleError("The end of the period must be after its start");
  }

  return scopedDb(acting, async (tx) => {
    const { user, profile } = await assertManagedExternalTeacher(
      tx,
      centerId,
      teacherId,
      { allowRemoved: true },
    );

    const courses = await tx.course.findMany({
      where: { centerId, teacherId },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    if (!courseIds.length) {
      return emptyStatement(teacherId, user.name, period, profile.walletBalance);
    }

    // Sessions this teacher's groups ran inside the window. `lessonId` on the
    // ledger points at a session, so this is the join between "when it
    // happened" and "what it moved".
    const sessions = await tx.session.findMany({
      where: { courseId: { in: courseIds }, date: { gte: period.from, lt: period.to } },
      select: { id: true, status: true, date: true, distributedAt: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    const settledSessionIds = sessions
      .filter((s) => s.distributedAt !== null)
      .map((s) => s.id);

    // A sentinel that matches nothing, so an empty `in` list narrows to zero
    // rows instead of matching everything.
    const NONE = "00000000-0000-0000-0000-000000000000";

    const [collected, platformFees, settled, settlements, paidOut] = await Promise.all([
      // WHAT STUDENTS PAID = the Payment rows, not the ledger's `payment`
      // transactions. Deliberate: the distribution engine writes one `payment`
      // transaction PER PRESENT STUDENT PER LESSON on top of the subscription's
      // own payment row, so summing the ledger's payment type would count a
      // month's fee once at the counter and again lesson by lesson. `payments`
      // is one row per receipt, and its amount is SIGNED, so refunds net out.
      tx.payment.aggregate({
        where: {
          centerId,
          courseId: { in: courseIds },
          paidAt: { gte: period.from, lt: period.to },
        },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: {
          centerId,
          type: "commission",
          status: "completed",
          lessonId: { in: sessionIds.length ? sessionIds : [NONE] },
        },
        _sum: { amount: true },
      }),
      // The exact split, frozen per settled lesson by the engine itself.
      tx.sessionSettlement.aggregate({
        where: {
          centerId,
          teacherId,
          sessionId: { in: settledSessionIds.length ? settledSessionIds : [NONE] },
        },
        _sum: { teacherTotal: true, centerTotal: true },
        _count: { _all: true },
      }),
      tx.externalTeacherSettlement.findMany({
        where: { centerId, teacherId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      tx.externalTeacherSettlement.aggregate({
        where: { centerId, teacherId, createdAt: { gte: period.from, lt: period.to } },
        _sum: { amountPaid: true },
      }),
    ]);

    const grossCollected = collected._sum.amount ?? 0;
    const platform = platformFees._sum.amount ?? 0;
    const teacherEarned = settled._sum.teacherTotal ?? 0;
    const centerShare = settled._sum.centerTotal ?? 0;

    // A settlement record exists only for ROOM-BASED groups (both pricing
    // methods). A legacy no-room group splits through flat fees and writes no
    // such record, so its teacher/center totals are genuinely not derivable
    // from a stored figure. Rather than invent a number for them, the statement
    // COUNTS them and says so — and `walletBalance` below is unaffected,
    // because the engine credited those lessons to the wallet like any other.
    const lessonsWithoutSplitRecord = settledSessionIds.length - (settled._count._all ?? 0);

    // PAST lessons only. A lesson scheduled for next week is not "awaiting
    // completion" in any sense the operator can act on, and counting it turns
    // an actionable warning ("you have money stuck") into background noise on
    // every freshly-created group. Same rule the gaps report uses.
    const now = new Date();
    const lessonsAwaitingCompletion = sessions.filter(
      (s) => s.date <= now && s.status !== "completed" && s.status !== "cancelled",
    ).length;

    return {
      teacherId,
      teacherName: user.name,
      period,
      grossCollected,
      platformFees: platform,
      centerShare,
      teacherEarned,
      alreadySettled: paidOut._sum.amountPaid ?? 0,
      walletBalance: profile.walletBalance,
      lessonsWithoutSplitRecord,
      sessionsSettled: settledSessionIds.length,
      lessonsAwaitingCompletion,
      settlements: settlements.map((s) => ({
        id: s.id,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        amountPaid: s.amountPaid,
        paymentMethod: s.paymentMethod,
        txnRef: s.txnRef,
        note: s.note,
        createdAt: s.createdAt,
      })),
    };
  });
}

function emptyStatement(
  teacherId: string,
  teacherName: string,
  period: StatementPeriod,
  walletBalance: number,
): TeacherStatement {
  return {
    teacherId,
    teacherName,
    period,
    grossCollected: 0,
    platformFees: 0,
    centerShare: 0,
    teacherEarned: 0,
    alreadySettled: 0,
    walletBalance,
    lessonsWithoutSplitRecord: 0,
    sessionsSettled: 0,
    lessonsAwaitingCompletion: 0,
    settlements: [],
  };
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * The center hands the teacher cash and records it.
 *
 * THE FLOOR IS THE SAME ONE EVERY PAYOUT USES. The debit is a conditional
 * `updateMany` (`WHERE wallet_balance >= amount`), so two staff members
 * settling at once cannot both succeed against the same balance — the loser
 * updates zero rows and this throws. The DB `CHECK (wallet_balance >= 0)`
 * stands behind it. Nothing here writes a balance it computed itself.
 *
 * The `payout` Transaction and the statement row are written in the SAME
 * transaction as the debit, so cash can never leave the drawer without a ledger
 * entry, and a ledger entry can never exist without the balance having moved.
 */
export async function settleWithTeacher(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: {
    amount: number;
    period: StatementPeriod;
    paymentMethod?: PaymentMethod;
    note?: string | null;
    /** The statement figures the operator was looking at, frozen onto the row. */
    snapshot?: {
      grossCollected: number;
      centerShareTotal: number;
      platformFeeTotal: number;
      teacherAccrued: number;
    };
  },
) {
  const centerId = centerOf(actor.acting);
  const amount = input.amount;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Amount must be a positive whole number of piasters");
  }
  if (input.period.to <= input.period.from) {
    throw new BusinessRuleError("The end of the period must be after its start");
  }

  return scopedDb(actor.acting, async (tx) => {
    const { profile } = await assertManagedExternalTeacher(tx, centerId, teacherId, {
      requireExternal: true,
      allowRemoved: true,
    });

    // H2 conditional decrement — the balance check and the write are ONE
    // statement, so there is no window between them for a second settlement to
    // slip through.
    const debited = await tx.teacherProfile.updateMany({
      where: { userId: teacherId, walletBalance: { gte: amount } },
      data: { walletBalance: { decrement: amount } },
    });
    if (debited.count === 0) {
      throw new BusinessRuleError(
        `This teacher is owed ${(profile.walletBalance / 100).toFixed(2)} EGP — you cannot settle more than that`,
      );
    }

    const refNumber = await nextTxnRef(tx);
    await tx.transaction.create({
      data: {
        refNumber,
        type: "payout",
        amount,
        // The center pays the teacher. Same direction the money physically
        // moves, so statements, distributions and reports all read it the way
        // they already read every other payout.
        fromEntityId: centerId,
        toEntityId: teacherId,
        centerId,
        status: "completed",
        paymentMethod: input.paymentMethod ?? "cash",
        notes: `Settlement with off-system teacher${input.note ? ` — ${input.note}` : ""}`,
        dataSource: "manual",
      },
    });

    const settlement = await tx.externalTeacherSettlement.create({
      data: {
        centerId,
        teacherId,
        periodStart: input.period.from,
        periodEnd: input.period.to,
        // Snapshot of what the statement SAID when the operator acted on it. A
        // later attendance edit changes the live statement; it must not be able
        // to change the record of what was agreed and handed over.
        grossCollected: input.snapshot?.grossCollected ?? 0,
        centerShareTotal: input.snapshot?.centerShareTotal ?? 0,
        platformFeeTotal: input.snapshot?.platformFeeTotal ?? 0,
        teacherAccrued: input.snapshot?.teacherAccrued ?? profile.walletBalance,
        amountPaid: amount,
        paymentMethod: input.paymentMethod ?? "cash",
        txnRef: refNumber,
        note: input.note?.trim() || null,
        settledBy: actor.actorId,
      },
    });

    await writeExternalTeacherAudit(tx, {
      action: "external_teacher.settled",
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf ?? null,
      centerId,
      targetType: "teacher",
      targetId: teacherId,
      before: { walletBalance: profile.walletBalance },
      after: {
        walletBalance: profile.walletBalance - amount,
        amountPaid: amount,
        txnRef: refNumber,
        settlementId: settlement.id,
      },
    });

    return {
      settlementId: settlement.id,
      amountPaid: amount,
      txnRef: refNumber,
      remainingOwed: profile.walletBalance - amount,
    };
  });
}

/** Settlement history for one teacher. Read-only. */
export async function listSettlements(acting: SessionUser, teacherId: string) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    await assertManagedExternalTeacher(tx, centerId, teacherId, { allowRemoved: true });
    return tx.externalTeacherSettlement.findMany({
      where: { centerId, teacherId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
}

/** Every off-system teacher this center owes money to right now. */
export async function listOutstandingBalances(acting: SessionUser) {
  const centerId = centerOf(acting);
  return scopedDb(acting, async (tx) => {
    const profiles = await tx.teacherProfile.findMany({
      where: { managedByCenterId: centerId, systemStatus: "external" },
      select: { userId: true, walletBalance: true },
    });
    if (!profiles.length) return [];

    const ids = profiles.map((p) => p.userId);
    const [users, lastSettlements] = await Promise.all([
      tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      tx.externalTeacherSettlement.findMany({
        where: { centerId, teacherId: { in: ids } },
        orderBy: { createdAt: "desc" },
        distinct: ["teacherId"],
        select: { teacherId: true, createdAt: true, amountPaid: true },
      }),
    ]);
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    const lastById = new Map(lastSettlements.map((s) => [s.teacherId, s]));

    return profiles
      .map((p) => ({
        teacherId: p.userId,
        name: nameById.get(p.userId) ?? "",
        owed: p.walletBalance,
        lastSettledAt: lastById.get(p.userId)?.createdAt ?? null,
        lastSettledAmount: lastById.get(p.userId)?.amountPaid ?? null,
      }))
      .sort((a, b) => b.owed - a.owed);
  });
}
