import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  platformTx: null as any,
  notified: [] as any[],
  door: vi.fn(),
}));

vi.mock("@repo/server-core/db/scope", () => ({
  scopedDb: vi.fn(),
  platformDb: async (fn: (tx: any) => Promise<unknown>) => fn(h.platformTx),
}));

vi.mock("@repo/server-core/services/attendance/checkin", () => ({
  resolveAssistantTeacher: async (_tx: unknown, caller: { id: string }) => caller.id,
  doorTransitionTx: h.door,
}));

vi.mock("@repo/server-core/services/notifications/notify", () => ({
  notifyAfterCommit: async (input: unknown) => {
    h.notified.push(input);
  },
}));

const { bulkMarkAttendanceTx } = await import(
  "@repo/server-core/services/attendance/attendance"
);
const { syncOfflineAttendance } = await import("@repo/server-core/services/attendance/sync");

type Row = { sessionId: string; studentId: string; status: string; markedBy: string };

function fakeDb(opts: {
  sessions: { id: string; courseId: string; teacherId: string; status?: string }[];
  enrolled: string[];
  rows?: Row[];
  links?: { studentId: string; parentId: string }[];
}) {
  const rows: Row[] = [...(opts.rows ?? [])];
  const calls: string[] = [];
  const log = (name: string) => calls.push(name);
  const inList = (v: string, cond: any) =>
    typeof cond === "string" ? v === cond : cond.in.includes(v);
  const tx = {
    $queryRaw: async () => {
      log("lock");
      return [];
    },
    session: {
      findUnique: async ({ where }: any) => {
        log("session.findUnique");
        const s = opts.sessions.find((x) => x.id === where.id);
        return s
          ? {
              ...s,
              date: new Date(),
              status: s.status ?? "scheduled",
              attendanceReopenedAt: null,
              distributedAt: null,
              dataSource: "system",
            }
          : null;
      },
      findMany: async ({ where }: any) => {
        log("session.findMany");
        return opts.sessions
          .filter((s) => where.id.in.includes(s.id))
          .map((s) => ({ ...s, status: s.status ?? "scheduled", distributedAt: null }));
      },
    },
    course: {
      findMany: async ({ where }: any) => {
        log("course.findMany");
        return where.id.in.map((id: string) => ({ id, centerId: "center-1" }));
      },
    },
    enrollment: {
      findMany: async ({ where }: any) => {
        log("enrollment.findMany");
        const courseIds: string[] = where.courseId?.in ?? [where.courseId];
        return courseIds.flatMap((courseId) =>
          opts.enrolled
            .filter((studentId) => !where.studentId || where.studentId.in.includes(studentId))
            .map((studentId) => ({ courseId, studentId })),
        );
      },
    },
    attendanceRecord: {
      findMany: async ({ where }: any) => {
        log("attendanceRecord.findMany");
        return rows.filter(
          (r) => inList(r.sessionId, where.sessionId) && inList(r.studentId, where.studentId),
        );
      },
      createMany: async ({ data }: any) => {
        log("attendanceRecord.createMany");
        for (const d of data) {
          if (rows.some((r) => r.sessionId === d.sessionId && r.studentId === d.studentId)) {
            throw new Error("unique violation");
          }
          rows.push({ ...d });
        }
        return { count: data.length };
      },
      updateMany: async ({ where, data }: any) => {
        log("attendanceRecord.updateMany");
        const hit = rows.filter(
          (r) => r.sessionId === where.sessionId && where.studentId.in.includes(r.studentId),
        );
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
      upsert: async () => {
        log("attendanceRecord.upsert");
      },
    },
    parentStudentLink: {
      findMany: async () => {
        log("parentStudentLink.findMany");
        return opts.links ?? [];
      },
    },
  };
  return { tx, rows, calls };
}

describe("bulkMarkAttendanceTx batching", () => {
  it("marks a class of 40 in a constant number of round trips", async () => {
    const students = Array.from({ length: 40 }, (_, i) => `stu-${i}`);
    const { tx, rows, calls } = fakeDb({
      sessions: [{ id: "s1", courseId: "c1", teacherId: "t1" }],
      enrolled: students,
      rows: students.slice(0, 10).map((studentId) => ({
        sessionId: "s1",
        studentId,
        status: "present",
        markedBy: "old",
      })),
    });
    const entries = students.map((studentId, i) => ({
      studentId,
      status: (i % 4 === 0 ? "absent" : "present") as "absent" | "present",
    }));

    const { value, effects } = await bulkMarkAttendanceTx(tx as any, "s1", entries, "admin-1", "center-1");

    expect(calls.filter((c) => c === "attendanceRecord.upsert")).toHaveLength(0);
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(rows).toHaveLength(40);
    for (const [i, id] of students.entries()) {
      const row = rows.find((r) => r.studentId === id)!;
      expect(row.status).toBe(i % 4 === 0 ? "absent" : "present");
      expect(row.markedBy).toBe("admin-1");
    }
    expect(value).toEqual({ updated: 40, count: 40 });
    expect(effects).toHaveLength(10);
  });

  it("keeps the last status when a student appears twice", async () => {
    const { tx, rows } = fakeDb({
      sessions: [{ id: "s1", courseId: "c1", teacherId: "t1" }],
      enrolled: ["a"],
    });
    await bulkMarkAttendanceTx(
      tx as any,
      "s1",
      [
        { studentId: "a", status: "present" },
        { studentId: "a", status: "excused" },
      ],
      "admin-1",
      null,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("excused");
  });

  it("falls back to upsert when a concurrent writer beat the batch insert", async () => {
    const { tx, calls } = fakeDb({
      sessions: [{ id: "s1", courseId: "c1", teacherId: "t1" }],
      enrolled: ["a", "b"],
    });
    tx.attendanceRecord.createMany = async () => ({ count: 1 });
    await bulkMarkAttendanceTx(
      tx as any,
      "s1",
      [
        { studentId: "a", status: "present" },
        { studentId: "b", status: "present" },
      ],
      "admin-1",
      "center-1",
    );
    expect(calls.filter((c) => c === "attendanceRecord.upsert")).toHaveLength(2);
  });
});

describe("syncOfflineAttendance batching", () => {
  beforeEach(() => {
    h.notified = [];
    h.door.mockReset();
  });

  it("syncs 100 records in a constant number of round trips with per-record outcomes", async () => {
    const students = Array.from({ length: 100 }, (_, i) => `stu-${i}`);
    const { tx, rows, calls } = fakeDb({
      sessions: [{ id: "s1", courseId: "c1", teacherId: "t1" }],
      enrolled: students.slice(0, 98),
      rows: [{ sessionId: "s1", studentId: "stu-0", status: "present", markedBy: "x" }],
      links: [{ studentId: "stu-1", parentId: "p-1" }],
    });
    h.platformTx = tx;

    const records = students.map((studentId, i) => ({
      sessionId: "s1",
      studentId,
      status: (i % 2 ? "absent" : "present") as "absent" | "present",
    }));
    const res = await syncOfflineAttendance(records, { id: "t1", role: "teacher" } as any);

    expect(res.results[0]).toMatchObject({ result: "conflict", reason: "server_record_kept" });
    expect(res.results[98]).toMatchObject({ result: "error", reason: "student_not_enrolled" });
    expect(res.results[99]).toMatchObject({ result: "error", reason: "student_not_enrolled" });
    expect(res).toMatchObject({ synced: 97, conflicts: 1, errors: 2, total: 100 });
    expect(rows).toHaveLength(98);
    expect(calls).toEqual([
      "lock",
      "session.findMany",
      "course.findMany",
      "enrollment.findMany",
      "attendanceRecord.findMany",
      "attendanceRecord.createMany",
      "parentStudentLink.findMany",
    ]);

    expect(h.notified).toHaveLength(1);
    const absentSynced = res.results.filter(
      (r, i) => r.result === "synced" && records[i]!.status === "absent",
    ).length;
    expect(h.notified[0].recipients).toHaveLength(absentSynced + 1);
    expect(h.notified[0].recipients).toContain("p-1");
    expect(h.notified[0].data).toEqual({ sessionId: "s1", source: "offline_sync" });
  });

  it("reports a duplicated record as a conflict and keeps the first", async () => {
    const { tx, rows } = fakeDb({
      sessions: [{ id: "s1", courseId: "c1", teacherId: "t1" }],
      enrolled: ["a"],
    });
    h.platformTx = tx;
    const res = await syncOfflineAttendance(
      [
        { sessionId: "s1", studentId: "a", status: "present" },
        { sessionId: "s1", studentId: "a", status: "absent" },
      ],
      { id: "t1", role: "teacher" } as any,
    );
    expect(res.results.map((r) => r.result)).toEqual(["synced", "conflict"]);
    expect(rows).toEqual([expect.objectContaining({ status: "present" })]);
    expect(h.notified).toHaveLength(0);
  });

  it("keeps the session guards and routes door records through the door transition", async () => {
    const { tx } = fakeDb({
      sessions: [
        { id: "mine", courseId: "c1", teacherId: "t1" },
        { id: "theirs", courseId: "c2", teacherId: "t2" },
        { id: "shut", courseId: "c1", teacherId: "t1", status: "cancelled" },
      ],
      enrolled: ["a"],
    });
    h.platformTx = tx;
    h.door.mockResolvedValue({ outcome: "present" });
    const res = await syncOfflineAttendance(
      [
        { sessionId: "ghost", studentId: "a", status: "present" },
        { sessionId: "theirs", studentId: "a", status: "present" },
        { sessionId: "shut", studentId: "a", status: "present" },
        { sessionId: "mine", studentId: "a", status: "present", stage: "door" },
      ],
      { id: "t1", role: "teacher" } as any,
    );
    expect(res.results.map((r) => `${r.result}/${r.reason}`)).toEqual([
      "error/session_not_found",
      "error/not_your_session",
      "conflict/session_cancelled",
      "synced/present",
    ]);
    expect(h.door).toHaveBeenCalledTimes(1);
  });
});
