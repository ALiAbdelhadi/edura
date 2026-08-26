import type { TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

// ===========================================================================
// CENTER CREDIT (Phase 4, D4/D5) — the clearing side of the money engine.
//
// `centers.wallet_balance` keeps exactly its pre-Phase-4 meaning: PLATFORM-
// HELD money owed to the center (H2 CHECK untouched, payouts unchanged).
// `centers.credit_balance` is the center<->platform POSITION: top-ups credit
// it, center-held settlement obligations debit it, and it may go NEGATIVE —
// arrears the platform can see and chase. Refusing the debit would mean
// refusing to settle a lesson that already happened, which is why there is
// deliberately no floor.
//
// Every move goes through `creditMove` so the column and its ledger can never
// disagree: the balance is updated atomically and the ledger row snapshots
// the RETURNING value in the same transaction.
// ===========================================================================

export type FundingSource = "platform_held" | "center_held";

/** Coverage methods the PLATFORM physically holds the money for. Everything
 *  else — the counter channels, or no coverage at all — is center-held: the
 *  safe default, because it can never make the platform pay out money it does
 *  not hold. (`wallet` is platform-held BECAUSE cash wallet top-ups debit the
 *  collecting center's credit at top-up time — see wallet_cash_collection.) */
const PLATFORM_HELD_METHODS = new Set(["online_paymob", "online_fawry", "wallet"]);

export function fundingOfMethod(method: string | null | undefined): FundingSource {
  return method && PLATFORM_HELD_METHODS.has(method) ? "platform_held" : "center_held";
}

/**
 * WHO HOLDS EACH PRESENT STUDENT'S MONEY. Coverage is always a subscription
 * (`coveredStudentIds` reads nothing else) and every subscription records its
 * `paymentMethod` at activation — so the answer is a lookup, not a guess.
 * Selection mirrors the coverage rule: a per-session pass for THIS lesson
 * first, else a monthly window containing its date. A student with no live
 * coverage resolves center-held.
 */
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
  /** Signed piasters. Positive credits the center's position, negative debits it. */
  delta: number;
  method?: string | null;
  refNumber?: string | null;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  relatedTxnId?: string | null;
  reason?: string | null;
  recordedBy?: string | null;
};

/** THE single writer of `credit_balance`: atomic update + ledger row with the
 *  running balance, one transaction, so the two can never drift. */
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
