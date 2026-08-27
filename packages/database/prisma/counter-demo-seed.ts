import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-counterdemo:");

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({
  id: did(key),
  key,
  name,
  role,
});

const HODA = P("hoda", "هدى مصطفى", "center_admin");
const MONA = P("mona", "منى رشدي", "center_staff");
const AHMED = P("ahmed", "أ. أحمد الشناوي", "teacher");
const SAMIA = P("samia", "أ. سامية درويش", "teacher");

const STUDENT_NAMES = [
  ["ali", "علي حسام"],
  ["nour", "نور الدين طارق"],
  ["salma", "سلمى مجدي"],
  ["kareem", "كريم أشرف"],
  ["habiba", "حبيبة وليد"],
  ["yassin", "ياسين محمود"],
  ["malak", "ملك عمرو"],
  ["adham", "أدهم سيد"],
  ["hana", "هنا إبراهيم"],
  ["ziad", "زياد فاروق"],
] as const;
const STUDENTS = STUDENT_NAMES.map(([k, n]) => P(k, n, "student"));

const STAFF = [HODA, MONA, AHMED, SAMIA];
const ALL = [...STAFF, ...STUDENTS];

const email = (p: Person) => `counterdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const CENTER = did("center");
const CENTER_SHORT_ID = "COUNTERDEMO1";
const ROOM_A = did("room:a");
const ROOM_B = did("room:b");
const COURSE_LIVE = did("course:live");
const COURSE_LATER = did("course:later");
const COURSE_SAMIA = did("course:samia");

const CAIRO = "Africa/Cairo";
const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const nowMinutes = (() => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
})();
const clock = (minutes: number) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, minutes));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const TODAY = new Date(`${dayKey}T00:00:00.000Z`);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

async function purge() {
  console.log("Purging counter-board demo data…");
  await withPlatformContext(async (tx) => {
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

    await tx.payment.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.subscription.deleteMany({ where: { courseId: { in: courseIds } } });

    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.room.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerStudentRoster.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
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
  await assertNotProduction("counter-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding counter-board demo…");

  const LESSONS = [
    {
      key: "earlier",
      course: COURSE_LIVE,
      teacher: AHMED,
      room: ROOM_A,
      start: clock(nowMinutes - 210),
      end: clock(nowMinutes - 120),
    },
    {
      key: "live",
      course: COURSE_LIVE,
      teacher: AHMED,
      room: ROOM_A,
      start: clock(nowMinutes - 30),
      end: clock(nowMinutes + 60),
    },
    {
      key: "later",
      course: COURSE_LATER,
      teacher: AHMED,
      room: ROOM_B,
      start: clock(nowMinutes + 120),
      end: clock(nowMinutes + 210),
    },
    {
      key: "samia",
      course: COURSE_SAMIA,
      teacher: SAMIA,
      room: ROOM_B,
      start: clock(nowMinutes + 90),
      end: clock(nowMinutes + 180),
    },
  ];

  await withPlatformContext(async (tx) => {
    for (const p of ALL) {
      await tx.user.upsert({
        where: { id: p.id },
        update: { name: p.name, status: "active", isDemo: true, deletedAt: null },
        create: {
          id: p.id,
          name: p.name,
          role: p.role,
          email: email(p),
          passwordHash: hash,
          status: "active",
          locale: "ar",
          isDemo: true,
        },
      });
    }

    await tx.center.upsert({
      where: { id: CENTER },
      update: { isDemo: true, onboardingCompleted: true },
      create: {
        id: CENTER,
        name: "سنتر الأفق التعليمي",
        shortId: CENTER_SHORT_ID,
        status: "active",
        ownerUserId: HODA.id,
        governorate: "الجيزة",
        area: "الدقي",
        address: "٣٤ شارع التحرير",
        phone: "0233334444",
        onboardingCompleted: true,
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: HODA.id },
      update: { centerId: CENTER },
      create: { userId: HODA.id, centerId: CENTER },
    });
    await tx.centerStaff.upsert({
      where: { centerId_staffUserId: { centerId: CENTER, staffUserId: MONA.id } },
      update: { role: "receptionist", removedAt: null },
      create: {
        centerId: CENTER,
        staffUserId: MONA.id,
        role: "receptionist",
        title: "مكتب الاستقبال",
      },
    });

    for (const [id, name] of [
      [ROOM_A, "قاعة ١"],
      [ROOM_B, "قاعة ٢"],
    ] as const) {
      await tx.room.upsert({
        where: { id },
        update: { name },
        create: { id, centerId: CENTER, name, capacity: 30, isActive: true },
      });
    }

    for (const [teacher, subjects] of [
      [AHMED, ["رياضيات"]],
      [SAMIA, ["لغة عربية"]],
    ] as const) {
      await tx.teacherProfile.upsert({
        where: { userId: teacher.id },
        update: { systemStatus: "enrolled" },
        create: {
          userId: teacher.id,
          walletBalance: 0,
          subjects: [...subjects],
          systemStatus: "enrolled",
        },
      });
      const existing = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId: CENTER, teacherId: teacher.id },
        select: { id: true },
      });
      if (existing) {
        await tx.centerTeacherAffiliation.update({
          where: { id: existing.id },
          data: { status: "active", removedAt: null },
        });
      } else {
        await tx.centerTeacherAffiliation.create({
          data: {
            centerId: CENTER,
            teacherId: teacher.id,
            status: "active",
            centerShare: 0,
            respondedAt: new Date(),
            expiresAt: daysAhead(3650),
          },
        });
      }
    }

    for (const s of STUDENTS) {
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: { fullName: s.name },
        create: {
          userId: s.id,
          fullName: s.name,
          entityType: "invited",
          familyLinkCode: `CNTRDEMO${s.key.slice(0, 6).toUpperCase()}`,
        },
      });
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: CENTER, studentId: s.id } },
        update: { leftAt: null },
        create: { centerId: CENTER, studentId: s.id },
      });
    }

    const groups = [
      {
        id: COURSE_LIVE,
        teacher: AHMED,
        title: "رياضيات — الصف الثالث الثانوي (مجموعة أ)",
        subject: "رياضيات",
        price: 60000,
        pricePerSession: 7500,
      },
      {
        id: COURSE_LATER,
        teacher: AHMED,
        title: "رياضيات — الصف الثاني الثانوي",
        subject: "رياضيات",
        price: 50000,
        pricePerSession: 6000,
      },
      {
        id: COURSE_SAMIA,
        teacher: SAMIA,
        title: "لغة عربية — الصف الثالث الثانوي",
        subject: "لغة عربية",
        price: 40000,
        pricePerSession: 5000,
      },
    ];

    for (const g of groups) {
      await tx.course.upsert({
        where: { id: g.id },
        update: { status: "active", isDemo: true, pricePerSession: g.pricePerSession },
        create: {
          id: g.id,
          centerId: CENTER,
          teacherId: g.teacher.id,
          title: g.title,
          subject: g.subject,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startTime: "16:00",
          endTime: "17:30",
          startDate: daysAgo(28),
          endDate: daysAhead(60),
          price: g.price,
          pricePerMonth: g.price,
          pricePerSession: g.pricePerSession,
          maxStudents: 30,
          status: "active",
          isDemo: true,
        },
      });
    }

    for (const l of LESSONS) {
      const id = did(`session:${l.key}`);
      await tx.session.upsert({
        where: { id },
        update: {
          date: TODAY,
          originalDate: TODAY,
          startTime: l.start,
          endTime: l.end,
          status: "scheduled",
          roomId: l.room,
        },
        create: {
          id,
          courseId: l.course,
          teacherId: l.teacher.id,
          roomId: l.room,
          originalDate: TODAY,
          date: TODAY,
          startTime: l.start,
          endTime: l.end,
          status: "scheduled",
        },
      });
    }

    const enrollments = [
      ...STUDENTS.slice(0, 8).map((s) => ({ student: s, course: COURSE_LIVE })),
      ...STUDENTS.slice(4, 8).map((s) => ({ student: s, course: COURSE_SAMIA })),
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
          enrolledBy: MONA.id,
        },
      });
    }
  });

  const live = LESSONS.find((l) => l.key === "live")!;
  console.log(`
Seeded. Sign in as the receptionist, whose FIRST screen is the board:
  ${email(MONA)} / ${PASSWORD}
Or as the center owner (board at /dashboard/admin/counter):
  ${email(HODA)} / ${PASSWORD}

  • ${AHMED.name} is teaching RIGHT NOW (${live.start}–${live.end}, قاعة ١),
    so the board opens on him with that lesson already selected.
  • 8 children on that lesson's roster, 4 on ${SAMIA.name}'s later one, and 2
    enrolled in nothing — search for هنا or زياد to reach them off-roster.
  • ZERO money rows are seeded, so everyone reads as unpaid and the
    "سجّلوا الحضور" tab starts empty. Collect the 75 EGP on the board and
    watch both tabs move — that runs the real money engine.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
