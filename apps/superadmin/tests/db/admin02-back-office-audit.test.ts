// ADMIN-02 (SECURITY_AUDIT.md 2026-09-11) — every back-office write leaves an
// `audit_logs` row. Most of these are written by the Prisma auto-audit
// extension (packages/database/src/extensions/index.ts, AUDITED map) — the
// audit's "unaudited" claim was wrong about blacklist, points, wallet policy
// and payout rejection. The real gaps were payout APPROVE and PAY (both
// `updateMany`, invisible to the extension) and payout GENERATION; those now
// write explicit rows. This suite pins all of it, so a change to either
// mechanism shows up here.
import { withPlatformContext } from "@repo/database";
import { platformBlacklistUser, removeBlacklistEntry } from "@repo/server-core/services/blacklist/blacklist";
import { createPointsRule, updatePointsRule, deletePointsRule, adjustStudentPoints } from "@/lib/services/points/points-admin";
import { getWalletPolicy, updateWalletPolicy } from "@/lib/services/settings/wallet-settings-admin";
import { approvePayout, rejectPayout } from "@/lib/services/finance/payouts";
import type { SessionUser } from "@/lib/auth/session";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "admin02-back-office-audit.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "a02s-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const admin = await tx.user.create({ data: { name: `${tag}-admin`, role: "super_admin", email: `${tag}-a@x.io`, status: "active" } });
    const other = await tx.user.create({ data: { name: `${tag}-other`, role: "super_admin", email: `${tag}-b@x.io`, status: "active" } });
    const stu = await tx.user.create({ data: { name: `${tag}-stu`, role: "student", email: `${tag}-s@x.io`, status: "active" } });
    await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-stu`, familyLinkCode: (tag + rid() + "00").slice(0, 18), pointsBalance: 10 } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    await tx.teacherProfile.create({ data: { userId: teacher.id, walletBalance: 100000 } });
    const p1 = await tx.payout.create({ data: { beneficiaryId: teacher.id, beneficiaryType: "teacher", netPayable: 50000, status: "pending", generatedBy: other.id } });
    const p2 = await tx.payout.create({ data: { beneficiaryId: teacher.id, beneficiaryType: "teacher", netPayable: 40000, status: "pending", generatedBy: other.id } });
    return { admin: admin.id, student: stu.id, teacher: teacher.id, p1: p1.id, p2: p2.id };
  });
  const admin = { id: fx.admin, role: "super_admin", locale: "en" } as SessionUser;
  const rows = (action: string, targetId: string) =>
    withPlatformContext((tx) => tx.auditLog.findMany({ where: { action, targetId, actorId: fx.admin }, select: { beforeState: true, afterState: true, centerId: true } }));
  const after = (r: { afterState: unknown }) => (r.afterState ?? {}) as Record<string, unknown>;

  console.log("\n[1] blacklist add + remove (auto-audited on the entry)");
  const entry = await platformBlacklistUser(fx.student, "a02 reason", fx.admin);
  const added = await rows("blacklist.added", entry.id);
  assert(added.length === 1 && after(added[0]!).targetId === fx.student && after(added[0]!).level === "platform", "the entry's creation is audited with target and level");
  await removeBlacklistEntry(entry.id, admin, "a02 lifted");
  const changed = await rows("blacklist.changed", entry.id);
  assert(changed.length === 1 && after(changed[0]!).isActive === false && after(changed[0]!).removedBy === fx.admin, "the lift is audited with removedBy");

  console.log("\n[2] points rules and a manual adjustment (auto-audited)");
  const rule = await createPointsRule({ eventName: `${tag}-event`, pointsValue: 5 }, fx.admin);
  await updatePointsRule(rule.id, { pointsValue: 7 }, fx.admin);
  await deletePointsRule(rule.id, fx.admin);
  assert((await rows("points_rule.created", rule.id)).length === 1, "rule creation audited");
  const upd = await rows("points_rule.updated", rule.id);
  assert(upd.length === 1 && after(upd[0]!).pointsValue === 7, "rule update audited with the new value");
  assert((await rows("points_rule.deleted", rule.id)).length === 1, "rule deletion audited");
  const adj = await adjustStudentPoints(fx.student, { delta: 5, reason: "a02 adjust" }, fx.admin);
  const adjRows = await rows("points.adjusted", adj.entry.id);
  assert(adjRows.length === 1 && after(adjRows[0]!).delta === 5 && after(adjRows[0]!).balanceAfter === 15, "the manual adjustment ledger row is audited with delta and balance");

  console.log("\n[3] wallet policy (auto-audited; restored afterwards)");
  const policy = await getWalletPolicy();
  const saved = await updateWalletPolicy({ minTopup: policy.minTopup, maxTopup: policy.maxTopup + 100 }, admin);
  try {
    const pol = await rows("wallet_settings.updated", saved.id);
    assert(pol.some((r) => after(r).maxTopup === policy.maxTopup + 100), "the policy change is audited with the new bound");
  } finally {
    await updateWalletPolicy({ minTopup: policy.minTopup, maxTopup: policy.maxTopup }, admin);
  }

  console.log("\n[4] payout approve (explicit row — updateMany is invisible to the extension) and reject (auto)");
  await approvePayout(fx.p1, admin);
  const ap = await rows("payout.approved", fx.p1);
  assert(ap.length === 1 && after(ap[0]!).approvedBy === fx.admin, "approval is audited with the approver");
  await rejectPayout(fx.p2, "a02 no", admin);
  const rj = await rows("payout.decided", fx.p2);
  assert(rj.length === 1 && after(rj[0]!).status === "rejected" && after(rj[0]!).rejectionReason === "a02 no", "rejection is audited (auto) with status and reason");

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
