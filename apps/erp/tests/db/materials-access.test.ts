/**
 * Materials access control — the default-deny branch (H-1).
 *
 * The bug this locks down: `listMaterials` and `getMaterialDownloadUrl` were
 * `if/else if` chains over student → parent → center_admin → teacher with NO
 * final `else`. Only `center_admin` runs under `withTenant()` in `scopedDb`;
 * every other role runs in PLATFORM context with RLS bypassed. So an unlisted
 * role fell past every branch and reached the query unscoped:
 *
 *   - listMaterials  -> `where` stayed {} -> EVERY material on the platform.
 *     Measured 2026-08-18: a center_staff member saw 4 materials across 3
 *     centers.
 *   - getMaterialDownloadUrl -> a findUnique BY ID with no ownership check ->
 *     a signed download URL for ANY material, including other centers'.
 *     Measured: center_staff (all three sub-tiers) and assistant got 200.
 *
 * Proves:
 *  1. center_staff is REFUSED on both the list and the download, for its own
 *     centre's material and for another centre's alike (materials are not a
 *     staff capability — the center-actor CAPABILITY MAP does not list them,
 *     and no staff-facing materials screen exists).
 *  2. An assistant still reaches its OWN teacher's material (delegation intact
 *     via `toActingUser`) and is refused another teacher's.
 *  3. The roles that always worked still work: teacher owns / cannot cross,
 *     center_admin same-centre only, enrolled student yes, unenrolled no.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only materials-access
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { listMaterials, getMaterialDownloadUrl } from "@/lib/services/materials/materials";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "materials-access.test.ts";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}
async function expectThrows(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} (did NOT throw — access was granted)`);
  } catch (e) {
    assert(true, `${label} (threw: ${(e as Error).message.slice(0, 60)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);
const su = (u: Partial<SessionUser> & { id: string; role: string }) => u as SessionUser;

async function main() {
  const tag = "matacl-" + rid();
  __sweepTag = tag;
  console.log("Materials access-control DB tests —", tag);

  // Two independent centres, each with its own admin, teacher, course and
  // material. Centre A also gets an assistant (bound to A's teacher), a
  // center_staff member, an enrolled student and an unenrolled one.
  const fx = await withPlatformContext(async (tx) => {
    const mkCentre = async (k: string) => {
      const centre = await tx.center.create({
        data: {
          name: `${tag}-${k}`,
          shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
          status: "active",
          walletBalance: 0,
        },
      });
      const admin = await tx.user.create({
        data: { name: `${tag}-${k}-admin`, role: "center_admin", email: `${tag}-${k}-admin@x.io`, status: "active" },
      });
      await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: centre.id } });
      const teacher = await tx.user.create({
        data: { name: `${tag}-${k}-teacher`, role: "teacher", email: `${tag}-${k}-teacher@x.io`, status: "active" },
      });
      await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
      const course = await tx.course.create({
        data: {
          title: `${tag}-${k}-course`,
          subject: "math",
          centerId: centre.id,
          teacherId: teacher.id,
          status: "active",
          price: 10000,
          maxStudents: 30,
          startTime: "16:00",
          endTime: "18:00",
          startDate: new Date(),
          updatedAt: new Date(),
        },
      });
      const material = await tx.material.create({
        data: {
          title: `${tag}-${k}-material`,
          type: "lecture",
          courseId: course.id,
          centerId: centre.id,
          teacherId: teacher.id,
          storageProvider: "external",
          externalUrl: "https://example.com/secret.pdf",
          updatedAt: new Date(),
        },
      });
      return { centerId: centre.id, adminId: admin.id, teacherId: teacher.id, courseId: course.id, materialId: material.id };
    };

    const A = await mkCentre("A");
    const B = await mkCentre("B");

    // Centre A's staff member (receptionist tier — the gate is the same for all).
    const staff = await tx.user.create({
      data: { name: `${tag}-staff`, role: "center_staff", email: `${tag}-staff@x.io`, status: "active" },
    });
    await tx.centerStaff.create({ data: { staffUserId: staff.id, centerId: A.centerId, role: "receptionist" } });

    // Assistant serving centre A's teacher.
    const assistant = await tx.user.create({
      data: { name: `${tag}-asst`, role: "assistant", email: `${tag}-asst@x.io`, status: "active" },
    });
    await tx.teacherAssistant.create({
      data: { assistantId: assistant.id, teacherId: A.teacherId, updatedAt: new Date() },
    });

    const enrolled = await tx.user.create({
      data: { name: `${tag}-stu-in`, role: "student", email: `${tag}-stu-in@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: enrolled.id,
        fullName: `${tag}-stu-in`,
        entityType: "invited",
        inviteCode: (tag + "IN").toUpperCase(),
        familyLinkCode: (tag + "FIN").toUpperCase(),
        walletBalance: 0,
      },
    });
    await tx.enrollment.create({
      data: { studentId: enrolled.id, courseId: A.courseId, status: "active", enrolledBy: A.adminId, updatedAt: new Date() },
    });

    const outsider = await tx.user.create({
      data: { name: `${tag}-stu-out`, role: "student", email: `${tag}-stu-out@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: outsider.id,
        fullName: `${tag}-stu-out`,
        entityType: "invited",
        inviteCode: (tag + "OUT").toUpperCase(),
        familyLinkCode: (tag + "FOUT").toUpperCase(),
        walletBalance: 0,
      },
    });

    return { A, B, staffId: staff.id, assistantId: assistant.id, enrolledId: enrolled.id, outsiderId: outsider.id };
  });

  const staffUser = su({ id: fx.staffId, role: "center_staff", centerId: fx.A.centerId });
  const adminA = su({ id: fx.A.adminId, role: "center_admin", centerId: fx.A.centerId });
  const teacherA = su({ id: fx.A.teacherId, role: "teacher" });
  const teacherB = su({ id: fx.B.teacherId, role: "teacher" });
  // The assistant AFTER `toActingUser` — the route-level resolution that makes
  // an assistant act as the teacher it serves. Asserted separately below.
  const assistantActing = su({ id: fx.A.teacherId, role: "teacher" });
  const assistantRaw = su({ id: fx.assistantId, role: "assistant" });

  console.log("\n[1] center_staff has NO materials capability (the H-1 leak)");
  await expectThrows(() => listMaterials(undefined, staffUser), "center_staff cannot LIST materials");
  await expectThrows(
    () => getMaterialDownloadUrl(fx.A.materialId, staffUser),
    "center_staff cannot download its OWN centre's material",
  );
  await expectThrows(
    () => getMaterialDownloadUrl(fx.B.materialId, staffUser),
    "center_staff cannot download ANOTHER centre's material",
  );

  console.log("\n[2] a raw assistant identity is refused; the ACTING teacher is not");
  await expectThrows(
    () => getMaterialDownloadUrl(fx.A.materialId, assistantRaw),
    "an unresolved assistant identity is refused by the service (default-deny)",
  );
  const asstOwn = await getMaterialDownloadUrl(fx.A.materialId, assistantActing);
  assert(
    asstOwn.url === "https://example.com/secret.pdf",
    "assistant acting as ITS teacher still downloads that teacher's material (delegation intact)",
  );
  await expectThrows(
    () => getMaterialDownloadUrl(fx.B.materialId, assistantActing),
    "assistant acting as its teacher cannot reach ANOTHER teacher's material",
  );

  console.log("\n[3] the roles that always worked still work");
  const tOwn = await getMaterialDownloadUrl(fx.A.materialId, teacherA);
  assert(tOwn.url === "https://example.com/secret.pdf", "teacher downloads its OWN material");
  await expectThrows(
    () => getMaterialDownloadUrl(fx.A.materialId, teacherB),
    "teacher cannot download another teacher's material",
  );
  await expectThrows(
    () => getMaterialDownloadUrl(fx.B.materialId, adminA),
    "center_admin cannot download another centre's material",
  );
  const stuOk = await getMaterialDownloadUrl(fx.A.materialId, su({ id: fx.enrolledId, role: "student" }));
  assert(stuOk.url === "https://example.com/secret.pdf", "an ENROLLED student downloads the course material");
  await expectThrows(
    () => getMaterialDownloadUrl(fx.A.materialId, su({ id: fx.outsiderId, role: "student" })),
    "an UNENROLLED student cannot download it",
  );

  console.log("\n[4] the teacher list stays scoped to its own materials");
  const teacherList = await listMaterials(undefined, teacherA);
  assert(
    teacherList.length === 1 && teacherList[0]?.id === fx.A.materialId,
    `teacher lists ONLY its own material (got ${teacherList.length})`,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
