import { describe, expect, it, vi, beforeEach } from "vitest";
import { todayKey } from "@repo/server-core/lib/date-key";

const { capturedWhere } = vi.hoisted(() => ({ capturedWhere: { value: null as any } }));

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: async (_user: unknown, fn: (tx: any) => Promise<unknown>) => {
    const tx = {
      payment: {
        findMany: async ({ where }: { where: unknown }) => {
          capturedWhere.value = where;
          return [];
        },
      },
      user: { findMany: async () => [] },
      course: { findMany: async () => [] },
      studentProfile: { findMany: async () => [] },
      parentStudentLink: { findFirst: async () => ({ id: "link-1" }) },
    };
    return fn(tx);
  },
  platformDb: vi.fn(),
}));

const { listPayments } = await import("@repo/server-core/services/payments/payments");

const OWNER = { id: "owner-1", role: "center_admin", centerId: "center-1" } as any;

async function whereFor(filters: { from?: string; to?: string }) {
  capturedWhere.value = null;
  await listPayments(filters, OWNER);
  return capturedWhere.value;
}

describe("listPayments — the `to` day is included", () => {
  beforeEach(() => {
    capturedWhere.value = null;
  });

  it("THE BUG: a single-day range covers the whole day, not just its first instant", async () => {
    const where = await whereFor({ from: "2026-08-20", to: "2026-08-20" });

    expect(where.paidAt.gte.toISOString()).toBe("2026-08-19T21:00:00.000Z");
    expect(where.paidAt.lte.toISOString()).toBe("2026-08-20T20:59:59.999Z");
  });

  it("a payment taken at 23:00 on the `to` date is inside the range", async () => {
    const where = await whereFor({ from: "2026-08-20", to: "2026-08-20" });
    const paidAt = new Date("2026-08-20T20:00:00.000Z");

    expect(paidAt >= where.paidAt.gte).toBe(true);
    expect(paidAt <= where.paidAt.lte).toBe(true);
  });

  it("the day AFTER `to` is still excluded — the fix widens by one day, not two", async () => {
    const where = await whereFor({ from: "2026-08-20", to: "2026-08-20" });
    const nextDayFirstInstant = new Date("2026-08-20T21:00:00.000Z"); // 00:00 Cairo, 21 Aug

    expect(nextDayFirstInstant <= where.paidAt.lte).toBe(false);
  });

  it("`from = to = today` returns the day's payments", async () => {
    const today = todayKey();
    const where = await whereFor({ from: today, to: today });

    const now = new Date();
    expect(now >= where.paidAt.gte).toBe(true);
    expect(now <= where.paidAt.lte).toBe(true);
  });

  it("an open-ended range keeps its open end open", async () => {
    expect((await whereFor({ from: "2026-08-01" })).paidAt).toEqual({
      gte: new Date("2026-07-31T21:00:00.000Z"), // 00:00 Cairo, 1 Aug
    });
    expect((await whereFor({ to: "2026-08-31" })).paidAt).toEqual({
      lte: new Date("2026-08-31T20:59:59.999Z"), // 23:59:59.999 Cairo, 31 Aug
    });
  });

  it("no date filter at all adds no `paidAt` clause", async () => {
    expect(await whereFor({})).not.toHaveProperty("paidAt");
  });
});

describe("listPayments and the Fees P&L agree", () => {
  it("both halves of the screen bound the range identically", async () => {
    const { dayRange } = await import("@repo/server-core/lib/day-range");
    const where = await whereFor({ from: "2026-08-01", to: "2026-08-20" });

    expect(where.paidAt).toEqual(dayRange("2026-08-01", "2026-08-20"));
  });
});
