import { platformDb, type TenantTx } from "@/lib/db/scope";
import { AppError, NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import { nextTxnRef } from "@/lib/services/finance/ref-numbers";
import type { SessionUser } from "@/lib/auth/session";

const GENERATION_CHUNK_SIZE = 25;

type LedgerStats = { commission: number; lessonCount: number };
type LockedRow = { id: string; wallet_balance: number };
type GeneratedPayout = { beneficiaryType: string; beneficiaryId: string; netPayable: number };

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function bulkLedgerStats(tx: TenantTx, ids: string[]): Promise<Map<string, LedgerStats>> {
  const stats = new Map<string, LedgerStats>();
  if (ids.length === 0) return stats;
  const rows = await tx.$queryRaw<
    { from_entity_id: string; commission: bigint; lesson_count: number }[]
  >`
    SELECT from_entity_id,
           COALESCE(SUM(amount), 0)::bigint AS commission,
           (COUNT(DISTINCT lesson_id)
             + CASE WHEN COUNT(*) FILTER (WHERE lesson_id IS NULL) > 0 THEN 1 ELSE 0 END)::int
             AS lesson_count
      FROM transactions
     WHERE type = 'commission'::transaction_type
       AND from_entity_id = ANY(${ids}::uuid[])
     GROUP BY from_entity_id`;
  for (const r of rows) {
    stats.set(r.from_entity_id, {
      commission: Number(r.commission),
      lessonCount: Number(r.lesson_count),
    });
  }
  return stats;
}

function lockTeachers(tx: TenantTx, ids: string[]) {
  return tx.$queryRaw<LockedRow[]>`
    SELECT user_id AS id, wallet_balance FROM teacher_profiles
     WHERE user_id = ANY(${ids}::uuid[])
     ORDER BY user_id
     FOR UPDATE`;
}

function lockCenters(tx: TenantTx, ids: string[]) {
  return tx.$queryRaw<LockedRow[]>`
    SELECT id, wallet_balance FROM centers
     WHERE id = ANY(${ids}::uuid[])
     ORDER BY id
     FOR UPDATE`;
}

async function generateForChunk(
  beneficiaryType: "teacher" | "center",
  ids: string[],
  stats: Map<string, LedgerStats>,
  user: SessionUser,
): Promise<GeneratedPayout[]> {
  return platformDb(async (tx) => {
    const locked =
      beneficiaryType === "teacher" ? await lockTeachers(tx, ids) : await lockCenters(tx, ids);

    const open = await tx.payout.groupBy({
      by: ["beneficiaryId"],
      where: { beneficiaryId: { in: ids }, status: { in: ["pending", "approved"] } },
      _sum: { netPayable: true },
    });
    const reserved = new Map(open.map((o) => [o.beneficiaryId, o._sum.netPayable ?? 0]));

    const rows = [];
    const created: GeneratedPayout[] = [];
    for (const row of locked) {
      const avail = row.wallet_balance - (reserved.get(row.id) ?? 0);
      if (avail <= 0) continue;
      const s = stats.get(row.id) ?? { commission: 0, lessonCount: 0 };
      rows.push({
        ...(beneficiaryType === "center" ? { centerId: row.id } : {}),
        beneficiaryId: row.id,
        beneficiaryType,
        netPayable: avail,
        grossAmount: avail + s.commission,
        commission: s.commission,
        lessonCount: s.lessonCount,
        status: "pending" as const,
      });
      created.push({ beneficiaryType, beneficiaryId: row.id, netPayable: avail });
    }
    if (rows.length > 0) {
      await tx.payout.createMany({ data: rows });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "payout.generated",
          targetType: "payout",
          targetId: null,
          afterState: {
            beneficiaryType,
            count: created.length,
            totalNetPayable: created.reduce((s, c) => s + c.netPayable, 0),
            beneficiaries: created.map((c) => ({ id: c.beneficiaryId, netPayable: c.netPayable })),
          } as never,
        },
      });
    }
    return created;
  });
}

export async function generatePayouts(user: SessionUser) {
  const { teacherIds, centerIds, stats } = await platformDb(async (tx) => {
    const teachers = await tx.teacherProfile.findMany({
      where: { walletBalance: { gt: 0 } },
      select: { userId: true },
      orderBy: { userId: "asc" },
    });
    const centers = await tx.center.findMany({
      where: { walletBalance: { gt: 0 } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const teacherIds = teachers.map((t) => t.userId);
    const centerIds = centers.map((c) => c.id);
    return {
      teacherIds,
      centerIds,
      stats: await bulkLedgerStats(tx, [...teacherIds, ...centerIds]),
    };
  });

  const created: GeneratedPayout[] = [];
  const batches: { type: "teacher" | "center"; ids: string[] }[] = [
    ...chunk(teacherIds, GENERATION_CHUNK_SIZE).map((ids) => ({ type: "teacher" as const, ids })),
    ...chunk(centerIds, GENERATION_CHUNK_SIZE).map((ids) => ({ type: "center" as const, ids })),
  ];

  for (const batch of batches) {
    try {
      created.push(...(await generateForChunk(batch.type, batch.ids, stats, user)));
    } catch (cause) {
      console.error("[payouts] generation chunk failed", cause);
      throw new AppError(
        500,
        "internal",
        `Payout generation stopped after ${created.length} payout(s). ` +
          `Nothing partial was written — every generated payout is complete and ` +
          `re-running generation is safe: it resumes where this run stopped.`,
        { generated: created.length },
      );
    }
  }

  return { generated: created.length, payouts: created };
}

export function payoutStatusCounts() {
  return platformDb(async (tx) => {
    const grouped = await tx.payout.groupBy({ by: ["status"], _count: { _all: true } });
    const counts: Record<string, number> = {
      pending: 0,
      approved: 0,
      paid: 0,
      rejected: 0,
    };
    for (const g of grouped) counts[g.status] = g._count._all;
    return counts;
  });
}

export function listPayouts(filters: { status?: string; beneficiaryType?: string }) {
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.status && ["pending", "approved", "paid", "rejected"].includes(filters.status)) {
      where.status = filters.status;
    }
    if (filters.beneficiaryType && ["teacher", "center"].includes(filters.beneficiaryType)) {
      where.beneficiaryType = filters.beneficiaryType;
    }
    const rows = await tx.payout.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });

    const teacherIds = rows.filter((r) => r.beneficiaryType === "teacher").map((r) => r.beneficiaryId);
    const centerIds = rows.filter((r) => r.beneficiaryType === "center").map((r) => r.beneficiaryId);
    const [teachers, centers, teacherWallets] = await Promise.all([
      tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true, email: true } }),
      tx.center.findMany({
        where: { id: { in: centerIds } },
        select: { id: true, name: true, walletBalance: true },
      }),
      tx.teacherProfile.findMany({
        where: { userId: { in: teacherIds } },
        select: { userId: true, walletBalance: true },
      }),
    ]);
    const tMap = new Map(teachers.map((u) => [u.id, u]));
    const cMap = new Map(centers.map((c) => [c.id, c]));
    const wMap = new Map(teacherWallets.map((w) => [w.userId, w.walletBalance]));
    return rows.map((r) => {
      const walletBalance =
        r.beneficiaryType === "teacher"
          ? (wMap.get(r.beneficiaryId) ?? null)
          : (cMap.get(r.beneficiaryId)?.walletBalance ?? null);
      return {
        ...r,
        beneficiaryName:
          r.beneficiaryType === "teacher"
            ? (tMap.get(r.beneficiaryId)?.name ?? null)
            : (cMap.get(r.beneficiaryId)?.name ?? null),
        beneficiaryEmail:
          r.beneficiaryType === "teacher" ? (tMap.get(r.beneficiaryId)?.email ?? null) : null,
        walletBalance,
        covered:
          walletBalance === null || r.netPayable === null
            ? null
            : walletBalance >= r.netPayable,
      };
    });
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

  const decremented =
    payout.beneficiaryType === "teacher"
      ? await tx.teacherProfile.updateMany({
          where: { userId: payout.beneficiaryId, walletBalance: { gte: net } },
          data: { walletBalance: { decrement: net } },
        })
      : await tx.center.updateMany({
          where: { id: payout.beneficiaryId, walletBalance: { gte: net } },
          data: { walletBalance: { decrement: net } },
        });
  if (decremented.count === 0) {
    throw new BusinessRuleError(
      "Insufficient wallet balance to settle this payout",
    );
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
