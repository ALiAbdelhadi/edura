import { type TenantTx } from "../../db/scope";
import { BusinessRuleError, ForbiddenError } from "../../errors/classes";
import type { WalletEntryType, WalletMethod } from "./wallet";

export const INSUFFICIENT_PARENT_WALLET =
  "Insufficient wallet balance — top up or pay by card";

export type ParentWalletMovementOpts = {
  type: WalletEntryType;
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

export async function parentWalletDebit(
  tx: TenantTx,
  parentId: string,
  amount: number,
  opts: ParentWalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Wallet debit amount must be a positive integer");
  }
  // L-01: decrement and read the running balance in one statement (see wallet.ts).
  const rows = await tx.$queryRaw<{ wallet_balance: number }[]>`
    UPDATE parent_profiles
       SET wallet_balance = wallet_balance - ${amount}
     WHERE user_id = ${parentId}::uuid AND wallet_balance >= ${amount}
    RETURNING wallet_balance`;
  if (rows.length === 0) {
    throw new BusinessRuleError(INSUFFICIENT_PARENT_WALLET);
  }
  const balanceAfter = rows[0]!.wallet_balance;
  await tx.parentWalletLedger.create({
    data: { parentId, delta: -amount, balanceAfter, ...ledgerLinks(opts) },
  });
  return { balanceAfter };
}

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
