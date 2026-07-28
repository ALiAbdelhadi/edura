import { type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import type { WalletEntryType, WalletMethod } from "./wallet";

// ---------------------------------------------------------------------------
// Parent Wallet — money-movement primitives.
//
// The deliberate MIRROR of ./wallet.ts, owned by a PARENT instead of a student,
// so a guardian can pay for their own child's lesson out of their own money.
// Same invariants, same shapes, same failure modes: the append-only
// ParentWalletLedger is the source of truth, ParentProfile.walletBalance is the
// reconciled cache, every movement writes ONE ledger row AND updates the cache
// in the caller's SAME transaction, and debits are all-or-nothing via the H2
// conditional decrement + the DB CHECK (wallet_balance >= 0) floor.
//
// WHAT THIS IS NOT: a second money direction. A parent-funded subscription still
// moves student -> center/teacher in the Transaction ledger, exactly as a
// self-funded one does, so every split, statement, payout and distribution is
// untouched. This records only the FUNDING leg — plus which child it was for.
// ---------------------------------------------------------------------------

export const INSUFFICIENT_PARENT_WALLET =
  "Insufficient wallet balance — top up or pay by card";

export type ParentWalletMovementOpts = {
  type: WalletEntryType;
  /** Which child a spend was for. NULL on top-ups — money in is for no one child. */
  beneficiaryStudentId?: string | null;
  method?: WalletMethod | null;
  refNumber?: string | null;
  paymentId?: string | null;
  paymentIntentId?: string | null;
  subscriptionId?: string | null;
  relatedTxnId?: string | null;
  reason?: string | null;
  recordedBy?: string | null;
};

function ledgerLinks(o: ParentWalletMovementOpts) {
  return {
    type: o.type,
    beneficiaryStudentId: o.beneficiaryStudentId ?? null,
    method: o.method ?? null,
    refNumber: o.refNumber ?? null,
    paymentId: o.paymentId ?? null,
    paymentIntentId: o.paymentIntentId ?? null,
    subscriptionId: o.subscriptionId ?? null,
    relatedTxnId: o.relatedTxnId ?? null,
    reason: o.reason ?? null,
    recordedBy: o.recordedBy ?? null,
  };
}

/**
 * Credit the parent's wallet: increment the cached balance (returns the running
 * balanceAfter) + append ONE ledger row, in the caller's tx. A pure primitive —
 * top-up bound checks live at the entry points, so money that was already paid
 * always lands.
 */
export async function parentWalletCredit(
  tx: TenantTx,
  parentId: string,
  amount: number,
  opts: ParentWalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Wallet credit amount must be a positive integer");
  }
  const updated = await tx.parentProfile.update({
    where: { userId: parentId },
    data: { walletBalance: { increment: amount } },
    select: { walletBalance: true },
  });
  const balanceAfter = updated.walletBalance;
  await tx.parentWalletLedger.create({
    data: { parentId, delta: amount, balanceAfter, ...ledgerLinks(opts) },
  });
  return { balanceAfter };
}

/**
 * Debit the parent's wallet ALL-OR-NOTHING. The H2 conditional decrement
 * (updateMany WHERE wallet_balance >= amount) either takes the FULL amount or
 * matches zero rows — never a partial debit. count===0 => insufficient => throw
 * (the caller's tx rolls back, so nothing is charged and no subscription is
 * created). The DB CHECK (>= 0) is the backstop.
 */
export async function parentWalletDebit(
  tx: TenantTx,
  parentId: string,
  amount: number,
  opts: ParentWalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Wallet debit amount must be a positive integer");
  }
  const debited = await tx.parentProfile.updateMany({
    where: { userId: parentId, walletBalance: { gte: amount } },
    data: { walletBalance: { decrement: amount } },
  });
  if (debited.count === 0) {
    throw new BusinessRuleError(INSUFFICIENT_PARENT_WALLET);
  }
  const p = await tx.parentProfile.findUnique({
    where: { userId: parentId },
    select: { walletBalance: true },
  });
  const balanceAfter = p?.walletBalance ?? 0;
  await tx.parentWalletLedger.create({
    data: { parentId, delta: -amount, balanceAfter, ...ledgerLinks(opts) },
  });
  return { balanceAfter };
}

/**
 * Reconcile the cached balance against the ledger — the same drift check the
 * student wallet's money-safety story rests on: cached == SUM(delta) == last
 * balanceAfter.
 */
export async function reconcileParentWallet(tx: TenantTx, parentId: string) {
  const profile = await tx.parentProfile.findUnique({
    where: { userId: parentId },
    select: { walletBalance: true },
  });
  const agg = await tx.parentWalletLedger.aggregate({
    where: { parentId },
    _sum: { delta: true },
  });
  const last = await tx.parentWalletLedger.findFirst({
    where: { parentId },
    orderBy: { createdAt: "desc" },
    select: { balanceAfter: true },
  });
  const cached = profile?.walletBalance ?? 0;
  const ledgerSum = agg._sum.delta ?? 0;
  const lastBalanceAfter = last?.balanceAfter ?? 0;
  return {
    cached,
    ledgerSum,
    lastBalanceAfter,
    ok: cached === ledgerSum && cached === lastBalanceAfter,
  };
}

// ---------------------------------------------------------------------------
// The relationship gate — the ONE place "is this my child?" is decided
// ---------------------------------------------------------------------------

/**
 * A parent may only ever act for a child they hold an APPROVED link to.
 * `pending`, `rejected` and `revoked` all fail — approval is the whole point of
 * the link, and a revoked one must stop working immediately.
 *
 * Every parent money path calls this; there is deliberately no second
 * implementation to drift from it. Mirrors the inline checks the read-only
 * parent endpoints already do (grades, attendance, payments), promoted to a
 * named function because money is now on the other side of it.
 */
export async function assertApprovedChild(
  tx: TenantTx,
  parentId: string,
  studentId: string,
): Promise<void> {
  const link = await tx.parentStudentLink.findFirst({
    where: { parentId, studentId, status: "approved" },
    select: { id: true },
  });
  if (!link) {
    throw new ForbiddenError("Not an approved child of this parent");
  }
}

/** Approved children of a parent — the id list every parent scope narrows to. */
export async function approvedChildIds(
  tx: TenantTx,
  parentId: string,
): Promise<string[]> {
  const links = await tx.parentStudentLink.findMany({
    where: { parentId, status: "approved" },
    select: { studentId: true },
  });
  return links.map((l) => l.studentId);
}
