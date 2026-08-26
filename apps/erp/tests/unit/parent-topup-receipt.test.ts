// PARENT_IA_AUDIT.md §7.1 finding 4 — a card top-up produced no receipt.
//
// Worse than "no receipt": the settler already MINTED a receipt number and put
// it in the notification, so a parent read "Receipt RCP-EDURA-2026-00042 has
// been issued" while `sendPaymentReceiptEmail` looked it up, found no `payments`
// row and returned `no_payment_row`. A number to quote at a counter, and nothing
// for the counter to match it against.
//
// The student online top-up had written a Payment row since it was built. The
// parent path was the odd one out, and docs/decisions/parent-pays-lesson.md §5
// was the reason — reversed by Ali on 2026-08-20.
//
// THE RISK IN THIS CHANGE IS NOT THE RECEIPT, IT IS THE MONEY. A Payment row is
// what every center revenue read counts. So most of what follows asserts that
// the row is INVISIBLE to all of them, and that the ledger is unchanged.
import { describe, expect, it, vi, beforeEach } from "vitest";

const { created } = vi.hoisted(() => ({
  created: {
    payments: [] as any[],
    transactions: [] as any[],
    ledger: [] as any[],
    intentUpdates: [] as any[],
  },
}));

vi.mock("@repo/server-core/services/wallet/parent-wallet", () => ({
  parentWalletCredit: async (_tx: any, parentId: string, amount: number, opts: any) => {
    created.ledger.push({ parentId, amount, ...opts });
    return { balanceAfter: 50_000 };
  },
  parentWalletDebit: vi.fn(),
  reconcileParentWallet: vi.fn(),
  assertApprovedChild: vi.fn(),
  approvedChildIds: vi.fn(),
  INSUFFICIENT_PARENT_WALLET: "insufficient",
}));
vi.mock("@repo/server-core/services/wallet/wallet", () => ({
  getWalletSettings: vi.fn(),
  assertTopupAllowed: vi.fn(),
}));
vi.mock("@/lib/services/payments/gateway", () => ({ resolveDriver: vi.fn() }));
vi.mock("@/lib/services/finance/ref-numbers", () => ({ nextTxnRef: async () => "TXN-000123" }));
vi.mock("@/lib/db/scope", () => ({ platformDb: vi.fn() }));

const { settleParentWalletTopUpFromIntentTx } = await import(
  "@/lib/services/wallet/parent-wallet"
);

const INTENT = {
  id: "intent-1",
  payerUserId: "parent-1",
  amount: 20_000, // 200 EGP in piasters
  gateway: "mock",
  method: "card",
  purpose: "parent_wallet_topup",
  gatewayRef: "gw-1",
};

function fakeTx() {
  return {
    paymentIntent: {
      findUnique: async () => INTENT,
      update: async ({ data }: any) => {
        created.intentUpdates.push(data);
        return {};
      },
    },
    payment: {
      create: async ({ data }: any) => {
        created.payments.push(data);
        return { id: "payment-1", ...data };
      },
    },
    transaction: {
      create: async ({ data }: any) => {
        created.transactions.push(data);
        return { id: "txn-1", ...data };
      },
    },
    $queryRaw: async () => [{ nextval: 42n }],
  } as any;
}

beforeEach(() => {
  created.payments = [];
  created.transactions = [];
  created.ledger = [];
  created.intentUpdates = [];
});

async function settle() {
  return settleParentWalletTopUpFromIntentTx(fakeTx(), "intent-1", { gatewayRef: "gw-1" });
}

describe("parent wallet top-up — the receipt is real", () => {
  it("exactly ONE Payment row is written", async () => {
    await settle();
    expect(created.payments).toHaveLength(1);
  });

  it("it carries the receipt number the parent is told about", async () => {
    const note = await settle();
    expect(created.payments[0].receiptNumber).toBe("RCP-EDURA-2026-00042");
    expect(note.data.receiptNumber).toBe("RCP-EDURA-2026-00042");
    expect(note.body).toContain("RCP-EDURA-2026-00042");
  });

  it("the notification carries the paymentId a receipt link needs", async () => {
    // The half that was missing: a receipt number with nothing to open.
    const note = await settle();
    expect(note.data.paymentId).toBe("payment-1");
  });

  it("the amount is the INTENT's snapshot, never a client figure", async () => {
    await settle();
    expect(created.payments[0].amount).toBe(20_000);
  });

  it("the payer owns it, and is who recorded it (self-service)", async () => {
    await settle();
    expect(created.payments[0].payerUserId).toBe("parent-1");
    expect(created.payments[0].recordedBy).toBe("parent-1");
  });
});

describe("parent wallet top-up — it is INVISIBLE to every center money read", () => {
  it("centerId is NULL, so no center's revenue, P&L or payout counts it", async () => {
    await settle();
    // Every center-scoped read keys on center_id: paymentWhereBase(centerId),
    // listPayments for a center_admin, getRevenueReport, getAdminDashboard.
    expect(created.payments[0].centerId).toBeNull();
  });

  it("courseId is NULL, so it buys no lesson and enters no course breakdown", async () => {
    await settle();
    expect(created.payments[0].courseId).toBeNull();
  });

  it("studentId is NULL — no child's fee history gains a payment they did not make", async () => {
    await settle();
    expect(created.payments[0].studentId).toBeNull();
  });

  it("the row matches the shape the DB CHECK permits, and only that shape", async () => {
    // payments_student_required:
    //   student_id IS NOT NULL
    //   OR (payer_user_id IS NOT NULL AND center_id IS NULL AND course_id IS NULL)
    await settle();
    const p = created.payments[0];
    const permitted =
      p.studentId !== null ||
      (p.payerUserId !== null && p.centerId === null && p.courseId === null);
    expect(permitted).toBe(true);
  });
});

describe("parent wallet top-up — the money model is untouched", () => {
  it("the Transaction still records the float direction it always did", async () => {
    await settle();
    const t = created.transactions[0];
    expect(t.fromEntityId).toBe("parent-1");
    expect(t.toEntityId).toBeNull(); // platform float, NOT center/teacher revenue
    expect(t.centerId).toBeNull();
    expect(t.type).toBe("payment");
    expect(t.amount).toBe(20_000);
  });

  it("exactly one wallet credit, for the intent's amount", async () => {
    await settle();
    expect(created.ledger).toHaveLength(1);
    expect(created.ledger[0]).toMatchObject({
      parentId: "parent-1",
      amount: 20_000,
      type: "topup",
      method: "online_paymob",
    });
  });

  it("the ledger row now links to the receipt — the point of the change", async () => {
    await settle();
    expect(created.ledger[0].paymentId).toBe("payment-1");
    expect(created.ledger[0].relatedTxnId).toBe("txn-1");
    expect(created.ledger[0].paymentIntentId).toBe("intent-1");
  });

  it("the intent records BOTH the payment and the transaction", async () => {
    await settle();
    expect(created.intentUpdates.at(-1)).toEqual({
      paymentId: "payment-1",
      transactionId: "txn-1",
    });
  });

  it("the notification still addresses the parent alone — no child is involved", async () => {
    const note = await settle();
    expect(note.recipients).toEqual(["parent-1"]);
    expect(note.studentId).toBe("parent-1");
  });
});

describe("parent wallet top-up — it still refuses a malformed intent", () => {
  it("an intent with no payer settles nothing", async () => {
    const tx = fakeTx();
    tx.paymentIntent.findUnique = async () => ({ ...INTENT, payerUserId: null });

    await expect(
      settleParentWalletTopUpFromIntentTx(tx, "intent-1", { gatewayRef: null }),
    ).rejects.toThrow();
    expect(created.payments).toHaveLength(0);
    expect(created.ledger).toHaveLength(0);
  });

  it("a vanished intent settles nothing", async () => {
    const tx = fakeTx();
    tx.paymentIntent.findUnique = async () => null;

    await expect(
      settleParentWalletTopUpFromIntentTx(tx, "intent-1", { gatewayRef: null }),
    ).rejects.toThrow();
    expect(created.payments).toHaveLength(0);
  });
});
