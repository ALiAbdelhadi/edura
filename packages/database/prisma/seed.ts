/* eslint-disable no-console */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "../src/index";
import { seedCatalog } from "./seed-catalog";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(
    async (tx) => {
      // Everything this seed creates is demo data — flagged is_demo on the
      // ROOT entities (center/users/course) so it can be purged before launch;
      // child rows inherit demo-ness by ancestry. The education catalog
      // (seedCatalog below) is permanent reference data and is NOT flagged.
      const center = await tx.center.upsert({
        where: { shortId: "NILE" },
        update: { isDemo: true },
        create: {
          name: "Nile Educational Academy",
          shortId: "NILE",
          status: "active",
          subjects: ["Math", "Physics", "Arabic"],
          address: "Cairo, Egypt",
          isDemo: true,
        },
      });

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
          update: { isDemo: true },
          create: {
            email,
            name,
            role,
            status: "active",
            passwordHash,
            isDemo: true,
          },
        });

      await mkUser(
        "superadmin@edura.eg",
        "Platform Super Admin",
        "super_admin",
      );
      await mkUser("accountant@edura.eg", "Platform Accountant", "accountant");

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

      // ---- Chat relationships: assistant on the teacher's team, an active
      // center affiliation, and a course + enrollment linking the student to
      // the teacher. This is what the conversation-policy relationship gates
      // (and the contacts directory) key off.
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
          title: "Senior assistant",
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
            daysOfWeek: [1, 3],
            startTime: "16:00",
            endTime: "18:00",
            startDate: new Date(),
            price: 30000, // piasters
            maxStudents: 30,
            isDemo: true,
          },
        });
      }
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

      const POINTS_RULES: { eventName: string; pointsValue: number }[] = [
        { eventName: "attendance", pointsValue: 10 },
        { eventName: "online_payment", pointsValue: 20 },
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

  await seedCatalog();

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
