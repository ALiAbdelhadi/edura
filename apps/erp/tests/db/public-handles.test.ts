import { testPool } from "../../../../packages/database/scripts/test-pool";
import { withPlatformContext, prisma } from "@repo/database";
import type { SessionUser } from "@repo/server-core/erp-auth/session";
import { BusinessRuleError, ConflictError, ForbiddenError } from "@repo/server-core/errors/classes";
import {
  checkHandleAvailability,
  clearMyHandle,
  findHandleOwner,
  getMyHandle,
  setMyHandle,
} from "@repo/server-core/services/public-handles/public-handles";
import {
  getCenterPublicProfile,
  readPublicProfile as resolvePublicProfile,
} from "@repo/server-core/services/public-handles/public-profiles";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

const admin = testPool();

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

async function rejects(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

const su = (u: { id: string; role: string; centerId?: string }): SessionUser =>
  ({ id: u.id, role: u.role, centerId: u.centerId, locale: "ar", name: "test", email: null }) as unknown as SessionUser;

async function main() {
  const tag = "ph" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Public handles DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkUser = (key: string, role: string, status = "active") =>
      tx.user.create({
        data: {
          name: `${tag}-${key}`,
          role: role as never,
          email: `${tag}-${key}@x.io`,
          status: status as never,
        },
      });

    const owner = await mkUser("owner", "center_admin");
    const otherOwner = await mkUser("owner2", "center_admin");
    const teacher = await mkUser("teacher", "teacher");
    const suspendedTeacher = await mkUser("teacher2", "teacher", "suspended");
    const assistant = await mkUser("assistant", "assistant");
    const student = await mkUser("student", "student");

    const teacherProfile = await tx.teacherProfile.create({
      data: { userId: teacher.id, walletBalance: 0, bio: "bio" },
    });
    await tx.teacherProfile.create({
      data: { userId: suspendedTeacher.id, walletBalance: 0 },
    });

    const center = await tx.center.create({
      data: {
        name: `${tag} center`,
        shortId: (tag + "AAAA").slice(0, 12).toUpperCase(),
        status: "active",
        ownerUserId: owner.id,
      },
    });
    const pendingCenter = await tx.center.create({
      data: {
        name: `${tag} pending`,
        shortId: (tag + "BBBB").slice(1, 13).toUpperCase(),
        status: "pending",
        ownerUserId: otherOwner.id,
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    await tx.centerAdminProfile.create({
      data: { userId: otherOwner.id, centerId: pendingCenter.id },
    });

    const grade = await tx.gradeLevel.findFirst({ where: { isActive: true } });
    const subject = await tx.subject.findFirst({ where: { isActive: true } });
    const course = await tx.course.create({
      data: {
        centerId: center.id,
        teacherId: teacher.id,
        title: `${tag} course`,
        subject: subject?.nameAr ?? "Math",
        subjectId: subject?.id,
        gradeLevelId: grade?.id,
        daysOfWeek: [0, 2],
        startTime: "17:00",
        endTime: "18:30",
        startDate: new Date(),
        price: 30000,
        pricePerMonth: 30000,
        maxStudents: 10,
        status: "active",
        deliveryMode: "hybrid",
        onlineUrl: "https://meet.example/secret-room",
      },
    });

    return {
      owner,
      otherOwner,
      teacher,
      suspendedTeacher,
      assistant,
      student,
      teacherProfile,
      center,
      pendingCenter,
      course,
    };
  });

  const ownerS = su({ id: fx.owner.id, role: "center_admin", centerId: fx.center.id });
  const otherOwnerS = su({ id: fx.otherOwner.id, role: "center_admin", centerId: fx.pendingCenter.id });
  const teacherS = su({ id: fx.teacher.id, role: "teacher" });
  const suspendedTeacherS = su({ id: fx.suspendedTeacher.id, role: "teacher" });
  const assistantS = su({ id: fx.assistant.id, role: "assistant" });
  const studentS = su({ id: fx.student.id, role: "student" });

  const cHandle = `${tag}-center`;
  const tHandle = `${tag}-teacher`;

  try {
    console.log("\n[A] ownership comes from the session, never the body");
    const before = await getMyHandle(ownerS);
    assert(before.kind === "center" && before.handle === null, "A1 a fresh centre has no handle");
    const set = await setMyHandle(ownerS, `  ${cHandle.toUpperCase()}  `);
    assert(set.handle === cHandle, "A2 the handle is normalized (trim + lowercase) on save");
    const mine = await getMyHandle(ownerS);
    assert(mine.handle === cHandle, "A3 the centre admin reads back their own handle");
    const tset = await setMyHandle(teacherS, tHandle);
    assert(tset.kind === "teacher" && tset.handle === tHandle, "A4 a teacher names their own profile");
    assert(
      (await rejects(() => setMyHandle(assistantS, `${tag}-assistant`))) instanceof ForbiddenError,
      "A5 an assistant is refused — the handle is identity, not a delegated task",
    );
    assert(
      (await rejects(() => setMyHandle(studentS, `${tag}-student`))) instanceof ForbiddenError,
      "A6 a student is refused",
    );

    console.log("\n[B] one namespace for both kinds");
    const clash = await rejects(() => setMyHandle(teacherS, cHandle));
    assert(clash instanceof ConflictError, "B1 a teacher cannot take a centre's handle (ConflictError)");
    assert(
      ((clash as ConflictError)?.details as { reason?: string } | undefined)?.reason === "taken",
      "B2 the conflict names its reason: taken",
    );
    const clash2 = await rejects(() => setMyHandle(otherOwnerS, tHandle));
    assert(clash2 instanceof ConflictError, "B3 a centre cannot take a teacher's handle");
    const stillTeacher = await getMyHandle(teacherS);
    assert(stillTeacher.handle === tHandle, "B4 a refused rename leaves the previous handle in place");
    const avail = await checkHandleAvailability(otherOwnerS, cHandle);
    assert(avail.available === false && avail.problem === "taken", "B5 availability reports taken to another owner");
    const own = await checkHandleAvailability(ownerS, cHandle);
    assert(own.available === true && own.problem === null, "B6 your own current handle is available to you");
    const free = await checkHandleAvailability(ownerS, `${tag}-free`);
    assert(free.available === true, "B7 an unowned valid handle is available");

    console.log("\n[C] shape and reserved names are refused before the database, and by it");
    for (const [raw, reason] of [
      ["ab", "too_short"],
      ["-abc", "shape"],
      ["a--b", "shape"],
      ["a.b", "shape"],
      ["www", "reserved"],
      ["admin", "reserved"],
      ["api", "reserved"],
    ] as const) {
      const err = await rejects(() => setMyHandle(ownerS, raw));
      assert(
        err instanceof BusinessRuleError && ((err as BusinessRuleError).details as { reason: string }).reason === reason,
        `C1 "${raw}" refused with reason ${reason}`,
      );
    }
    const rawShape = await rejects(() =>
      admin.query(
        `INSERT INTO public_handles (handle, kind, center_id) VALUES ($1, 'center', $2)`,
        ["Bad_Handle", fx.pendingCenter.id],
      ),
    );
    assert(
      rawShape !== null && /public_handles_shape/.test(String((rawShape as Error).message)),
      "C2 the database CHECK refuses a bad shape even when the service is bypassed",
    );
    const rawOwner = await rejects(() =>
      admin.query(
        `INSERT INTO public_handles (handle, kind, center_id, teacher_profile_id) VALUES ($1, 'center', $2, $3)`,
        [`${tag}-two-owners`, fx.pendingCenter.id, fx.teacherProfile.id],
      ),
    );
    assert(
      rawOwner !== null && /public_handles_one_owner/.test(String((rawOwner as Error).message)),
      "C3 the database CHECK refuses a row with two owners",
    );
    const rawKind = await rejects(() =>
      admin.query(
        `INSERT INTO public_handles (handle, kind, center_id) VALUES ($1, 'teacher', $2)`,
        [`${tag}-wrong-kind`, fx.pendingCenter.id],
      ),
    );
    assert(
      rawKind !== null && /public_handles_one_owner/.test(String((rawKind as Error).message)),
      "C4 the database CHECK refuses a kind that disagrees with the owner column",
    );

    console.log("\n[D] resolution and the status gate");
    const owner1 = await findHandleOwner(cHandle);
    assert(owner1?.kind === "center" && owner1.centerId === fx.center.id, "D1 the centre handle resolves to its centre");
    const owner2 = await findHandleOwner(tHandle.toUpperCase());
    assert(owner2?.kind === "teacher" && owner2.teacherUserId === fx.teacher.id, "D2 the teacher handle resolves case-insensitively to the user");
    assert((await findHandleOwner(`${tag}-nobody`)) === null, "D3 an unknown handle resolves to null");
    assert((await findHandleOwner("www")) === null, "D4 a reserved handle never resolves");

    const page = await resolvePublicProfile(cHandle);
    assert(page?.kind === "center" && page.name === fx.center.name, "D5 the centre page resolves");
    assert(page?.kind === "center" && page.courses.length === 1, "D6 the centre page lists its active course");
    const json = JSON.stringify(page);
    assert(!json.includes("secret-room") && !json.includes("onlineUrl"), "D7 the meeting link is never in the public payload");
    assert(page?.kind === "center" && page.courses[0]!.teacherName === fx.teacher.name, "D8 the course row carries the teacher's name");
    assert(page?.kind === "center" && page.handle === cHandle, "D9 the page knows its own handle");

    const tpage = await resolvePublicProfile(tHandle);
    assert(tpage?.kind === "teacher" && tpage.courses.length === 1, "D10 the teacher page lists the course they teach");
    assert(tpage?.kind === "teacher" && tpage.courses[0]!.centerName === fx.center.name, "D11 the course row on a teacher page names the centre");

    await setMyHandle(otherOwnerS, `${tag}-pending`);
    assert((await resolvePublicProfile(`${tag}-pending`)) === null, "D12 a PENDING centre's handle resolves to nothing — no public face");
    assert(
      (await rejects(() => getCenterPublicProfile(fx.pendingCenter.id))) !== null,
      "D13 the id-based public read applies the same gate (GET /api/v1/centers/[id])",
    );
    await setMyHandle(suspendedTeacherS, `${tag}-suspended`);
    assert((await resolvePublicProfile(`${tag}-suspended`)) === null, "D14 a suspended teacher's handle resolves to nothing");

    console.log("\n[E] rename and clear");
    const renamed = await setMyHandle(ownerS, `${tag}-renamed`);
    assert(renamed.handle === `${tag}-renamed`, "E1 rename updates the same row");
    assert((await findHandleOwner(cHandle)) === null, "E2 the old name is released immediately");
    assert((await findHandleOwner(`${tag}-renamed`))?.kind === "center", "E3 the new name resolves");
    const rows = await admin.query(`SELECT count(*)::int AS n FROM public_handles WHERE center_id = $1`, [fx.center.id]);
    assert(rows.rows[0].n === 1, "E4 exactly one row per owner after a rename");
    const cleared = await clearMyHandle(ownerS);
    assert(cleared.handle === null, "E5 clear removes the handle");
    assert((await findHandleOwner(`${tag}-renamed`)) === null, "E6 a cleared name no longer resolves");
    const cleared2 = await clearMyHandle(ownerS);
    assert(cleared2.handle === null, "E7 clearing twice is a no-op");

    console.log("\n[F] cascade");
    await admin.query(`DELETE FROM teacher_profiles WHERE id = $1`, [fx.teacherProfile.id]);
    assert((await findHandleOwner(tHandle)) === null, "F1 deleting the owner takes the handle with it");
  } finally {
    await withPlatformContext(async (tx) => {
      await tx.publicHandle.deleteMany({ where: { handle: { startsWith: tag } } });
      await tx.course.deleteMany({ where: { id: fx.course.id } });
      await tx.centerAdminProfile.deleteMany({ where: { userId: { in: [fx.owner.id, fx.otherOwner.id] } } });
      await tx.center.deleteMany({ where: { id: { in: [fx.center.id, fx.pendingCenter.id] } } });
      await tx.teacherProfile.deleteMany({ where: { userId: { in: [fx.teacher.id, fx.suspendedTeacher.id] } } });
    });
    // DB-04: edura_app cannot DELETE users; fixtures go through the owner pool.
    await admin.query(`DELETE FROM users WHERE email LIKE $1`, [tag + "%"]);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await admin.end().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite public-handles.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
