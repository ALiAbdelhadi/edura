import { withPlatformContext } from "@repo/database";
import { cancelOwnPayoutRequest } from "@repo/server-core/services/finance/payout-cancel";
import { requestCenterPayout, getCenterWallet } from "@repo/server-core/services/finance/center-wallet";
import { requestTeacherPayout, getTeacherWallet } from "@/lib/services/finance/teacher-wallet";
import { BusinessRuleError, NotFoundError } from "@repo/server-core/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "payout-cancel.test.ts";

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
const teacherSu = (id: string): SessionUser => ({ id, role: "teacher" }) as SessionUser;
const centerSu = (id: string, centerId: string): SessionUser =>
  ({ id, role: "center_admin", centerId }) as SessionUser;

async function expectError(fn: () => Promise<unknown>, kind: "notfound" | "rule"): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return kind === "notfound" ? e instanceof NotFoundError : e instanceof BusinessRuleError;
  }
}

async function main() {
  const tag = "pcxl-" + rid();
  __sweepTag = tag;
  console.log("Payout-cancel DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacher = await tx.user.create({
      data: { name: `${tag}-teacher`, role: "teacher", email: `${tag}-t@x.io`, status: "active" },
    });
    const rival = await tx.user.create({
      data: { name: `${tag}-rival`, role: "teacher", email: `${tag}-r@x.io`, status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 10000 } });
    await tx.teacherProfile.create({ data: { userId: rival.id, walletBalance: 10000 } });
    const admin = await tx.user.create({
      data: { name: `${tag}-admin`, role: "center_admin", email: `${tag}-a@x.io`, status: "active" },
    });
    const center = await tx.center.create({
      data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), ownerUserId: admin.id, walletBalance: 8000 },
    });
    return { teacher: teacher.id, rival: rival.id, admin: admin.id, center: center.id };
  });

  const t = teacherSu(fx.teacher);

  console.log("\n[1] request reserves, cancel releases");
  const before = await getTeacherWallet(t);
  assert(before.available === 10000, "pre-request available is the full balance");
  const request = await requestTeacherPayout(t, 6000);
  const reserved = await getTeacherWallet(t);
  assert(reserved.available === 4000, "the request reserves — available drops by the requested sum (H1)");
  const cancelled = await cancelOwnPayoutRequest(t, request.id);
  assert(cancelled.status === "cancelled" && cancelled.cancelledAt instanceof Date, "the request is cancelled, with when");
  const released = await getTeacherWallet(t);
  assert(released.available === 10000, "the reserve is RELEASED — available recovers in the same atomic flip");

  console.log("\n[2] the cancel is audited");
  const audit = await withPlatformContext((tx) =>
    tx.auditLog.findFirst({
      where: { action: "payout.cancel", targetId: request.id },
      select: { actorId: true },
    }),
  );
  assert(audit?.actorId === fx.teacher, "one audit row, action payout.cancel, actor = the owner");

  console.log("\n[3] only the owner, only pending");
  const second = await requestTeacherPayout(t, 3000);
  assert(
    await expectError(() => cancelOwnPayoutRequest(teacherSu(fx.rival), second.id), "notfound"),
    "a rival teacher's cancel → NotFound (never Forbidden)",
  );
  await withPlatformContext((tx) =>
    tx.payout.update({ where: { id: second.id }, data: { status: "approved" } }),
  );
  assert(
    await expectError(() => cancelOwnPayoutRequest(t, second.id), "rule"),
    "an APPROVED request refuses — it is in the accountant's hands",
  );
  assert(
    await expectError(() => cancelOwnPayoutRequest(t, request.id), "rule"),
    "a CANCELLED request refuses again — terminal states stay terminal",
  );

  console.log("\n[4] the center face, same kernel function");
  const c = centerSu(fx.admin, fx.center);
  const centerReq = await requestCenterPayout(c, 5000);
  const centerReserved = await getCenterWallet(c);
  assert(centerReserved.available === 3000, "center request reserves");
  const centerCancelled = await cancelOwnPayoutRequest(c, centerReq.id);
  assert(centerCancelled.status === "cancelled", "center cancel flips the row");
  const centerReleased = await getCenterWallet(c);
  assert(centerReleased.available === 8000, "center reserve released");

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
