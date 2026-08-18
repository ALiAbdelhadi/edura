import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import type { Role } from "../src/generated/client/index";
import { prisma, withPlatformContext } from "../src/index";
import { seedId } from "./seed-ids";

// ---------------------------------------------------------------------------
// WEEKLY CENTER DIGEST demo — a week that has already happened.
//
// THE WHOLE DIFFICULTY OF SEEDING THIS ONE IS THE WINDOW. The job reports the
// week BEFORE the run — Sunday 00:00 to Saturday 23:59:59 UTC — so fixtures
// placed "recently" land in the current week and the digest reports a quiet
// week over an empty range. `lastWeekRange` below is the job's own function,
// restated here, and every lesson is placed inside the window it returns. The
// seed prints the dates so you can check them against what the job says.
//
// THREE CENTERS, because the digest's interesting behaviour is who does NOT
// get one:
//   • the LIVE center      — a real week: lessons, attendance, a gap to fix
//   • the SUSPENDED owner  — skipped, never failed. The digest is not a way
//                            around a closed account.
//   • the OWNERLESS center — nobody to write to, which is a state, not a fault
//
// ZERO money rows (per the Conventions rule). The digest's revenue, expenses
// and net therefore read 0.00 and the template renders its "sessions ran but
// nothing was collected" variant — which is a REAL state for a center that
// bills monthly and had a quiet week, not a broken fixture. Take a cash
// payment in the preview and run the job again; the same email fills in.
//
// AND IT WRITES NO `center.weekly_digest_sent` AUDIT ROW. That row is the
// idempotency key, and a seed that planted one would silently suppress the
// first digest — the exact bug the row exists to prevent, introduced by the
// fixture meant to demonstrate it.
// ---------------------------------------------------------------------------

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-weeklydigestdemo:");

type Person = { id: string; key: string; name: string; role: Role };
const P = (key: string, name: string, role: Role): Person => ({ id: did(key), key, name, role });

const HODA = P("hoda", "هدى الشاذلي", "center_admin"); // live center owner
const WALID = P("walid", "وليد قابيل", "center_admin"); // suspended owner
const YOUSSEF = P("youssef", "أ. يوسف الجزار", "teacher"); // on-platform
const NAGWA = P("nagwa", "أ. نجوى السقا", "teacher"); // OFF-SYSTEM — the gaps
const STUDENT_NAMES = [
  ["laila", "ليلى مؤمن"],
  ["hamza", "حمزة الشريف"],
  ["jana", "جنى وجدي"],
  ["karim", "كريم الديب"],
  ["nour", "نور الهدى سعد"],
  ["adam", "آدم الفقي"],
  ["mariam", "مريم القاضي"],
  ["zein", "زين العابدين"],
] as const;
const STUDENTS = STUDENT_NAMES.map(([k, n]) => P(k, n, "student"));

const ALL = [HODA, WALID, YOUSSEF, NAGWA, ...STUDENTS];
const email = (p: Person) => `wdigdemo-${p.key}@edura.test`;
const EMAILS = ALL.map(email);

const CENTER = did("center:live");
const CENTER_SHORT_ID = "WDIGDEMO1";
const SUSPENDED_CENTER = did("center:susp");
const SUSPENDED_SHORT_ID = "WDIGDEMO2";
const ORPHAN_CENTER = did("center:orphan");
const ORPHAN_SHORT_ID = "WDIGDEMO3";

const COURSE_MAIN = did("course:main");
const COURSE_EXTERNAL = did("course:external");

/**
 * The job's own window, restated. Duplicated deliberately and printed, so a
 * drift between this and `runWeeklyCenterDigest` shows up as dates that do not
 * match rather than as a demo that quietly reports an empty week.
 */
function lastWeekRange(now: Date): { start: Date; end: Date } {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() - end.getUTCDay() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

const WEEK = lastWeekRange(new Date());
const dateKey = (d: Date) => d.toISOString().slice(0, 10);
/** Day N of last week (0 = Sunday), at midnight UTC like every other lesson. */
const dayOfWeek = (n: number) => new Date(WEEK.start.getTime() + n * 86_400_000);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Lessons inside the reported window: 3 taught, 1 left open by the off-system teacher. */
const LESSONS = [
  { key: "mon", course: COURSE_MAIN, teacher: YOUSSEF, day: 1, status: "completed" as const },
  { key: "wed", course: COURSE_MAIN, teacher: YOUSSEF, day: 3, status: "completed" as const },
  { key: "sat", course: COURSE_MAIN, teacher: YOUSSEF, day: 6, status: "completed" as const },
  // Never closed. `buildGapReport` calls this BLOCKING and it is the finding
  // operators most often miss: an uncompleted lesson never runs distribution,
  // so the teacher is silently never credited. The digest's `gapsCount` is
  // what surfaces it, which is the reason this row exists.
  { key: "ext", course: COURSE_EXTERNAL, teacher: NAGWA, day: 2, status: "scheduled" as const },
];

async function purge() {
  console.log("Purging weekly-digest demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${ALL.map((p) => p.id)}::uuid[])`;
    const ids = users.map((u) => u.id);
    const centers = await tx.center.findMany({
      where: {
        OR: [
          { shortId: { in: [CENTER_SHORT_ID, SUSPENDED_SHORT_ID, ORPHAN_SHORT_ID] } },
          { id: { in: [CENTER, SUSPENDED_CENTER, ORPHAN_CENTER] } },
        ],
      },
      select: { id: true },
    });
    const centerIds = centers.map((c) => c.id);
    const courses = await tx.course.findMany({
      where: { OR: [{ centerId: { in: centerIds } }, { teacherId: { in: ids } }] },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    await tx.payment.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.expense.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });
    await tx.centerStudentRoster.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { centerId: { in: centerIds } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
    await tx.center.deleteMany({ where: { id: { in: centerIds } } });
    const hardDeleted =
      ids.length === 0
        ? 0
        : await tx.$executeRaw`DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;

    console.log("Purged:", { users: hardDeleted, centers: centerIds.length, courses: courseIds.length });
  });
  console.log("Purged.");
  console.log(
    "NOTE: any `center.weekly_digest_sent` audit row a real run produced STAYS —\n" +
      "`audit_logs` is REVOKEd DELETE for the app role. It names a center id that\n" +
      "no longer resolves, and it is the append-only trail working as designed.",
  );
}

async function main() {
  await assertNotProduction("weekly-digest-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding weekly-digest demo…");
  console.log(`  the reported week will be ${dateKey(WEEK.start)} → ${dateKey(WEEK.end)}`);

  // Several small transactions rather than one: each write is a round trip to a
  // remote Neon and the whole seed exceeds the 20s interactive limit from a
  // laptop. Every write is an upsert or a skipDuplicates createMany.
  await withPlatformContext(async (tx) => {
    for (const p of ALL) {
      await tx.user.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          // WALID is suspended on purpose: his center is active and has an
          // owner, and the digest still must not reach him.
          status: p.key === "walid" ? "suspended" : "active",
          isDemo: true,
          deletedAt: null,
        },
        create: {
          id: p.id,
          name: p.name,
          role: p.role,
          email: email(p),
          // The off-system teacher never signs in: no password, status `shell`.
          // That is the door the external-teacher feature already uses, not a
          // second one.
          ...(p.key === "nagwa" ? { status: "shell" as const } : { passwordHash: hash, status: p.key === "walid" ? ("suspended" as const) : ("active" as const) }),
          locale: "ar",
          isDemo: true,
        },
      });
    }
  });

  await withPlatformContext(async (tx) => {
    for (const [id, name, shortId, owner] of [
      [CENTER, "سنتر البيان — المهندسين", CENTER_SHORT_ID, HODA.id],
      [SUSPENDED_CENTER, "سنتر الرواد — المعادي", SUSPENDED_SHORT_ID, WALID.id],
      [ORPHAN_CENTER, "سنتر الأمانة — أسيوط", ORPHAN_SHORT_ID, null],
    ] as const) {
      await tx.center.upsert({
        where: { id },
        update: { isDemo: true, status: "active", ownerUserId: owner },
        create: {
          id,
          name,
          shortId,
          // All three centers are ACTIVE — the job iterates active centers, so
          // an inactive one would be excluded before the interesting checks and
          // would demonstrate nothing.
          status: "active",
          ...(owner ? { ownerUserId: owner } : {}),
          governorate: "القاهرة",
          isDemo: true,
        },
      });
    }
    await tx.centerAdminProfile.upsert({
      where: { userId: HODA.id },
      update: { centerId: CENTER },
      create: { userId: HODA.id, centerId: CENTER },
    });
    await tx.centerAdminProfile.upsert({
      where: { userId: WALID.id },
      update: { centerId: SUSPENDED_CENTER },
      create: { userId: WALID.id, centerId: SUSPENDED_CENTER },
    });
  });

  await withPlatformContext(async (tx) => {
    await tx.teacherProfile.upsert({
      where: { userId: YOUSSEF.id },
      update: { systemStatus: "enrolled" },
      create: { userId: YOUSSEF.id, walletBalance: 0, subjects: ["فيزياء"], systemStatus: "enrolled" },
    });
    // OFF-SYSTEM: `managedByCenterId` is NOT NULL whenever systemStatus is
    // external (DB CHECK teacher_external_needs_center), and it is also what
    // scopes buildGapReport — no external teacher, no gaps, and the digest's
    // gapsCount would be a permanent zero.
    await tx.teacherProfile.upsert({
      where: { userId: NAGWA.id },
      update: { systemStatus: "external", managedByCenterId: CENTER },
      create: {
        userId: NAGWA.id,
        walletBalance: 0,
        subjects: ["كيمياء"],
        systemStatus: "external",
        managedByCenterId: CENTER,
        dataSource: "manual",
      },
    });

    for (const t of [YOUSSEF, NAGWA]) {
      const existing = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId: CENTER, teacherId: t.id },
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
            teacherId: t.id,
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
          familyLinkCode: `WDIGDEMO${s.key.replace(/[^a-z]/g, "").toUpperCase()}`,
        },
      });
    }
    await tx.centerStudentRoster.createMany({
      data: STUDENTS.map((s) => ({ centerId: CENTER, studentId: s.id })),
      skipDuplicates: true,
    });
  });

  await withPlatformContext(async (tx) => {
    for (const [id, teacher, title, subject, source] of [
      [COURSE_MAIN, YOUSSEF, "فيزياء — الصف الثاني الثانوي", "فيزياء", "system"],
      [COURSE_EXTERNAL, NAGWA, "كيمياء — الصف الثالث الثانوي (خارج المنظومة)", "كيمياء", "manual"],
    ] as const) {
      await tx.course.upsert({
        where: { id },
        update: { status: "active", isDemo: true },
        create: {
          id,
          centerId: CENTER,
          teacherId: teacher.id,
          title,
          subject,
          daysOfWeek: [1, 3, 6],
          startTime: "15:00",
          endTime: "16:30",
          startDate: daysAgo(60),
          endDate: daysAhead(60),
          price: 48000,
          pricePerMonth: 48000,
          pricePerSession: 6000,
          maxStudents: 20,
          status: "active",
          dataSource: source,
          isDemo: true,
        },
      });
    }

    await tx.enrollment.createMany({
      data: [
        ...STUDENTS.map((s) => ({
          id: did(`enr:main:${s.key}`),
          studentId: s.id,
          courseId: COURSE_MAIN,
          centerId: CENTER,
          status: "active" as const,
          enrolledBy: HODA.id,
          dataSource: "system" as const,
        })),
        ...STUDENTS.slice(0, 5).map((s) => ({
          id: did(`enr:ext:${s.key}`),
          studentId: s.id,
          courseId: COURSE_EXTERNAL,
          centerId: CENTER,
          status: "active" as const,
          enrolledBy: HODA.id,
          dataSource: "manual" as const,
        })),
      ],
      skipDuplicates: true,
    });
  });

  await withPlatformContext(async (tx) => {
    await tx.session.createMany({
      data: LESSONS.map((l) => ({
        id: did(`ses:${l.key}`),
        courseId: l.course,
        teacherId: l.teacher.id,
        originalDate: dayOfWeek(l.day),
        date: dayOfWeek(l.day),
        startTime: "15:00",
        endTime: "16:30",
        status: l.status,
        dataSource: (l.course === COURSE_EXTERNAL ? "manual" : "system") as "manual" | "system",
      })),
      skipDuplicates: true,
    });

    // Attendance only for the three lessons that were actually taught. Roughly
    // 7 of 8 present, so the digest's rate is a real figure and not 100%.
    const rows = LESSONS.filter((l) => l.status === "completed").flatMap((l, w) =>
      STUDENTS.map((s, i) => ({
        sessionId: did(`ses:${l.key}`),
        studentId: s.id,
        courseId: l.course,
        centerId: CENTER,
        status: ((i + w) % 8 === 0 ? "absent" : "present") as "absent" | "present",
        markedBy: l.teacher.id,
      })),
    );
    await tx.attendanceRecord.createMany({ data: rows, skipDuplicates: true });
  });

  console.log(`
Seeded. The reported week is ${dateKey(WEEK.start)} → ${dateKey(WEEK.end)}.

  live center      "سنتر البيان — المهندسين"   owner ${email(HODA)} / ${PASSWORD}
  suspended owner  "سنتر الرواد — المعادي"      ${email(WALID)} (account suspended)
  ownerless        "سنتر الأمانة — أسيوط"       no owner at all

In the live center's week the digest reports 4 lessons and an attendance rate of
88%: three were taught and marked, and ONE — the off-system teacher نجوى السقا's
— was left open. That last one makes gapsCount ≥ 1 (BLOCKING). An uncompleted
lesson never runs distribution, so the teacher is silently never credited; the
digest is where an owner finds out.

RUN IT (the job is POST-only by M7 design, so a browser cannot trigger it):
  curl -X POST "$APP_URL/api/v1/cron/weekly-center-digest" \\
       -H "x-cron-secret: $CRON_SECRET"

With MAIL_PROVIDER=console the email is PRINTED to the server log and the run
reports it as \`skipped\`, not \`sent\` — a deliberate non-send, not a failure.
That also means NO audit row is written, so the week stays owed and the digest
goes out for real once SMTP is configured. Run it twice and watch: with console
mail nothing is ever suppressed, because nothing was ever delivered.

REVENUE READS 0.00, on purpose: this seed writes no money rows (Conventions
rule). Take a cash payment at the counter for one of these students and run the
job again — revenue, net and the per-group line all fill in, from the same
\`getNetProfitReport\` the reports screen uses.

NO \`center.weekly_digest_sent\` AUDIT ROW WAS SEEDED. That row is the
idempotency key; planting one would suppress the first digest — the exact bug
it exists to prevent.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
