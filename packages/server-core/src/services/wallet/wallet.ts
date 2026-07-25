import { type TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

// ---------------------------------------------------------------------------
// Student Wallet — money-movement primitives.
//
// The append-only WalletLedger is the source of truth; StudentProfile.
// walletBalance is the reconciled cache. Every movement writes ONE ledger row
// (signed delta + running balanceAfter) AND updates the cache in the caller's
// SAME transaction — the awardPoints pattern. Debits are all-or-nothing via the
// H2 conditional decrement + the DB CHECK (wallet_balance >= 0) floor.
// ---------------------------------------------------------------------------

export type WalletEntryType = "topup" | "payment" | "refund" | "adjustment";
export type WalletMethod = "cash" | "online_paymob" | "online_fawry" | "wallet";

export const INSUFFICIENT_WALLET =
  "Insufficient wallet balance — top up or pay another way";

export type WalletMovementOpts = {
  type: WalletEntryType;
  method?: WalletMethod | null;
  refNumber?: string | null;
  paymentId?: string | null;
  paymentIntentId?: string | null;
  subscriptionId?: string | null;
  relatedTxnId?: string | null;
  centerId?: string | null; // crediting center for cash top-ups (audit)
  reason?: string | null;
  recordedBy?: string | null; // staff/actor who credited (audit)
};

function ledgerLinks(o: WalletMovementOpts) {
  return {
    type: o.type,
    method: o.method ?? null,
    refNumber: o.refNumber ?? null,
    paymentId: o.paymentId ?? null,
    paymentIntentId: o.paymentIntentId ?? null,
    subscriptionId: o.subscriptionId ?? null,
    relatedTxnId: o.relatedTxnId ?? null,
    centerId: o.centerId ?? null,
    reason: o.reason ?? null,
    recordedBy: o.recordedBy ?? null,
  };
}

/**
 * Credit the wallet: increment the cached balance (returns the running
 * balanceAfter) + append ONE ledger row, in the caller's tx. A pure primitive —
 * balance-cap enforcement lives at the top-up entry points, so money that was
 * already paid/refunded always lands.
 */
export async function walletCredit(
  tx: TenantTx,
  studentId: string,
  amount: number,
  opts: WalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Wallet credit amount must be a positive integer");
  }
  const updated = await tx.studentProfile.update({
    where: { userId: studentId },
    data: { walletBalance: { increment: amount } },
    select: { walletBalance: true },
  });
  const balanceAfter = updated.walletBalance;
  await tx.walletLedger.create({
    data: { studentId, delta: amount, balanceAfter, ...ledgerLinks(opts) },
  });
  return { balanceAfter };
}

/**
 * Debit the wallet ALL-OR-NOTHING. The H2 conditional decrement
 * (updateMany WHERE wallet_balance >= amount) either takes the FULL amount or
 * matches zero rows — never a partial debit. count===0 => insufficient => throw
 * (the caller's tx rolls back, so nothing is charged). Then append ONE ledger
 * row with the post-decrement running balance. The DB CHECK (>= 0) is the
 * backstop. Two concurrent debits: the first locks + decrements; the second
 * re-evaluates the predicate after commit and fails cleanly.
 */
export async function walletDebit(
  tx: TenantTx,
  studentId: string,
  amount: number,
  opts: WalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Wallet debit amount must be a positive integer");
  }
  const debited = await tx.studentProfile.updateMany({
    where: { userId: studentId, walletBalance: { gte: amount } },
    data: { walletBalance: { decrement: amount } },
  });
  if (debited.count === 0) {
    throw new BusinessRuleError(INSUFFICIENT_WALLET);
  }
  const p = await tx.studentProfile.findUnique({
    where: { userId: studentId },
    select: { walletBalance: true },
  });
  const balanceAfter = p?.walletBalance ?? 0;
  await tx.walletLedger.create({
    data: { studentId, delta: -amount, balanceAfter, ...ledgerLinks(opts) },
  });
  return { balanceAfter };
}

export type WalletSettings = {
  minTopup: number;
  maxTopup: number;
};

export async function getWalletSettings(tx: TenantTx): Promise<WalletSettings> {
  const row = await tx.walletSettings.findFirst();
  return {
    minTopup: row?.minTopup ?? 1000,
    maxTopup: row?.maxTopup ?? 500000,
  };
}

/**
 * Validate a requested top-up amount against policy. Throws a clear
 * BusinessRuleError; used BEFORE any money is taken. There is NO wallet balance
 * cap — a student may hold any balance (removed 2026-07-23); only the
 * per-transaction min/max bounds apply.
 */
export async function assertTopupAllowed(
  tx: TenantTx,
  _studentId: string,
  amount: number,
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Top-up amount must be a positive amount");
  }
  const settings = await getWalletSettings(tx);
  if (amount < settings.minTopup) {
    throw new BusinessRuleError(
      `Minimum top-up is ${(settings.minTopup / 100).toFixed(2)} EGP`,
    );
  }
  if (amount > settings.maxTopup) {
    throw new BusinessRuleError(
      `Maximum top-up is ${(settings.maxTopup / 100).toFixed(2)} EGP`,
    );
  }
}

/**
 * Reconcile the cached balance against the ledger — the drift check the money
 * safety story depends on: cached == SUM(delta) == last balanceAfter.
 */
export async function reconcileWallet(tx: TenantTx, studentId: string) {
  const profile = await tx.studentProfile.findUnique({
    where: { userId: studentId },
    select: { walletBalance: true },
  });
  const agg = await tx.walletLedger.aggregate({
    where: { studentId },
    _sum: { delta: true },
  });
  const last = await tx.walletLedger.findFirst({
    where: { studentId },
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
