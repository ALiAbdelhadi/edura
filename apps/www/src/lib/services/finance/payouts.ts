import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import { nextTxnRef } from "@/lib/services/finance/ref-numbers";
import type { SessionUser } from "@/lib/auth/session";


async function openPayoutSum(tx: TenantTx, beneficiaryId: string): Promise<number> {
  const agg = await tx.payout.aggregate({
    where: { beneficiaryId, status: { in: ["pending", "approved"] } },
    _sum: { netPayable: true },
  });
  return agg._sum.netPayable ?? 0;
}

async function beneficiaryLedgerStats(tx: TenantTx, beneficiaryId: string) {
  const comm = await tx.transaction.aggregate({
    where: { fromEntityId: beneficiaryId, type: "commission" },
    _sum: { amount: true },
  });
  const lessons = await tx.transaction.findMany({
    where: { fromEntityId: beneficiaryId, type: "commission" },
    select: { lessonId: true },
    distinct: ["lessonId"],
  });
  return { commission: comm._sum.amount ?? 0, lessonCount: lessons.length };
}

export function generatePayouts() {
  return platformDb(async (tx) => {
    const created: { beneficiaryType: string; beneficiaryId: string; netPayable: number }[] = [];

    const teachers = await tx.teacherProfile.findMany({
      where: { walletBalance: { gt: 0 } },
      select: { userId: true, walletBalance: true },
    });
    for (const t of teachers) {
      const avail = t.walletBalance - (await openPayoutSum(tx, t.userId));
      if (avail <= 0) continue;
      const stats = await beneficiaryLedgerStats(tx, t.userId);
      await tx.payout.create({
        data: {
          beneficiaryId: t.userId,
          beneficiaryType: "teacher",
          netPayable: avail,
          grossAmount: avail + stats.commission,
          commission: stats.commission,
          lessonCount: stats.lessonCount,
          status: "pending",
        },
      });
      created.push({ beneficiaryType: "teacher", beneficiaryId: t.userId, netPayable: avail });
    }

    const centers = await tx.center.findMany({
      where: { walletBalance: { gt: 0 } },
      select: { id: true, walletBalance: true },
    });
    for (const c of centers) {
      const avail = c.walletBalance - (await openPayoutSum(tx, c.id));
      if (avail <= 0) continue;
      const stats = await beneficiaryLedgerStats(tx, c.id);
      await tx.payout.create({
        data: {
          centerId: c.id,
          beneficiaryId: c.id,
          beneficiaryType: "center",
          netPayable: avail,
          grossAmount: avail + stats.commission,
          commission: stats.commission,
          lessonCount: stats.lessonCount,
          status: "pending",
        },
      });
      created.push({ beneficiaryType: "center", beneficiaryId: c.id, netPayable: avail });
    }

    return { generated: created.length, payouts: created };
  });
}

export function listPayouts(filters: { status?: string; beneficiaryType?: string }) {
  return platformDb((tx) => {
    const where: Record<string, unknown> = {};
    if (filters.status && ["pending", "approved", "paid", "rejected"].includes(filters.status)) {
      where.status = filters.status;
    }
    if (filters.beneficiaryType && ["teacher", "center"].includes(filters.beneficiaryType)) {
      where.beneficiaryType = filters.beneficiaryType;
    }
    return tx.payout.findMany({ where, orderBy: { createdAt: "desc" } });
  });
}

async function settlePayout(tx: TenantTx, payoutId: string, approverId: string) {
  const claimed = await tx.payout.updateMany({
    where: { id: payoutId, status: "pending" },
    data: { status: "approved" },
  });
  if (claimed.count === 0) {
    const exists = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true } });
    if (!exists) throw new NotFoundError("Payout not found");
    throw new BusinessRuleError(`Payout is already ${exists.status}`);
  }

  const payout = await tx.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError("Payout not found");
  const net = payout.netPayable ?? 0;

  if (payout.beneficiaryType === "teacher") {
    await tx.teacherProfile.updateMany({
      where: { userId: payout.beneficiaryId },
      data: { walletBalance: { decrement: net } },
    });
  } else {
    await tx.center.update({
      where: { id: payout.beneficiaryId },
      data: { walletBalance: { decrement: net } },
    });
  }

  await tx.transaction.create({
    data: {
      refNumber: await nextTxnRef(tx),
      type: "payout",
      amount: net,
      toEntityId: payout.beneficiaryId,
      centerId: payout.centerId,
      status: "completed",
      notes: `Payout ${payout.id}`,
    },
  });

  return tx.payout.update({
    where: { id: payoutId },
    data: { status: "paid", approvedBy: approverId, paidAt: new Date() },
  });
}

export async function approvePayout(payoutId: string, user: SessionUser) {
  const { payout, recipients } = await platformDb(
    async (tx) => {
      const payout = await settlePayout(tx, payoutId, user.id);
      const recipients = await resolveBeneficiaryRecipients(tx, payout.beneficiaryType, payout.beneficiaryId);
      return { payout, recipients };
    },
    { actorId: user.id },
  );

  if (recipients.length > 0) {
    await notify({
      recipients,
      type: "payout_approved",
      title: "Payout approved",
      body: `A payout of ${((payout.netPayable ?? 0) / 100).toFixed(2)} EGP has been approved.`,
      data: { payoutId: payout.id, netPayable: payout.netPayable },
    });
  }
  return payout;
}

export async function bulkApprovePayouts(ids: string[], user: SessionUser) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      await approvePayout(id, user);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : "failed" });
    }
  }
  return { approved: results.filter((r) => r.ok).length, results };
}

export function rejectPayout(payoutId: string, reason: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const claimed = await tx.payout.updateMany({
        where: { id: payoutId, status: "pending" },
        data: { status: "rejected" },
      });
      if (claimed.count === 0) {
        const exists = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true } });
        if (!exists) throw new NotFoundError("Payout not found");
        throw new BusinessRuleError(`Payout is already ${exists.status}`);
      }
      return tx.payout.update({
        where: { id: payoutId },
        data: { rejectionReason: reason, receiptUrl: null, approvedBy: user.id },
      });
    },
    { actorId: user.id },
  );
}

export function getPayoutReceipt(payoutId: string) {
  return platformDb(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundError("Payout not found");
    if (payout.status !== "paid") throw new BusinessRuleError("Payout has no receipt until paid");
    return {
      payoutId: payout.id,
      beneficiaryType: payout.beneficiaryType,
      beneficiaryId: payout.beneficiaryId,
      lessonCount: payout.lessonCount,
      grossAmount: payout.grossAmount,
      commission: payout.commission,
      netPayable: payout.netPayable,
      paidAt: payout.paidAt,
    };
  });
}

async function resolveBeneficiaryRecipients(
  tx: TenantTx,
  beneficiaryType: string,
  beneficiaryId: string,
): Promise<string[]> {
  if (beneficiaryType === "teacher") return [beneficiaryId];
  const admins = await tx.centerAdminProfile.findMany({
    where: { centerId: beneficiaryId },
    select: { userId: true },
  });
  return admins.map((a) => a.userId);
}
