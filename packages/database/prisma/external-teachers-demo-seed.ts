import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;

// Deterministic UUIDv5 via the shared generator (H-03: never hand-rolled).
const did = seedId("edura-extteachersdemo:");
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
const daysAhead = (d: number) => new Date(Date.now() + d * DAY);

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({
  id: did(key),
  key,
  name,
  role,
});

// ---- the cast --------------------------------------------------------------
const MONA = P("mona", "منى شعبان", "center_admin");
const RANIA = P("rania", "رانيا فؤاد", "center_staff");
const TAREK = P("tarek", "أ. طارق منصور", "teacher"); // ON-PLATFORM
const HASSAN = P("hassan", "أ. حسن الشناوي", "teacher"); // OFF-SYSTEM
const SALWA = P("salwa", "أ. سلوى مرسي", "teacher"); // OFF-SYSTEM
const YOUSSEF = P("youssef", "يوسف أحمد", "student"); // the SHARED child
const MARIAM = P("mariam", "مريم خالد", "student");
const OMAR = P("omar", "عمر إبراهيم", "student");

const STAFF = [MONA, RANIA, TAREK, HASSAN, SALWA];
const STUDENTS = [YOUSSEF, MARIAM, OMAR];
const ALL = [...STAFF, ...STUDENTS];

// Natural keys — stable across any id-formula change (H-03 purge lesson).
const email = (p: Person) => `extdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);
const CENTER_SHORT_ID = "EXTDEMO0001";
const CENTER = did("center:ext");

const COURSE_HASSAN = did("course:hassan-physics");
const COURSE_TAREK = did("course:tarek-maths");
const COURSE_SALWA = did("course:salwa-chem");

async function purge() {
  console.log("Purging off-system-teacher demo data…");
  await withPlatformContext(async (tx) => {
    // Resolve by NATURAL keys, not derived ids (see messaging-demo-seed purge).
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: { OR: [{ shortId: CENTER_SHORT_ID }, { id: CENTER }] },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);

    const courses = await tx.course.findMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);
    const sessions = await tx.session.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true },
    });

    await tx.attendanceRecord.deleteMany({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
    });
    await tx.gradeScore.deleteMany({ where: { studentId: { in: ids } } });
    await tx.grade.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.centerStudentRoster.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
    // Raw hard delete: user.deleteMany is soft-delete-intercepted and would
    // leave the UNIQUE emails behind (P2002 on the next run).
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", {
      users: hardDeleted,
      centers: centerIds.length,
      courses: courseIds.length,
    });
  });
  console.log("Purged.");
}

async function main() {
  await assertNotProduction("external-teachers-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding off-system-teacher demo…");

  await withPlatformContext(async (tx) => {
    // ---- accounts ---------------------------------------------------------
    // The OFF-SYSTEM teachers are created exactly as the service creates them:
    // shell + NO password hash. If this seed gave them one, the preview would
    // quietly disagree with the feature it is demonstrating.
    for (const p of ALL) {
      const offSystem = p === HASSAN || p === SALWA;
      await tx.user.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          status: offSystem ? "shell" : "active",
          isDemo: true,
          deletedAt: null,
        },
        create: {
          id: p.id,
          name: p.name,
          role: p.role,
          email: email(p),
          phone: offSystem ? null : undefined,
          passwordHash: offSystem ? null : hash,
          status: offSystem ? "shell" : "active",
          locale: "ar",
          isDemo: true,
        },
      });
    }

    // ---- the center -------------------------------------------------------
    await tx.center.upsert({
      where: { id: CENTER },
      update: { isDemo: true },
      create: {
        id: CENTER,
        name: "سنتر النيل التعليمي",
        shortId: CENTER_SHORT_ID,
        status: "active",
        ownerUserId: MONA.id,
        governorate: "القاهرة",
        area: "مدينة نصر",
        address: "١٢ شارع مصطفى النحاس",
        phone: "0223456789",
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: MONA.id },
      update: { centerId: CENTER },
      create: { userId: MONA.id, centerId: CENTER },
    });
    await tx.centerStaff.upsert({
      where: { centerId_staffUserId: { centerId: CENTER, staffUserId: RANIA.id } },
      update: { role: "receptionist", removedAt: null },
      create: {
        centerId: CENTER,
        staffUserId: RANIA.id,
        role: "receptionist",
        title: "مكتب الاستقبال",
      },
    });

    // ---- teacher profiles -------------------------------------------------
    await tx.teacherProfile.upsert({
      where: { userId: TAREK.id },
      update: { systemStatus: "enrolled" },
      create: {
        userId: TAREK.id,
        walletBalance: 0,
        subjects: ["رياضيات"],
        systemStatus: "enrolled",
      },
    });
    for (const [teacher, subjects] of [
      [HASSAN, ["فيزياء"]],
      [SALWA, ["كيمياء"]],
    ] as const) {
      await tx.teacherProfile.upsert({
        where: { userId: teacher.id },
        update: {
          systemStatus: "external",
          managedByCenterId: CENTER,
          dataSource: "manual",
        },
        create: {
          userId: teacher.id,
          walletBalance: 0,
          subjects: [...subjects],
          systemStatus: "external",
          managedByCenterId: CENTER,
          dataSource: "manual",
        },
      });
    }

    // ---- affiliations -----------------------------------------------------
    for (const [teacher, share, source] of [
      [TAREK, 0, "system"],
      [HASSAN, 1000, "manual"], // 10 EGP per lesson to the center
      [SALWA, 1500, "manual"],
    ] as const) {
      const existing = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId: CENTER, teacherId: teacher.id },
        select: { id: true },
      });
      if (existing) {
        await tx.centerTeacherAffiliation.update({
          where: { id: existing.id },
          data: { status: "active", removedAt: null, centerShare: share },
        });
      } else {
        await tx.centerTeacherAffiliation.create({
          data: {
            centerId: CENTER,
            teacherId: teacher.id,
            status: "active",
            centerShare: share,
            dataSource: source,
            respondedAt: new Date(),
            expiresAt: daysAhead(3650),
          },
        });
      }
    }

    // ---- student profiles -------------------------------------------------
    // National IDs are made-up but well-formed 14-digit strings — the column is
    // UNIQUE, so a demo value must never collide with a real one.
    const NID: Record<string, string> = {
      youssef: "30105011234501",
      mariam: "30203022345602",
      omar: "30310033456703",
    };
    for (const s of STUDENTS) {
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: { fullName: s.name, nationalId: NID[s.key] },
        create: {
          userId: s.id,
          fullName: s.name,
          phone: null,
          nationalId: NID[s.key],
          entityType: "invited",
          familyLinkCode: `EXTDEMO${s.key.slice(0, 6).toUpperCase()}`,
        },
      });
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: CENTER, studentId: s.id } },
        update: { leftAt: null },
        create: { centerId: CENTER, studentId: s.id, dataSource: "manual" },
      });
    }

    // ---- groups -----------------------------------------------------------
    const groups = [
      {
        id: COURSE_HASSAN,
        teacher: HASSAN,
        title: "فيزياء — الصف الثالث الثانوي",
        subject: "فيزياء",
        price: 60000,
        pricePerMonth: 60000,
        pricePerSession: 7500,
        source: "manual" as const,
      },
      {
        id: COURSE_TAREK,
        teacher: TAREK,
        title: "رياضيات — الصف الثالث الثانوي",
        subject: "رياضيات",
        price: 50000,
        pricePerMonth: 50000,
        pricePerSession: 6000,
        source: "system" as const,
      },
      {
        // Deliberately UNPRICED and empty — the completeness report must have
        // something real to find, and an empty report proves nothing.
        id: COURSE_SALWA,
        teacher: SALWA,
        title: "كيمياء — الصف الثاني الثانوي",
        subject: "كيمياء",
        price: 0,
        pricePerMonth: null,
        pricePerSession: null,
        source: "manual" as const,
      },
    ];

    for (const g of groups) {
      await tx.course.upsert({
        where: { id: g.id },
        update: { status: "active", isDemo: true },
        create: {
          id: g.id,
          centerId: CENTER,
          teacherId: g.teacher.id,
          title: g.title,
          subject: g.subject,
          daysOfWeek: [1, 4],
          startTime: "16:00",
          endTime: "17:30",
          startDate: daysAgo(28),
          endDate: daysAhead(28),
          price: g.price,
          pricePerMonth: g.pricePerMonth,
          pricePerSession: g.pricePerSession,
          maxStudents: 25,
          status: "active",
          dataSource: g.source,
          isDemo: true,
        },
      });

      // Four lessons: two in the past (so the gaps report has real material)
      // and two ahead. NO attendance is seeded — an unmarked past lesson is
      // precisely the silent failure the report exists to surface.
      for (const [i, offset] of [-21, -14, 7, 14].entries()) {
        const when = offset < 0 ? daysAgo(-offset) : daysAhead(offset);
        const sessionId = did(`session:${g.id}:${i}`);
        await tx.session.upsert({
          where: { id: sessionId },
          update: { date: when },
          create: {
            id: sessionId,
            courseId: g.id,
            teacherId: g.teacher.id,
            originalDate: when,
            date: when,
            startTime: "16:00",
            endTime: "17:30",
            status: "scheduled",
            dataSource: g.source,
          },
        });
      }
    }

    // ---- enrollments: THE SHARED CHILD ------------------------------------
    // يوسف is in BOTH the off-system teacher's group and the on-platform one,
    // under ONE user id. That is the case a duplicated record would have hidden.
    const enrollments = [
      { student: YOUSSEF, course: COURSE_HASSAN, source: "manual" as const },
      { student: YOUSSEF, course: COURSE_TAREK, source: "system" as const },
      { student: MARIAM, course: COURSE_HASSAN, source: "manual" as const },
      { student: OMAR, course: COURSE_HASSAN, source: "manual" as const },
    ];
    for (const e of enrollments) {
      const existing = await tx.enrollment.findFirst({
        where: { studentId: e.student.id, courseId: e.course, status: "active" },
        select: { id: true },
      });
      if (existing) continue;
      await tx.enrollment.create({
        data: {
          studentId: e.student.id,
          courseId: e.course,
          centerId: CENTER,
          status: "active",
          enrolledBy: RANIA.id,
          dataSource: e.source,
        },
      });
    }
  });

  console.log(`
Seeded. Sign in as the center owner:
  ${email(MONA)} / ${PASSWORD}
Or the receptionist who does the manual entry:
  ${email(RANIA)} / ${PASSWORD}

Then open  /dashboard/admin/external-teachers

  • أ. حسن  — 3 students, one of them (يوسف) ALSO with an on-platform teacher
  • أ. سلوى — an unpriced, empty group, so the gaps report has real findings
  • NO money rows are seeded: take a cash payment and settle in the preview,
    which is the part worth seeing.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
