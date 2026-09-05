// SECURITY_AUDIT.md L-02 — resolveLessonPrice floors; a full run never
// distributes more than the course was sold for.
import { describe, expect, it } from "vitest";
import { resolveLessonPrice } from "@repo/server-core/services/finance/fees";

describe("L-02 — per-lesson price never rounds up", () => {
  it("floors the amortised course price", () => {
    expect(resolveLessonPrice({ price: 10000 }, 3)).toBe(3333);
    expect(resolveLessonPrice({ price: 10001 }, 2)).toBe(5000);
    expect(resolveLessonPrice({ price: 99999 }, 7)).toBe(14285);
  });
  it("Σ over the planned sessions is ≤ price and short by fewer than n piasters", () => {
    for (const [price, n] of [[10000, 3], [45000, 7], [99999, 13], [100, 3]] as const) {
      const per = resolveLessonPrice({ price }, n);
      expect(per * n).toBeLessThanOrEqual(price);
      expect(price - per * n).toBeLessThan(n);
    }
  });
  it("session_price basis and the no-sessions fallback are unchanged", () => {
    expect(resolveLessonPrice({ price: 10000, pricePerSession: 4000, settlementBasis: "session_price" }, 3)).toBe(4000);
    expect(resolveLessonPrice({ price: 10000 }, 0)).toBe(10000);
  });
});
