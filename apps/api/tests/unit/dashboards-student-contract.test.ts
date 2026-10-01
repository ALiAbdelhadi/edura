import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { requireRole } = vi.hoisted(() => ({ requireRole: vi.fn() }));

vi.mock("@repo/server-core/authz/require-role", () => ({ requireRole }));
vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
    fn({
      enrollment: { findMany: async () => [{ courseId: "c1" }] },
      course: { findMany: async () => [{ id: "c1", title: "رياضيات", subject: "math", centerId: null }] },
      session: { findMany: async () => [] },
      attendanceRecord: { groupBy: async () => [] },
      grade: { findMany: async () => [] },
      user: { findMany: async () => [] },
      room: { findMany: async () => [] },
      center: { findMany: async () => [] },
    }),
}));
vi.mock("@repo/server-core/services/reports/reports", () => ({
  studentGradeTrendTx: async () => ({ items: [] }),
}));

const { GET } = await import("../../src/routes/v1/dashboards/student/route");

const FABRICATED = ["unreadMessages", "assignmentsDue", "dueSoon", "assignmentsTrend"];

beforeEach(() => {
  requireRole.mockResolvedValue({ id: "student-1", role: "student" });
});

describe("dashboards/student — the fabricated fields are gone", () => {
  it("the response carries none of them", async () => {
    const res = await GET(new Request("http://localhost/api/v1/dashboards/student"), {} as any);
    const data = (await res.json()).data;

    for (const field of FABRICATED) {
      expect(Object.keys(data)).not.toContain(field);
    }
  });

  it("the route source does not emit them either", async () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../src/routes/v1/dashboards/student/route.ts", import.meta.url)),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const field of FABRICATED) {
      expect(code).not.toContain(field);
    }
  });

  it("everything the dashboard actually answers is still answered", async () => {
    const res = await GET(new Request("http://localhost/api/v1/dashboards/student"), {} as any);
    const data = (await res.json()).data;

    expect(Object.keys(data).sort()).toEqual(
      [
        "analytics",
        "attendanceRate",
        "averageBand",
        "averagePercent",
        "subjectPerformance",
        "todaySchedule",
        "upcoming",
      ].sort(),
    );
  });
});
