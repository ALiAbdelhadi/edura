import { describe, expect, it, vi } from "vitest";

type Captured = { sql: string; values: unknown[] };

// `paidAt` arrives as the ISO text Postgres renders with to_char(... AT TIME ZONE 'UTC'),
// so the rows below mirror the wire shape, not Date objects.
const { rows } = vi.hoisted(() => ({
  rows: { payments: [] as { amount: number; paidAt: string }[], captured: null as Captured | null },
}));

vi.mock("@repo/server-core/db/scope", async () => {
  const { Prisma } = await import("@repo/database");
  return {
    scopedDb: async (_user: unknown, fn: (tx: any) => Promise<unknown>) =>
      fn({
        $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const q = Prisma.sql(strings, ...values);
          rows.captured = { sql: q.text, values: q.values };
          return [{ payments: rows.payments, expenses: [] }];
        },
      }),
    platformDb: vi.fn(),
  };
});

const { getRevenueTimeseries } = await import("@repo/server-core/services/reports/reports");

const OWNER = { id: "owner-1", role: "center_admin", centerId: "center-1" } as any;

function paidAtBound(op: ">=" | "<="): Date {
  const q = rows.captured!;
  const m = q.sql.match(new RegExp(`p\\.paid_at ${op} \\$(\\d+)`));
  expect(m).not.toBeNull();
  return q.values[Number(m![1]) - 1] as Date;
}

describe("revenue timeseries — bounds and buckets share one clock", () => {
  it("a payment at 00:30 Cairo lands in the bucket its Cairo day belongs to", async () => {
    rows.payments = [{ amount: 5000, paidAt: "2026-08-31T21:30:00.000Z" }];

    const { series } = await getRevenueTimeseries(
      OWNER,
      "2026-09-01",
      "2026-09-30",
      "month",
    );

    expect(series.map((p) => p.period)).toEqual(["2026-09"]);
    expect(series[0].revenue).toBe(5000);
  });

  it("no money selected by the range falls outside every bucket", async () => {
    rows.payments = [
      { amount: 100, paidAt: "2026-08-31T21:30:00.000Z" }, // 01 Sep 00:30 Cairo
      { amount: 200, paidAt: "2026-09-15T12:00:00.000Z" }, // mid-month
      { amount: 400, paidAt: "2026-09-30T20:59:59.999Z" }, // 30 Sep 23:59:59 Cairo
    ];

    const { series } = await getRevenueTimeseries(OWNER, "2026-09-01", "2026-09-30", "month");

    expect(series.reduce((a, b) => a + b.revenue, 0)).toBe(700);
  });

  it("the query's own bounds are the Cairo day bounds", async () => {
    rows.payments = [];
    await getRevenueTimeseries(OWNER, "2026-09-01", "2026-09-30", "month");

    expect(paidAtBound(">=").toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(paidAtBound("<=").toISOString()).toBe("2026-09-30T20:59:59.999Z");
    // the expenses leg is cut by the same two bound values, not a second pair
    const q = rows.captured!;
    const x = q.sql.match(/x\.expense_date >= \$(\d+) AND x\.expense_date <= \$(\d+)/)!;
    expect(x).not.toBeNull();
    expect(q.values[Number(x[1]) - 1]).toEqual(paidAtBound(">="));
    expect(q.values[Number(x[2]) - 1]).toEqual(paidAtBound("<="));
  });

  it("empty buckets are still emitted, in calendar order, across a year boundary", async () => {
    rows.payments = [];
    const { series } = await getRevenueTimeseries(OWNER, "2026-11-01", "2027-02-28", "month");

    expect(series.map((p) => p.period)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(series.every((p) => p.revenue === 0 && p.expenses === 0)).toBe(true);
  });

  it("weekly granularity buckets by the Cairo day's ISO week", async () => {
    rows.payments = [{ amount: 900, paidAt: "2026-08-19T21:30:00.000Z" }];

    const { series } = await getRevenueTimeseries(OWNER, "2026-08-17", "2026-08-23", "week");

    expect(series).toHaveLength(1);
    expect(series[0].revenue).toBe(900);
  });

  it("a Sunday-to-Monday Cairo crossing changes the ISO week, and follows the row", async () => {
    rows.payments = [{ amount: 700, paidAt: "2026-08-23T21:30:00.000Z" }];

    const { series } = await getRevenueTimeseries(OWNER, "2026-08-17", "2026-08-30", "week");
    const nonZero = series.filter((p) => p.revenue > 0);

    expect(nonZero).toHaveLength(1);
    expect(nonZero[0].period).toBe("2026-W35");
  });
});
