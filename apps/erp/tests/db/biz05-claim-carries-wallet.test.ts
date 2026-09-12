// BIZ-05 (SECURITY_AUDIT.md 2026-09-11) — claiming a walk-in shell after
// registering must carry the shell's WALLET BALANCE and PAID COVERAGE into the
// claimant's account. Before: receipts were re-pointed, the subscription was
// not, and the profile holding the balance was deleted.
import { withPlatformContext } from "@repo/database";
import { topUpWalletCash } from "@repo/server-core/services/wallet/cash-topup";
import { createWalkInSubscription } from "@repo/server-core/services/subscriptions/subscriptions";
import { claimTempStudent } from "@repo/server-core/services/temp-students/temp-students";
import type { SessionUser } from "@repo/server-core/auth/types";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "biz05-claim-carries-wallet.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "b05s-" + rid(); __sweepTag = tag;
  const inviteCode = (tag + rid()).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: center.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 30000, pricePerMonth: 30000 } });
    const shell = await tx.user.create({ data: { name: `${tag}-shell`, role: "student", phone: "+201000000042", status: "shell", passwordHash: null } });
    const shellProfile = await tx.studentProfile.create({ data: { userId: shell.id, fullName: `${tag}-shell`, entityType: "invited", inviteCode, familyLinkCode: (tag + rid() + "01").slice(0, 18) } });
    await tx.centerStudentRoster.create({ data: { centerId: center.id, studentId: shell.id } });
    const me = await tx.user.create({ data: { name: `${tag}-me`, role: "student", email: `${tag}-me@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: me.id, fullName: `${tag}-me`, familyLinkCode: (tag + rid() + "02").slice(0, 18) } });
    return { owner: owner.id, center: center.id, course: course.id, shell: shell.id, shellProfile: shellProfile.id, me: me.id };
  });
  const owner = { id: fx.owner, role: "center_admin", centerId: fx.center, locale: "en" } as SessionUser;
  const me = { id: fx.me, role: "student", locale: "en" } as SessionUser;
  const balance = (uid: string) => withPlatformContext((tx) => tx.studentProfile.findUnique({ where: { userId: uid }, select: { walletBalance: true } }));

  console.log("\n[setup] the counter tops the shell up with 200 EGP cash and sells it the month");
  await topUpWalletCash({ studentId: fx.shell, amount: 20000 }, owner);
  const sub = await createWalkInSubscription({ studentId: fx.shell, courseId: fx.course, plan: "monthly", paymentMethod: "cash" }, owner);
  assert((await balance(fx.shell))?.walletBalance === 20000, "the shell holds 200 EGP");

  console.log("\n[1] the registered student claims the shell");
  const out = await claimTempStudent(inviteCode, me);
  assert(out.merged === true && (out as { walletCarried?: number }).walletCarried === 20000, `claim reports the carried balance (${JSON.stringify(out)})`);
  assert((await balance(fx.me))?.walletBalance === 20000, "the claimant's wallet now holds the 200 EGP");
  assert((await balance(fx.shell)) === null, "the shell profile is gone");
  const rows = await withPlatformContext((tx) => tx.walletLedger.findMany({ where: { OR: [{ studentId: fx.shell }, { studentId: fx.me }], type: "adjustment" }, select: { studentId: true, delta: true } }));
  assert(rows.some((r) => r.studentId === fx.shell && r.delta === -20000) && rows.some((r) => r.studentId === fx.me && r.delta === 20000), "the move is two append-only ledger rows: −200 on the shell, +200 on the claimant");
  const subAfter = await withPlatformContext((tx) => tx.subscription.findUniqueOrThrow({ where: { id: sub.id }, select: { studentId: true, status: true } }));
  assert(subAfter.studentId === fx.me && subAfter.status === "active", "the paid month now belongs to the claimant");
  const receipt = await withPlatformContext((tx) => tx.payment.findFirst({ where: { receiptNumber: sub.receiptNumber }, select: { studentId: true } }));
  assert(receipt?.studentId === fx.me, "…as does its receipt");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
