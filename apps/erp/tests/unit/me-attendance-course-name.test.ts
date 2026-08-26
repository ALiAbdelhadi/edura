// STUDENT_IA_AUDIT.md §5.1 finding 3 / PARENT_IA_AUDIT.md §7.1 finding 2 —
// `me/attendance` returned `courseId` and no course name.
//
// Every consumer therefore fetched `enrollments` separately and joined the two
// client-side just to print a subject. Three portals doing the same join is
// three chances to do it differently — and the join has a hole the server does
// not: an attendance record OUTLIVES the enrolment, so a student who left a
// group still has history for it and the client-side join renders those rows
// blank.
//
// Resolving the name server-side closes both. These pin the shape and the hole.
import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireSession, state } = vi.hoisted(() => ({
  requireSession: vi.fn(),
  state: {
    records: [] as any[],
    courses: [] as any[],
    courseWhere: null as any,
    courseQueries: 0,
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireSession, getSessionUser: vi.fn() }));
vi.mock("@/lib/db/scope", () => ({
  scopedDb: async (_user: unknown, fn: (tx: any) => Promise<unknown>) => {
    const tx = {
      attendanceRecord: { findMany: async () => state.records },
      course: {
        findMany: async ({ where }: { where: any }) => {
          state.courseQueries += 1;
          state.courseWhere = where;
          return state.courses;
        },
      },
      parentStudentLink: { findFirst: async () => ({ id: "link-1" }) },
      centerStudentRoster: { findFirst: async () => ({ id: "roster-1" }) },
    };
    return fn(tx);
  },
}));

const { GET } = await import("@/app/api/v1/me/attendance/route");

const STUDENT = { id: "student-1", role: "student" } as any;

function rec(courseId: string, status: string, date: string) {
  return { courseId, status, session: { date: new Date(date) } };
}

async function body(qs = "") {
  const res = await GET(new Request(`http://localhost/api/v1/me/attendance${qs}`), {} as any);
  return (await res.json()).data;
}

beforeEach(() => {
  requireSession.mockResolvedValue(STUDENT);
  state.records = [];
  state.courses = [];
  state.courseWhere = null;
  state.courseQueries = 0;
});

describe("me/attendance — the course name comes from the server", () => {
  it("every record carries the name alongside the id", async () => {
    state.records = [
      rec("course-1", "present", "2026-08-20T00:00:00.000Z"),
      rec("course-2", "absent", "2026-08-19T00:00:00.000Z"),
    ];
    state.courses = [
      { id: "course-1", title: "رياضيات — الصف الثالث" },
      { id: "course-2", title: "فيزياء" },
    ];

    const data = await body();

    expect(data.records).toEqual([
      {
        date: "2026-08-20",
        status: "present",
        courseId: "course-1",
        courseName: "رياضيات — الصف الثالث",
      },
      { date: "2026-08-19", status: "absent", courseId: "course-2", courseName: "فيزياء" },
    ]);
  });

  it("`courseId` is still there — this ADDS a field, it does not replace one", async () => {
    state.records = [rec("course-1", "present", "2026-08-20T00:00:00.000Z")];
    state.courses = [{ id: "course-1", title: "كيمياء" }];

    const data = await body();

    expect(data.records[0].courseId).toBe("course-1");
  });

  it("THE HOLE THE CLIENT JOIN HAD: history for a course the student has left", async () => {
    // The record survives the enrolment. A client-side join against
    // `enrollments` finds nothing and renders a blank row; the server reads the
    // course itself and still knows its name.
    state.records = [rec("old-course", "present", "2026-05-01T00:00:00.000Z")];
    state.courses = [{ id: "old-course", title: "لغة عربية" }];

    const data = await body();

    expect(data.records[0].courseName).toBe("لغة عربية");
  });

  it("a course row that is genuinely gone yields \"\", not undefined or a uuid", async () => {
    state.records = [rec("deleted-course", "present", "2026-08-20T00:00:00.000Z")];
    state.courses = [];

    const data = await body();

    expect(data.records[0].courseName).toBe("");
  });

  it("ONE keyed read over the distinct ids — not a lookup per row", async () => {
    state.records = [
      rec("course-1", "present", "2026-08-20T00:00:00.000Z"),
      rec("course-1", "absent", "2026-08-18T00:00:00.000Z"),
      rec("course-1", "present", "2026-08-16T00:00:00.000Z"),
      rec("course-2", "present", "2026-08-15T00:00:00.000Z"),
    ];
    state.courses = [
      { id: "course-1", title: "رياضيات" },
      { id: "course-2", title: "فيزياء" },
    ];

    await body();

    expect(state.courseQueries).toBe(1);
    expect(state.courseWhere.id.in.sort()).toEqual(["course-1", "course-2"]);
  });

  it("no records means no course query at all", async () => {
    const data = await body();

    expect(state.courseQueries).toBe(0);
    expect(data.records).toEqual([]);
  });

  it("the tallies are untouched by the enrichment", async () => {
    state.records = [
      rec("c", "present", "2026-08-20T00:00:00.000Z"),
      rec("c", "present", "2026-08-19T00:00:00.000Z"),
      rec("c", "absent", "2026-08-18T00:00:00.000Z"),
      rec("c", "excused", "2026-08-17T00:00:00.000Z"),
    ];
    state.courses = [{ id: "c", title: "أحياء" }];

    const data = await body();

    expect({ present: data.present, absent: data.absent, late: data.late }).toEqual({
      present: 2,
      absent: 1,
      late: 1,
    });
    expect(data.total).toBe(4);
    expect(data.rate).toBe(50);
  });

  it("a parent reading a child gets the same enriched shape", async () => {
    requireSession.mockResolvedValue({ id: "parent-1", role: "parent" } as any);
    state.records = [rec("course-9", "present", "2026-08-20T00:00:00.000Z")];
    state.courses = [{ id: "course-9", title: "جغرافيا" }];

    const data = await body("?studentId=child-a");

    expect(data.records[0].courseName).toBe("جغرافيا");
  });
});
