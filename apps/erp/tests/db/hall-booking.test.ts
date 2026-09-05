import { withPlatformContext } from "@repo/database";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

import {
  createCollaborationRequest,
  acceptCollaborationRequest,
  rejectCollaborationRequest,
  cancelCollaborationRequest,
  expireCollaborationRequests,
  listCollaborationRequests,
} from "@/lib/services/collaboration/collaboration";
import {
  resolveMethod2Rate,
  resolveMethod2RatesForRooms,
} from "@/lib/services/finance/commission";

let __sweepTag = "";
const SUITE_NAME = "hall-booking.test.ts";

type GlobalSplit = {
  platformShareBp: number | null;
  teacherShareBp: number | null;
  centerShareBp: number | null;
};
let __prevGlobalSplit: GlobalSplit | null = null;

async function pinGlobalSplit() {
  const row = await withPlatformContext((tx) =>
    tx.commissionSetting.findFirst({ where: { scope: "global" } }),
  );
  if (!row) return;
  __prevGlobalSplit = {
    platformShareBp: row.platformShareBp,
    teacherShareBp: row.teacherShareBp,
    centerShareBp: row.centerShareBp,
  };
  await withPlatformContext((tx) =>
    tx.commissionSetting.update({
      where: { id: row.id },
      data: { platformShareBp: 1500, teacherShareBp: 7000, centerShareBp: 1500 },
    }),
  );
}

async function restoreGlobalSplit() {
  if (!__prevGlobalSplit) return;
  const prev = __prevGlobalSplit;
  await withPlatformContext(async (tx) => {
    const row = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
    if (row) await tx.commissionSetting.update({ where: { id: row.id }, data: prev });
  }).catch(() => {});
}

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
async function expectError(fn: () => Promise<unknown>, needle: string, label: string) {
  try {
    await fn();
    assert(false, `${label} — DID NOT THROW`);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    assert(
      msg.toLowerCase().includes(needle.toLowerCase()),
      `${label} — threw: ${msg.slice(0, 90)}`,
    );
  }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

let slot = 8;
const nextSlot = () => {
  const h = slot++;
  return { startTime: `${String(h).padStart(2, "0")}:00`, endTime: `${String(h).padStart(2, "0")}:45` };
};

const MONDAY = new Date("2026-03-02T00:00:00Z");
const TWO_WEEKS = new Date("2026-03-16T00:00:00Z");

async function main() {
  const tag = "hallbook-" + rid();
  __sweepTag = tag;
  console.log("Hall booking (collaboration requests) DB tests —", tag);

  await pinGlobalSplit();

  const fx = await withPlatformContext(async (tx) => {
    const all = await tx.subjectOffering.findMany({
      where: { isActive: true },
      select: { subjectId: true, gradeLevelId: true, trackId: true },
      take: 800,
    });
    const bySubject = new Map<string, (typeof all)[number]>();
    for (const o of all) if (!bySubject.has(o.subjectId)) bySubject.set(o.subjectId, o);
    const offerings = [...bySubject.values()];
    if (offerings.length < 16) {
      throw new Error(`Need 16 offerings on distinct subjects, catalog has ${offerings.length}`);
    }

    const gradesOf = new Map<string, Set<string>>();
    for (const o of all) {
      const set = gradesOf.get(o.subjectId) ?? new Set<string>();
      set.add(o.gradeLevelId);
      gradesOf.set(o.subjectId, set);
    }
    const allGrades = [...new Set(all.map((o) => o.gradeLevelId))];
    let mismatch: { subjectId: string; gradeLevelId: string } | null = null;
    for (const [subjectId, taught] of gradesOf) {
      const g = allGrades.find((id) => !taught.has(id));
      if (g) {
        mismatch = { subjectId, gradeLevelId: g };
        break;
      }
    }
    if (!mismatch) throw new Error("Catalog offers every subject in every grade — cannot test A10");

    const mkCenter = async (k: string, status: "active" | "suspended" = "active") => {
      const c = await tx.center.create({
        data: {
          name: `${tag}-${k}`,
          shortId: ("H" + rid() + rid()).slice(0, 12).toUpperCase(),
          status,
          walletBalance: 0,
        },
      });
      const admin = await tx.user.create({
        data: { name: `${tag}-${k}-admin`, role: "center_admin", email: `${tag}-${k}@x.io`, status: "active" },
      });
      await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: c.id } });
      return { id: c.id, adminId: admin.id };
    };
    const mkTeacher = async (k: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${k}`, role: "teacher", email: `${tag}-${k}@x.io`, status: "active" },
      });
      await tx.teacherProfile.create({ data: { userId: u.id, walletBalance: 0 } });
      return u.id;
    };
    const mkRoom = async (
      centerId: string,
      k: string,
      methods: string[],
      opts: { isActive?: boolean; price?: number | null } = {},
    ) =>
      (
        await tx.room.create({
          data: {
            centerId,
            name: `${tag}-${k}`,
            isActive: opts.isActive ?? true,
            price: opts.price ?? null,
            allowedPricingMethods: methods as never,
          },
        })
      ).id;

    const center = await mkCenter("C1");
    const other = await mkCenter("C2");
    const dead = await mkCenter("C3", "suspended");
    const bare = await mkCenter("C4");
    const teacher = await mkTeacher("T1");
    const teacher2 = await mkTeacher("T2");
    const superAdmin = await tx.user.create({
      data: { name: `${tag}-sa`, role: "super_admin", email: `${tag}-sa@x.io`, status: "active" },
    });

    const rooms = {
      percent: await mkRoom(center.id, "hall-percent", ["whole_room_percent"], { price: 60_000 }),
      perStudent: await mkRoom(center.id, "hall-perstudent", ["per_attending_student"]),
      both: await mkRoom(center.id, "hall-both", ["whole_room_percent", "per_attending_student"], {
        price: 45_000,
      }),
      unrated: await mkRoom(bare.id, "hall-unrated", ["per_attending_student"]),
      inactive: await mkRoom(center.id, "hall-inactive", ["whole_room_percent"], { isActive: false }),
      foreign: await mkRoom(other.id, "hall-foreign", ["whole_room_percent"]),
    };

    await tx.commissionSetting.create({
      data: { scope: "room", roomId: rooms.both, centerPerStudentBp: 900 },
    });
    await tx.commissionSetting.create({
      data: { scope: "center", centerId: center.id, centerPerStudentBp: 500 },
    });

    const globalSplit = await tx.commissionSetting.findFirst({ where: { scope: "global" } });

    return {
      offerings,
      mismatch,
      bare: bare.id,
      center: center.id,
      admin: center.adminId,
      other: other.id,
      otherAdmin: other.adminId,
      dead: dead.id,
      deadAdmin: dead.adminId,
      teacher,
      teacher2,
      superAdmin: superAdmin.id,
      rooms,
      globalSplit,
    };
  });

  const T = { id: fx.teacher, role: "teacher" } as never;
  const T2 = { id: fx.teacher2, role: "teacher" } as never;
  const C = { id: fx.admin, role: "center_admin", centerId: fx.center } as never;
  const C2 = { id: fx.otherAdmin, role: "center_admin", centerId: fx.other } as never;
  const SA = { id: fx.superAdmin, role: "super_admin" } as never;

  let offIdx = 0;
  const input = (extra: Record<string, unknown> = {}) => {
    const off = fx.offerings[offIdx++]!;
    return {
      teacherId: fx.teacher,
      centerId: fx.center,
      subjectId: off.subjectId,
      gradeLevelId: off.gradeLevelId,
      trackId: off.trackId,
      roomId: null,
      daysOfWeek: [1],
      ...nextSlot(),
      startDate: MONDAY,
      endDate: TWO_WEEKS,
      ...extra,
    } as never;
  };

  console.log("\nA — a TEACHER books at a center");

  const aNoHall = await createCollaborationRequest(input({ expectedStudents: 12 }), T);
  assert(aNoHall.status === "pending" && aNoHall.initiator === "teacher", "A1 no-hall request created as pending, initiator=teacher");
  assert(aNoHall.proposedPricingMethod === null, "A1 …with NO pricing method (no hall → the flat share is platform config)");
  assert(aNoHall.proposedCenterShare === 0, "A1 …and no money number on the request");

  const aPercent = await createCollaborationRequest(input({ roomId: fx.rooms.percent }), T);
  assert(aPercent.proposedPricingMethod === "whole_room_percent", "A2 a percent-ONLY hall forces whole_room_percent");

  const aPerStudent = await createCollaborationRequest(input({ roomId: fx.rooms.perStudent }), T);
  assert(aPerStudent.proposedPricingMethod === "per_attending_student", "A3 a per-student-ONLY hall forces per_attending_student");

  const globalRate = await withPlatformContext((tx) =>
    tx.commissionSetting.findFirst({
      where: { scope: "global" },
      select: { id: true, centerPerStudentFee: true, centerPerStudentBp: true },
    }),
  );
  try {
    if (globalRate && (globalRate.centerPerStudentFee !== null || globalRate.centerPerStudentBp !== null)) {
      await withPlatformContext((tx) =>
        tx.commissionSetting.update({
          where: { id: globalRate.id },
          data: { centerPerStudentFee: null, centerPerStudentBp: null },
        }),
      );
    }
    await expectError(
      () => createCollaborationRequest(input({ centerId: fx.bare, roomId: fx.rooms.unrated }), T),
      "not configured",
      "A4 a per-student hall with NO configured rate is refused at REQUEST time (not at settlement)",
    );
  } finally {
    if (globalRate && (globalRate.centerPerStudentFee !== null || globalRate.centerPerStudentBp !== null)) {
      await withPlatformContext((tx) =>
        tx.commissionSetting.update({
          where: { id: globalRate.id },
          data: {
            centerPerStudentFee: globalRate.centerPerStudentFee,
            centerPerStudentBp: globalRate.centerPerStudentBp,
          },
        }),
      );
    }
  }

  const aBothDefault = await createCollaborationRequest(input({ roomId: fx.rooms.both }), T);
  assert(aBothDefault.proposedPricingMethod === "whole_room_percent", "A5 a both-methods hall defaults to the classic % when the teacher sends nothing");

  const aBothPicked = await createCollaborationRequest(
    input({ roomId: fx.rooms.both, proposedPricingMethod: "per_attending_student" }),
    T,
  );
  assert(aBothPicked.proposedPricingMethod === "per_attending_student", "A6 …and honours the teacher's explicit choice on a both-methods hall");

  await expectError(
    () => createCollaborationRequest(input({ roomId: fx.rooms.percent, proposedPricingMethod: "per_attending_student" }), T),
    "does not offer",
    "A7 asking a hall for a method it does not offer is refused",
  );
  await expectError(
    () => createCollaborationRequest(input({ roomId: fx.rooms.foreign }), T),
    "not found",
    "A8 a hall belonging to ANOTHER center is not bookable here",
  );
  await expectError(
    () => createCollaborationRequest(input({ roomId: fx.rooms.inactive }), T),
    "not found",
    "A9 an INACTIVE hall is not bookable",
  );
  await expectError(
    () =>
      createCollaborationRequest(
        input({ subjectId: fx.mismatch!.subjectId, gradeLevelId: fx.mismatch!.gradeLevelId, trackId: null }),
        T,
      ),
    "not offered",
    "A10 a subject not offered for the chosen grade is refused",
  );
  await expectError(
    () =>
      createCollaborationRequest(
        {
          ...(input() as object),
          subjectId: aNoHall.subjectId,
          gradeLevelId: aNoHall.gradeLevelId,
          trackId: aNoHall.trackId,
        } as never,
        T,
      ),
    "already exists",
    "A11 a SECOND open request for the same teacher+center+subject is refused",
  );
  await expectError(
    () => createCollaborationRequest(input({ teacherId: fx.teacher2 }), T),
    "only apply as themselves",
    "A12 a teacher cannot book on another teacher's behalf",
  );
  await expectError(
    () => createCollaborationRequest(input({ centerId: fx.other }), C),
    "own center",
    "A13 a center cannot invite into another center",
  );
  await expectError(
    () => createCollaborationRequest(input({ centerId: fx.dead }), T),
    "not found or not active",
    "A14 an INACTIVE center cannot be booked",
  );
  const smuggled = await createCollaborationRequest(input({ proposedCenterShare: 9_500 }), T);
  assert(smuggled.proposedCenterShare === 0, "A15 a crafted money number on the wire is stored as 0");

  console.log("\nB — a CENTER invites a teacher");

  await expectError(
    () =>
      createCollaborationRequest(
        input({ roomId: fx.rooms.both, proposedPricingMethod: "whole_room_percent" }),
        C,
      ),
    "teacher chooses",
    "B1 a center may NOT pre-pick the method on a both-methods hall",
  );
  const bBoth = await createCollaborationRequest(input({ roomId: fx.rooms.both }), C);
  assert(bBoth.initiator === "center" && bBoth.proposedPricingMethod === null, "B2 …it is stored NULL — the teacher picks when accepting");
  const bForced = await createCollaborationRequest(input({ roomId: fx.rooms.perStudent }), C);
  assert(bForced.proposedPricingMethod === "per_attending_student", "B3 a forced hall still imposes its method on a center invite");

  console.log("\nC — acceptance: affiliation + course + schedule, in ONE transaction");

  const c1 = await acceptCollaborationRequest(aNoHall.id, C);
  assert(!!c1.course?.id, "C1 the center accepts → a course is created");
  assert((c1.course as never as { sessionsGenerated: number }).sessionsGenerated === 3, `C1 …with the full generated schedule (${(c1.course as never as { sessionsGenerated: number }).sessionsGenerated} sessions)`);
  assert(c1.course.price === 0 && c1.course.maxStudents === 12, "C1 …unpriced until the owner sets plans, seats = expectedStudents");
  const affAfterC1 = await withPlatformContext((tx) =>
    tx.centerTeacherAffiliation.findFirst({ where: { centerId: fx.center, teacherId: fx.teacher } }),
  );
  assert(affAfterC1?.status === "active" && affAfterC1?.centerShare === 0, "C1 …and the affiliation is activated at share 0 (superadmin owns that number)");
  const c1Row = await withPlatformContext((tx) => tx.collaborationRequest.findUnique({ where: { id: aNoHall.id } }));
  assert(c1Row?.status === "accepted" && c1Row?.courseId === c1.course.id && c1Row?.affiliationId === affAfterC1?.id, "C1 …the request records the course + affiliation it produced");
  assert(c1.course.pricingMethod === null, "C1 a NO-HALL course carries no hall pricing snapshot");

  const c2 = await acceptCollaborationRequest(aPercent.id, C);
  assert(
    c2.course.pricingMethod === "whole_room_percent" &&
      c2.course.splitPlatformBp === fx.globalSplit?.platformShareBp &&
      c2.course.splitTeacherBp === fx.globalSplit?.teacherShareBp &&
      c2.course.splitCenterBp === fx.globalSplit?.centerShareBp,
    `C2 a %-hall course FREEZES the 3-way split (${c2.course.splitPlatformBp}/${c2.course.splitTeacherBp}/${c2.course.splitCenterBp} bp)`,
  );

  const c3 = await acceptCollaborationRequest(aPerStudent.id, C);
  assert(
    c3.course.pricingMethod === "per_attending_student" && c3.course.m2CenterBp === 500,
    `C3 a per-student course freezes the INHERITED center rate (${c3.course.m2CenterBp} bp)`,
  );
  assert(c3.course.splitPlatformBp === fx.globalSplit?.platformShareBp, "C3 …alongside the platform's own share");

  await expectError(
    () => acceptCollaborationRequest(bBoth.id, T),
    "choose a pricing method",
    "C4 the teacher CANNOT accept a both-methods hall without naming the method",
  );
  const c5 = await acceptCollaborationRequest(bBoth.id, T, { pricingMethod: "per_attending_student" });
  const c5Row = await withPlatformContext((tx) => tx.collaborationRequest.findUnique({ where: { id: bBoth.id } }));
  assert(c5Row?.proposedPricingMethod === "per_attending_student", "C5 …and the chosen method is written back onto the request");
  assert(c5.course.pricingMethod === "per_attending_student" && c5.course.m2CenterBp === 900, `C5 …the course freezes the HALL's own rate, which beats the center's (${c5.course.m2CenterBp} bp)`);

  assert(affAfterC1!.id === c5Row!.affiliationId, "C6 every later acceptance REUSES the one affiliation, never a duplicate");

  await expectError(
    () => acceptCollaborationRequest(aBothDefault.id, T),
    "only the invited center",
    "C7 the INITIATOR cannot accept their own request (teacher-initiated → center decides)",
  );
  await expectError(
    () => acceptCollaborationRequest(bForced.id, C),
    "only the invited teacher",
    "C8 …and the same in the other direction (center-initiated → teacher decides)",
  );
  await expectError(
    () => acceptCollaborationRequest(aBothDefault.id, C2),
    "only the invited center",
    "C9 a DIFFERENT center cannot accept a request addressed to this one",
  );
  await expectError(
    () => acceptCollaborationRequest(bForced.id, T2),
    "only the invited teacher",
    "C9 …and a different teacher cannot accept an invite addressed to another",
  );
  await expectError(
    () => acceptCollaborationRequest(aPercent.id, C),
    "already accepted",
    "C9 a replay of an accepted request is refused (the claim is atomic)",
  );

  const expiring = await createCollaborationRequest(input(), T);
  await withPlatformContext((tx) =>
    tx.collaborationRequest.update({
      where: { id: expiring.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    }),
  );
  await expectError(() => acceptCollaborationRequest(expiring.id, C), "has expired", "C10 an EXPIRED request cannot be accepted");
  const expiredRow = await withPlatformContext((tx) => tx.collaborationRequest.findUnique({ where: { id: expiring.id } }));
  assert(expiredRow?.status === "expired", "C10 …and the attempt flips it to `expired` rather than leaving it pending");

  console.log("\nC11 — a clashing schedule rolls the entire acceptance back");
  const clash = await createCollaborationRequest(
    input({
      roomId: fx.rooms.percent,
      startTime: c2.course.startTime,
      endTime: c2.course.endTime,
      daysOfWeek: [1],
    }),
    T,
  );
  const coursesBefore = await withPlatformContext((tx) => tx.course.count({ where: { centerId: fx.center } }));
  await expectError(() => acceptCollaborationRequest(clash.id, C), "conflict", "C11 the clashing acceptance is refused");
  const after = await withPlatformContext(async (tx) => ({
    courses: await tx.course.count({ where: { centerId: fx.center } }),
    row: await tx.collaborationRequest.findUnique({ where: { id: clash.id } }),
  }));
  assert(after.courses === coursesBefore, `C11 …no orphan course was left behind (${coursesBefore} → ${after.courses})`);
  assert(after.row?.status === "pending" && after.row?.courseId === null, "C11 …and the request is STILL pending, so it can be re-tried");

  console.log("\nC12 — the platform can decide a request neither side answered");
  const stuck = await createCollaborationRequest(input(), C);
  await expectError(
    () => acceptCollaborationRequest(stuck.id, C, { as: "platform_override" }),
    "only a super admin",
    "C12 a non-super-admin passing `as: platform_override` is refused (default-closed)",
  );
  const overridden = await acceptCollaborationRequest(stuck.id, SA, { as: "platform_override" });
  assert(!!overridden.course?.id, "C12 …a super admin CAN decide it, and the class is created normally");

  console.log("\nD — declining, withdrawing, and the TTL sweep");

  const dReject = await createCollaborationRequest(input(), T);
  await expectError(() => rejectCollaborationRequest(dReject.id, "no space", T), "only the invited center", "D1 the initiator cannot reject their own request");
  await rejectCollaborationRequest(dReject.id, "الجدول مزحوم", C);
  const dRow = await withPlatformContext((tx) => tx.collaborationRequest.findUnique({ where: { id: dReject.id } }));
  assert(dRow?.status === "rejected" && dRow?.responseNote === "الجدول مزحوم", "D2 the center declines with a reason, stored on the request");
  assert(dRow?.courseId === null, "D2 …and a declined request creates NO course");

  const dCancel = await createCollaborationRequest(input(), T);
  await expectError(() => cancelCollaborationRequest(dCancel.id, C), "only the initiator", "D3 the RECIPIENT cannot cancel — only decline");
  await cancelCollaborationRequest(dCancel.id, T);
  const dcRow = await withPlatformContext((tx) => tx.collaborationRequest.findUnique({ where: { id: dCancel.id } }));
  assert(dcRow?.status === "cancelled", "D4 the initiator withdraws their own request");
  await expectError(() => cancelCollaborationRequest(dCancel.id, T), "already cancelled", "D5 …and cannot withdraw it twice");
  await expectError(() => rejectCollaborationRequest(aPercent.id, undefined, C), "already accepted", "D6 an ACCEPTED request can no longer be declined");

  const dExpire = await createCollaborationRequest(input(), T);
  const fresh = await createCollaborationRequest(input(), T);
  await withPlatformContext((tx) =>
    tx.collaborationRequest.update({
      where: { id: dExpire.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    }),
  );
  await expireCollaborationRequests(new Date());
  const swept = await withPlatformContext(async (tx) => ({
    old: await tx.collaborationRequest.findUnique({ where: { id: dExpire.id } }),
    new: await tx.collaborationRequest.findUnique({ where: { id: fresh.id } }),
  }));
  assert(swept.old?.status === "expired", "D7 the TTL sweep expires an over-due pending request");
  assert(swept.new?.status === "pending", "D7 …and leaves a live one alone");

  console.log("\nE — the booking list, and the rate the teacher is quoted");

  const teacherList = await listCollaborationRequests(T);
  const centerList = await listCollaborationRequests(C);
  assert(teacherList.length > 0 && teacherList.every((r) => r.teacherId === fx.teacher), "E1 the teacher's list is scoped to their own requests");
  assert(centerList.every((r) => r.centerId === fx.center), "E1 …and the center's to its own");
  assert(teacherList.some((r) => r.roomName?.includes("hall-both")), "E1 …enriched with the hall's name for the UI");
  const pendingOnly = await listCollaborationRequests(C, "pending");
  assert(pendingOnly.every((r) => r.status === "pending"), "E2 the status filter narrows the list");
  await expectError(() => listCollaborationRequests({ id: fx.teacher, role: "student" } as never), "", "E3 a role with no side in this flow is refused a list");

  const roomIds = [fx.rooms.both, fx.rooms.perStudent, fx.rooms.percent, fx.rooms.unrated];
  const parity = await withPlatformContext(async (tx) => {
    const batch = await resolveMethod2RatesForRooms(tx, { centerId: fx.center, roomIds });
    const single = await Promise.all(
      roomIds.map((id) => resolveMethod2Rate(tx, { roomId: id, centerId: fx.center })),
    );
    return { batch, single };
  });
  const mismatched = roomIds.filter((id, i) => {
    const a = parity.batch[id];
    const b = parity.single[i];
    return (a?.fee ?? null) !== (b?.fee ?? null) || (a?.bp ?? null) !== (b?.bp ?? null) || (a?.source ?? null) !== (b?.source ?? null);
  });
  assert(mismatched.length === 0, "E4 the picker's batch rate resolver matches the settlement resolver on every hall");
  assert(parity.batch[fx.rooms.both]?.source === "room" && parity.batch[fx.rooms.both]?.bp === 900, "E4 …a hall's OWN rate wins (room > center)");
  assert(parity.batch[fx.rooms.perStudent]?.source === "center" && parity.batch[fx.rooms.perStudent]?.bp === 500, "E4 …a hall without one inherits the center's (center > global)");

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
    await restoreGlobalSplit();
    if (__sweepTag) await sweepTagQuietly(__sweepTag);
  }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => {
  console.error(e);
  process.exit(1);
});
