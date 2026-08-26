// MC-1 — `listPayments` excluded the whole `to` day.
//
// `/dashboard/admin/fees` renders a P&L and, directly beneath it, the payment
// log that is supposed to itemise the same money. ONE `DateRangeField` drives
// both. The P&L bounded its range through `reports.ts` (`endOfUtcDay(to)`); the
// log built its own filter as `lte = new Date(filters.to)` — midnight, the
// instant the day BEGINS. So every payment taken on the last day of the range
// fell outside it.
//
// The visible symptom is the one an owner hits first: pick `from = to = today`
// to answer "how much did we take today", and the log comes back empty while
// the P&L above it shows the day's revenue.
//
// Proven without a database by capturing the `where` clause `listPayments`
// hands to Prisma — the bug lives entirely in that object, and asserting on it
// pins the boundary to the millisecond in a way a fixture row could not.
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

    // Cairo day bounds — see docs/decisions/money-day-boundary.md. Before the
    // fix `lte` was the instant the day STARTS, a window of zero width, which
    // is why the log looked empty.
    expect(where.paidAt.gte.toISOString()).toBe("2026-08-19T21:00:00.000Z");
    expect(where.paidAt.lte.toISOString()).toBe("2026-08-20T20:59:59.999Z");
  });

  it("a payment taken at 23:00 on the `to` date is inside the range", async () => {
    const where = await whereFor({ from: "2026-08-20", to: "2026-08-20" });
    // 23:00 on the center's wall clock, which is what "23:00" means to the
    // owner reading the log — 20:00Z while Cairo is on UTC+3.
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
    // The operator's actual question, expressed the way the screen expresses it.
    //
    // `todayKey()`, NOT `new Date().toISOString().slice(0, 10)`. The UTC slice
    // is the very anti-pattern `date-key.ts` exists to forbid — it answers
    // "what day is it?" on the WRONG clock, and Cairo runs UTC+2/+3, so
    // between local midnight and 02:00/03:00 it names YESTERDAY. This test
    // then built a range over yesterday and asserted that `now` fell inside
    // it, which it does not. Red every night for three hours; green again by
    // breakfast, which is the worst kind of failing test.
    const today = todayKey();
    const where = await whereFor({ from: today, to: today });

    // Every instant of today, including the one we are living in right now.
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
    // The regression this file exists to prevent: two derivations of what `to`
    // means. `reports.ts` no longer has its own — it imports the same helper —
    // so this compares the log's bounds against the shared source directly.
    const { dayRange } = await import("@repo/server-core/lib/day-range");
    const where = await whereFor({ from: "2026-08-01", to: "2026-08-20" });

    expect(where.paidAt).toEqual(dayRange("2026-08-01", "2026-08-20"));
  });
});
