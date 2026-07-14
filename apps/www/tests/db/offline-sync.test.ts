import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext, prisma } from "@repo/database";
import { syncOfflineAttendance, type OfflineRecord } from "@/lib/services/attendance/sync";
import { randomUUID } from "node:crypto";

neonConfig.webSocketConstructor = ws as never;
const adminPool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

async function main() {
  const tag = "offsync-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Offline attendance sync DB tests —", tag);

  const LOCAL_TS = new Date("2026-06-01T08:30:00.000Z");

  const fx = await withPlatformContext(async (tx) => {
    const teacherA = await tx.user.create({
      data: { name: tag + "-teacherA", role: "teacher", email: tag + "-ta@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacherA.id, walletBalance: 0 } });

    const teacherB = await tx.user.create({
      data: { name: tag + "-teacherB", role: "teacher", email: tag + "-tb@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacherB.id, walletBalance: 0 } });

    const center = await tx.center.create({
      data: { name: tag + "-center", shortId: tag.slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    await tx.centerTeacherAffiliation.create({
      data: {
        centerId: center.id, teacherId: teacherA.id, status: "active", centerShare: 5000,
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });

    const course = await tx.course.create({
      data: {
        centerId: center.id, teacherId: teacherA.id, title: tag, subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: 40000, maxStudents: 30, status: "active",
      },
    });

    const enrolledUser = await tx.user.create({
      data: { name: tag + "-enrolled", role: "student", email: tag + "-se@x.io", status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: enrolledUser.id, fullName: tag + "-enrolled", familyLinkCode: (tag + "E").slice(0, 18), pointsBalance: 0 },
    });
    await tx.enrollment.create({
      data: { studentId: enrolledUser.id, courseId: course.id, centerId: center.id, status: "active", enrolledBy: teacherA.id },
    });

    const unenrolledUser = await tx.user.create({
      data: { name: tag + "-unenrolled", role: "student", email: tag + "-su@x.io", status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: unenrolledUser.id, fullName: tag + "-unenrolled", familyLinkCode: (tag + "U").slice(0, 18), pointsBalance: 0 },
    });

    const mkSession = (d: string, teacherId: string) => tx.session.create({
      data: {
        courseId: course.id, teacherId,
        originalDate: new Date(d), date: new Date(d), startTime: "10:00", endTime: "11:00", status: "scheduled",
      },
    });
    const sessionFresh = await mkSession("2026-02-02T10:00:00Z", teacherA.id);
    const sessionConflict = await mkSession("2026-02-09T10:00:00Z", teacherA.id);
    const sessionOtherTeacher = await mkSession("2026-02-16T10:00:00Z", teacherB.id);

    await tx.attendanceRecord.create({
      data: {
        sessionId: sessionConflict.id, studentId: enrolledUser.id, courseId: course.id,
        centerId: center.id, status: "present", markedBy: teacherA.id,
      },
    });

    return {
      teacherA: teacherA.id, teacherB: teacherB.id, center: center.id, course: course.id,
      enrolled: enrolledUser.id, unenrolled: unenrolledUser.id,
      sessionFresh: sessionFresh.id, sessionConflict: sessionConflict.id, sessionOtherTeacher: sessionOtherTeacher.id,
    };
  });

  const fakeSessionId = randomUUID();

  try {
    const teacher = { id: fx.teacherA, role: "teacher" } as never;

    const records: OfflineRecord[] = [
      { sessionId: fx.sessionFresh, studentId: fx.enrolled, status: "present", localTimestamp: LOCAL_TS },
      { sessionId: fx.sessionConflict, studentId: fx.enrolled, status: "absent" },
      { sessionId: fx.sessionOtherTeacher, studentId: fx.enrolled, status: "present" },
      { sessionId: fx.sessionFresh, studentId: fx.unenrolled, status: "present" },
      { sessionId: fakeSessionId, studentId: fx.enrolled, status: "present" },
    ];

    const res = await syncOfflineAttendance(records, teacher);
    const find = (sid: string, stid: string) => res.results.find((r) => r.sessionId === sid && r.studentId === stid);

    const r1 = find(fx.sessionFresh, fx.enrolled);
    assert(r1?.result === "synced", `fresh enrolled record -> synced (got ${r1?.result})`);
    const created = await withPlatformContext((tx) =>
      tx.attendanceRecord.findUnique({
        where: { sessionId_studentId: { sessionId: fx.sessionFresh, studentId: fx.enrolled } },
        select: { status: true, synced: true, localTimestamp: true, markedBy: true },
      }),
    );
    assert(created != null, "a server attendance row was created for the synced record");
    assert(created?.synced === true, "created row is marked synced = true");
    assert(created?.status === "present", `created row keeps offline status present (got ${created?.status})`);
    assert(
      created?.localTimestamp != null && created.localTimestamp.getTime() === LOCAL_TS.getTime(),
      `localTimestamp preserved (${created?.localTimestamp?.toISOString()} == ${LOCAL_TS.toISOString()})`,
    );

    const r2 = find(fx.sessionConflict, fx.enrolled);
    assert(r2?.result === "conflict", `pre-existing server row -> conflict (got ${r2?.result})`);
    assert(r2?.reason === "server_record_kept", `conflict reason = server_record_kept (got ${r2?.reason})`);
    const serverRow = await withPlatformContext((tx) =>
      tx.attendanceRecord.findUnique({
        where: { sessionId_studentId: { sessionId: fx.sessionConflict, studentId: fx.enrolled } },
        select: { status: true },
      }),
    );
    assert(serverRow?.status === "present", `server record status UNCHANGED = present, offline 'absent' discarded (got ${serverRow?.status})`);

    const r3 = find(fx.sessionOtherTeacher, fx.enrolled);
    assert(r3?.result === "error" && r3?.reason === "not_your_session", `different-teacher session -> error/not_your_session (got ${r3?.result}/${r3?.reason})`);

    const r4 = find(fx.sessionFresh, fx.unenrolled);
    assert(r4?.result === "error" && r4?.reason === "student_not_enrolled", `unenrolled student -> error/student_not_enrolled (got ${r4?.result}/${r4?.reason})`);

    const r5 = find(fakeSessionId, fx.enrolled);
    assert(r5?.result === "error" && r5?.reason === "session_not_found", `missing session -> error/session_not_found (got ${r5?.result}/${r5?.reason})`);

    assert(res.total === 5, `total = 5 (got ${res.total})`);
    assert(res.synced === 1, `synced count = 1 (got ${res.synced})`);
    assert(res.conflicts === 1, `conflicts count = 1 (got ${res.conflicts})`);
    assert(res.errors === 3, `errors count = 3 (got ${res.errors})`);
    assert(res.results.length === 5, `results length = 5 (got ${res.results.length})`);
  } finally {
    const allSessions = [fx.sessionFresh, fx.sessionConflict, fx.sessionOtherTeacher];
    const allStudents = [fx.enrolled, fx.unenrolled];
    const allTeachers = [fx.teacherA, fx.teacherB];
    const allUsers = [...allStudents, ...allTeachers];
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM attendance_records WHERE session_id = ANY($1::uuid[])`, [allSessions]);
      await c.query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [allSessions]);
      await c.query(`DELETE FROM enrollments WHERE course_id = $1`, [fx.course]);
      await c.query(`DELETE FROM courses WHERE id = $1`, [fx.course]);
      await c.query(`DELETE FROM center_teacher_affiliations WHERE center_id = $1`, [fx.center]);
      await c.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [allTeachers]);
      await c.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [allStudents]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [allTeachers]);
      await c.query(`DELETE FROM centers WHERE id = $1`, [fx.center]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allUsers]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  try { await adminPool.end(); } catch { /* already ended */ }
  process.exit(1);
});
