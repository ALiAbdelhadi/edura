import { describe, expect, it } from "vitest";
import { EMPTY_TAKINGS, takingsOf } from "@/features/admin/takings";

/**
 * `takingsOf` is the single derivation behind «اتحصّل النهاردة» and anything
 * that later sums the same rows. `payments.amount` is SIGNED — the table has no
 * `type` column and the schema comment says positive is a payment, negative a
 * refund — so getting the sign convention wrong here would understate or
 * overstate a money figure on the owner's first screen.
 */
describe("takingsOf", () => {
  it("returns zeroes for no rows", () => {
    expect(takingsOf([])).toEqual(EMPTY_TAKINGS);
  });

  it("sums receipts and counts them", () => {
    const t = takingsOf([{ amount: 7500 }, { amount: 12000 }]);
    expect(t.received).toBe(19500);
    expect(t.net).toBe(19500);
    expect(t.receipts).toBe(2);
    expect(t.refunds).toBe(0);
    expect(t.refunded).toBe(0);
  });

  it("SUBTRACTS refunds from the net and reports them positive", () => {
    const t = takingsOf([{ amount: 10000 }, { amount: -2500 }]);
    expect(t.received).toBe(10000);
    // The refunded figure is positive so a caller can render its own sign;
    // rendering a negative of a negative is how a refund shows up as income.
    expect(t.refunded).toBe(2500);
    expect(t.net).toBe(7500);
    expect(t.receipts).toBe(1);
    expect(t.refunds).toBe(1);
  });

  it("can go negative on a day that refunded more than it took", () => {
    const t = takingsOf([{ amount: 1000 }, { amount: -4000 }]);
    expect(t.net).toBe(-3000);
    // Deliberately NOT clamped at zero. The parent portal's «الرسوم المستحقة»
    // used Math.max(…, 0) and that is exactly what hid its broken arithmetic
    // (CENTER_IA_AUDIT reconciliation; PARENT_IA_AUDIT §3.5). A day that really
    // did refund more than it took must be able to say so.
  });

  it("ignores zero and unusable amounts rather than counting them as receipts", () => {
    const t = takingsOf([
      { amount: 0 },
      { amount: null },
      { amount: undefined },
      { amount: Number.NaN },
      { amount: 500 },
    ]);
    expect(t.receipts).toBe(1);
    expect(t.refunds).toBe(0);
    expect(t.net).toBe(500);
  });

  it("does not mutate EMPTY_TAKINGS between calls", () => {
    takingsOf([{ amount: 999 }]);
    expect(EMPTY_TAKINGS).toEqual({
      net: 0,
      received: 0,
      refunded: 0,
      receipts: 0,
      refunds: 0,
    });
  });
});
