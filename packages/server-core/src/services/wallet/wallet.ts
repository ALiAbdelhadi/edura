import { type TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

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

export async function walletDebit(
  tx: TenantTx,
  studentId: string,
  amount: number,
  opts: WalletMovementOpts,
): Promise<{ balanceAfter: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BusinessRuleError("Wallet debit amount must be a positive integer");
  }
  // L-01 (SECURITY_AUDIT.md): the running balance comes back from the SAME
  // statement that decrements — the H2 conditional floor and RETURNING in one
  // round trip. Reading it back afterwards let two concurrent debits record the
  // same balanceAfter, and reconcileWallet's "last balanceAfter" check drifted.
  const rows = await tx.$queryRaw<{ wallet_balance: number }[]>`
    UPDATE student_profiles
       SET wallet_balance = wallet_balance - ${amount}
     WHERE user_id = ${studentId}::uuid AND wallet_balance >= ${amount}
    RETURNING wallet_balance`;
  if (rows.length === 0) {
    throw new BusinessRuleError(INSUFFICIENT_WALLET);
  }
  const balanceAfter = rows[0]!.wallet_balance;
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
