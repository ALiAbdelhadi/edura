import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { ownerPurgeMoneyRows } from "./owner-purge";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-reportexportdemo:");

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({ id: did(key), key, name, role });

const NADIA = P("nadia", "نادية شكري", "center_admin"); // owner — exports everything
const SAMEH = P("sameh", "سامح لطفي", "center_staff"); // manager — NOT revenue
const AZZA = P("azza", "عزة الطوخي", "center_staff"); // center_accountant — money only
const MAHMOUD = P("mahmoud", "أ. محمود قنديل", "teacher");
const SOHA = P("soha", "أ. سها الأبيض", "teacher");

const STUDENT_NAMES = [
  ["ganna", "جنة أيمن"],
  ["seif", "سيف الرحمن"],
  ["retaj", "ريتاج علاء"],
  ["yehia", "يحيى صبري"],
  ["basma", "بسمة الحسيني"],
  ["omnia", "أمنية رأفت"],
  ["taha", "طه عبد الله"],
  ["rowan", "روان مجدي"],
  ["kenzy", "كنزي إسلام"],
  ["fady", "فادي بطرس"],
  ["shahd", "شهد الطنطاوي"],
  ["ammar", "عمار السيد"],
] as const;
const STUDENTS = STUDENT_NAMES.map(([k, n]) => P(k, n, "student"));

const STAFF = [NADIA, SAMEH, AZZA, MAHMOUD, SOHA];
const ALL = [...STAFF, ...STUDENTS];

const email = (p: Person) => `rexpdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const CENTER = did("center");
const CENTER_SHORT_ID = "REPEXPDEMO1";

const FORMULA_TITLE = "=SUM(A1:A9) — مجموعة مراجعة نهائية";

type Group = {
  id: string;
  teacher: Person;
  title: string;
  subject: string;
  maxStudents: number;
  enrolled: number;
  shape: [number, number, number];
};

const GROUPS: Group[] = [
  {
    id: did("course:math3"),
    teacher: MAHMOUD,
    title: "رياضيات — الصف الثالث الثانوي",
    subject: "رياضيات",
    maxStudents: 12,
    enrolled: 11, // ~92% — nearly full
    shape: [9, 1, 1],
  },
  {
    id: did("course:arabic2"),
    teacher: SOHA,
    title: "لغة عربية — الصف الثاني الثانوي",
    subject: "لغة عربية",
    maxStudents: 14,
    enrolled: 7, // 50%
    shape: [5, 2, 0],
  },
  {
    id: did("course:formula"),
    teacher: MAHMOUD,
    title: FORMULA_TITLE,
    subject: "رياضيات",
    maxStudents: 20,
    enrolled: 3, // 15% — the nearly-empty one
    shape: [2, 1, 0],
  },
];

const WEEKS = 6;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);
const lessonDate = (weeksBack: number) => {
  const d = daysAgo(weeksBack * 7);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

async function purge() {
  console.log("Purging report-export demo data…");
  // Receipts go first and as the OWNER (migration 20260909120100, M-04).
  const purgeCenterIds = (
    await withPlatformContext((tx) => tx.center.findMany({ where: { OR: [{ shortId: CENTER_SHORT_ID }, { id: CENTER }] }, select: { id: true } }))
  ).map((c) => c.id);
  await ownerPurgeMoneyRows({ paymentCenterIds: purgeCenterIds });
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

    await tx.expense.deleteMany({ where: { centerId: { in: centerIds } } });

    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollmentRequest.deleteMany({ where: { courseId: { in: courseIds } } });
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
    await tx.$executeRaw`DELETE FROM user_prefs WHERE user_id = ANY(${ids}::uuid[])`;

    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", { users: hardDeleted, centers: centerIds.length, courses: courseIds.length });
  });
  console.log("Purged.");
}

async function main() {
  await assertNotProduction("report-export-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding report-export demo…");

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
  });

  await withPlatformContext(async (tx) => {
    await tx.center.upsert({
      where: { id: CENTER },
      update: { isDemo: true, status: "active" },
      create: {
        id: CENTER,
        name: "سنتر الصفوة — التقارير",
        shortId: CENTER_SHORT_ID,
        status: "active",
        ownerUserId: NADIA.id,
        governorate: "الإسكندرية",
        area: "سموحة",
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: NADIA.id },
      update: { centerId: CENTER },
      create: { userId: NADIA.id, centerId: CENTER },
    });

    for (const [staff, role, title] of [
      [SAMEH, "manager", "مدير الفرع"],
      [AZZA, "center_accountant", "الحسابات"],
    ] as const) {
      await tx.centerStaff.upsert({
        where: { centerId_staffUserId: { centerId: CENTER, staffUserId: staff.id } },
        update: { role, removedAt: null },
        create: { centerId: CENTER, staffUserId: staff.id, role, title },
      });
    }
  });

  await withPlatformContext(async (tx) => {
    for (const [teacher, subjects] of [
      [MAHMOUD, ["رياضيات"]],
      [SOHA, ["لغة عربية"]],
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
  });

  await withPlatformContext(async (tx) => {
    for (const s of STUDENTS) {
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: { fullName: s.name },
        create: {
          userId: s.id,
          fullName: s.name,
          entityType: "registered",
          familyLinkCode: `REXPDEMO${s.key.replace(/[^a-z]/g, "").toUpperCase()}`,
        },
      });
    }
    await tx.centerStudentRoster.createMany({
      data: STUDENTS.map((s) => ({ centerId: CENTER, studentId: s.id })),
      skipDuplicates: true,
    });
  });

  await withPlatformContext(async (tx) => {
    for (const g of GROUPS) {
      await tx.course.upsert({
        where: { id: g.id },
        update: { title: g.title, status: "active", maxStudents: g.maxStudents, isDemo: true },
        create: {
          id: g.id,
          centerId: CENTER,
          teacherId: g.teacher.id,
          title: g.title,
          subject: g.subject,
          daysOfWeek: [1, 3],
          startTime: "16:00",
          endTime: "17:30",
          startDate: daysAgo(WEEKS * 7 + 7),
          endDate: daysAhead(60),
          price: 60000,
          pricePerMonth: 60000,
          pricePerSession: 7500,
          maxStudents: g.maxStudents,
          status: "active",
          isDemo: true,
        },
      });
    }
  });

  await withPlatformContext(async (tx) => {
    await tx.enrollment.createMany({
      data: GROUPS.flatMap((g) =>
        STUDENTS.slice(0, g.enrolled).map((s) => ({
          id: did(`enr:${g.id}:${s.key}`),
          studentId: s.id,
          courseId: g.id,
          centerId: CENTER,
          status: "active" as const,
          enrolledBy: NADIA.id,
        })),
      ),
      skipDuplicates: true,
    });

    await tx.session.createMany({
      data: GROUPS.flatMap((g) =>
        Array.from({ length: WEEKS }, (_, w) => ({
          id: did(`ses:${g.id}:${w}`),
          courseId: g.id,
          teacherId: g.teacher.id,
          originalDate: lessonDate(w + 1),
          date: lessonDate(w + 1),
          startTime: "16:00",
          endTime: "17:30",
          status: "completed" as const,
        })),
      ),
      skipDuplicates: true,
    });
  });

  await withPlatformContext(async (tx) => {
    const rows = GROUPS.flatMap((g) =>
      Array.from({ length: WEEKS }, (_, w) => {
        const [present, absent, excused] = g.shape;
        const roster = STUDENTS.slice(0, g.enrolled);
        const rotated = [...roster.slice(w % roster.length), ...roster.slice(0, w % roster.length)];
        return rotated.slice(0, present + absent + excused).map((s, i) => ({
          sessionId: did(`ses:${g.id}:${w}`),
          studentId: s.id,
          courseId: g.id,
          centerId: CENTER,
          status: (i < present ? "present" : i < present + absent ? "absent" : "excused") as
            | "present"
            | "absent"
            | "excused",
          markedBy: g.teacher.id,
        }));
      }).flat(),
    );
    await tx.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
  });

  await withPlatformContext(async (tx) => {
    const plan: { status: "pending" | "approved" | "declined" | "expired"; n: number }[] = [
      { status: "pending", n: 4 },
      { status: "approved", n: 6 },
      { status: "declined", n: 2 },
      { status: "expired", n: 3 },
    ];
    let i = 0;
    const data = plan.flatMap((p) =>
      Array.from({ length: p.n }, () => {
        const s = STUDENTS[i % STUDENTS.length]!;
        const g = GROUPS[i % GROUPS.length]!;
        const idx = i++;
        return {
          id: did(`req:${idx}`),
          studentId: s.id,
          courseId: g.id,
          centerId: CENTER,
          status: p.status,
          submittedAt: daysAgo(3 + idx),
          ...(p.status === "pending"
            ? {}
            : { respondedAt: daysAgo(2 + idx), respondedBy: SAMEH.id }),
          ...(p.status === "declined" ? { declineReason: "المجموعة مكتملة" } : {}),
          expiresAt: p.status === "expired" ? daysAgo(1) : daysAhead(14),
        };
      }),
    );
    await tx.enrollmentRequest.createMany({ data, skipDuplicates: true });
  });

  console.log(`
Seeded. Open /dashboard/admin/reports and use the export menu (⤓ / 🖨).

  owner              ${email(NADIA)} / ${PASSWORD}   ← exports all 8 reports
  MANAGER            ${email(SAMEH)} / ${PASSWORD}   ← 3 reports; revenue REFUSED
  center_accountant  ${email(AZZA)} / ${PASSWORD}   ← the 5 money reports only

POPULATED (manager tier):
  • fill rates        ~92% / 50% / 15% across three groups — a column of 100%s
                      would prove nothing
  • attendance        ${WEEKS} weeks of present / absent / excused, so the rate is real
                      and the date range visibly narrows it
  • enrolment funnel  4 pending · 6 approved · 2 declined · 3 expired

EMPTY, ON PURPOSE (accountant tier): profit & loss, revenue by group, both
timeseries, expenses by category. This seed writes NO money rows — per the
Conventions rule a demo center must not carry invented revenue in the same
ledger every real report reads. Take one cash payment at the counter and
re-export: the numbers appear, which also proves the export reads the ledger
and not a fixture.

Worth doing:
  1. Sign in as the MANAGER and ask for "كشف الأرباح والخسائر". The server
     refuses — from the registry that defines the report, not from a list the
     route keeps. A manager may read attendance; they may not read revenue.
  2. Export "الحضور حسب المجموعة" as CSV and open it in Excel. Arabic renders
     because of the BOM; drop the BOM and every name becomes mojibake.
  3. Look at the group named "${FORMULA_TITLE}".
     In the file it is prefixed with an apostrophe and displays as TEXT. Without
     that, opening the file would EXECUTE it.
  4. Press print instead of download — same numbers, same service, no second
     query anywhere in the feature.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
