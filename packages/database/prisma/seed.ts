/* eslint-disable no-console */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "../src/index";
import { readDbEnv } from "../scripts/db-guard";
import { seedCatalog } from "./seed-catalog";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";

async function main() {

  const dbEnv = await readDbEnv();
  if (dbEnv === null) {
    throw new Error(
      "seed: REFUSING TO RUN — target database carries no 'edura-env:' label.\n" +
        "Label it first:  tsx --env-file=<file> scripts/label-db.ts <dev|test|production>",
    );
  }
  const isProduction = dbEnv === "production";
  const noDemo = process.argv.includes("--no-demo");

  if (isProduction || process.env.NODE_ENV === "production") {
    const missing = [
      !process.env.SEED_SUPERADMIN_EMAIL && "SEED_SUPERADMIN_EMAIL",
      !process.env.SEED_SUPERADMIN_PASSWORD && "SEED_SUPERADMIN_PASSWORD",
      !process.env.SEED_ACCOUNTANT_EMAIL && "SEED_ACCOUNTANT_EMAIL",
      !process.env.SEED_ACCOUNTANT_PASSWORD && "SEED_ACCOUNTANT_PASSWORD",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(
        `Refusing to seed staff accounts in production without explicit credentials — missing: ${missing.join(", ")}`,
      );
    }
  }

  console.log(`Seeding a '${dbEnv}' database${isProduction ? " — CATALOG + STAFF ONLY, no demo data" : ""}.`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await seedCatalog();

  await withPlatformContext(
    async (tx) => {
      const mkUser = async (
        email: string,
        name: string,
        role:
          | "center_admin"
          | "teacher"
          | "assistant"
          | "student"
          | "parent"
          | "super_admin"
          | "accountant",
      ) =>
        tx.user.upsert({
          where: { email },
          update: { isDemo: true, deletedAt: null },
          create: {
            email,
            name,
            role,
            status: "active",
            passwordHash,
            isDemo: true,
          },
        });

      const mkStaffUser = async (
        role: "super_admin" | "accountant",
        emailEnv: string | undefined,
        passwordEnv: string | undefined,
        fallbackEmail: string,
        name: string,
      ) => {
        const email = emailEnv || fallbackEmail;
        const isDemo = !emailEnv;
        const hash = passwordEnv ? await bcrypt.hash(passwordEnv, 10) : passwordHash;
        return tx.user.upsert({
          where: { email },
          update: { isDemo, passwordHash: hash, deletedAt: null },
          create: {
            email,
            name,
            role,
            status: "active",
            passwordHash: hash,
            isDemo,
          },
        });
      };

      await mkStaffUser(
        "super_admin",
        process.env.SEED_SUPERADMIN_EMAIL,
        process.env.SEED_SUPERADMIN_PASSWORD,
        "superadmin@edura.eg",
        "Platform Super Admin",
      );
      await mkStaffUser(
        "accountant",
        process.env.SEED_ACCOUNTANT_EMAIL,
        process.env.SEED_ACCOUNTANT_PASSWORD,
        "accountant@edura.eg",
        "Platform Accountant",
      );

      // Points rules are operational CONFIGURATION, not demo data — the points
      // engine reads them at runtime — so production needs them too. They carry
      // no is_demo flag and are keyed by event name, so this stays idempotent.
      const POINTS_RULES: { eventName: string; pointsValue: number }[] = [
        { eventName: "attendance", pointsValue: 10 },
        { eventName: "online_payment", pointsValue: 20 },
        // Same value as the online rule ON PURPOSE: this row makes the ledger
        // say `cash_payment` for cash without changing a single award, so it can
        // be seeded into a live environment with no behavioural consequence.
        // Until it exists, RULE_FALLBACK in points.ts borrows the online rule —
        // so seeding is safe whenever, and skipping it is safe too.
        { eventName: "cash_payment", pointsValue: 20 },
        { eventName: "first_booking", pointsValue: 50 },
        { eventName: "lesson_booking", pointsValue: 5 },
        { eventName: "teacher_rating", pointsValue: 15 },
        { eventName: "streak_bonus", pointsValue: 25 },
      ];
      for (const r of POINTS_RULES) {
        const existing = await tx.pointsRule.findFirst({
          where: { eventName: r.eventName },
        });
        if (!existing) {
          await tx.pointsRule.create({ data: { ...r, isActive: true } });
        }
      }
      if (isProduction || noDemo) {
        console.log(
          `${isProduction ? "Production" : "--no-demo"} seed complete: education catalog, points rules, and the ` +
            "two staff accounts from SEED_* env vars. No demo data written.",
        );
        return;
      }
      const center = await tx.center.upsert({
        where: { shortId: "NILE" },
        // onboardingCompleted in BOTH branches: the demo center must present
        // post-onboarding, or the server-side portal gate bounces the
        // quick-login admin to the wizard. The update branch matters as much
        // as create — an upsert that only sets it on create leaves any
        // already-seeded row false forever (exactly what broke the E2E smoke).
        update: { isDemo: true, onboardingCompleted: true },
        create: {
          name: "Nile Educational Academy",
          shortId: "NILE",
          status: "active",
          subjects: ["Math", "Physics", "Arabic"],
          address: "Cairo, Egypt",
          onboardingCompleted: true,
          isDemo: true,
        },
      });

      const admin = await mkUser(
        "admin@nile-academy.eg",
        "Demo Admin",
        "center_admin",
      );
      await tx.centerAdminProfile.upsert({
        where: { userId: admin.id },
        update: {},
        create: { userId: admin.id, centerId: center.id },
      });

      const teacher = await mkUser(
        "hossam.aziz@nile-academy.eg",
        "Hossam Aziz",
        "teacher",
      );
      await tx.teacherProfile.upsert({
        where: { userId: teacher.id },
        update: {},
        create: { userId: teacher.id, subjects: ["Math"] },
      });

      const student = await mkUser(
        "lina.hassan@student.nile-academy.eg",
        "Lina Hassan",
        "student",
      );
      await tx.studentProfile.upsert({
        where: { userId: student.id },
        update: {},
        create: {
          userId: student.id,
          fullName: student.name,
          familyLinkCode: createHash("sha1")
            .update(student.id)
            .digest("hex")
            .slice(0, 8)
            .toUpperCase(),
        },
      });
      await tx.centerStudentRoster.upsert({
        where: {
          centerId_studentId: { centerId: center.id, studentId: student.id },
        },
        update: {},
        create: { centerId: center.id, studentId: student.id },
      });

      const parent = await mkUser(
        "mona.hassan@email.eg",
        "Mona Hassan",
        "parent",
      );
      await tx.parentProfile.upsert({
        where: { userId: parent.id },
        update: {},
        create: { userId: parent.id },
      });
      const existingLink = await tx.parentStudentLink.findFirst({
        where: { parentId: parent.id, studentId: student.id },
      });
      if (!existingLink) {
        await tx.parentStudentLink.create({
          data: {
            parentId: parent.id,
            studentId: student.id,
            status: "approved",
            initiatedBy: "parent",
          },
        });
      }
      const assistant = await mkUser(
        "sara.fawzy@nile-academy.eg",
        "Sara Fawzy",
        "assistant",
      );
      await tx.teacherAssistant.upsert({
        where: {
          teacherId_assistantId: {
            teacherId: teacher.id,
            assistantId: assistant.id,
          },
        },
        update: { removedAt: null },
        create: {
          teacherId: teacher.id,
          assistantId: assistant.id,
          title: "مساعد أول",
        },
      });

      const existingAffiliation = await tx.centerTeacherAffiliation.findFirst({
        where: { centerId: center.id, teacherId: teacher.id },
      });
      if (!existingAffiliation) {
        await tx.centerTeacherAffiliation.create({
          data: {
            centerId: center.id,
            teacherId: teacher.id,
            status: "active",
            respondedAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        });
      } else if (existingAffiliation.status !== "active") {
        await tx.centerTeacherAffiliation.update({
          where: { id: existingAffiliation.id },
          data: { status: "active", respondedAt: new Date() },
        });
      }
      const mathSubject = await tx.subject.findUniqueOrThrow({
        where: { code: "math" },
      });
      const grade12 = await tx.gradeLevel.findUniqueOrThrow({
        where: { code: "general-secondary-3" },
      });
      const sciMathTrack = await tx.track.findUniqueOrThrow({
        where: { code: "general-sci-math" },
      });

      let course = await tx.course.findFirst({
        where: {
          centerId: center.id,
          teacherId: teacher.id,
          title: "Math — Grade 12",
        },
      });
      if (!course) {
        course = await tx.course.create({
          data: {
            centerId: center.id,
            teacherId: teacher.id,
            title: "Math — Grade 12",
            subject: "Math",
            subjectId: mathSubject.id,
            gradeLevelId: grade12.id,
            trackId: sciMathTrack.id,
            daysOfWeek: [1, 3],
            startTime: "16:00",
            endTime: "18:00",
            startDate: new Date(),
            price: 30000,
            maxStudents: 30,
            isDemo: true,
          },
        });
      } else if (!course.subjectId) {
        course = await tx.course.update({
          where: { id: course.id },
          data: {
            subjectId: mathSubject.id,
            gradeLevelId: grade12.id,
            trackId: sciMathTrack.id,
          },
        });
      }
      await tx.teacherSubject.upsert({
        where: {
          teacherId_subjectId: {
            teacherId: teacher.id,
            subjectId: mathSubject.id,
          },
        },
        update: {},
        create: { teacherId: teacher.id, subjectId: mathSubject.id },
      });
      await tx.teacherGradeLevel.upsert({
        where: {
          teacherId_gradeLevelId: {
            teacherId: teacher.id,
            gradeLevelId: grade12.id,
          },
        },
        update: {},
        create: { teacherId: teacher.id, gradeLevelId: grade12.id },
      });
      const existingEnrollment = await tx.enrollment.findFirst({
        where: { studentId: student.id, courseId: course.id },
      });
      if (!existingEnrollment) {
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            courseId: course.id,
            centerId: center.id,
            status: "active",
            enrolledBy: admin.id,
          },
        });
      } else if (existingEnrollment.status !== "active") {
        await tx.enrollment.update({
          where: { id: existingEnrollment.id },
          data: { status: "active", unenrolledAt: null },
        });
      }

      console.log("Seed complete:", {
        center: center.shortId,
        users: [
          admin.email,
          teacher.email,
          assistant.email,
          student.email,
          parent.email,
        ],
        password:
          PASSWORD === "Passw0rd!"
            ? "Passw0rd! (default)"
            : "(from SEED_PASSWORD)",
      });
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
