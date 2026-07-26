/**
 * Room-based revenue split — money-path verification (live DB).
 *
 * Proves:
 *  VP1  the three shares sum to exactly 100% (DB-level CHECK) AND resolution
 *       order is per-room → per-center → global.
 *  VP2  a room-based course settles through the EXISTING append-only ledger with
 *       exactly-once settlement — platform/teacher/center each get their share
 *       ONCE, conserving the price; a re-run does not double-pay; a %-mode
 *       refund reverses it exactly.
 *  VP3  the split is SNAPSHOT at course creation — changing the config afterwards
 *       leaves an existing course settling at its ORIGINAL split while a newly
 *       created course uses the NEW split.
 *  VP5  the is_demo seed wrote room profiles but NO ledger rows.
 *
 * Run (all suites, guarded):  pnpm --filter superadmin test:db
 * Run (this one only):        pnpm --filter superadmin test:db:only room-revenue-split
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import {
  resolveRevenueSplit,
  resolveCourseSplitSnapshot,
} from "@/lib/services/finance/commission";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

// Fixture teardown + the environment guard, wired at the module edge so
// neither depends on remembering to do it inside a proof.
//  * __sweepTag is set where the suite builds its tag; runGuarded() sweeps it
//    in a finally, so an assertion that THROWS still cleans up.
//  * assertDbEnv runs before the first fixture: running this file directly
//    with --env-file=.env.local (which skips pretest:db) is now refused here,
//    not just by the npm script.
let __sweepTag = "";
const SUITE_NAME = "room-revenue-split.test.ts";

import {
  updateGlobalSplit,
  upsertCenterSplit,
  clearCenterSplit,
  upsertRoomSplit,
  clearRoomSplit,
} from "@/lib/services/admin/rooms-split";

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
async function expectThrows(fn: () => Promise<unknown>, match: string, msg: string) {
  try {
    await fn();
    assert(false, `${msg} (did not throw)`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(match), `${msg} (threw: ${m.slice(0, 120)})`);
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function mkTeacher(tag: string) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: u.id, walletBalance: 0 } });
    return u.id;
  });
}
async function mkCenterRoom(tag: string) {
  return withPlatformContext(async (tx) => {
    const c = await tx.center.create({
      data: { name: `${tag}-c`, shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    const room = await tx.room.create({ data: { centerId: c.id, name: "hall", isActive: true } });
    return { centerId: c.id, roomId: room.id };
  });
}
async function mkStudent(tag: string) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: { userId: u.id, fullName: `${tag}-s`, familyLinkCode: (tag + rid() + "00").slice(0, 18), pointsBalance: 0 },
    });
    return u.id;
  });
}
async function mkRoomBasedCourse(
  tag: string,
  centerId: string,
  roomId: string,
  teacherId: string,
  studentId: string,
  price: number,
) {
  return withPlatformContext(async (tx) => {
    const snapshot = await resolveCourseSplitSnapshot(tx, { roomId, centerId });
    const course = await tx.course.create({
      data: {
        centerId,
        teacherId,
        defaultRoomId: roomId,
        title: tag,
        subject: "Math",
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price,
        maxStudents: 30,
        status: "active",
        ...snapshot,
      },
    });
    const s = await tx.session.create({
      data: {
        courseId: course.id,
        teacherId,
        originalDate: new Date("2026-02-02T10:00:00Z"),
        date: new Date("2026-02-02T10:00:00Z"),
        startTime: "10:00",
        endTime: "11:00",
        status: "scheduled",
        roomId,
      },
    });
    await tx.attendanceRecord.create({
      data: { sessionId: s.id, studentId, courseId: course.id, centerId, status: "present", markedBy: teacherId },
    });
    return { courseId: course.id, sessionId: s.id, snapshot };
  });
}
const wallets = (teacherId: string, centerId: string) =>
  withPlatformContext(async (tx) => ({
    teacher: (await tx.teacherProfile.findUnique({ where: { userId: teacherId }, select: { walletBalance: true } }))!.walletBalance,
    center: (await tx.center.findUnique({ where: { id: centerId }, select: { walletBalance: true } }))!.walletBalance,
  }));

async function main() {
  const tag = "split-" + rid();
  __sweepTag = tag;
  console.log("Room revenue-split DB tests —", tag);

  const suId = await withPlatformContext((tx) =>
    tx.user.create({ data: { name: `${tag}-su`, role: "super_admin", email: `${tag}-su@x.io`, status: "active" } }).then((u) => u.id),
  );
  const su = { id: suId, role: "super_admin" } as never;

  // Baseline: a known global split so tests are deterministic.
  await updateGlobalSplit({ platformShareBp: 1500, teacherShareBp: 7000, centerShareBp: 1500 }, su);

  // ---------------------------------------------------------------- VP1
  console.log("\nVP1 — DB sum=100 CHECK + resolution order");
  const { centerId, roomId } = await mkCenterRoom(tag);

  await expectThrows(
    () =>
      withPlatformContext(
        (tx) =>
          tx.$executeRaw`INSERT INTO commission_settings (scope, room_id, platform_share_bp, teacher_share_bp, center_share_bp) VALUES ('room', gen_random_uuid(), 5000, 4000, 2000)` as unknown as Promise<unknown>,
      ),
    "commission_split_shape",
    "DB CHECK rejects a config split not summing to 100%",
  );

  let r = await withPlatformContext((tx) => resolveRevenueSplit(tx, { roomId, centerId }));
  assert(r?.source === "global" && r?.platformShareBp === 1500, "resolves to GLOBAL when no override");

  await upsertCenterSplit(centerId, { platformShareBp: 1200, teacherShareBp: 6800, centerShareBp: 2000 }, su);
  r = await withPlatformContext((tx) => resolveRevenueSplit(tx, { roomId, centerId }));
  assert(r?.source === "center" && r?.platformShareBp === 1200, "per-CENTER override beats global");

  await upsertRoomSplit(centerId, roomId, { platformShareBp: 2000, teacherShareBp: 6000, centerShareBp: 2000 }, su);
  r = await withPlatformContext((tx) => resolveRevenueSplit(tx, { roomId, centerId }));
  assert(r?.source === "room" && r?.platformShareBp === 2000, "per-ROOM override beats center (room→center→global)");

  await clearRoomSplit(centerId, roomId, su);
  r = await withPlatformContext((tx) => resolveRevenueSplit(tx, { roomId, centerId }));
  assert(r?.source === "center", "clearing room override falls back to center");

  await clearCenterSplit(centerId, su);
  r = await withPlatformContext((tx) => resolveRevenueSplit(tx, { roomId, centerId }));
  assert(r?.source === "global", "clearing center override falls back to global");

  // ---------------------------------------------------------------- VP2
  console.log("\nVP2 — room-based settlement through the existing ledger, exactly-once");
  await upsertRoomSplit(centerId, roomId, { platformShareBp: 2000, teacherShareBp: 6000, centerShareBp: 2000 }, su);
  const teacherId = await mkTeacher(tag + "2");
  const studentId = await mkStudent(tag + "2");
  const price = 20000;
  const { courseId, sessionId, snapshot } = await mkRoomBasedCourse(tag + "2", centerId, roomId, teacherId, studentId, price);
  assert(
    (snapshot as Record<string, number>).splitPlatformBp === 2000 &&
      (snapshot as Record<string, number>).splitCenterBp === 2000,
    "course froze the room-override split snapshot (20/60/20)",
  );

  const before = await wallets(teacherId, centerId);
  await completeSession(sessionId, { id: teacherId, role: "teacher" } as never);
  const after = await wallets(teacherId, centerId);

  const platformCut = Math.round((price * 2000) / 10000); // 4000
  const centerCut = Math.round((price * 2000) / 10000); // 4000
  const teacherCut = price - platformCut - centerCut; // 12000
  assert(after.teacher - before.teacher === teacherCut, `teacher credited its share once (+${teacherCut})`);
  assert(after.center - before.center === centerCut, `center credited its share once (+${centerCut})`);
  assert(teacherCut + centerCut + platformCut === price, "three shares conserve exactly to the price");

  const ledger = await withPlatformContext(async (tx) => {
    const rows = await tx.transaction.findMany({ where: { lessonId: sessionId } });
    const payment = rows.filter((x) => x.type === "payment").reduce((s, x) => s + x.amount, 0);
    const commission = rows.filter((x) => x.type === "commission").reduce((s, x) => s + x.amount, 0);
    return { count: rows.length, payment, commission };
  });
  assert(ledger.payment === price, `ledger payment row = price (${price})`);
  assert(ledger.commission === platformCut, `ledger commission total = platform cut (${platformCut})`);

  // Exactly-once: settling again must not move money.
  await completeSession(sessionId, { id: teacherId, role: "teacher" } as never);
  const after2 = await wallets(teacherId, centerId);
  assert(
    after2.teacher === after.teacher && after2.center === after.center,
    "re-settling the same session does NOT double-pay (distributedAt exactly-once)",
  );

  // %-mode refund reverses exactly (uses the course snapshot).
  await refundLessonForStudent(sessionId, studentId, "verification", su);
  const afterRefund = await wallets(teacherId, centerId);
  assert(
    afterRefund.teacher === before.teacher && afterRefund.center === before.center,
    "a %-mode refund reverses the split exactly (wallets back to pre-settlement)",
  );

  // Course-level snapshot CHECK is DB-enforced too.
  await expectThrows(
    () =>
      withPlatformContext(
        (tx) =>
          tx.$executeRaw`UPDATE courses SET split_platform_bp = 5000, split_teacher_bp = 4000, split_center_bp = 2000 WHERE id = ${courseId}::uuid` as unknown as Promise<unknown>,
      ),
    // Renamed from course_split_shape by the room-pricing-methods migration
    // (method-aware CHECK, same rule for Method-1 rows).
    "course_pricing_shape",
    "DB CHECK rejects a course snapshot not summing to 100%",
  );

  // ---------------------------------------------------------------- VP3
  console.log("\nVP3 — snapshot: config change does NOT re-rate an existing course");
  const t3 = await mkTeacher(tag + "3");
  const s3 = await mkStudent(tag + "3");
  const cr3 = await mkCenterRoom(tag + "3"); // no center/room override → inherits global

  await updateGlobalSplit({ platformShareBp: 1000, teacherShareBp: 8000, centerShareBp: 1000 }, su); // A
  const c1 = await mkRoomBasedCourse(tag + "3a", cr3.centerId, cr3.roomId, t3, s3, 20000);
  assert((c1.snapshot as Record<string, number>).splitTeacherBp === 8000, "course1 froze split A (teacher 80%)");

  await updateGlobalSplit({ platformShareBp: 3000, teacherShareBp: 5000, centerShareBp: 2000 }, su); // B
  const s3b = await mkStudent(tag + "3b");
  const c2 = await mkRoomBasedCourse(tag + "3b", cr3.centerId, cr3.roomId, t3, s3b, 20000);
  assert((c2.snapshot as Record<string, number>).splitTeacherBp === 5000, "course2 (created after) froze split B (teacher 50%)");

  // Settle course1 AFTER the config changed to B → it must still use A.
  const b1 = await wallets(t3, cr3.centerId);
  await completeSession(c1.sessionId, { id: t3, role: "teacher" } as never);
  const a1 = await wallets(t3, cr3.centerId);
  assert(a1.teacher - b1.teacher === 16000, "EXISTING course settles at ORIGINAL split A (teacher +16000), not the new config");

  const b2 = await wallets(t3, cr3.centerId);
  await completeSession(c2.sessionId, { id: t3, role: "teacher" } as never);
  const a2 = await wallets(t3, cr3.centerId);
  assert(a2.teacher - b2.teacher === 10000, "NEW course settles at NEW split B (teacher +10000)");

  // Restore the shared global default split (this test mutated it above).
  await updateGlobalSplit({ platformShareBp: 1500, teacherShareBp: 7000, centerShareBp: 1500 }, su);

  // ---------------------------------------------------------------- VP5
  console.log("\nVP5 — is_demo seed wrote room profiles but NO ledger");
  const seedCheck = await withPlatformContext(async (tx) => {
    const demoCenters = await tx.center.findMany({ where: { isDemo: true }, select: { id: true } });
    const ids = demoCenters.map((c) => c.id);
    const demoTx = await tx.transaction.count({ where: { centerId: { in: ids } } });
    const roomsWithPhotos = await tx.room.count({ where: { centerId: { in: ids }, NOT: { photos: { isEmpty: true } } } });
    const roomsWithPrice = await tx.room.count({ where: { centerId: { in: ids }, NOT: { price: null } } });
    return { demoTx, roomsWithPhotos, roomsWithPrice };
  });
  assert(seedCheck.demoTx === 0, "NO ledger Transaction rows reference demo centers (no ledger pollution)");
  assert(seedCheck.roomsWithPhotos > 0, "demo rooms have photos (previewable)");
  assert(seedCheck.roomsWithPrice > 0, "demo rooms have a hall price");

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
