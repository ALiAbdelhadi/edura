import type { TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

export type FundingSource = "platform_held" | "center_held";

const PLATFORM_HELD_METHODS = new Set(["online_paymob", "online_fawry", "wallet"]);

export function fundingOfMethod(method: string | null | undefined): FundingSource {
  return method && PLATFORM_HELD_METHODS.has(method) ? "platform_held" : "center_held";
}

export async function resolveFundingLegs(
  tx: TenantTx,
  args: { courseId: string; sessionId: string; sessionDate: Date; studentIds: string[] },
): Promise<Map<string, FundingSource>> {
  const out = new Map<string, FundingSource>();
  if (args.studentIds.length === 0) return out;
  const subs = await tx.subscription.findMany({
    where: {
      studentId: { in: args.studentIds },
      status: "active",
      OR: [
        { plan: "per_session", sessionId: args.sessionId },
        {
          plan: "monthly",
          courseId: args.courseId,
          periodStart: { lte: args.sessionDate },
          periodEnd: { gte: args.sessionDate },
        },
      ],
    },
    select: { studentId: true, plan: true, sessionId: true, paymentMethod: true },
  });
  for (const id of args.studentIds) {
    const mine = subs.filter((s) => s.studentId === id);
    const pick =
      mine.find((s) => s.plan === "per_session" && s.sessionId === args.sessionId) ??
      mine.find((s) => s.plan === "monthly");
    out.set(id, fundingOfMethod(pick?.paymentMethod));
  }
  return out;
}

export type CreditMoveInput = {
  centerId: string;
  type:
    | "topup"
    | "teacher_debit"
    | "commission_debit"
    | "wallet_cash_collection"
    | "refund_reversal"
    | "adjustment";
  delta: number;
  method?: string | null;
  refNumber?: string | null;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  relatedTxnId?: string | null;
  reason?: string | null;
  recordedBy?: string | null;
};

export async function creditMove(tx: TenantTx, input: CreditMoveInput) {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new BusinessRuleError("Credit move must be a non-zero whole number of piasters");
  }
  const rows = await tx.$queryRaw<{ credit_balance: number }[]>`
    UPDATE centers SET credit_balance = credit_balance + ${input.delta}
    WHERE id = ${input.centerId}::uuid
    RETURNING credit_balance`;
  if (rows.length === 0) throw new BusinessRuleError("Center not found for credit move");
  const balanceAfter = rows[0].credit_balance;
  const entry = await tx.centerWalletLedger.create({
    data: {
      centerId: input.centerId,
      type: input.type,
      delta: input.delta,
      balanceAfter,
      method: (input.method ?? null) as never,
      refNumber: input.refNumber ?? null,
      paymentIntentId: input.paymentIntentId ?? null,
      sessionId: input.sessionId ?? null,
      relatedTxnId: input.relatedTxnId ?? null,
      reason: input.reason ?? null,
      recordedBy: input.recordedBy ?? null,
    },
  });
  return { balanceAfter, entry };
}
