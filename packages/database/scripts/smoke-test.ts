import { config } from "dotenv";
config();

import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { hardenNeonWebSockets } from "../src/neon-ws";
import {
  prisma,
  withTenant,
  withPlatformContext,
} from "../src/index.js";
import { assertDbEnv } from "./db-guard";

// Normalize a dropped socket into a real Error — see src/neon-ws.ts.
hardenNeonWebSockets();
neonConfig.webSocketConstructor = ws as never;
const adminPool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok:", msg);
}

async function main() {
  // This script CREATES real rows — users, centers, a course, and an immutable
  // `transactions` row that cannot be deleted afterwards. It has no production
  // use whatsoever, so the target database must prove it is dev or test. The
  // label is read from INSIDE the database (see db-guard.ts), so a copied or
  // stale connection string cannot talk its way past this.
  await assertDbEnv(["dev", "test"], { intent: "smoke-test" });

  const tag = "smoke-" + Math.floor(Math.random() * 1e9);

  const { centerA, centerB, courseId, teacherId } = await withPlatformContext(
    async (tx) => {
      const teacher = await tx.user.create({
        data: { name: tag + "-teacher", role: "teacher", email: tag + "-t@x.io" },
      });
      const a = await tx.center.create({
        data: { name: tag + "-A", shortId: (tag + "A").toUpperCase(), status: "active" },
      });
      const b = await tx.center.create({
        data: { name: tag + "-B", shortId: (tag + "B").toUpperCase(), status: "active" },
      });
      const course = await tx.course.create({
        data: {
          centerId: a.id,
          teacherId: teacher.id,
          title: tag + "-course",
          subject: "math",
          daysOfWeek: [1, 3],
          startTime: "16:00",
          endTime: "17:00",
          startDate: new Date(),
          price: 20000,
          maxStudents: 20,
        },
      });
      return { centerA: a.id, centerB: b.id, courseId: course.id, teacherId: teacher.id };
    },
  );
  console.log("setup done", { centerA, centerB });

  const seenByA = await withTenant(centerA, (tx) =>
    tx.course.findMany({ where: { id: courseId } }),
  );
  assert(seenByA.length === 1, "tenant A can read its own course");

  const seenByB = await withTenant(centerB, (tx) =>
    tx.course.findMany({ where: { id: courseId } }),
  );
  assert(seenByB.length === 0, "tenant B is blocked from center A's course (RLS)");

  let writeBlocked = false;
  try {
    await withTenant(centerB, (tx) =>
      tx.course.create({
        data: {
          centerId: centerA,
          teacherId,
          title: tag + "-evil",
          subject: "math",
          daysOfWeek: [2],
          startTime: "10:00",
          endTime: "11:00",
          startDate: new Date(),
          price: 100,
          maxStudents: 1,
        },
      }),
    );
  } catch {
    writeBlocked = true;
  }
  assert(writeBlocked, "tenant B cannot insert a row scoped to center A (RLS WITH CHECK)");

  const txnId = await withPlatformContext(async (tx) => {
    const t = await tx.transaction.create({
      data: { refNumber: "TXN-" + tag, type: "payment", amount: 20000, centerId: centerA },
    });
    return t.id;
  });
  let updateBlocked = false;
  try {
    await withPlatformContext((tx) =>
      tx.transaction.update({ where: { id: txnId }, data: { amount: 1 } }),
    );
  } catch {
    updateBlocked = true;
  }
  assert(updateBlocked, "transaction.update is blocked (append-only ledger)");

  const u = await withPlatformContext((tx) =>
    tx.user.create({ data: { name: tag + "-victim", role: "student", email: tag + "-v@x.io" } }),
  );
  await prisma.user.delete({ where: { id: u.id } });
  const afterDelete = await prisma.user.findMany({ where: { id: u.id } });
  assert(afterDelete.length === 0, "soft-deleted user is filtered from findMany");
  const raw = await withPlatformContext((tx) =>
    tx.$queryRaw<{ deleted_at: Date | null }[]>`SELECT deleted_at FROM users WHERE id = ${u.id}::uuid`,
  );
  assert(raw[0]?.deleted_at != null, "row still exists with deleted_at set (not hard-deleted)");

  await adminPool.query(`DELETE FROM transactions WHERE ref_number = $1`, ["TXN-" + tag]);
  await withPlatformContext(async (tx) => {
    await tx.course.deleteMany({ where: { title: { startsWith: tag } } });
    await tx.center.deleteMany({ where: { name: { startsWith: tag } } });
    await tx.$executeRaw`DELETE FROM users WHERE name LIKE ${tag + "%"}`;
  });
  await adminPool.end();

  console.log("\nALL SMOKE TESTS PASSED ✅");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nSMOKE TEST FAILED ❌\n", e);
  await prisma.$disconnect();
  process.exit(1);
});
