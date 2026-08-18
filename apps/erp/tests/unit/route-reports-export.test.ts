import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@repo/server-core/auth/types";

/**
 * GET /api/v1/reports/export — the second gate.
 *
 * The wrapper admits the UNION of accountant+manager because one route serves
 * reports of both tiers. Everything therefore rests on the per-report check
 * inside. THE FAILURE THIS PREVENTS: a manager — who legitimately reads
 * attendance and fill rates — downloading the center's revenue. The tier
 * constants themselves are pinned by report-export-tiers.test.ts; this proves
 * the ROUTE acts on them.
 */

const requireSession = vi.fn<() => Promise<SessionUser>>();
vi.mock("@/lib/auth/session", () => ({
  requireSession: (...a: unknown[]) => requireSession(...(a as [])),
  getSessionUser: vi.fn(),
}));

const platformDb = vi.fn();
vi.mock("@/lib/db/scope", () => ({
  platformDb: (cb: (tx: unknown) => unknown) => platformDb(cb),
  scopedDb: vi.fn(),
}));

// The report services are the screen's own; the export must not re-query, so
// mocking them here is also a check that it calls them and nothing else.
const getNetProfitReport = vi.fn(async () => ({
  revenue: 1234567,
  expenses: 234567,
  netProfit: 1000000,
  monthly: [{ month: "2026-07", revenue: 1234567, expenses: 234567 }],
  byCourse: [{ title: "=فيزياء", revenue: 1234567, pct: 100 }],
}));
const getAttendanceByCourse = vi.fn(async () => ({
  from: undefined,
  to: undefined,
  items: [{ title: "فيزياء", present: 9, absent: 1, excused: 0, attendanceRatePct: 90 }],
}));
vi.mock("@repo/server-core/services/reports/reports", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getNetProfitReport: (...a: unknown[]) => getNetProfitReport(...(a as [])),
  getAttendanceByCourse: (...a: unknown[]) => getAttendanceByCourse(...(a as [])),
}));

const { GET } = await import("@/app/api/v1/reports/export/route");

const owner: SessionUser = { id: "o1", role: "center_admin", centerId: "c1", locale: "ar" };
const staff: SessionUser = { id: "s1", role: "center_staff", locale: "ar" };

function asStaff(role: "manager" | "center_accountant" | "receptionist") {
  requireSession.mockResolvedValue(staff);
  platformDb.mockImplementation(async () => ({ centerId: "c1", role }));
}

const hit = (qs: string) =>
  GET(new Request(`http://t.local/api/v1/reports/export${qs}`), {
    params: Promise.resolve({}),
  });

describe("report export — authorization", () => {
  it("owner downloads an accountant report", async () => {
    requireSession.mockResolvedValue(owner);
    const res = await hit("?report=net-profit");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });

  it("center_accountant downloads an accountant report", async () => {
    asStaff("center_accountant");
    expect((await hit("?report=net-profit")).status).toBe(200);
  });

  it("MANAGER IS REFUSED an accountant report — the money stays on its tier", async () => {
    asStaff("manager");
    const res = await hit("?report=net-profit");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/cannot export/i);
  });

  it("manager downloads a manager report", async () => {
    asStaff("manager");
    expect((await hit("?report=attendance-by-course")).status).toBe(200);
  });

  it("center_accountant is refused a MANAGER report (read-only finance tier, not everything)", async () => {
    asStaff("center_accountant");
    expect((await hit("?report=attendance-by-course")).status).toBeGreaterThanOrEqual(400);
  });

  it("receptionist is refused by the wrapper before any report is loaded", async () => {
    asStaff("receptionist");
    getNetProfitReport.mockClear();
    const res = await hit("?report=net-profit");
    expect(res.status).toBe(403);
    expect(getNetProfitReport).not.toHaveBeenCalled();
  });

  it("an unknown report key is refused, not guessed", async () => {
    requireSession.mockResolvedValue(owner);
    const res = await hit("?report=all-the-money");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("report export — the file", () => {
  it("is an attachment, uncached, with a dated filename", async () => {
    requireSession.mockResolvedValue(owner);
    const res = await hit("?report=net-profit");
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="net-profit-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    // A financial export must not sit in a shared cache.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("carries the BOM ON THE WIRE, the totals and a neutralised course title", async () => {
    requireSession.mockResolvedValue(owner);
    const res = await hit("?report=revenue-by-course&locale=ar");
    // Assert the BYTES, not res.text(): the WHATWG decode that text() performs
    // STRIPS a leading BOM, so a string check here would pass whether or not
    // Excel ever receives it — and the BOM is the whole reason Arabic renders.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder("utf-8").decode(bytes);
    expect(csv).toContain("12345.67");
    // The seeded title starts with '=' — it must arrive as text, not a formula.
    expect(csv).toContain("'=فيزياء");
  });

  it("passes the date range through to the report service, unchanged", async () => {
    requireSession.mockResolvedValue(owner);
    getNetProfitReport.mockClear();
    await hit("?report=net-profit&from=2026-07-01&to=2026-07-31");
    expect(getNetProfitReport).toHaveBeenCalledWith(
      expect.objectContaining({ centerId: "c1" }),
      "2026-07-01",
      "2026-07-31",
    );
  });
});
