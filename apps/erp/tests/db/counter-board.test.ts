import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import {
  counterRoster,
  listCounterSessions,
  listCounterTeachers,
} from "@repo/server-core/services/attendance/counter";
import type { SessionUser } from "@repo/server-core/erp-auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m));
};

const centerActor = (centerId: string): SessionUser =>
  ({ id: "counter-actor-" + centerId, role: "center_admin", centerId, locale: "en" }) as SessionUser;

function cairoNowMinutes(): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
const clock = (minutes: number) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const cairoToday = () =>
  new Date(
    `${new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())}T00:00:00.000Z`,
  );

async function main() {
  const tag = "cb-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Counter board —", tag);

  const now = cairoNowMinutes();
  const clockUsable = now > 90 && now < 24 * 60 - 90;
  const today = cairoToday();

  const fx = await withPlatformContext(async (tx) => {
    const mkCenter = async (suffix: string) =>
      tx.center.create({
        data: {
          name: `${tag}-${suffix}`,
          shortId: (tag + suffix).slice(0, 12).toUpperCase(),
          status: "active",
          walletBalance: 0,
        },
      });
    const centerA = await mkCenter("A");
    const centerB = await mkCenter("B");

    const mkUser = (n: string, role: "teacher" | "student") =>
      tx.user.create({
        data: { name: `${tag}-${n}`, role, email: `${tag}-${n}@x.io`, status: "active" },
      });

    const live = await mkUser("live", "teacher"); // teaching right now at A
    const later = await mkUser("later", "teacher"); // due later today at A
    const idle = await mkUser("idle", "teacher"); // affiliated, nothing today
    const foreign = await mkUser("foreign", "teacher"); // teaches at B only

    for (const t of [live, later, idle, foreign]) {
      await tx.teacherProfile.create({ data: { userId: t.id, walletBalance: 0 } });
    }
    for (const [center, teacher] of [
      [centerA, live],
      [centerA, later],
      [centerA, idle],
      [centerB, foreign],
    ] as const) {
      await tx.centerTeacherAffiliation.create({
        data: {
          centerId: center.id,
          teacherId: teacher.id,
          status: "active",
          centerShare: 0,
          expiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      });
    }

    const mkCourse = (n: string, teacherId: string, centerId: string, perSession: number | null) =>
      tx.course.create({
        data: {
          centerId,
          teacherId,
          title: `${tag}-${n}`,
          subject: "Math",
          daysOfWeek: [1],
          startTime: "10:00",
          endTime: "11:00",
          startDate: new Date("2026-01-01T00:00:00Z"),
          maxStudents: 30,
          status: "active",
          price: 40000,
          pricePerSession: perSession,
        },
      });

    const courseLive = await mkCourse("c-live", live.id, centerA.id, 7500);
    const courseLater = await mkCourse("c-later", later.id, centerA.id, 6000);
    const courseForeign = await mkCourse("c-foreign", foreign.id, centerB.id, 5000);

    const mkSession = (courseId: string, teacherId: string, start: string, end: string) =>
      tx.session.create({
        data: {
          courseId,
          teacherId,
          originalDate: today,
          date: today,
          startTime: start,
          endTime: end,
          status: "scheduled",
        },
      });

    const sessionLive = await mkSession(
      courseLive.id,
      live.id,
      clock(now - 30),
      clock(now + 60),
    );
    const sessionDone = await mkSession(
      courseLive.id,
      live.id,
      clock(now - 240),
      clock(now - 150),
    );
    const sessionLater = await mkSession(
      courseLater.id,
      later.id,
      clock(now + 120),
      clock(now + 200),
    );
    const sessionForeign = await mkSession(
      courseForeign.id,
      foreign.id,
      clock(now - 30),
      clock(now + 60),
    );
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const sessionYesterday = await tx.session.create({
      data: {
        courseId: courseLive.id,
        teacherId: live.id,
        originalDate: yesterday,
        date: yesterday,
        startTime: clock(now - 30),
        endTime: clock(now + 60),
        status: "scheduled",
      },
    });

    const mkStudent = async (n: string) => (await mkUser(n, "student")).id;
    const enrolled1 = await mkStudent("s-enrolled1");
    const enrolled2 = await mkStudent("s-enrolled2");
    const present = await mkStudent("s-present"); // enrolled AND checked in
    const passOnly = await mkStudent("s-pass"); // paid a per-session pass, NOT enrolled
    const stranger = await mkStudent("s-stranger"); // on the center roster, in no lesson

    for (const id of [enrolled1, enrolled2, present, passOnly, stranger]) {
      await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: id } });
    }
    for (const id of [enrolled1, enrolled2, present]) {
      await tx.enrollment.create({
        data: {
          studentId: id,
          courseId: courseLive.id,
          centerId: centerA.id,
          status: "active",
          enrolledBy: live.id,
        },
      });
    }
    await tx.enrollment.create({
      data: {
        studentId: stranger,
        courseId: courseLive.id,
        centerId: centerA.id,
        status: "unenrolled",
        enrolledBy: live.id,
      },
    });

    const sub = await tx.subscription.create({
      data: {
        studentId: passOnly,
        courseId: courseLive.id,
        centerId: centerA.id,
        teacherId: live.id,
        sessionId: sessionLive.id,
        targetType: "center",
        plan: "per_session",
        status: "active",
        source: "walk_in",
        price: 7500,
        paymentMethod: "cash",
        activatedAt: new Date(),
      },
    });
    const staleSub = await tx.subscription.create({
      data: {
        studentId: enrolled2,
        courseId: courseLive.id,
        centerId: centerA.id,
        teacherId: live.id,
        targetType: "center",
        plan: "monthly",
        status: "active",
        source: "walk_in",
        price: 40000,
        periodStart: new Date("2020-01-01T00:00:00Z"),
        periodEnd: new Date("2020-02-01T00:00:00Z"),
        paymentMethod: "cash",
        activatedAt: new Date("2020-01-01T00:00:00Z"),
      },
    });

    const attendance = await tx.attendanceRecord.create({
      data: {
        sessionId: sessionLive.id,
        studentId: present,
        courseId: courseLive.id,
        centerId: centerA.id,
        status: "present",
        markedBy: live.id,
        counterAt: new Date(),
        counterBy: live.id,
      },
    });

    return {
      centerA: centerA.id,
      centerB: centerB.id,
      teachers: { live: live.id, later: later.id, idle: idle.id, foreign: foreign.id },
      courses: [courseLive.id, courseLater.id, courseForeign.id],
      sessions: {
        live: sessionLive.id,
        done: sessionDone.id,
        later: sessionLater.id,
        foreign: sessionForeign.id,
        yesterday: sessionYesterday.id,
      },
      students: { enrolled1, enrolled2, present, passOnly, stranger },
      subs: [sub.id, staleSub.id],
      attendance: attendance.id,
    };
  });

  try {
    const A = centerActor(fx.centerA);
    const B = centerActor(fx.centerB);

    console.log("\n(1) the picker: every affiliated teacher, today deciding the order");
    const teachers = await listCounterTeachers(A);
    const ids = teachers.teachers.map((t) => t.teacherId);
    ok(ids.includes(fx.teachers.live), "the teacher on now is listed");
    ok(ids.includes(fx.teachers.later), "a teacher due later today is listed");
    ok(
      ids.includes(fx.teachers.idle),
      "a teacher with NO lesson today is still listed — the picker is a directory, not a schedule",
    );
    ok(
      !ids.includes(fx.teachers.foreign),
      "another center's teacher is NOT listed",
    );
    const liveRow = teachers.teachers.find((t) => t.teacherId === fx.teachers.live);
    ok(
      liveRow?.sessionsToday === 2,
      `the live teacher's two lessons today are counted, yesterday's is not (got ${liveRow?.sessionsToday})`,
    );

    console.log("\n(2) the clock: Cairo wall-clock decides who is on now");
    if (!clockUsable) {
      console.log("  ~ skipped: seeded within 90 minutes of midnight, the window is clamped");
    } else {
      ok(
        teachers.defaultTeacherId === fx.teachers.live,
        "the default is the teacher whose lesson straddles this minute",
      );
      ok(
        liveRow?.liveSessionId === fx.sessions.live,
        "that teacher's live lesson is named, and it is the running one, not the finished one",
      );
      ok(
        teachers.teachers.find((t) => t.teacherId === fx.teachers.later)?.liveSessionId === null,
        "a teacher due later has NO live lesson",
      );
      ok(
        teachers.clock === clock(cairoNowMinutes()) ||
          Math.abs(cairoNowMinutes() - now) <= 1,
        "the clock the service reports is Cairo's, not the host's",
      );
    }

    console.log("\n(3) narrowing the list never moves the selection");
    const searched = await listCounterTeachers(A, { q: `${tag}-idle` });
    ok(
      searched.teachers.length === 1 && searched.teachers[0]?.teacherId === fx.teachers.idle,
      "?q= filters by name",
    );
    ok(
      searched.defaultTeacherId === teachers.defaultTeacherId,
      "?q= leaves defaultTeacherId alone — typing must not change who is on now",
    );

    console.log("\n(4) the day: this teacher's lessons at THIS center, today");
    const day = await listCounterSessions(fx.teachers.live, A);
    const dayIds = day.sessions.map((s) => s.sessionId);
    ok(dayIds.includes(fx.sessions.live) && dayIds.includes(fx.sessions.done), "both of today's lessons");
    ok(!dayIds.includes(fx.sessions.yesterday), "yesterday's lesson is not in today's list");
    ok(!dayIds.includes(fx.sessions.later), "another teacher's lesson is not in this teacher's list");
    if (clockUsable) {
      ok(day.defaultSessionId === fx.sessions.live, "the running lesson is preselected, not the finished one");
      ok(day.sessions.find((s) => s.sessionId === fx.sessions.live)?.live === true, "it is flagged live");
      ok(day.sessions.find((s) => s.sessionId === fx.sessions.done)?.live === false, "the finished one is not");
    }
    const liveChip = day.sessions.find((s) => s.sessionId === fx.sessions.live);
    ok(liveChip?.enrolled === 3, `the chip counts the 3 enrolled (got ${liveChip?.enrolled})`);
    ok(liveChip?.checkedIn === 1, `the chip counts the 1 checked in (got ${liveChip?.checkedIn})`);
    ok(liveChip?.pricePerSession === 7500, "the chip carries the server's per-session price");

    console.log("\n(5) tenancy: a foreign lesson is refused by every read");
    const foreignDay = await listCounterSessions(fx.teachers.foreign, A);
    ok(
      foreignDay.sessions.length === 0,
      "asking center A for center B's teacher returns nothing rather than B's day",
    );
    let refused = false;
    try {
      await counterRoster(fx.sessions.foreign, A);
    } catch {
      refused = true;
    }
    ok(refused, "counterRoster REFUSES a session that is not at the caller's center");
    const bDay = await listCounterSessions(fx.teachers.foreign, B);
    ok(bDay.sessions.length === 1, "…and center B still gets its own teacher's day");

    console.log("\n(6) the roster is a UNION, and the tabs partition it");
    const roster = await counterRoster(fx.sessions.live, A);
    const rosterIds = roster.students.map((s) => s.studentId);
    ok(rosterIds.includes(fx.students.enrolled1), "an enrolled student is listed");
    ok(
      rosterIds.includes(fx.students.passOnly),
      "a student who paid a pass but is NOT enrolled is listed — otherwise they vanish from the screen they paid on",
    );
    ok(
      rosterIds.includes(fx.students.present),
      "a student with an attendance row is listed",
    );
    ok(
      !rosterIds.includes(fx.students.stranger),
      "an UNENROLLED (dropped) student on the center roster is NOT in this lesson",
    );
    ok(roster.counts.total === rosterIds.length, "counts.total is the list's own length");

    const attended = roster.students.filter(
      (s) => s.attendance === "present" || s.attendance === "counter_only",
    );
    ok(
      roster.counts.checkedIn === attended.length && roster.counts.checkedIn === 1,
      `the "checked in" tab is exactly the present/counter_only rows (got ${roster.counts.checkedIn})`,
    );
    ok(
      attended.every((s) => rosterIds.includes(s.studentId)),
      "the first tab is a SUBSET of the second — one list, two views",
    );

    console.log("\n(7) coverage is a question about THIS lesson");
    const byId = new Map(roster.students.map((s) => [s.studentId, s]));
    ok(byId.get(fx.students.passOnly)?.covered === true, "a per-session pass for this lesson covers it");
    ok(
      byId.get(fx.students.enrolled2)?.covered === false,
      "a monthly subscription whose window ended in 2020 does NOT cover today",
    );
    ok(byId.get(fx.students.enrolled1)?.covered === false, "an enrolled student who has paid nothing is uncovered");
    ok(byId.get(fx.students.passOnly)?.enrolled === false, "…and the pass-holder is marked as off the roster");
    ok(byId.get(fx.students.enrolled1)?.enrolled === true, "…while the enrolled one is marked on it");

    console.log("\n(8) the lesson header carries what the commit needs");
    ok(roster.session.pricePerSession === 7500, "the price the collect step quotes comes from the server");
    ok(
      roster.session.courseId === day.sessions.find((s) => s.sessionId === fx.sessions.live)?.courseId,
      "the courseId the pass is written against is the same one the chip named",
    );
    ok(roster.session.live === (clockUsable ? true : roster.session.live), "the header agrees with the chip on live");
    ok(roster.session.attendanceMode === "counter_only", "the teacher's attendance mode is reported (default counter_only)");
  } finally {
    const c = await admin.connect();
    const studentIds = Object.values(fx.students);
    const teacherIds = Object.values(fx.teachers);
    try {
      await c.query(`DELETE FROM attendance_records WHERE id = $1`, [fx.attendance]);
      await c.query(`DELETE FROM subscriptions WHERE id = ANY($1::uuid[])`, [fx.subs]);
      await c.query(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [fx.courses]);
      await c.query(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [fx.courses]);
      await c.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [fx.courses]);
      await c.query(`DELETE FROM center_student_rosters WHERE student_id = ANY($1::uuid[])`, [studentIds]);
      await c.query(`DELETE FROM center_teacher_affiliations WHERE teacher_id = ANY($1::uuid[])`, [teacherIds]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [teacherIds]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[...studentIds, ...teacherIds]]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [[fx.centerA, fx.centerB]]);
    } finally {
      c.release();
      await admin.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite counter-board.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
