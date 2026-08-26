// STUDENT_IA_AUDIT.md §5.1 finding 1 — `dashboards/student` shipped fabricated
// fields.
//
// `unreadMessages` was a hardcoded `0`: no messaging read reached this route, so
// it was never a count of anything, and a consumer that trusted it would have
// told a student with a full inbox they had nothing waiting. `assignmentsDue` /
// `dueSoon` / `assignmentsTrend` stood beside it, derived from scoreless grade
// rows against an Assignment model this product does not have.
//
// A field that nothing reads and nothing could answer correctly is worse than a
// missing one — it is the SHAPE of an answer, so the next person to need an
// unread count finds it already there and wires a badge to it. This test is the
// guard against it being re-added by reflex rather than by building the read.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { requireRole } = vi.hoisted(() => ({ requireRole: vi.fn() }));

vi.mock("@/lib/authz/require-role", () => ({ requireRole }));
vi.mock("@/lib/db/scope", () => ({
  scopedDb: async (_u: unknown, fn: (tx: any) => Promise<unknown>) =>
    fn({
      enrollment: { findMany: async () => [{ courseId: "c1" }] },
      course: { findMany: async () => [{ id: "c1", title: "رياضيات", subject: "math", centerId: null }] },
      session: { findMany: async () => [] },
      attendanceRecord: { count: async () => 0 },
      grade: { findMany: async () => [] },
      // enrichSessions (B.1#9 — todaySchedule.room/teacher now served, not "")
      // joins users, rooms and centers; empty answers keep the contract test
      // about the SHAPE, not the data.
      user: { findMany: async () => [] },
      room: { findMany: async () => [] },
      center: { findMany: async () => [] },
    }),
}));
vi.mock("@/lib/services/reports/reports", () => ({
  getStudentGradeTrend: async () => ({ items: [] }),
}));

const { GET } = await import("@/app/api/v1/dashboards/student/route");

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
    // Belt to the response's braces: a field re-added behind a conditional
    // would pass the assertion above on this fixture and still ship.
    const src = readFileSync(
      fileURLToPath(new URL("../../src/app/api/v1/dashboards/student/route.ts", import.meta.url)),
      "utf8",
    );
    // Strip comments — the removal is explained in one, and that must not read
    // as a re-introduction.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const field of FABRICATED) {
      expect(code).not.toContain(field);
    }
  });

  it("everything the dashboard actually answers is still answered", async () => {
    const res = await GET(new Request("http://localhost/api/v1/dashboards/student"), {} as any);
    const data = (await res.json()).data;

    // The real contract, pinned so the removal above cannot quietly take a
    // neighbour with it.
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
