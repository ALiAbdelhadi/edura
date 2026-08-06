import bcrypt from "bcryptjs";
import { assertNotProduction } from "../scripts/db-guard";
import { prisma, withPlatformContext } from "../src/index";
import { finalizeStudentCode } from "../src/queries/student-code-issue";
import { seedId } from "./seed-ids";

const PASSWORD = process.env.SEED_PASSWORD || "Passw0rd!";
const PURGE = process.argv.includes("--purge");

const did = seedId("edura-studentiddemo:");

type Kid = {
  key: string;
  name: string;
  system: "general" | "azhari" | "bacc" | null;
  stageIndex?: number;
};

const KIDS: Kid[] = [
  { key: "yara", name: "يارا مصطفى", system: "general", stageIndex: 2 },
  { key: "omar", name: "عمر شعبان", system: "general", stageIndex: 1 },
  { key: "hana", name: "هنا عبد اللطيف", system: "azhari", stageIndex: 2 },
  { key: "mostafa", name: "مصطفى الجندي", system: "azhari", stageIndex: 1 },
  { key: "salma", name: "سلمى بدوي", system: "bacc", stageIndex: 0 },
  { key: "ziad", name: "زياد الشربيني", system: null },
];

const email = (k: Kid) => `iddemo-${k.key}@edura.test`;
const EMAILS = KIDS.map(email);
const IDS = KIDS.map((k) => did(k.key));

async function purge() {
  console.log("Purging student-ID demo data…");
  await withPlatformContext(async (tx) => {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE email = ANY(${EMAILS}::text[]) OR id = ANY(${IDS}::uuid[])`;
    const ids = users.map((u) => u.id);
    if (ids.length === 0) {
      console.log("Purged: nothing to remove.");
      return;
    }
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });

    const hardDeleted = await tx.$executeRaw`
      DELETE FROM users WHERE is_demo = true AND id = ANY(${ids}::uuid[])`;
    console.log("Purged:", { users: hardDeleted });
  });
}

async function main() {
  await assertNotProduction("student-id-demo-seed");

  if (PURGE) {
    await purge();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  console.log("Seeding student-ID demo…");

  const issued: { name: string; email: string; code: string }[] = [];

  await withPlatformContext(async (tx) => {
    for (const kid of KIDS) {
      const id = did(kid.key);

      await tx.user.upsert({
        where: { id },
        update: { name: kid.name, status: "active", isDemo: true, deletedAt: null },
        create: {
          id,
          name: kid.name,
          role: "student",
          email: email(kid),
          passwordHash: hash,
          status: "active",
          locale: "ar",
          isDemo: true,
        },
      });

      let academic = {} as {
        educationSystemId?: string;
        stageId?: string;
        gradeLevelId?: string;
        onboardingCompleted?: boolean;
        grade?: string;
      };
      if (kid.system) {
        const system = await tx.educationSystem.findUnique({
          where: { code: kid.system },
          select: { id: true },
        });
        if (!system) throw new Error(`catalog: no education system '${kid.system}' — run the catalog seed first`);
        const stages = await tx.stage.findMany({
          where: { educationSystemId: system.id, isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });
        const stage = stages[kid.stageIndex ?? 0] ?? stages[0];
        const grade = await tx.gradeLevel.findFirst({
          where: { stageId: stage?.id, isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, nameAr: true },
        });
        academic = {
          educationSystemId: system.id,
          stageId: stage?.id,
          gradeLevelId: grade?.id,
          onboardingCompleted: true,
          grade: grade?.nameAr,
        };
      }

      await tx.studentProfile.upsert({
        where: { userId: id },
        update: academic,
        create: {
          userId: id,
          fullName: kid.name,
          familyLinkCode: `IDDEMO${kid.key.toUpperCase()}`.slice(0, 20),
          ...academic,
        },
      });

      const res = await finalizeStudentCode(tx, id);
      issued.push({ name: kid.name, email: email(kid), code: res?.studentCode ?? "—" });
    }
  });

  console.log("Seeded. Logins (password:", PASSWORD + "):");
  for (const row of issued) {
    console.log(`  ${row.code.padEnd(10)} ${row.email.padEnd(30)} ${row.name}`);
  }
  console.log("\nOpen /dashboard/student/id after signing in as any of them.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());