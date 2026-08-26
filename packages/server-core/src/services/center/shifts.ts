import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";

// ===========================================================================
// COUNTER SHIFTS (Phase 2, revenue-operations spec §2.4) — one staff member's
// drawer session, opened with a float and closed against a physical count.
//
// THE SHIFT WRITES NO MONEY OF ITS OWN. Every figure it reports is a SUM over
// `payments` rows stamped with its id at write time (`stampShiftId`, called by
// the three counter money writers). The reconciliation and the ledger are one
// set of books by construction — there is nothing to drift.
//
// WHAT "EXPECTED" MEANS, per Phase 1's channel semantics (migration
// 20260825120000): only `cash` physically sits in the drawer, so
//   expected_cash = opening_float + Σ signed cash amounts of the shift.
// instapay / pos_card are reported for BANK-statement matching, mobile_wallet
// for the provider's; `wallet` moves no physical money and `unknown` stays its
// own admitted bucket (never folded into cash — the MC-3 rule).
//
// Refunds are SIGNED negative `payments.amount`s, so a cash refund handed out
// of the drawer reduces expected cash by simple summation — no special case.
// ===========================================================================

function centerIdOf(user: SessionUser): string {
  if (user.role !== "center_admin" || !user.centerId) throw new ForbiddenError();
  return user.centerId;
}

/**
 * The stamp, used BY THE MONEY WRITERS inside their own transaction: the
 * recorder's open shift, or NULL. Derived from `recordedBy` rather than passed
 * by callers, so no route can stamp somebody else's drawer — and a payment
 * recorded by an actor with no open shift (a student paying online, a center
 * that never uses shifts) is stamped NULL and behaves exactly as before.
 */
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

/** Per-method sums over the shift's stamped payments. Pure read, shared by the
 *  live summary, the close (which freezes the cash figures), and the export. */
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
  // Stable order: drawer first, then bank, provider, internal, admitted-gap.
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
    // Friendly pre-check; the partial unique center_shifts_one_open_per_staff
    // is what actually guarantees it under concurrency.
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

/** The live (or frozen) picture of one shift. For a CLOSED shift the stored
 *  cash figures are returned as stored — frozen at close, never recomputed. */
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
      // Live expectation while open; the FROZEN figure once closed.
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
    // Serialize against a concurrent close AND against money writers stamping
    // this shift: the row lock makes "the payments of this shift" a closed set
    // for the rest of the transaction... for writers that would stamp AFTER us
    // the stamp lookup happens in their own tx; they will find the shift no
    // longer open and stamp NULL. A double close is refused, not merged.
    const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status::text FROM center_shifts WHERE id = ${shiftId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError("Shift not found");
    const shift = await tx.centerShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.centerId !== centerId) throw new NotFoundError("Shift not found");
    if (shift.status === "closed") throw new BusinessRuleError("This shift is already closed");
    // Only the drawer's owner — or a center_admin owner account — closes it.
    // (user.id is the staff member's own id under the center-actor shape.)
    // A manager closing a colleague's drawer is deliberately NOT supported in
    // this phase: the count is the counter's own attestation.
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

/** The recorder's own open shift, if any — what the counter card renders. */
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

/**
 * The reconciliation list — THE function both the screen and the CSV export
 * run (report-export invariant: an export that re-derives its own totals is a
 * second set of books).
 */
export async function listShiftReconciliation(
  user: SessionUser,
  opts: { from?: string; to?: string; take?: number } = {},
) {
  const centerId = centerIdOf(user);
  const take = Math.min(200, Math.max(1, opts.take ?? 100));
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
