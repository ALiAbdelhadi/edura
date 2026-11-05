import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

// Accounts for the Paymob merchant review (docs/paymob-review/walkthrough.md):
// one independent teacher who prices her own groups, one student, and the
// student's parent. No wallet balance anywhere — every lesson in the review is
// paid by card straight through the gateway (payFrom "gateway").

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");
const DAY = 24 * 60 * 60 * 1000;

const did = seedId("edura-paymobreview:");
const flc = (id: string) =>
  createHash("sha1").update("pmrflc:" + id).digest("hex").slice(0, 10).toUpperCase();

const daysAhead = (d: number) => new Date(Date.now() + d * DAY);

type Person = { id: string; name: string; role: Role; slug: string };

const mk = (slug: string, name: string, role: Role): Person => ({
  id: did(`user:${slug}`),
  name,
  role,
  slug,
});

const TEACHER = mk("teacher", "أ. نهى الشريف", "teacher");
const STUDENT = mk("student", "عمر خالد", "student");
const PARENT = mk("parent", "خالد إبراهيم", "parent");

const ALL = [TEACHER, STUDENT, PARENT];
const email = (p: Person) => `review.${p.slug}@edura.demo`;
const EMAILS = ALL.map(email);

const COURSE_MATH = did("course:math");
const COURSE_PHYS = did("course:physics");

async function purge() {
  console.log("Purging Paymob-review demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const courses = await tx.course.findMany({
      where: { teacherId: { in: ids } },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.subscription.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollmentRequest.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.parentStudentLink.deleteMany({
      where: { OR: [{ parentId: { in: ids } }, { studentId: { in: ids } }] },
    });
    if (ids.length) {
      await tx.$executeRaw`
        DELETE FROM payment_intents
        WHERE payer_user_id = ANY(${ids}::uuid[]) OR student_id = ANY(${ids}::uuid[])`;
    }
    await tx.teacherGradeLevel.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.teacherSubject.deleteMany({ where: { teacherId: { in: ids } } });
    await tx.parentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", { users: hardDeleted, courses: courseIds.length });
    console.log(
      "NOTE: Payment / Transaction rows produced by paying in the preview are\n" +
        "      append-only and are NOT removed here — the Step 9 pre-launch wipe covers them.",
    );
  });
}

async function main() {
  await assertNotProduction("paymob-review-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  console.log("Seeding Paymob-review demo data…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(async (tx) => {
    // A grade + track with at least two subjects, so both groups show on the
    // student's own "my subjects" list.
    const offeringsAll = await tx.subjectOffering.findMany({
      where: { isActive: true, trackId: { not: null } },
      include: {
        gradeLevel: { select: { sortOrder: true } },
        subject: { select: { nameAr: true } },
      },
    });
    const byTrack = new Map<string, typeof offeringsAll>();
    for (const o of offeringsAll) {
      const k = `${o.gradeLevelId}:${o.trackId}`;
      byTrack.set(k, [...(byTrack.get(k) ?? []), o]);
    }
    const picked = [...byTrack.values()]
      .filter((g) => g.length >= 2)
      .sort((a, b) => b[0]!.gradeLevel.sortOrder - a[0]!.gradeLevel.sortOrder)[0];
    if (!picked) {
      throw new Error(
        "paymob-review-demo-seed: the education catalog is empty — run `bun run seed` first.",
      );
    }
    const [first, second] = picked as [(typeof picked)[0], (typeof picked)[0]];
    const grade = { id: first.gradeLevelId };

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
          emailVerified: true,
          isDemo: true,
        },
      });
    }

    await tx.teacherProfile.upsert({
      where: { userId: TEACHER.id },
      update: { onboardingCompleted: true },
      create: {
        userId: TEACHER.id,
        bio: "مدرسة رياضيات وفيزياء للثانوية العامة — حساب تجريبي للمراجعة",
        subjects: [],
        experienceYears: 8,
        onboardingCompleted: true,
      },
    });

    await tx.teacherGradeLevel.deleteMany({ where: { teacherId: TEACHER.id } });
    await tx.teacherGradeLevel.create({ data: { teacherId: TEACHER.id, gradeLevelId: grade.id } });
    await tx.teacherSubject.deleteMany({ where: { teacherId: TEACHER.id } });
    await tx.teacherSubject.createMany({
      data: [...new Set([first.subjectId, second.subjectId])].map((subjectId) => ({
        teacherId: TEACHER.id,
        subjectId,
      })),
    });

    await tx.parentProfile.upsert({
      where: { userId: PARENT.id },
      update: {},
      create: { userId: PARENT.id },
    });

    await tx.studentProfile.upsert({
      where: { userId: STUDENT.id },
      update: {
        fullName: STUDENT.name,
        gradeLevelId: grade.id,
        trackId: first.trackId,
        guardianEmail: email(PARENT),
      },
      create: {
        userId: STUDENT.id,
        fullName: STUDENT.name,
        familyLinkCode: flc(STUDENT.id),
        gradeLevelId: grade.id,
        trackId: first.trackId,
        guardianEmail: email(PARENT),
        onboardingCompleted: true,
      },
    });

    const link = await tx.parentStudentLink.findFirst({
      where: { parentId: PARENT.id, studentId: STUDENT.id },
    });
    if (link) {
      await tx.parentStudentLink.update({
        where: { id: link.id },
        data: { status: "approved", revokedBy: null },
      });
    } else {
      await tx.parentStudentLink.create({
        data: {
          parentId: PARENT.id,
          studentId: STUDENT.id,
          status: "approved",
          initiatedBy: "parent",
        },
      });
    }

    const mkCourse = async (
      id: string,
      offering: typeof first,
      title: string,
      perMonth: number,
      perSession: number,
      days: number[],
      startTime: string,
      endTime: string,
    ) => {
      await tx.course.upsert({
        where: { id },
        update: { title, subject: title, pricePerMonth: perMonth, pricePerSession: perSession, status: "active" },
        create: {
          id,
          centerId: null,
          teacherId: TEACHER.id,
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
          deliveryMode: "onsite",
          location: "مدينة نصر — القاهرة",
          maxStudents: 30,
          status: "active",
          isDemo: true,
        },
      });
      // The next four dates that fall on the course's own weekdays.
      const dates: Date[] = [];
      for (let d = 1; dates.length < 4; d++) {
        const when = daysAhead(d);
        if (days.includes(when.getDay())) dates.push(when);
      }
      for (let i = 0; i < 4; i++) {
        const when = dates[i]!;
        const sid = did(`session:${id}:${i}`);
        await tx.session.upsert({
          where: { id: sid },
          update: { date: when, originalDate: when, status: "scheduled" },
          create: {
            id: sid,
            courseId: id,
            teacherId: TEACHER.id,
            date: when,
            originalDate: when,
            startTime,
            endTime,
            status: "scheduled",
          },
        });
      }
    };

    // Titles follow the catalog subject, so the group shows under the subject it names.
    const t1 = `مجموعة ${first.subject.nameAr}`;
    const t2 = `مجموعة ${second.subject.nameAr}`;
    await mkCourse(COURSE_MATH, first, t1, 40000, 12000, [0, 3], "17:00", "18:30");
    await mkCourse(COURSE_PHYS, second, t2, 45000, 13000, [1, 4], "19:00", "20:30");

    console.log("  3 users (1 independent teacher, 1 student, 1 parent — linked and approved)");
    console.log("  2 courses priced monthly + per lesson, 8 upcoming lessons");
    console.log("  0 wallet balance, 0 subscriptions / payments (the reviewer pays them)");
  });

  console.log(`\nReview logins (password: ${PASSWORD})`);
  for (const p of ALL) console.log(`  ${p.role.padEnd(8)} ${email(p)} — ${p.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
