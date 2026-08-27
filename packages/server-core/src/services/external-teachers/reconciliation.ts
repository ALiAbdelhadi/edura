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
  grossCollected: number;
  platformFees: number;
  centerShare: number;
  teacherEarned: number;
  alreadySettled: number;
  walletBalance: number;
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

    const sessions = await tx.session.findMany({
      where: { courseId: { in: courseIds }, date: { gte: period.from, lt: period.to } },
      select: { id: true, status: true, date: true, distributedAt: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    const settledSessionIds = sessions
      .filter((s) => s.distributedAt !== null)
      .map((s) => s.id);

    const NONE = "00000000-0000-0000-0000-000000000000";

    const [collected, platformFees, settled, settlements, paidOut] = await Promise.all([
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

    const lessonsWithoutSplitRecord = settledSessionIds.length - (settled._count._all ?? 0);

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

export async function settleWithTeacher(
  actor: { acting: SessionUser; actorId: string; onBehalfOf?: string | null },
  teacherId: string,
  input: {
    amount: number;
    period: StatementPeriod;
    paymentMethod?: PaymentMethod;
    note?: string | null;
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
