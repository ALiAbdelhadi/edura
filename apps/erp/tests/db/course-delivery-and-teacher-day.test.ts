import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@repo/server-core/erp-auth/session";
import { createCourse } from "@repo/server-core/services/center/courses";
import { searchCourses, searchTeachersByDay } from "@repo/server-core/services/discovery/discovery";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

const admin = testPool();

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

const su = (u: { id: string; role: string; centerId?: string }): SessionUser =>
  ({ id: u.id, role: u.role, centerId: u.centerId, locale: "ar", name: "test", email: null }) as unknown as SessionUser;

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_AT = Date.now();
const utcDay = (offset: number) => new Date(Math.floor((RUN_AT + offset * DAY_MS) / DAY_MS) * DAY_MS);

const WED = 3;
const SUN = 0;

async function main() {
  const tag = "dlv-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Course delivery mode + teacher-by-day DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string) =>
      tx.user.create({
        data: {
          name: `${tag}-${key}`,
          role: role as never,
          email: `${tag}-${key}@x.io`,
          status: "active",
        },
      });

    const owner = await mkUser("owner", "center_admin");
    const wedTeacher = await mkUser("wedT", "teacher");
    const sunTeacher = await mkUser("sunT", "teacher");
    for (const t of [wedTeacher, sunTeacher]) {
      await tx.teacherProfile.create({ data: { userId: t.id, walletBalance: 0, ratingAvg: 4 } });
    }

    const center = await tx.center.create({
      data: {
        name: tag,
        shortId: (tag + "XXXX").slice(0, 12).toUpperCase(),
        status: "active",
        ownerUserId: owner.id,
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    for (const t of [wedTeacher, sunTeacher]) {
      await tx.centerTeacherAffiliation.create({
        data: {
          centerId: center.id,
          teacherId: t.id,
          status: "active",
          centerShare: 0,
          expiresAt: utcDay(365),
        },
      });
    }

    const grade = await tx.gradeLevel.findFirst({ where: { isActive: true } });
    const subjects = await tx.subject.findMany({ where: { isActive: true }, take: 2 });
    return {
      owner,
      wedTeacher,
      sunTeacher,
      center: center.id,
      gradeLevelId: grade?.id ?? null,
      subjectA: subjects[0]?.id ?? null,
      subjectB: subjects[1]?.id ?? null,
    };
  });

  const ownerActor = su({ id: fx.owner.id, role: "center_admin", centerId: fx.center });
  const courseIds: string[] = [];

  const mkCourse = async (opts: {
    key: string;
    teacherId: string;
    days: number[];
    startTime?: string;
    deliveryMode: "onsite" | "online" | "hybrid";
    onlineUrl?: string | null;
    subjectId?: string | null;
    gradeLevelId?: string | null;
  }) => {
    const c = await withPlatformContext((tx) =>
      tx.course.create({
        data: {
          centerId: fx.center,
          teacherId: opts.teacherId,
          title: `${tag}-${opts.key}`,
          subject: `${tag}-subj`,
          subjectId: opts.subjectId ?? null,
          gradeLevelId: opts.gradeLevelId ?? null,
          daysOfWeek: opts.days,
          startTime: opts.startTime ?? "17:00",
          endTime: "19:00",
          startDate: utcDay(-1),
          endDate: utcDay(60),
          price: 10000,
          pricePerMonth: 10000,
          maxStudents: 20,
          status: "active",
          deliveryMode: opts.deliveryMode,
          onlineUrl: opts.onlineUrl ?? null,
        },
      }),
    );
    courseIds.push(c.id);
    return c;
  };

  try {
    // ---- 1. the write path carries the mode ----
    const created = await createCourse(ownerActor, {
      teacherId: fx.wedTeacher.id,
      title: tag + "-created",
      subject: tag + "-subj",
      schedulePattern: {
        daysOfWeek: [WED],
        startTime: "17:00",
        endTime: "19:00",
        startDate: utcDay(1),
        endDate: utcDay(30),
      },
      price: 10000,
      maxStudents: 20,
      deliveryMode: "online",
      onlineUrl: "https://meet.example.com/" + tag,
    });
    courseIds.push(created.course.id);
    assert(created.course.deliveryMode === "online", "createCourse stores deliveryMode=online");
    assert(
      created.course.onlineUrl === "https://meet.example.com/" + tag,
      "createCourse stores the meeting link",
    );

    // ---- 2. an onsite course may not carry a link ----
    let refused = false;
    try {
      await createCourse(ownerActor, {
        teacherId: fx.wedTeacher.id,
        title: tag + "-bad",
        subject: tag + "-subj",
        schedulePattern: {
          daysOfWeek: [WED],
          startTime: "17:00",
          endTime: "19:00",
          startDate: utcDay(1),
          endDate: utcDay(30),
        },
        price: 10000,
        maxStudents: 20,
        deliveryMode: "onsite",
        onlineUrl: "https://meet.example.com/leak",
      });
    } catch (e) {
      refused = e instanceof BusinessRuleError;
    }
    assert(refused, "an onsite class with a meeting link is refused by the service");

    // ...and by the database itself, whatever the service does.
    let dbRefused = false;
    try {
      await admin.query(
        `UPDATE courses SET online_url = 'https://x.test/leak' WHERE id = $1 AND delivery_mode = 'onsite'`,
        [(await mkCourse({ key: "onsite-raw", teacherId: fx.wedTeacher.id, days: [WED], deliveryMode: "onsite" })).id],
      );
    } catch {
      dbRefused = true;
    }
    assert(dbRefused, "courses_delivery_mode_shape refuses a link on an onsite row at the database");

    // ---- 3. the discovery fixtures ----
    await mkCourse({
      key: "wed-online",
      teacherId: fx.wedTeacher.id,
      days: [WED],
      deliveryMode: "online",
      onlineUrl: "https://meet.example.com/wed",
      subjectId: fx.subjectA,
    });
    await mkCourse({
      key: "wed-hybrid",
      teacherId: fx.wedTeacher.id,
      days: [WED],
      deliveryMode: "hybrid",
      onlineUrl: "https://meet.example.com/hyb",
      subjectId: fx.subjectB,
    });
    await mkCourse({
      key: "sun-onsite",
      teacherId: fx.sunTeacher.id,
      days: [SUN],
      startTime: "09:00",
      deliveryMode: "onsite",
      subjectId: fx.subjectA,
    });

    const mine = (rows: { title: string }[]) => rows.filter((r) => r.title.startsWith(tag));

    // ---- 4. delivery filter ----
    const onlineHits = mine(
      (await searchCourses({ q: tag, deliveryMode: "online", limit: "50" })).courses,
    );
    assert(
      onlineHits.length > 0 && onlineHits.every((c: any) => c.deliveryMode !== "onsite"),
      "deliveryMode=online returns online and hybrid, never onsite",
    );
    assert(
      onlineHits.some((c: any) => c.deliveryMode === "hybrid"),
      "a hybrid class satisfies a student asking for online",
    );

    const onsiteHits = mine(
      (await searchCourses({ q: tag, deliveryMode: "onsite", limit: "50" })).courses,
    );
    assert(
      onsiteHits.length > 0 && onsiteHits.every((c: any) => c.deliveryMode !== "online"),
      "deliveryMode=onsite returns onsite and hybrid, never online-only",
    );

    const hybridHits = mine(
      (await searchCourses({ q: tag, deliveryMode: "hybrid", limit: "50" })).courses,
    );
    assert(
      hybridHits.length > 0 && hybridHits.every((c: any) => c.deliveryMode === "hybrid"),
      "deliveryMode=hybrid is literal",
    );

    // ---- 5. the meeting link never leaves through search ----
    assert(
      onlineHits.every((c: any) => !("onlineUrl" in c)),
      "course search never returns the meeting link",
    );

    // ---- 6. the day filter is ANY-of ----
    const bothDays = mine(
      (await searchCourses({ q: tag, daysOfWeek: `${WED},${SUN}`, limit: "50" })).courses,
    );
    assert(
      bothDays.some((c: any) => c.daysOfWeek.includes(WED)) &&
        bothDays.some((c: any) => c.daysOfWeek.includes(SUN)),
      "daysOfWeek=3,0 returns classes on EITHER day (any-of, not all-of)",
    );

    // ---- 7. teachers by day ----
    const wedTeachers = (await searchTeachersByDay({ daysOfWeek: String(WED), q: tag, limit: "50" }))
      .teachers;
    assert(
      wedTeachers.some((t) => t.userId === fx.wedTeacher.id),
      "the Wednesday teacher is listed for daysOfWeek=3",
    );
    assert(
      !wedTeachers.some((t) => t.userId === fx.sunTeacher.id),
      "the Sunday-only teacher is NOT listed for daysOfWeek=3",
    );
    const wedHit = wedTeachers.find((t) => t.userId === fx.wedTeacher.id)!;
    assert(
      wedHit.courses.every((c) => c.matchedDays.every((d) => d === WED)),
      "matchedDays names only the day the student asked for",
    );
    assert(
      wedHit.courses.every((c) => !("onlineUrl" in c)),
      "teacher-by-day never returns the meeting link",
    );

    const sunTeachers = (await searchTeachersByDay({ daysOfWeek: String(SUN), q: tag, limit: "50" }))
      .teachers;
    assert(
      sunTeachers.some((t) => t.userId === fx.sunTeacher.id) &&
        !sunTeachers.some((t) => t.userId === fx.wedTeacher.id),
      "daysOfWeek=0 flips the answer to the Sunday teacher",
    );

    // ---- 8. day + subject together ----
    if (fx.subjectA && fx.subjectB) {
      const bySubject = (
        await searchTeachersByDay({
          daysOfWeek: String(WED),
          subjectId: fx.subjectB,
          q: tag,
          limit: "50",
        })
      ).teachers;
      const hit = bySubject.find((t) => t.userId === fx.wedTeacher.id);
      assert(
        !!hit && hit.courses.every((c) => c.subjectId === fx.subjectB),
        "day + subject narrows to that subject's groups only",
      );
    } else {
      console.log("  · catalog subjects absent — subject narrowing not exercised");
    }

    // ---- 9. delivery filter applies to the teacher view too ----
    const onsiteWed = (
      await searchTeachersByDay({ daysOfWeek: String(WED), deliveryMode: "onsite", q: tag, limit: "50" })
    ).teachers.find((t) => t.userId === fx.wedTeacher.id);
    assert(
      !onsiteWed || onsiteWed.courses.every((c) => c.deliveryMode !== "online"),
      "an online-only group is hidden from a student who wants to attend in person",
    );

    // ---- 10. a suspended teacher disappears from the list ----
    await admin.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [fx.wedTeacher.id]);
    const afterSuspend = (
      await searchTeachersByDay({ daysOfWeek: String(WED), q: tag, limit: "50" })
    ).teachers;
    assert(
      !afterSuspend.some((t) => t.userId === fx.wedTeacher.id),
      "a suspended teacher is not offered, even though their classes still exist",
    );
    await admin.query(`UPDATE users SET status = 'active' WHERE id = $1`, [fx.wedTeacher.id]);

    // ---- 11. the student's own year still bounds the answer ----
    if (fx.gradeLevelId) {
      const scoped = await mkCourse({
        key: "graded",
        teacherId: fx.sunTeacher.id,
        days: [WED],
        deliveryMode: "onsite",
        gradeLevelId: fx.gradeLevelId,
      });
      const others = await withPlatformContext((tx) =>
        tx.gradeLevel.findFirst({ where: { id: { not: fx.gradeLevelId! }, isActive: true } }),
      );
      if (others) {
        const wrongYear = (
          await searchTeachersByDay(
            { daysOfWeek: String(WED), q: tag, limit: "50" },
            { gradeLevelId: others.id, trackId: null },
          )
        ).teachers;
        assert(
          !wrongYear.some((t) => t.courses.some((c) => c.id === scoped.id)),
          "a class for another academic year is not shown to this student",
        );
        const rightYear = (
          await searchTeachersByDay(
            { daysOfWeek: String(WED), q: tag, limit: "50" },
            { gradeLevelId: fx.gradeLevelId, trackId: null },
          )
        ).teachers;
        assert(
          rightYear.some((t) => t.courses.some((c) => c.id === scoped.id)),
          "the same class IS shown to a student in its year",
        );
      } else {
        console.log("  · only one grade level in the catalog — scoping not exercised");
      }
    } else {
      console.log("  · catalog grade levels absent — scoping not exercised");
    }
  } finally {
    const q = (sql: string, params: unknown[]) => admin.query(sql, params);
    const U = [fx.owner.id, fx.wedTeacher.id, fx.sunTeacher.id];
    const C = [fx.center];
    await q(`DELETE FROM sessions WHERE course_id = ANY($1::uuid[])`, [courseIds]);
    await q(`DELETE FROM enrollments WHERE course_id = ANY($1::uuid[])`, [courseIds]);
    await q(`DELETE FROM courses WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM center_teacher_affiliations WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [C]);
    await q(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [U, C]);
    await q(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await q(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [C]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite course-delivery-and-teacher-day.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
