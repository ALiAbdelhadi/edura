/**
 * Room pricing methods — Method 2 (per-attending-student) money-path
 * verification (live DB). Extends room-revenue-split.test.ts (Method 1, kept
 * intact — rerun it alongside this file).
 *
 * Proves:
 *  VP1  M2 rate resolution room → center → global, BOTH rate forms (flat
 *       piasters / bp), and the DB CHECK rejecting a row with both forms set.
 *  VP2  method policy at snapshot time: forced rooms impose their method,
 *       mismatches throw, both-methods rooms honor the request and default to
 *       percent, M2 with NO configured rate THROWS (never falls back to a flat
 *       share), and platform% + rate% > 100% is rejected.
 *  VP3  M2 settlement: per PRESENT student only (absent + counter_only
 *       excluded), through the SAME append-only ledger, exact conservation,
 *       method-stamped notes, and a session_settlements record matching the
 *       ledger.
 *  VP4  exactly-once: re-completing moves no money, writes no rows; a
 *       zero-present completion does NOT claim and a later re-complete settles
 *       exactly once.
 *  VP5  attendance edited AFTER settlement never re-rates money, and the
 *       oversight listing flags the mismatch.
 *  VP6  cancelled sessions cannot settle; a negative teacher net (M2 flat fee
 *       > lesson price) aborts completion BEFORE anything persists.
 *  VP7  an M2 refund reverses the settlement exactly (wallets restored,
 *       student credited, double-refund rejected).
 *  VP8  M2 with a PERCENT rate settles bp-exact; the course-snapshot DB CHECK
 *       holds; clearing a split preserves a co-located rate and vice versa.
 *  VP9  the is_demo seed wrote method configs + an M2 demo course but NO
 *       ledger rows.
 *
 * Run: pnpm --filter superadmin exec tsx --env-file=.env.local tests/db/room-pricing-methods.test.ts
 */
import { withPlatformContext } from "@repo/database";
import { completeSession } from "@/lib/services/finance/distribution";
import {
  resolveMethod2Rate,
  resolveCoursePricingSnapshot,
} from "@/lib/services/finance/commission";
import { refundLessonForStudent } from "@/lib/services/finance/refunds";
import {
  updateGlobalSplit,
  updateGlobalM2Rate,
  clearGlobalM2Rate,
  upsertCenterM2Rate,
  clearCenterM2Rate,
  upsertRoomM2Rate,
  clearRoomM2Rate,
  upsertRoomSplit,
  clearRoomSplit,
} from "@/lib/services/admin/rooms-split";
import { listSessionSettlements } from "@/lib/services/admin/session-settlements";

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
    assert(m.includes(match), `${msg} (threw: ${m.slice(0, 140)})`);
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
async function mkCenterRoom(
  tag: string,
  methods: ("whole_room_percent" | "per_attending_student")[] = ["whole_room_percent"],
) {
  return withPlatformContext(async (tx) => {
    const c = await tx.center.create({
      data: {
        name: `${tag}-c`,
        shortId: ("M" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    const room = await tx.room.create({
      data: { centerId: c.id, name: "hall", isActive: true, allowedPricingMethods: methods },
    });
    return { centerId: c.id, roomId: room.id };
  });
}
async function mkStudent(tag: string) {
  return withPlatformContext(async (tx) => {
    const u = await tx.user.create({
      data: { name: `${tag}-s`, role: "student", email: `${tag}-s@x.io`, status: "active" },
    });
    await tx.studentProfile.create({
      data: {
        userId: u.id,
        fullName: `${tag}-s`,
        familyLinkCode: (tag + rid() + "00").slice(0, 18),
        pointsBalance: 0,
      },
    });
    return u.id;
  });
}

/** Course frozen via the REAL snapshot resolver + one session + attendance. */
async function mkCourse(opts: {
  tag: string;
  centerId: string;
  roomId: string;
  teacherId: string;
  price: number;
  requestedMethod?: "whole_room_percent" | "per_attending_student";
  present?: string[];
  absent?: string[];
  counterOnly?: string[];
  sessionStatus?: "scheduled" | "cancelled";
}) {
  return withPlatformContext(async (tx) => {
    const snapshot = await resolveCoursePricingSnapshot(tx, {
      roomId: opts.roomId,
      centerId: opts.centerId,
      requestedMethod: opts.requestedMethod ?? null,
    });
    const course = await tx.course.create({
      data: {
        centerId: opts.centerId,
        teacherId: opts.teacherId,
        defaultRoomId: opts.roomId,
        title: opts.tag,
        subject: "Math",
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: opts.price,
        maxStudents: 30,
        status: "active",
        ...snapshot,
      },
    });
    const s = await tx.session.create({
      data: {
        courseId: course.id,
        teacherId: opts.teacherId,
        originalDate: new Date("2026-02-02T10:00:00Z"),
        date: new Date("2026-02-02T10:00:00Z"),
        startTime: "10:00",
        endTime: "11:00",
        status: opts.sessionStatus ?? "scheduled",
        roomId: opts.roomId,
      },
    });
    const mark = async (studentId: string, status: "present" | "absent" | "counter_only") =>
      tx.attendanceRecord.create({
        data: {
          sessionId: s.id,
          studentId,
          courseId: course.id,
          centerId: opts.centerId,
          status,
          markedBy: opts.teacherId,
        },
      });
    for (const id of opts.present ?? []) await mark(id, "present");
    for (const id of opts.absent ?? []) await mark(id, "absent");
    for (const id of opts.counterOnly ?? []) await mark(id, "counter_only");
    return { courseId: course.id, sessionId: s.id, snapshot: snapshot as Record<string, unknown> };
  });
}

const wallets = (teacherId: string, centerId: string) =>
  withPlatformContext(async (tx) => ({
    teacher: (await tx.teacherProfile.findUnique({
      where: { userId: teacherId },
      select: { walletBalance: true },
    }))!.walletBalance,
    center: (await tx.center.findUnique({
      where: { id: centerId },
      select: { walletBalance: true },
    }))!.walletBalance,
  }));

const ledgerFor = (sessionId: string) =>
  withPlatformContext((tx) => tx.transaction.findMany({ where: { lessonId: sessionId } }));

const settlementFor = (sessionId: string) =>
  withPlatformContext((tx) => tx.sessionSettlement.findUnique({ where: { sessionId } }));

async function main() {
  const tag = "m2-" + rid();
  console.log("Room pricing methods (Method 2) DB tests —", tag);

  const suId = await withPlatformContext((tx) =>
    tx.user
      .create({
        data: { name: `${tag}-su`, role: "super_admin", email: `${tag}-su@x.io`, status: "active" },
      })
      .then((u) => u.id),
  );
  const su = { id: suId, role: "super_admin" } as never;

  // Deterministic baseline: known global split, NO global M2 rate.
  await updateGlobalSplit({ platformShareBp: 1500, teacherShareBp: 7000, centerShareBp: 1500 }, su);
  await clearGlobalM2Rate(su);

  // ---------------------------------------------------------------- VP1
  console.log("\nVP1 — M2 rate resolution room → center → global, both forms + DB CHECK");
  const { centerId, roomId } = await mkCenterRoom(tag, [
    "whole_room_percent",
    "per_attending_student",
  ]);

  await expectThrows(
    () =>
      withPlatformContext(
        (tx) =>
          tx.$executeRaw`INSERT INTO commission_settings (scope, room_id, center_per_student_fee, center_per_student_bp) VALUES ('room', gen_random_uuid(), 500, 1000)` as unknown as Promise<unknown>,
      ),
    "commission_m2_rate_shape",
    "DB CHECK rejects a rate row with BOTH flat fee and bp set",
  );

  let rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate === null, "no rate configured anywhere → resolves to null (M2 unavailable)");

  await updateGlobalM2Rate({ fee: 300, bp: null }, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate?.source === "global" && rate?.fee === 300, "GLOBAL flat rate resolves (300 pt/student)");

  await upsertCenterM2Rate(centerId, { fee: null, bp: 800 }, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate?.source === "center" && rate?.bp === 800, "per-CENTER bp rate beats global");

  await upsertRoomM2Rate(centerId, roomId, { fee: 500, bp: null }, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate?.source === "room" && rate?.fee === 500, "per-ROOM flat rate beats center (room→center→global)");

  await clearRoomM2Rate(centerId, roomId, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate?.source === "center", "clearing the room rate falls back to center");

  await clearCenterM2Rate(centerId, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate?.source === "global", "clearing the center rate falls back to global");

  await clearGlobalM2Rate(su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate === null, "clearing the global rate → M2 unavailable again");

  // ---------------------------------------------------------------- VP2
  console.log("\nVP2 — method policy + no-rate guard at snapshot time");
  const forcedPct = await mkCenterRoom(tag + "-fp", ["whole_room_percent"]);
  const forcedM2 = await mkCenterRoom(tag + "-fm", ["per_attending_student"]);

  await expectThrows(
    () =>
      withPlatformContext((tx) =>
        resolveCoursePricingSnapshot(tx, {
          roomId: forcedPct.roomId,
          centerId: forcedPct.centerId,
          requestedMethod: "per_attending_student",
        }),
      ),
    "does not offer",
    "a percent-only room REJECTS a per-student request",
  );

  await expectThrows(
    () =>
      withPlatformContext((tx) =>
        resolveCoursePricingSnapshot(tx, {
          roomId: forcedM2.roomId,
          centerId: forcedM2.centerId,
        }),
      ),
    "not configured",
    "a per-student room with NO configured rate THROWS (never falls back to a flat share)",
  );

  await upsertCenterM2Rate(forcedM2.centerId, { fee: 500, bp: null }, su);
  const forcedSnap = await withPlatformContext((tx) =>
    resolveCoursePricingSnapshot(tx, { roomId: forcedM2.roomId, centerId: forcedM2.centerId }),
  );
  assert(
    (forcedSnap as Record<string, unknown>).pricingMethod === "per_attending_student" &&
      (forcedSnap as Record<string, unknown>).m2CenterFee === 500,
    "a forced per-student room imposes M2 even with no requestedMethod",
  );

  const bothDefault = await withPlatformContext((tx) =>
    resolveCoursePricingSnapshot(tx, { roomId, centerId }),
  );
  assert(
    (bothDefault as Record<string, unknown>).pricingMethod === "whole_room_percent",
    "a both-methods room with no request defaults to percent (backward-compatible)",
  );

  await expectThrows(
    () =>
      withPlatformContext(async (tx) => {
        await updateGlobalM2Rate({ fee: null, bp: 9000 }, su); // 90%/student
        try {
          return await resolveCoursePricingSnapshot(tx, {
            roomId,
            centerId,
            requestedMethod: "per_attending_student",
          });
        } finally {
          await clearGlobalM2Rate(su);
        }
      }),
    "exceeds 100%",
    "platform% + per-student% > 100% is rejected at snapshot time",
  );

  // ---------------------------------------------------------------- VP3
  console.log("\nVP3 — M2 settlement: present-only, exact ledger, settlement record");
  const t1 = await mkTeacher(tag + "1");
  const sA = await mkStudent(tag + "1a");
  const sB = await mkStudent(tag + "1b");
  const sAbs = await mkStudent(tag + "1x");
  const sCtr = await mkStudent(tag + "1c");
  await upsertRoomM2Rate(centerId, roomId, { fee: 500, bp: null }, su);

  const price = 20000; // 1 session → perSessionPrice = 20000
  const m2 = await mkCourse({
    tag: tag + "-m2",
    centerId,
    roomId,
    teacherId: t1,
    price,
    requestedMethod: "per_attending_student",
    present: [sA, sB],
    absent: [sAbs],
    counterOnly: [sCtr],
  });
  assert(
    m2.snapshot.pricingMethod === "per_attending_student" &&
      m2.snapshot.m2CenterFee === 500 &&
      m2.snapshot.splitPlatformBp === 1500,
    "course froze M2 snapshot (platform 15%, 500 pt/attending student)",
  );

  const platformCut = Math.round((price * 1500) / 10000); // 3000
  const centerCut = 500;
  const teacherCut = price - platformCut - centerCut; // 16500
  const N = 2;

  const b1 = await wallets(t1, centerId);
  await completeSession(m2.sessionId, { id: t1, role: "teacher" } as never);
  const a1 = await wallets(t1, centerId);

  assert(
    a1.teacher - b1.teacher === teacherCut * N,
    `teacher got the remainder × PRESENT only (+${teacherCut * N}, absent + counter_only excluded)`,
  );
  assert(a1.center - b1.center === centerCut * N, `center got rate × attendees (+${centerCut * N})`);
  assert(
    teacherCut + centerCut + platformCut === price,
    "per-student conservation: price = platform + center + teacher exactly",
  );

  const rows = await ledgerFor(m2.sessionId);
  assert(rows.length === 3 * N, `exactly 3 ledger rows per present student (${rows.length})`);
  const paySum = rows.filter((x) => x.type === "payment").reduce((s, x) => s + x.amount, 0);
  const comSum = rows.filter((x) => x.type === "commission").reduce((s, x) => s + x.amount, 0);
  assert(paySum === price * N, `ledger payment rows total price × N (${paySum})`);
  assert(comSum === platformCut * N, `ledger commission rows total platform cut × N (${comSum})`);
  assert(
    rows.some((x) => x.type === "commission" && (x.notes ?? "").includes("per-student method")),
    "commission notes stamp the method + rate",
  );

  const rec = await settlementFor(m2.sessionId);
  assert(!!rec && rec.presentCount === N, "session_settlements record written (presentCount = 2)");
  assert(
    !!rec &&
      rec.pricingMethod === "per_attending_student" &&
      rec.m2CenterFee === 500 &&
      rec.perSessionPrice === price &&
      rec.platformTotal === platformCut * N &&
      rec.centerTotal === centerCut * N &&
      rec.teacherTotal === teacherCut * N,
    "settlement record totals equal the ledger + wallet movements exactly",
  );
  assert(!!rec && rec.settledBy === t1, "settlement record attributes the settling actor");

  // ---------------------------------------------------------------- VP4
  console.log("\nVP4 — exactly-once (re-complete + zero-present claim ordering)");
  await completeSession(m2.sessionId, { id: t1, role: "teacher" } as never);
  const a2 = await wallets(t1, centerId);
  const rows2 = await ledgerFor(m2.sessionId);
  assert(
    a2.teacher === a1.teacher && a2.center === a1.center && rows2.length === rows.length,
    "re-completing moves NO money and writes NO rows (distributedAt exactly-once)",
  );

  const t2 = await mkTeacher(tag + "2");
  const empty = await mkCourse({
    tag: tag + "-empty",
    centerId,
    roomId,
    teacherId: t2,
    price,
    requestedMethod: "per_attending_student",
  });
  const r0 = await completeSession(empty.sessionId, { id: t2, role: "teacher" } as never);
  assert(
    r0.distribution.distributed === false && r0.distribution.reason === "no_present_students",
    "zero-present completion does NOT settle",
  );
  const unclaimed = await withPlatformContext((tx) =>
    tx.session.findUnique({ where: { id: empty.sessionId }, select: { distributedAt: true } }),
  );
  assert(unclaimed?.distributedAt === null, "…and does NOT claim distributedAt (settleable later)");

  const sLate = await mkStudent(tag + "2l");
  await withPlatformContext((tx) =>
    tx.attendanceRecord.create({
      data: {
        sessionId: empty.sessionId,
        studentId: sLate,
        courseId: empty.courseId,
        centerId,
        status: "present",
        markedBy: t2,
      },
    }),
  );
  const bLate = await wallets(t2, centerId);
  const r1 = await completeSession(empty.sessionId, { id: t2, role: "teacher" } as never);
  const r2 = await completeSession(empty.sessionId, { id: t2, role: "teacher" } as never);
  const aLate = await wallets(t2, centerId);
  assert(
    r1.distribution.distributed === true &&
      r2.distribution.reason === "already_distributed" &&
      aLate.center - bLate.center === centerCut,
    "late attendance + re-complete settles EXACTLY once",
  );

  // ---------------------------------------------------------------- VP5
  console.log("\nVP5 — attendance edited after settlement: money frozen, mismatch visible");
  const preEdit = await wallets(t1, centerId); // baseline NOW (VP4 settled another course on this center)
  await withPlatformContext((tx) =>
    tx.attendanceRecord.updateMany({
      where: { sessionId: m2.sessionId, studentId: sB },
      data: { status: "absent" },
    }),
  );
  const a3 = await wallets(t1, centerId);
  const rows3 = await ledgerFor(m2.sessionId);
  const rec3 = await settlementFor(m2.sessionId);
  assert(
    a3.teacher === preEdit.teacher && a3.center === preEdit.center && rows3.length === rows.length,
    "post-settlement attendance edit changes NO money (ledger + wallets frozen)",
  );
  assert(rec3?.presentCount === N, "settlement record keeps the FROZEN present count");
  const listing = await listSessionSettlements({ centerId });
  const listed = listing.settlements.find((s) => s.sessionId === m2.sessionId);
  assert(
    !!listed && listed.attendanceMismatch === true && listed.livePresentCount === N - 1,
    "oversight listing flags the live-vs-settled attendance mismatch",
  );
  await withPlatformContext((tx) =>
    tx.attendanceRecord.updateMany({
      where: { sessionId: m2.sessionId, studentId: sB },
      data: { status: "present" },
    }),
  );

  // ---------------------------------------------------------------- VP6
  console.log("\nVP6 — cancelled sessions + negative-net guard");
  const t3 = await mkTeacher(tag + "3");
  const s3 = await mkStudent(tag + "3");
  const cancelled = await mkCourse({
    tag: tag + "-cxl",
    centerId,
    roomId,
    teacherId: t3,
    price,
    requestedMethod: "per_attending_student",
    present: [s3],
    sessionStatus: "cancelled",
  });
  await expectThrows(
    () => completeSession(cancelled.sessionId, { id: t3, role: "teacher" } as never),
    "cancelled",
    "a cancelled session cannot be completed → M2 never settles for it",
  );
  assert((await ledgerFor(cancelled.sessionId)).length === 0, "…and it has zero ledger rows");

  const zero = await mkCourse({
    tag: tag + "-zero",
    centerId,
    roomId,
    teacherId: t3,
    price: 0, // unpriced (collab-created) course + flat fee → negative teacher net
    requestedMethod: "per_attending_student",
    present: [s3],
  });
  await expectThrows(
    () => completeSession(zero.sessionId, { id: t3, role: "teacher" } as never),
    "per-student fee exceeds",
    "flat fee > lesson price aborts completion with a clear error",
  );
  const zeroSession = await withPlatformContext((tx) =>
    tx.session.findUnique({
      where: { id: zero.sessionId },
      select: { status: true, distributedAt: true },
    }),
  );
  assert(
    zeroSession?.status === "scheduled" && zeroSession?.distributedAt === null,
    "…and the WHOLE tx rolled back (session not completed, nothing claimed)",
  );
  assert((await ledgerFor(zero.sessionId)).length === 0, "…zero ledger rows written");

  // ---------------------------------------------------------------- VP7
  console.log("\nVP7 — M2 refund reverses exactly, double-refund rejected");
  const preRefund = await wallets(t1, centerId);
  await refundLessonForStudent(m2.sessionId, sA, "verification", su);
  const postRefund = await wallets(t1, centerId);
  assert(
    preRefund.teacher - postRefund.teacher === teacherCut &&
      preRefund.center - postRefund.center === centerCut,
    "refunding ONE student reverses exactly one per-student split (teacher −16500, center −500)",
  );
  const studentWallet = await withPlatformContext((tx) =>
    tx.studentProfile.findUnique({ where: { userId: sA }, select: { walletBalance: true } }),
  );
  assert(studentWallet?.walletBalance === price, "student got the full lesson price to their wallet");
  await expectThrows(
    () => refundLessonForStudent(m2.sessionId, sA, "again", su),
    "already been refunded",
    "a second refund for the same student+lesson is rejected (H3)",
  );

  // ---------------------------------------------------------------- VP8
  console.log("\nVP8 — percent-form rate settles bp-exact; CHECK + clear interplay");
  const pctRateRoom = await mkCenterRoom(tag + "-pr", ["per_attending_student"]);
  await upsertRoomM2Rate(pctRateRoom.centerId, pctRateRoom.roomId, { fee: null, bp: 1000 }, su);
  const t4 = await mkTeacher(tag + "4");
  const s4 = await mkStudent(tag + "4");
  const pctCourse = await mkCourse({
    tag: tag + "-pct",
    centerId: pctRateRoom.centerId,
    roomId: pctRateRoom.roomId,
    teacherId: t4,
    price,
    present: [s4],
  });
  const b4 = await wallets(t4, pctRateRoom.centerId);
  await completeSession(pctCourse.sessionId, { id: t4, role: "teacher" } as never);
  const a4 = await wallets(t4, pctRateRoom.centerId);
  const pctCenterCut = Math.round((price * 1000) / 10000); // 2000
  assert(
    a4.center - b4.center === pctCenterCut &&
      a4.teacher - b4.teacher === price - platformCut - pctCenterCut,
    `percent-form rate settles bp-exact (center +${pctCenterCut}, teacher remainder)`,
  );

  await expectThrows(
    () =>
      withPlatformContext(
        (tx) =>
          tx.$executeRaw`UPDATE courses SET split_teacher_bp = 5000 WHERE id = ${pctCourse.courseId}::uuid` as unknown as Promise<unknown>,
      ),
    "course_pricing_shape",
    "DB CHECK rejects a malformed M2 course snapshot",
  );

  // A room row holding BOTH a split override and an M2 rate: clearing one
  // must preserve the other (regression for the shared scope row).
  await upsertRoomSplit(centerId, roomId, { platformShareBp: 2000, teacherShareBp: 6000, centerShareBp: 2000 }, su);
  await clearRoomSplit(centerId, roomId, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate?.source === "room" && rate?.fee === 500, "clearing the room SPLIT preserves the room M2 rate");
  await clearRoomM2Rate(centerId, roomId, su);
  rate = await withPlatformContext((tx) => resolveMethod2Rate(tx, { roomId, centerId }));
  assert(rate === null, "clearing the room M2 rate then resolves to nothing (no global)");

  // ---------------------------------------------------------------- VP9
  console.log("\nVP9 — is_demo seed: method configs + M2 course, NO ledger rows");
  const seedCheck = await withPlatformContext(async (tx) => {
    const demoCenters = await tx.center.findMany({ where: { isDemo: true }, select: { id: true } });
    const ids = demoCenters.map((c) => c.id);
    const demoTx = await tx.transaction.count({ where: { centerId: { in: ids } } });
    const m2Rooms = await tx.room.count({
      where: { centerId: { in: ids }, allowedPricingMethods: { has: "per_attending_student" } },
    });
    const m2Courses = await tx.course.findMany({
      where: { isDemo: true, pricingMethod: "per_attending_student" },
      select: { m2CenterFee: true, splitPlatformBp: true },
    });
    const demoSettlements = await tx.sessionSettlement.count({ where: { centerId: { in: ids } } });
    return { demoTx, m2Rooms, m2Courses, demoSettlements };
  });
  assert(seedCheck.demoTx === 0, "NO ledger Transaction rows reference demo centers");
  assert(seedCheck.demoSettlements === 0, "NO settlement records reference demo centers");
  assert(seedCheck.m2Rooms >= 2, "demo rooms offer the per-student method (NILE both, ANDL forced)");
  assert(
    seedCheck.m2Courses.length >= 1 &&
      seedCheck.m2Courses.every((c) => c.m2CenterFee != null && c.splitPlatformBp != null),
    "an M2 demo course exists with a fully-frozen snapshot",
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
