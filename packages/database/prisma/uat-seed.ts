/**
 * UAT seed — one working account per role, on a real environment.
 *
 *     EDURA_ENV=production npx tsx prisma/uat-seed.ts --yes
 *     EDURA_ENV=production npx tsx prisma/uat-seed.ts --purge --yes
 *
 * WHY THIS EXISTS SEPARATELY FROM seed.ts
 *
 *   seed.ts REFUSES to write demo data to a production-labelled database, and
 *   that refusal is correct — it is what keeps a live database clean. This
 *   script is the deliberate, reversible exception: a week of acceptance
 *   testing against the real deployment, then one command to remove every row
 *   it wrote.
 *
 * WHAT IT WILL NOT DO
 *
 *   It writes NO money. No transactions, payments, wallets, invoices, payouts,
 *   settlements or points ledger rows — the repo's rule is that demo data never
 *   touches the ledger, and an append-only ledger cannot be un-written anyway.
 *   Sessions are created as `scheduled` only; completing one settles money, and
 *   that is yours to do through the UI, where it belongs.
 *
 *   It creates NO platform staff. `super_admin` and `accountant` already exist
 *   as your real accounts — sign in with those. Seeding extra ones on a live
 *   database is how a fixture leaves 41 stray super_admins behind, which is a
 *   thing that has already happened here once.
 *
 * HOW THE CLEANUP IS GUARANTEED
 *
 *   Every row gets a deterministic id derived from a fixed namespace, and every
 *   root entity is flagged `is_demo = true`. `--purge` deletes by those exact
 *   ids, so it removes what this script wrote and cannot touch a real row that
 *   happens to look similar. Re-running without --purge is idempotent.
 */

import "../scripts/load-env";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { prisma, withPlatformContext } from "../src/client";
import { readDbEnv } from "../scripts/db-guard";
import { uuidV5, assertRfcUuid } from "./seed-ids";

const NS = "edura-uat-2026-08";
const id = (name: string) => assertRfcUuid(uuidV5(`${NS}:${name}`), name);

const CENTER_SHORT_ID = "UATC";
const DOMAIN = "uat.edura.eg";

type Person = {
  key: string;
  name: string;
  role:
    | "center_admin"
    | "center_staff"
    | "teacher"
    | "assistant"
    | "parent"
    | "student";
  staffRole?: "receptionist" | "manager" | "center_accountant";
  what: string;
};

const PEOPLE: Person[] = [
  { key: "owner", name: "مالك المركز", role: "center_admin", what: "صاحب المركز — كل شيء داخل المركز" },
  { key: "reception", name: "موظف الاستقبال", role: "center_staff", staffRole: "receptionist", what: "الكاونتر: تسجيل الحضور والدفع النقدي" },
  { key: "manager", name: "مدير المركز", role: "center_staff", staffRole: "manager", what: "إدارة يومية بصلاحيات أوسع من الاستقبال" },
  { key: "cashier", name: "محاسب المركز", role: "center_staff", staffRole: "center_accountant", what: "مالية المركز فقط" },
  { key: "teacher1", name: "أ. محمود سيد", role: "teacher", what: "مدرّس رياضيات — مجموعات وحضور ودرجات" },
  { key: "teacher2", name: "أ. هالة منير", role: "teacher", what: "مدرّسة فيزياء — للتجربة بمدرّس ثانٍ" },
  { key: "assistant", name: "مساعد المدرّس", role: "assistant", what: "ينوب عن أ. محمود — بدون محفظة أو مالية" },
  { key: "parent1", name: "ولي أمر — أم", role: "parent", what: "مرتبط بطالبين" },
  { key: "parent2", name: "ولي أمر — أب", role: "parent", what: "مرتبط بطالب واحد" },
  { key: "student1", name: "طالب أول", role: "student", what: "ثانوية عامة ٣ — علمي رياضة" },
  { key: "student2", name: "طالب ثاني", role: "student", what: "ثانوية عامة ٣ — علمي رياضة" },
  { key: "student3", name: "طالب ثالث", role: "student", what: "بدون ولي أمر — لاختبار بوابة القاصر" },
];

const emailOf = (key: string) => `${key}@${DOMAIN}`;

async function purge() {
  const userIds = PEOPLE.map((p) => id(`user:${p.key}`));
  const centerId = id("center");

  await withPlatformContext(async (tx) => {
    const courseIds = (
      await tx.course.findMany({ where: { centerId }, select: { id: true } })
    ).map((c) => c.id);

    await tx.attendanceRecord.deleteMany({ where: { session: { courseId: { in: courseIds } } } });
    await tx.session.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.enrollment.deleteMany({ where: { courseId: { in: courseIds } } });
    await tx.course.deleteMany({ where: { id: { in: courseIds } } });

    await tx.teacherAssistant.deleteMany({ where: { assistantId: { in: userIds } } });
    await tx.centerStaff.deleteMany({ where: { staffUserId: { in: userIds } } });
    await tx.centerStudentRoster.deleteMany({ where: { studentId: { in: userIds } } });
    await tx.centerTeacherAffiliation.deleteMany({ where: { teacherId: { in: userIds } } });
    await tx.parentStudentLink.deleteMany({ where: { parentId: { in: userIds } } });
    await tx.teacherSubject.deleteMany({ where: { teacherId: { in: userIds } } });
    await tx.teacherGradeLevel.deleteMany({ where: { teacherId: { in: userIds } } });
    await tx.centerAdminProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.parentProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.notification.deleteMany({ where: { userId: { in: userIds } } });

    const users = await tx.user.deleteMany({ where: { id: { in: userIds } } });
    const centers = await tx.center.deleteMany({ where: { id: centerId } });

    console.log(
      `\nPurged: ${users.count} user(s), ${centers.count} center(s), ` +
        `${courseIds.length} course(s) and everything hanging off them.`,
    );
    console.log(
      `Money rows are untouched because this script never wrote any. Anything\n` +
        `you generated through the UI during testing is still there — that is\n` +
        `the pre-launch wipe's job, not this one's.`,
    );
  });
}

async function seed(password: string) {
  const hash = await bcrypt.hash(password, 10);

  await withPlatformContext(async (tx) => {
    const center = await tx.center.upsert({
      where: { id: id("center") },
      update: { isDemo: true, status: "active", onboardingCompleted: true },
      create: {
        id: id("center"),
        name: "مركز التجربة — UAT",
        shortId: CENTER_SHORT_ID,
        status: "active",
        subjects: ["Math", "Physics"],
        address: "القاهرة، مصر",
        onboardingCompleted: true,
        isDemo: true,
      },
    });

    const users: Record<string, { id: string; name: string }> = {};
    for (const p of PEOPLE) {
      const u = await tx.user.upsert({
        where: { id: id(`user:${p.key}`) },
        update: { isDemo: true, deletedAt: null, status: "active", passwordHash: hash },
        create: {
          id: id(`user:${p.key}`),
          email: emailOf(p.key),
          name: p.name,
          role: p.role,
          status: "active",
          passwordHash: hash,
          isDemo: true,
        },
      });
      users[p.key] = { id: u.id, name: u.name };
    }

    await tx.centerAdminProfile.upsert({
      where: { userId: users.owner!.id },
      update: {},
      create: { userId: users.owner!.id, centerId: center.id },
    });

    for (const p of PEOPLE.filter((x) => x.role === "center_staff")) {
      await tx.centerStaff.upsert({
        where: { id: id(`staff:${p.key}`) },
        update: { role: p.staffRole!, removedAt: null },
        create: {
          id: id(`staff:${p.key}`),
          centerId: center.id,
          staffUserId: users[p.key]!.id,
          role: p.staffRole!,
          title: p.name,
        },
      });
    }

    for (const key of ["teacher1", "teacher2"]) {
      await tx.teacherProfile.upsert({
        where: { userId: users[key]!.id },
        update: {},
        create: { userId: users[key]!.id, subjects: key === "teacher1" ? ["Math"] : ["Physics"] },
      });
      const aff = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId: center.id, teacherId: users[key]!.id },
      });
      if (!aff) {
        await tx.centerTeacherAffiliation.create({
          data: {
            centerId: center.id,
            teacherId: users[key]!.id,
            status: "active",
            respondedAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    await tx.teacherAssistant.upsert({
      where: {
        teacherId_assistantId: {
          teacherId: users.teacher1!.id,
          assistantId: users.assistant!.id,
        },
      },
      update: { removedAt: null },
      create: {
        teacherId: users.teacher1!.id,
        assistantId: users.assistant!.id,
        title: "مساعد أول",
      },
    });

    for (const key of ["student1", "student2", "student3"]) {
      const s = users[key]!;
      await tx.studentProfile.upsert({
        where: { userId: s.id },
        update: {},
        create: {
          userId: s.id,
          fullName: s.name,
          familyLinkCode: createHash("sha1").update(s.id).digest("hex").slice(0, 8).toUpperCase(),
        },
      });
      await tx.centerStudentRoster.upsert({
        where: { centerId_studentId: { centerId: center.id, studentId: s.id } },
        update: { leftAt: null },
        create: { centerId: center.id, studentId: s.id },
      });
    }

    for (const key of ["parent1", "parent2"]) {
      await tx.parentProfile.upsert({
        where: { userId: users[key]!.id },
        update: {},
        create: { userId: users[key]!.id },
      });
    }
    const links: [string, string][] = [
      ["parent1", "student1"],
      ["parent1", "student2"],
      ["parent2", "student2"],
    ];
    for (const [p, s] of links) {
      const existing = await tx.parentStudentLink.findFirst({
        where: { parentId: users[p]!.id, studentId: users[s]!.id },
      });
      if (!existing) {
        await tx.parentStudentLink.create({
          data: {
            parentId: users[p]!.id,
            studentId: users[s]!.id,
            status: "approved",
            initiatedBy: "parent",
          },
        });
      }
    }

    const math = await tx.subject.findUniqueOrThrow({ where: { code: "math" } });
    const physics = await tx.subject.findUniqueOrThrow({ where: { code: "physics" } });
    const grade = await tx.gradeLevel.findUniqueOrThrow({
      where: { code: "general-secondary-3" },
    });
    const track = await tx.track.findUniqueOrThrow({ where: { code: "general-sci-math" } });

    const courseSpecs = [
      { key: "math", title: "رياضيات — ثانوية عامة ٣", subject: math, teacher: "teacher1", days: [1, 3], from: "16:00", to: "18:00", price: 30000 },
      { key: "physics", title: "فيزياء — ثانوية عامة ٣", subject: physics, teacher: "teacher2", days: [2, 4], from: "18:00", to: "20:00", price: 25000 },
    ];

    for (const c of courseSpecs) {
      const course = await tx.course.upsert({
        where: { id: id(`course:${c.key}`) },
        update: { isDemo: true },
        create: {
          id: id(`course:${c.key}`),
          centerId: center.id,
          teacherId: users[c.teacher]!.id,
          title: c.title,
          subject: c.subject.nameEn ?? c.subject.nameAr,
          subjectId: c.subject.id,
          gradeLevelId: grade.id,
          trackId: track.id,
          daysOfWeek: c.days,
          startTime: c.from,
          endTime: c.to,
          startDate: new Date(),
          price: c.price,
          maxStudents: 30,
          isDemo: true,
        },
      });

      await tx.teacherSubject.upsert({
        where: { teacherId_subjectId: { teacherId: users[c.teacher]!.id, subjectId: c.subject.id } },
        update: {},
        create: { teacherId: users[c.teacher]!.id, subjectId: c.subject.id },
      });
      await tx.teacherGradeLevel.upsert({
        where: { teacherId_gradeLevelId: { teacherId: users[c.teacher]!.id, gradeLevelId: grade.id } },
        update: {},
        create: { teacherId: users[c.teacher]!.id, gradeLevelId: grade.id },
      });

      for (const key of ["student1", "student2"]) {
        const existing = await tx.enrollment.findFirst({
          where: { studentId: users[key]!.id, courseId: course.id },
        });
        if (!existing) {
          await tx.enrollment.create({
            data: {
              studentId: users[key]!.id,
              courseId: course.id,
              centerId: center.id,
              status: "active",
              enrolledBy: users.owner!.id,
            },
          });
        }
      }

      // Scheduled only. Completing a session is what settles money, and that
      // is a deliberate action through the UI, not something a seed decides.
      for (let i = 1; i <= 4; i++) {
        const when = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
        await tx.session.upsert({
          where: { id: id(`session:${c.key}:${i}`) },
          update: {},
          create: {
            id: id(`session:${c.key}:${i}`),
            courseId: course.id,
            teacherId: users[c.teacher]!.id,
            originalDate: when,
            date: when,
            startTime: c.from,
            endTime: c.to,
            status: "scheduled",
          },
        });
      }
    }
  });
}

function writeCredentialsFile(password: string, env: string, host: string) {
  const dir = path.join(homedir(), ".edura-env");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "uat-accounts.md");

  const rows = PEOPLE.map(
    (p) =>
      `| ${p.role}${p.staffRole ? ` / ${p.staffRole}` : ""} | ${emailOf(p.key)} | ${p.name} | ${p.what} |`,
  ).join("\n");

  writeFileSync(
    file,
    `# حسابات التجربة — ${env}

المضيف: \`${host}\`
المركز: **مركز التجربة — UAT** (كود \`${CENTER_SHORT_ID}\`)

**كلمة السر واحدة لكل الحسابات دي:**

    ${password}

> الملف ده فيه كلمات سر. مكانه خارج المستودع وصلاحياته 600.
> متنسخهوش في شات ولا تيكت ولا تبعته لحد.

## الحسابات

| الدور | الإيميل | الاسم | بيجرّب إيه |
|---|---|---|---|
${rows}

## المنصّات

- التطبيق: https://edura-erp.vercel.app
- الباك أوفيس: https://edura-superadmin.vercel.app

## super_admin و accountant

مش موجودين هنا **عن قصد**. حساباتك الحقيقية موجودة أصلاً على الإنتاج —
استخدمها. إضافة حسابات إدارة منصّة إضافية على قاعدة حيّة هي بالظبط الطريقة
اللي بتخلّي ٤١ حساب super_admin شارد يفضلوا وراك، وده حصل في المشروع ده مرة.

## المسح بعد التجربة

    EDURA_ENV=${env} npx tsx prisma/uat-seed.ts --purge --yes

بيمسح بالمعرّفات بالظبط، فمش هيلمس أي صف حقيقي. أي بيانات مالية عملتها
بنفسك من التطبيق أثناء التجربة **مش** بتتمسح بالأمر ده — دي شغلانة مسح ما
قبل الإطلاق (\`production-cleanup.ts\`).
`,
    { mode: 0o600 },
  );
  chmodSync(file, 0o600);
  return file;
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsPurge = argv.includes("--purge");

  const env = await readDbEnv();
  const host = new URL(process.env.ADMIN_URL ?? process.env.DATABASE_URL!).host;

  if (!env) {
    throw new Error(
      "uat-seed: the target database carries no 'edura-env:' label. Refusing.",
    );
  }

  console.log("=".repeat(70));
  console.log(`  UAT SEED  —  ${wantsPurge ? "PURGE" : "CREATE"}`);
  console.log(`  target: ${host}`);
  console.log(`  label:  edura-env:${env}`);
  if (env === "production") {
    console.log(`\n  This is the PRODUCTION database. Rows written here are visible to`);
    console.log(`  anyone using the live site. No money is written either way.`);
  }
  console.log("=".repeat(70));

  if (!argv.includes("--yes")) {
    throw new Error("uat-seed: refusing without the explicit --yes flag.");
  }

  if (wantsPurge) {
    await purge();
    await prisma.$disconnect();
    return;
  }

  const password = `Uat-${randomBytes(9).toString("base64url")}-2026`;
  await seed(password);
  const file = writeCredentialsFile(password, env, host);

  console.log(`\n${PEOPLE.length} accounts, 1 center, 2 courses, 8 scheduled sessions.`);
  console.log(`Every root row carries is_demo = true.`);
  console.log(`\nCredentials written to:\n  ${file}   (mode 600, outside the repo)`);
  console.log(`\nThe password is in that file and is NOT printed here.`);
  await prisma.$disconnect();
}

main().catch(async (e: unknown) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
