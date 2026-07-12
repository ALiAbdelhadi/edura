import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Payout workflow (PRD §4.3). The fee-distribution engine accumulates net owed
 * into teacher_profiles.wallet_balance / centers.wallet_balance. A payout
 * snapshots the UNPAID portion of that balance and moves it through
 * pending → approved(=paid) with a ledger-recorded settlement.
 *
 * Reconciliation note: approve settles immediately (status "paid", wallet
 * debited, a `payout` transaction recorded) — a small-platform approve-and-pay
 * flow. Reject leaves the wallet untouched.
 */

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

/** Generate pending payouts for all beneficiaries with an unpaid positive balance. */
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

/** Approve a payout: settle it (status paid, wallet debited, ledger entry). */
async function settlePayout(tx: TenantTx, payoutId: string, approverId: string) {
  const payout = await tx.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError("Payout not found");
  if (payout.status !== "pending") {
    throw new BusinessRuleError(`Payout is already ${payout.status}`);
  }
  const net = payout.netPayable ?? 0;

  // Debit the beneficiary wallet.
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

  // Record the settlement in the append-only ledger.
  const year = new Date().getFullYear();
  const seq = (await tx.transaction.count()) + 1;
  await tx.transaction.create({
    data: {
      refNumber: `TXN-${year}-${String(seq).padStart(5, "0")}`,
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
      const payout = await tx.payout.findUnique({ where: { id: payoutId } });
      if (!payout) throw new NotFoundError("Payout not found");
      if (payout.status !== "pending") {
        throw new BusinessRuleError(`Payout is already ${payout.status}`);
      }
      return tx.payout.update({
        where: { id: payoutId },
        data: { status: "rejected", receiptUrl: null, approvedBy: user.id },
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
  // center → notify its admins
  const admins = await tx.centerAdminProfile.findMany({
    where: { centerId: beneficiaryId },
    select: { userId: true },
  });
  return admins.map((a) => a.userId);
}
