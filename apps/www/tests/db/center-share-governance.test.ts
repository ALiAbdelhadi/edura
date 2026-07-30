/**
 * Center-share governance (www side) — neither the teacher nor the center may
 * propose a money number on a collaboration request.
 *
 * The flat `center_teacher_affiliations.center_share` is the LEGACY no-room
 * money knob (piasters per present student). It is now superadmin-only config;
 * the request flow must never write it. Proves:
 *  VP1  a crafted TEACHER request carrying proposedCenterShare stores 0.
 *  VP2  a crafted CENTER request carrying proposedCenterShare stores 0.
 *  VP3  acceptance creates the affiliation at 0 — the proposal never reaches
 *       the money engine — while still creating the course + schedule.
 *  VP4  a LATER accepted request does NOT wipe a superadmin-set share
 *       (the regression this change had to avoid).
 *
 * The superadmin setter, its audit trail, and the settlement that consumes the
 * value are proven in apps/superadmin/tests/db/center-share-admin.test.ts.
 *
 * Run (all suites, guarded):  bun run --filter edura test:db
 * Run (this one only):        bun run --filter edura test:db:only center-share-governance
 * NEVER --env-file=.env.local: that is the DEV database and it skips the guard.
 */
import { withPlatformContext } from "@repo/database";
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
const SUITE_NAME = "center-share-governance.test.ts";

import {
  createCollaborationRequest,
  acceptCollaborationRequest,
} from "@/lib/services/collaboration/collaboration";

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

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "share-" + rid();
  __sweepTag = tag;
  console.log("Center-share governance (www) DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 0 } });
    const center = await tx.center.create({
      data: {
        name: `${tag}-c`,
        shortId: ("S" + rid() + rid()).slice(0, 12).toUpperCase(),
        status: "active",
        walletBalance: 0,
      },
    });
    const admin = await tx.user.create({
      data: { name: `${tag}-a`, role: "center_admin", email: `${tag}-a@x.io`, status: "active" },
    });
    await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: center.id } });
    // Two DIFFERENT offerings: the one-open-request unique is per subject.
    const offerings = await tx.subjectOffering.findMany({
      where: { isActive: true },
      select: { subjectId: true, gradeLevelId: true, trackId: true },
      take: 2,
    });
    if (offerings.length < 2) throw new Error("Need two active subject offerings in the catalog");
    return { teacher: teacher.id, center: center.id, admin: admin.id, offerings };
  });

  const teacherUser = { id: fx.teacher, role: "teacher" } as never;
  const centerUser = { id: fx.admin, role: "center_admin", centerId: fx.center } as never;

  const input = (i: number, extra: Record<string, unknown> = {}) => {
    const off = fx.offerings[i]!;
    return {
      teacherId: fx.teacher,
      centerId: fx.center,
      subjectId: off.subjectId,
      gradeLevelId: off.gradeLevelId,
      trackId: off.trackId,
      roomId: null, // NO ROOM → the flat affiliation share is the money knob
      daysOfWeek: [1],
      startTime: "10:00",
      endTime: "11:00",
      startDate: new Date("2026-03-02T00:00:00Z"),
      // Short window: acceptance generates the whole schedule inside one
      // transaction, and the default 3 months of weekly sessions times it out.
      endDate: new Date("2026-03-23T00:00:00Z"),
      ...extra,
    } as never;
  };

  // ---------------------------------------------------------------- VP1
  console.log("\nVP1 — a crafted TEACHER request cannot smuggle a share");
  // A hand-rolled client can still PUT this field on the wire (the route keeps
  // it optional for old bundles); the service must ignore it outright.
  const req1 = await createCollaborationRequest(
    input(0, { proposedCenterShare: 5000 }),
    teacherUser,
  );
  assert(
    req1.proposedCenterShare === 0,
    `teacher-proposed 50 EGP share stored as 0 (got ${req1.proposedCenterShare})`,
  );

  // ---------------------------------------------------------------- VP2
  console.log("\nVP2 — a crafted CENTER request cannot smuggle one either");
  const req2 = await createCollaborationRequest(
    // A different slot — VP4 accepts BOTH, and the session generator rejects
    // a second class in the same hour.
    input(1, { proposedCenterShare: 7500, startTime: "14:00", endTime: "15:00" }),
    centerUser,
  );
  assert(
    req2.proposedCenterShare === 0,
    `center-proposed 75 EGP share stored as 0 (got ${req2.proposedCenterShare})`,
  );

  // ---------------------------------------------------------------- VP3
  console.log("\nVP3 — acceptance creates the affiliation at 0, not at the proposal");
  const accepted = await acceptCollaborationRequest(req1.id, centerUser);
  const aff = await withPlatformContext((tx) =>
    tx.centerTeacherAffiliation.findFirst({
      where: { centerId: fx.center, teacherId: fx.teacher },
    }),
  );
  assert(aff?.centerShare === 0, `affiliation created with centerShare 0 (got ${aff?.centerShare})`);
  assert(!!accepted.course?.id, "…and the course + schedule were still created normally");

  // ---------------------------------------------------------------- VP4
  console.log("\nVP4 — a later acceptance does NOT wipe the superadmin-set share");
  // Stand in for the superadmin editor (proven in the superadmin suite).
  await withPlatformContext((tx) =>
    tx.centerTeacherAffiliation.update({ where: { id: aff!.id }, data: { centerShare: 2500 } }),
  );
  await acceptCollaborationRequest(req2.id, teacherUser);
  const affAfter = await withPlatformContext((tx) =>
    tx.centerTeacherAffiliation.findUnique({ where: { id: aff!.id } }),
  );
  assert(
    affAfter?.centerShare === 2500,
    `superadmin share survives a second acceptance (got ${affAfter?.centerShare})`,
  );
  assert(affAfter?.status === "active", "…and the affiliation is still activated by the accept");

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
