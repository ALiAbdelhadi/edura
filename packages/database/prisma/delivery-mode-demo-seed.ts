// Demo data for the delivery-mode + find-a-teacher-by-day work.
//
// Creates classes only: one per (day, delivery mode) combination for the
// Baccalaureate-3 academic track, so the student's own "My subjects" tab and the
// new "Find a teacher" screen both have something real to show. Every course is
// flagged is_demo and every id is derived from a fixed namespace, so re-running
// is idempotent and `--purge` removes exactly what this file made.
//
// It writes NO money: no payments, no wallets, no ledger rows. Sessions are
// generated only so the per-session booking picker has dates to offer.
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

const PURGE = process.argv.includes("--purge");
const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const did = seedId("edura-deliverydemo:");

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (offset: number) =>
  new Date(Math.floor((Date.now() + offset * DAY_MS) / DAY_MS) * DAY_MS);

type DemoTeacher = { key: string; name: string; email: string };

// Dev carries exactly one live teacher (the uat set is soft-deleted), and a
// "find a teacher" screen with one teacher proves nothing. These three are demo
// root entities: flagged is_demo, deterministic ids, removed by --purge.
const TEACHERS: DemoTeacher[] = [
  { key: "t-mahmoud", name: "أ. محمود سيد", email: "demo.mahmoud@edura.demo" },
  { key: "t-hala", name: "أ. هالة منير", email: "demo.hala@edura.demo" },
  { key: "t-hossam", name: "أ. حسام عزيز", email: "demo.hossam@edura.demo" },
];

type Plan = {
  key: string;
  title: string;
  teacherKey: string;
  days: number[];
  startTime: string;
  endTime: string;
  deliveryMode: "onsite" | "online" | "hybrid";
  onlineUrl: string | null;
  subjectName: string;
  pricePerMonth: number;
  pricePerSession: number;
};

// Saturday=6, Sunday=0, Monday=1, Wednesday=3, Thursday=4 — deliberately spread
// so a day filter visibly changes the answer.
const PLANS: Plan[] = [
  {
    key: "wed-online-math",
    title: "رياضيات — أونلاين (الأربعاء)",
    teacherKey: "t-mahmoud",
    days: [3],
    startTime: "17:00",
    endTime: "19:00",
    deliveryMode: "online",
    onlineUrl: "https://meet.example.com/edura-demo-math-wed",
    subjectName: "الرياضيات (مستوى رفيع)",
    pricePerMonth: 60000,
    pricePerSession: 20000,
  },
  {
    key: "wed-onsite-physics",
    title: "فيزياء — حضوري (الأربعاء)",
    teacherKey: "t-hala",
    days: [3],
    startTime: "10:00",
    endTime: "12:00",
    deliveryMode: "onsite",
    onlineUrl: null,
    subjectName: "الفيزياء",
    pricePerMonth: 55000,
    pricePerSession: 18000,
  },
  {
    key: "wed-hybrid-arabic",
    title: "لغة عربية — حضوري + أونلاين (الأربعاء)",
    teacherKey: "t-hossam",
    days: [3, 6],
    startTime: "19:30",
    endTime: "21:00",
    deliveryMode: "hybrid",
    onlineUrl: "https://meet.example.com/edura-demo-arabic",
    subjectName: "اللغة العربية",
    pricePerMonth: 45000,
    pricePerSession: 15000,
  },
  {
    key: "sun-onsite-history",
    title: "تاريخ — حضوري (الأحد)",
    teacherKey: "t-hala",
    days: [0],
    startTime: "09:00",
    endTime: "10:30",
    deliveryMode: "onsite",
    onlineUrl: null,
    subjectName: "التاريخ المصري",
    pricePerMonth: 35000,
    pricePerSession: 12000,
  },
  {
    key: "mon-online-english",
    title: "لغة أجنبية أولى — أونلاين (الاثنين)",
    teacherKey: "t-mahmoud",
    days: [1, 4],
    startTime: "16:00",
    endTime: "17:30",
    deliveryMode: "online",
    onlineUrl: "https://meet.example.com/edura-demo-english",
    subjectName: "اللغة الأجنبية الأولى",
    pricePerMonth: 50000,
    pricePerSession: 17000,
  },
];

async function main() {
  await assertNotProduction("delivery-mode-demo-seed");

  const courseIds = PLANS.map((p) => did(p.key));

  const teacherIds = TEACHERS.map((t) => did(t.key));

  if (PURGE) {
    await withPlatformContext(async (tx) => {
      await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
      await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
      const removed = await tx.course.deleteMany({ where: { id: { in: courseIds } } });
      await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: teacherIds } } });
      await tx.teacherProfile.deleteMany({ where: { userId: { in: teacherIds } } });
      console.log(`purged ${removed.count} demo course(s)`);
    });

    // `tx.user.deleteMany` is rewritten to a SOFT delete by the client
    // extension: it stamps deleted_at and leaves the row. That is right for real
    // people and wrong for a demo purge — the rows would survive every future
    // run while the script cheerfully reported them removed. So the users, and
    // the auth_accounts the password trigger mirrors for them, are removed on
    // the owner connection, in one statement each.
    const admin = new Pool({ connectionString: process.env.ADMIN_URL });
    try {
      await admin.query(`DELETE FROM auth_accounts WHERE user_id = ANY($1::uuid[])`, [teacherIds]);
      const gone = await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [teacherIds]);
      console.log(`purged ${gone.rowCount} demo teacher(s)`);
    } finally {
      await admin.end();
    }
    await prisma.$disconnect();
    return;
  }

  await withPlatformContext(async (tx) => {
    const grade = await tx.gradeLevel.findFirst({ where: { code: "BAC_3" } });
    const student = await tx.studentProfile.findFirst({
      where: { onboardingCompleted: true, gradeLevelId: { not: null } },
      select: { gradeLevelId: true, trackId: true },
    });
    const gradeLevelId = student?.gradeLevelId ?? grade?.id ?? null;
    if (!gradeLevelId) throw new Error("no onboarded student and no BAC_3 grade level to target");

    const center = await tx.center.findFirst({ where: { status: "active" } });
    if (!center) throw new Error("no active center on this database");

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    for (const t of TEACHERS) {
      const id = did(t.key);
      const base = {
        name: t.name,
        email: t.email,
        role: "teacher" as const,
        status: "active" as const,
        passwordHash,
        isDemo: true,
        deletedAt: null,
      };
      await tx.user.upsert({ where: { id }, create: { id, ...base }, update: base });
      await tx.teacherProfile.upsert({
        where: { userId: id },
        create: { userId: id, walletBalance: 0, ratingAvg: 4.5, ratingCount: 12 },
        update: {},
      });
      const affiliation = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId: center.id, teacherId: id },
        select: { id: true },
      });
      if (!affiliation) {
        await tx.centerTeacherAffiliation.create({
          data: {
            centerId: center.id,
            teacherId: id,
            status: "active",
            centerShare: 0,
            expiresAt: utcDay(365),
          },
        });
      }
    }

    for (const plan of PLANS) {
      const teacherId = did(plan.teacherKey);

      const subject = await tx.subject.findFirst({
        where: { nameAr: plan.subjectName, isActive: true },
        select: { id: true },
      });

      const id = did(plan.key);
      const data = {
        centerId: center.id,
        teacherId,
        title: plan.title,
        subject: plan.subjectName,
        subjectId: subject?.id ?? null,
        gradeLevelId,
        trackId: student?.trackId ?? null,
        daysOfWeek: plan.days,
        startTime: plan.startTime,
        endTime: plan.endTime,
        startDate: utcDay(-7),
        endDate: utcDay(60),
        price: plan.pricePerMonth,
        pricePerMonth: plan.pricePerMonth,
        pricePerSession: plan.pricePerSession,
        maxStudents: 25,
        status: "active" as const,
        deliveryMode: plan.deliveryMode,
        onlineUrl: plan.onlineUrl,
        isDemo: true,
      };
      await tx.course.upsert({ where: { id }, create: { id, ...data }, update: data });

      // Four weeks of dates so the per-session picker is not empty.
      await tx.session.deleteMany({ where: { courseId: id } });
      const rows: {
        courseId: string;
        teacherId: string;
        originalDate: Date;
        date: Date;
        startTime: string;
        endTime: string;
      }[] = [];
      for (let offset = 1; offset <= 28 && rows.length < 8; offset++) {
        const date = utcDay(offset);
        if (!plan.days.includes(date.getUTCDay())) continue;
        rows.push({
          courseId: id,
          teacherId,
          originalDate: date,
          date,
          startTime: plan.startTime,
          endTime: plan.endTime,
        });
      }
      if (rows.length > 0) await tx.session.createMany({ data: rows });
      console.log(`seeded ${plan.key} (${plan.deliveryMode}, days ${plan.days.join("/")}, ${rows.length} sessions)`);
    }
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
