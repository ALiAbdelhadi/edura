/* eslint-disable no-console */
/**
 * Idempotent baseline seed for FRESH environments (local dev, preview DBs).
 * Creates the demo center + one account per role, matching
 * apps/www/docs/test-credentials.md. Safe to run repeatedly (upserts only).
 *
 * Production data was ported from MongoDB via ETL — this seed intentionally
 * skips anything that already exists.
 *
 * Run: pnpm --filter @repo/database seed   (SEED_PASSWORD defaults Passw0rd!)
 */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma, withPlatformContext } from "../src/index";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await withPlatformContext(async (tx) => {
    const center = await tx.center.upsert({
      where: { shortId: "NILE" },
      update: {},
      create: {
        name: "Nile Educational Academy",
        shortId: "NILE",
        status: "active",
        subjects: ["Math", "Physics", "Arabic"],
        address: "Cairo, Egypt",
      },
    });

    const mkUser = async (
      email: string,
      name: string,
      role: "center_admin" | "teacher" | "student" | "parent" | "super_admin" | "accountant",
    ) =>
      tx.user.upsert({
        where: { email },
        update: {},
        create: { email, name, role, status: "active", passwordHash },
      });

    // Platform-level roles (no center). super_admin has all permissions;
    // accountant is finance-only.
    await mkUser("superadmin@edura.eg", "Platform Super Admin", "super_admin");
    await mkUser("accountant@edura.eg", "Platform Accountant", "accountant");

    const admin = await mkUser("admin@nile-academy.eg", "Demo Admin", "center_admin");
    await tx.centerAdminProfile.upsert({
      where: { userId: admin.id },
      update: {},
      create: { userId: admin.id, centerId: center.id },
    });

    const teacher = await mkUser("hossam.aziz@nile-academy.eg", "Hossam Aziz", "teacher");
    await tx.teacherProfile.upsert({
      where: { userId: teacher.id },
      update: {},
      create: { userId: teacher.id, subjects: ["Math"] },
    });

    const student = await mkUser("lina.hassan@student.nile-academy.eg", "Lina Hassan", "student");
    await tx.studentProfile.upsert({
      where: { userId: student.id },
      update: {},
      create: {
        userId: student.id,
        fullName: student.name,
        familyLinkCode: createHash("sha1").update(student.id).digest("hex").slice(0, 8).toUpperCase(),
      },
    });
    await tx.centerStudentRoster.upsert({
      where: { centerId_studentId: { centerId: center.id, studentId: student.id } },
      update: {},
      create: { centerId: center.id, studentId: student.id },
    });

    const parent = await mkUser("mona.hassan@email.eg", "Mona Hassan", "parent");
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
        data: { parentId: parent.id, studentId: student.id, status: "approved", initiatedBy: "parent" },
      });
    }

    // Default points rules (PRD §5.7) — the points engine is inert without them.
    const POINTS_RULES: { eventName: string; pointsValue: number }[] = [
      { eventName: "attendance", pointsValue: 10 },
      { eventName: "online_payment", pointsValue: 20 },
      { eventName: "first_booking", pointsValue: 50 },
      { eventName: "lesson_booking", pointsValue: 5 },
      { eventName: "teacher_rating", pointsValue: 15 },
      { eventName: "streak_bonus", pointsValue: 25 },
    ];
    for (const r of POINTS_RULES) {
      const existing = await tx.pointsRule.findFirst({ where: { eventName: r.eventName } });
      if (!existing) {
        await tx.pointsRule.create({ data: { ...r, isActive: true } });
      }
    }

    console.log("Seed complete:", {
      center: center.shortId,
      users: [admin.email, teacher.email, student.email, parent.email],
      password: PASSWORD === "Passw0rd!" ? "Passw0rd! (default)" : "(from SEED_PASSWORD)",
    });
  }, { timeout: 60_000, maxWait: 15_000 });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
