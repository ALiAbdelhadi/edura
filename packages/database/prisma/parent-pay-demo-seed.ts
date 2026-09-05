import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { ownerPurgeMoneyRows } from "./owner-purge";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;

const did = seedId("edura-paydemo:");
const flc = (id: string) =>
  createHash("sha1").update("payflc:" + id).digest("hex").slice(0, 10).toUpperCase();

const daysAhead = (d: number) => new Date(Date.now() + d * DAY);

type Person = { id: string; name: string; role: Role; slug: string };

const mk = (slug: string, name: string, role: Role): Person => ({
  id: did(`user:${slug}`),
  name,
  role,
  slug,
});

const SAMI = mk("sami", "أ. سامي عبد الرحمن", "parent");
const YOUSEF = mk("yousef", "يوسف سامي", "student");
const MALAK = mk("malak", "ملك سامي", "student");
const MONA = mk("mona", "أ. منى فؤاد", "teacher");
const HANY = mk("hany", "أ. هاني رشدي", "center_admin");

const ALL = [SAMI, YOUSEF, MALAK, MONA, HANY];
const email = (p: Person) => `paydemo.${p.slug}@edura.demo`;
const EMAILS = ALL.map(email);

const CENTER = did("center:sada");
const CENTER_SHORT = "PAYDEMOSADA";
const COURSE_A = did("course:algebra");
const COURSE_B = did("course:physics");

const OPENING_BALANCE = 75000;


async function purge() {
  console.log("Purging parent-pay demo data…");
  // Parent-wallet ledger rows go first and as the OWNER (migration 20260909120100, M-04).
  const purgeParentIds = (
    await withPlatformContext((tx) =>
      tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users
        WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`,
    )
  ).map((u) => u.id);
  await ownerPurgeMoneyRows({ parentWalletParentIds: purgeParentIds });
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: { OR: [{ shortId: CENTER_SHORT }, { id: CENTER }] },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);
    const courses = await tx.course.findMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.subscription.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollmentRequest.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.centerStudentRoster.deleteMany({ where: { studentId: { in: ids } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.parentStudentLink.deleteMany({
      where: { OR: [{ parentId: { in: ids } }, { studentId: { in: ids } }] },
    });

    const ledgerRows = 0; // removed above, as the owner
    if (ids.length) {
      await tx.$executeRaw`
        DELETE FROM payment_intents
        WHERE payer_user_id = ANY(${ids}::uuid[]) OR student_id = ANY(${ids}::uuid[])`;
    }
    await tx.parentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", {
      users: hardDeleted,
      centers: centerIds.length,
      courses: courseIds.length,
      parentWalletLedgerRows: ledgerRows,
    });
    console.log(
      "NOTE: any Payment / Transaction rows produced by clicking through a\n" +
        "      checkout in the preview are append-only and are NOT removed here.\n" +
        "      They are covered by the Step 9 pre-launch wipe.",
    );
  });
}

async function main() {
  await assertNotProduction("parent-pay-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  console.log("Seeding parent-pay demo data…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(async (tx) => {
    const grade = await tx.gradeLevel.findFirst({ orderBy: { sortOrder: "asc" } });
    const offering = grade
      ? await tx.subjectOffering.findFirst({
          where: { gradeLevelId: grade.id, isActive: true },
        })
      : null;
    if (!grade || !offering) {
      throw new Error(
        "parent-pay-demo-seed: the education catalog is empty — run `bun run seed` first.",
      );
    }

    for (const p of ALL) {
      await tx.user.upsert({
        where: { id: p.id },
        update: { name: p.name, status: "active", isDemo: true },
        create: {
          id: p.id,
          name: p.name,
          email: email(p),
          role: p.role,
          status: "active",
          passwordHash,
          isDemo: true,
        },
      });
    }

    await tx.parentProfile.upsert({
      where: { userId: SAMI.id },
      update: {},
      create: { userId: SAMI.id },
    });

    for (const s of [YOUSEF, MALAK]) {
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: { fullName: s.name, gradeLevelId: grade.id, trackId: offering.trackId },
        create: {
          userId: s.id,
          fullName: s.name,
          familyLinkCode: flc(s.id),
          gradeLevelId: grade.id,
          trackId: offering.trackId,
          onboardingCompleted: true,
        },
      });
      const existing = await tx.parentStudentLink.findFirst({
        where: { parentId: SAMI.id, studentId: s.id },
      });
      if (existing) {
        await tx.parentStudentLink.update({
          where: { id: existing.id },
          data: { status: "approved", revokedBy: null },
        });
      } else {
        await tx.parentStudentLink.create({
          data: {
            parentId: SAMI.id,
            studentId: s.id,
            status: "approved",
            initiatedBy: "parent",
          },
        });
      }
    }

    await tx.teacherProfile.upsert({
      where: { userId: MONA.id },
      update: {},
      create: { userId: MONA.id, bio: `${MONA.name} — بيانات تجريبية`, subjects: [] },
    });

    await tx.center.upsert({
      where: { id: CENTER },
      update: { name: "مركز صدى العلم", status: "active", isDemo: true },
      create: {
        id: CENTER,
        shortId: CENTER_SHORT,
        name: "مركز صدى العلم",
        ownerUserId: HANY.id,
        area: "المعادي",
        governorate: "القاهرة",
        classroomCount: 4,
        status: "active",
        isDemo: true,
      },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: HANY.id },
      update: { centerId: CENTER },
      create: { userId: HANY.id, centerId: CENTER },
    });

    for (const s of [YOUSEF, MALAK]) {
      const roster = await tx.centerStudentRoster.findFirst({
        where: { centerId: CENTER, studentId: s.id, leftAt: null },
      });
      if (!roster) {
        await tx.centerStudentRoster.create({
          data: { centerId: CENTER, studentId: s.id },
        });
      }
    }

    const mkCourse = async (
      id: string,
      title: string,
      perMonth: number,
      perSession: number,
      days: number[],
      startTime: string,
      endTime: string,
    ) => {
      await tx.course.upsert({
        where: { id },
        update: { pricePerMonth: perMonth, pricePerSession: perSession, status: "active" },
        create: {
          id,
          centerId: CENTER,
          teacherId: MONA.id,
          title,
          subject: title,
          subjectId: offering.subjectId,
          gradeLevelId: grade.id,
          trackId: offering.trackId,
          daysOfWeek: days,
          startTime,
          endTime,
          startDate: daysAhead(1),
          price: perMonth,
          pricePerMonth: perMonth,
          pricePerSession: perSession,
          maxStudents: 25,
          status: "active",
          isDemo: true,
        },
      });
      for (let i = 0; i < 4; i++) {
        const when = daysAhead(3 + i * 7);
        const sid = did(`session:${id}:${i}`);
        await tx.session.upsert({
          where: { id: sid },
          update: { date: when, originalDate: when, status: "scheduled" },
          create: {
            id: sid,
            courseId: id,
            teacherId: MONA.id,
            date: when,
            originalDate: when,
            startTime,
            endTime,
            status: "scheduled",
          },
        });
      }
    };

    await mkCourse(COURSE_A, "الجبر والهندسة", 30000, 8000, [1, 3], "16:00", "17:30");
    await mkCourse(COURSE_B, "الفيزياء", 35000, 10000, [2, 4], "18:00", "19:30");

    const existingLedger = await tx.parentWalletLedger.count({
      where: { parentId: SAMI.id },
    });
    if (existingLedger === 0) {
      const updated = await tx.parentProfile.update({
        where: { userId: SAMI.id },
        data: { walletBalance: { increment: OPENING_BALANCE } },
        select: { walletBalance: true },
      });
      await tx.parentWalletLedger.create({
        data: {
          parentId: SAMI.id,
          type: "topup",
          delta: OPENING_BALANCE,
          balanceAfter: updated.walletBalance,
          method: "online_paymob",
          reason: "رصيد افتتاحي — بيانات تجريبية",
          recordedBy: SAMI.id,
        },
      });
    }

    console.log("  5 users (1 parent, 2 children, 1 teacher, 1 center admin)");
    console.log("  1 center, 2 courses (both plans priced), 8 upcoming sessions");
    console.log(`  parent wallet opening balance: ${OPENING_BALANCE / 100} EGP`);
    console.log("  0 paid subscriptions / payments / ledger transactions (pay them yourself)");
  });

  console.log(`\nDemo logins (password: ${PASSWORD})`);
  console.log(`  parent   ${email(SAMI)}   — ${SAMI.name}`);
  console.log(`  student  ${email(YOUSEF)} — ${YOUSEF.name}`);
  console.log(`  student  ${email(MALAK)}  — ${MALAK.name}`);
  console.log(
    `\nSign in as the parent → "ادفع لدرس" (/dashboard/parent/pay):\n` +
      `  pick a child, open a subject, choose a lesson, then pay by card\n` +
      `  (mock gateway) or straight from the wallet. Check the result on\n` +
      `  "محفظتي" (/dashboard/parent/wallet) and on the child's own screens.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
