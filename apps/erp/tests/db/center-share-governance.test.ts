import { withPlatformContext } from "@repo/database";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

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
      endDate: new Date("2026-03-23T00:00:00Z"),
      ...extra,
    } as never;
  };

  console.log("\nVP1 — a crafted TEACHER request cannot smuggle a share");
  const req1 = await createCollaborationRequest(
    input(0, { proposedCenterShare: 5000 }),
    teacherUser,
  );
  assert(
    req1.proposedCenterShare === 0,
    `teacher-proposed 50 EGP share stored as 0 (got ${req1.proposedCenterShare})`,
  );

  console.log("\nVP2 — a crafted CENTER request cannot smuggle one either");
  const req2 = await createCollaborationRequest(
    input(1, { proposedCenterShare: 7500, startTime: "14:00", endTime: "15:00" }),
    centerUser,
  );
  assert(
    req2.proposedCenterShare === 0,
    `center-proposed 75 EGP share stored as 0 (got ${req2.proposedCenterShare})`,
  );

  console.log("\nVP3 — acceptance creates the affiliation at 0, not at the proposal");
  const accepted = await acceptCollaborationRequest(req1.id, centerUser);
  const aff = await withPlatformContext((tx) =>
    tx.centerTeacherAffiliation.findFirst({
      where: { centerId: fx.center, teacherId: fx.teacher },
    }),
  );
  assert(aff?.centerShare === 0, `affiliation created with centerShare 0 (got ${aff?.centerShare})`);
  assert(!!accepted.course?.id, "…and the course + schedule were still created normally");

  console.log("\nVP4 — a later acceptance does NOT wipe the superadmin-set share");
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
