import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { parsePageLimit } from "../../validation/common";

function centerIdOf(user: SessionUser): string {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  return user.centerId;
}

export async function openShiftIdFor(tx: TenantTx, recordedBy: string): Promise<string | null> {
  const row = await tx.centerShift.findFirst({
    where: { staffUserId: recordedBy, status: "open" },
    select: { id: true },
  });
  return row?.id ?? null;
}

export type ShiftMethodBucket = {
  method: string;
  received: number; // Σ positive amounts, piasters
  refunded: number; // Σ |negative amounts|, piasters
  net: number;
  count: number;
};

async function methodBuckets(tx: TenantTx, shiftId: string): Promise<ShiftMethodBucket[]> {
  const rows = await tx.payment.findMany({
    where: { shiftId },
    select: { amount: true, paymentMethod: true },
  });
  const map = new Map<string, ShiftMethodBucket>();
  for (const r of rows) {
    const key = r.paymentMethod;
    const b = map.get(key) ?? { method: key, received: 0, refunded: 0, net: 0, count: 0 };
    if (r.amount >= 0) b.received += r.amount;
    else b.refunded += -r.amount;
    b.net = b.received - b.refunded;
    b.count += 1;
    map.set(key, b);
  }
  const order = ["cash", "instapay", "pos_card", "mobile_wallet", "online_paymob", "online_fawry", "wallet", "unknown"];
  return [...map.values()].sort(
    (a, b) => (order.indexOf(a.method) + 1 || 99) - (order.indexOf(b.method) + 1 || 99),
  );
}

function cashNetOf(buckets: ShiftMethodBucket[]): number {
  return buckets.find((b) => b.method === "cash")?.net ?? 0;
}

export async function openShift(user: SessionUser, input: { openingFloat?: number } = {}) {
  const centerId = centerIdOf(user);
  const openingFloat = input.openingFloat ?? 0;
  if (!Number.isInteger(openingFloat) || openingFloat < 0) {
    throw new BusinessRuleError("Opening float must be a non-negative whole number of piasters");
  }
  return scopedDb(user, async (tx) => {
    const already = await tx.centerShift.findFirst({
      where: { staffUserId: user.id, status: "open" },
      select: { id: true },
    });
    if (already) {
      throw new BusinessRuleError("You already have an open shift — close it before opening another");
    }
    return tx.centerShift.create({
      data: { centerId, staffUserId: user.id, openedBy: user.id, openingFloat },
    });
  });
}

export async function getShiftSummary(user: SessionUser, shiftId: string) {
  const centerId = centerIdOf(user);
  return scopedDb(user, async (tx) => {
    const shift = await tx.centerShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.centerId !== centerId) throw new NotFoundError("Shift not found");
    const buckets = await methodBuckets(tx, shift.id);
    const cashNet = cashNetOf(buckets);
    const staff = await tx.user.findUnique({
      where: { id: shift.staffUserId },
      select: { name: true },
    });
    return {
      ...shift,
      staffName: staff?.name ?? null,
      buckets,
      expectedCashNow: shift.status === "open" ? shift.openingFloat + cashNet : shift.expectedCash,
    };
  });
}

export async function closeShift(
  user: SessionUser,
  shiftId: string,
  input: { countedCash: number; note?: string },
) {
  const centerId = centerIdOf(user);
  if (!Number.isInteger(input.countedCash) || input.countedCash < 0) {
    throw new BusinessRuleError("Counted cash must be a non-negative whole number of piasters");
  }
  return scopedDb(user, async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status::text FROM center_shifts WHERE id = ${shiftId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Shift not found");
    const shift = await tx.centerShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.centerId !== centerId) throw new NotFoundError("Shift not found");
    if (shift.status === "closed") throw new BusinessRuleError("This shift is already closed");
    if (shift.staffUserId !== user.id) {
      throw new ForbiddenError("Only the shift's owner can close it");
    }

    const buckets = await methodBuckets(tx, shift.id);
    const expectedCash = shift.openingFloat + cashNetOf(buckets);
    const variance = input.countedCash - expectedCash;
    const closed = await tx.centerShift.update({
      where: { id: shift.id },
      data: {
        status: "closed",
        closedAt: new Date(),
        closedBy: user.id,
        countedCash: input.countedCash,
        expectedCash,
        variance,
        note: input.note ?? null,
      },
    });
    return { ...closed, buckets };
  });
}

export async function myOpenShift(user: SessionUser) {
  const centerId = centerIdOf(user);
  return scopedDb(user, async (tx) => {
    const shift = await tx.centerShift.findFirst({
      where: { centerId, staffUserId: user.id, status: "open" },
    });
    if (!shift) return null;
    const buckets = await methodBuckets(tx, shift.id);
    return { ...shift, buckets, expectedCashNow: shift.openingFloat + cashNetOf(buckets) };
  });
}

export async function listShiftReconciliation(
  user: SessionUser,
  opts: { from?: string; to?: string; take?: number } = {},
) {
  const centerId = centerIdOf(user);
  const { take } = parsePageLimit({ limit: opts.take }, 100);
  return scopedDb(user, async (tx) => {
    const shifts = await tx.centerShift.findMany({
      where: {
        centerId,
        ...(opts.from ? { openedAt: { gte: new Date(opts.from) } } : {}),
        ...(opts.to ? { openedAt: { lte: new Date(`${opts.to}T23:59:59.999Z`) } } : {}),
      },
      orderBy: { openedAt: "desc" },
      take,
    });
    const staffIds = [...new Set(shifts.map((s) => s.staffUserId))];
    const staff = await tx.user.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, name: true },
    });
    const names = new Map(staff.map((u) => [u.id, u.name]));
    const out = [];
    for (const s of shifts) {
      const buckets = await methodBuckets(tx, s.id);
      const bank = buckets
        .filter((b) => b.method === "instapay" || b.method === "pos_card")
        .reduce((sum, b) => sum + b.net, 0);
      const provider = buckets.find((b) => b.method === "mobile_wallet")?.net ?? 0;
      out.push({
        id: s.id,
        staffName: names.get(s.staffUserId) ?? "—",
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingFloat: s.openingFloat,
        cashNet: cashNetOf(buckets),
        expectedCash: s.status === "closed" ? s.expectedCash : s.openingFloat + cashNetOf(buckets),
        countedCash: s.countedCash,
        variance: s.variance,
        bankNet: bank,
        providerNet: provider,
        note: s.note,
        buckets,
      });
    }
    return out;
  });
}
