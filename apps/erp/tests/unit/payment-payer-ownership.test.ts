// WHOEVER PAID OWNS THE RECEIPT.
//
// A parent wallet top-up writes a Payment row with a NULL `student_id`. Every
// read on that table authorized through the student — so without this rule a
// parent could fund a top-up and then be refused the receipt for their own
// money, which is the exact failure the feature exists to fix.
//
// The rule is the one `getIntentForStudent` already applies to intents
// ("ownership = who is PAYING it"), extended to the row the settlement writes.
// The danger in extending it is that `payer_user_id` is ALSO set when a parent
// funds a child's lesson — so these pin that it grants a payer their own
// receipt and NOT a wider view of the child.
import { describe, expect, it, vi, beforeEach } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { payment: null as any, link: null as any, paymentWhere: null as any },
}));

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
    fn({
      payment: {
        findUnique: async () => state.payment,
        findMany: async ({ where }: any) => {
          state.paymentWhere = where;
          return [];
        },
      },
      parentStudentLink: { findFirst: async () => state.link },
      user: { findMany: async () => [] },
      course: { findMany: async () => [] },
      studentProfile: { findMany: async () => [] },
    }),
  platformDb: vi.fn(),
}));

const { getPayment, listPayments } = await import(
  "@repo/server-core/services/payments/payments"
);

const PARENT = { id: "parent-1", role: "parent" } as any;
const OTHER_PARENT = { id: "parent-2", role: "parent" } as any;
const STUDENT = { id: "student-1", role: "student" } as any;
const OWNER = { id: "owner-1", role: "center_admin", centerId: "center-1" } as any;

/** The row a parent top-up settlement writes. */
const TOPUP = {
  id: "payment-1",
  centerId: null,
  studentId: null,
  payerUserId: "parent-1",
  courseId: null,
  amount: 20_000,
  receiptNumber: "RCP-EDURA-2026-00042",
};

/** An ordinary center receipt for a child. */
const CHILD_FEE = {
  id: "payment-2",
  centerId: "center-1",
  studentId: "student-1",
  payerUserId: null,
  courseId: "course-1",
  amount: 30_000,
  receiptNumber: "RCP-NILE-2026-00007",
};

beforeEach(() => {
  state.payment = null;
  state.link = null;
  state.paymentWhere = null;
});

describe("getPayment — the payer can read the receipt they funded", () => {
  it("the parent who paid gets their top-up receipt", async () => {
    state.payment = TOPUP;
    await expect(getPayment("payment-1", PARENT)).resolves.toMatchObject({
      receiptNumber: "RCP-EDURA-2026-00042",
    });
  });

  it("a DIFFERENT parent is refused it", async () => {
    state.payment = TOPUP;
    state.link = null;
    await expect(getPayment("payment-1", OTHER_PARENT)).rejects.toThrow();
  });

  it("a studentless receipt is refused to a parent even WITH an approved link", async () => {
    // The link is to some child; it says nothing about this row, which belongs
    // to another parent. Refused deliberately, not by the accident of querying
    // `studentId: null` and matching nothing.
    state.payment = TOPUP;
    state.link = { id: "link-1" };
    await expect(getPayment("payment-1", OTHER_PARENT)).rejects.toThrow();
  });

  it("a student is refused someone else's top-up", async () => {
    state.payment = TOPUP;
    await expect(getPayment("payment-1", STUDENT)).rejects.toThrow();
  });

  it("a center owner is refused it — it is not their center's money", async () => {
    // centerId is NULL and never equals a real center id.
    state.payment = TOPUP;
    await expect(getPayment("payment-1", OWNER)).rejects.toThrow();
  });
});

describe("getPayment — the pre-existing rules are unchanged", () => {
  it("a linked parent still reads their child's centre receipt", async () => {
    state.payment = CHILD_FEE;
    state.link = { id: "link-1" };
    await expect(getPayment("payment-2", PARENT)).resolves.toMatchObject({ id: "payment-2" });
  });

  it("an UNlinked parent is still refused it", async () => {
    state.payment = CHILD_FEE;
    state.link = null;
    await expect(getPayment("payment-2", PARENT)).rejects.toThrow();
  });

  it("the student it belongs to still reads it", async () => {
    state.payment = CHILD_FEE;
    await expect(getPayment("payment-2", STUDENT)).resolves.toMatchObject({ id: "payment-2" });
  });

  it("a different student is still refused", async () => {
    state.payment = CHILD_FEE;
    await expect(
      getPayment("payment-2", { id: "student-9", role: "student" } as any),
    ).rejects.toThrow();
  });

  it("the owning center still reads it; another center does not", async () => {
    state.payment = CHILD_FEE;
    await expect(getPayment("payment-2", OWNER)).resolves.toMatchObject({ id: "payment-2" });
    await expect(
      getPayment("payment-2", { id: "o2", role: "center_admin", centerId: "center-9" } as any),
    ).rejects.toThrow();
  });
});

describe("listPayments — a parent with no studentId reads their OWN receipts", () => {
  it("it scopes to payer_user_id, not to any child", async () => {
    await listPayments({}, PARENT);
    expect(state.paymentWhere).toMatchObject({ payerUserId: "parent-1" });
    expect(state.paymentWhere).not.toHaveProperty("studentId");
  });

  it("NO WIDENING: it grants nothing about a child", async () => {
    // A child's own payments carry a NULL payer (or someone else's id), so this
    // filter cannot reach them. Reading a child still requires the link check.
    await listPayments({}, PARENT);
    const where = state.paymentWhere;
    expect(Object.keys(where).sort()).toEqual(["payerUserId"]);
  });

  it("naming a linked child still narrows to that child, as before", async () => {
    state.link = { id: "link-1" };
    await listPayments({ studentId: "student-1" }, PARENT);
    expect(state.paymentWhere.studentId).toBe("student-1");
    expect(state.paymentWhere).not.toHaveProperty("payerUserId");
  });

  it("naming an UNlinked child is still refused, and runs no query", async () => {
    state.link = null;
    await expect(listPayments({ studentId: "not-mine" }, PARENT)).rejects.toThrow();
    expect(state.paymentWhere).toBeNull();
  });

  it("a date range still applies to the parent's own receipts", async () => {
    await listPayments({ from: "2026-08-01", to: "2026-08-31" }, PARENT);
    expect(state.paymentWhere.paidAt).toEqual({
      gte: new Date("2026-07-31T21:00:00.000Z"),
      lte: new Date("2026-08-31T20:59:59.999Z"),
    });
  });
});
