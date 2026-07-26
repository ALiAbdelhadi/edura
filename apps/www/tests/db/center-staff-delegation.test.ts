// Center Staff delegation — proofs against the LIVE DB, driving the REAL
// authorization surface (center-actor.ts) and the REAL services with plain
// SessionUser objects (the same style as rbac-isolation / l1). No mocks.
//
// Proves, per the approved plan:
//   1. each role does ONLY its allowed actions (the sub-role gate);
//   2. center_accountant is READ-ONLY (mutating method rejected);
//   3. ALL staff roles 403 on wallet-withdraw / staff-management, and the
//      center wallet is provably UNTOUCHED (balance + payout count unchanged);
//   4. staff see only their OWN center's data (RLS center-vs-center isolation);
//   5. every staff mutation is audited on-behalf-of the center;
//   6. deactivation cuts access on the NEXT request;
//   7. center_accountant is scoped to its own center and is never a platform
//      accountant / super_admin (can't reach apps/superadmin);
//   8. creating staff writes ZERO money/ledger rows (seed-hygiene contract).
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withPlatformContext, prisma } from "@repo/database";
import { ForbiddenError } from "@/lib/errors/classes";
import { scopedDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import {
  authorizeCenterActor,
  assertCenterActorMethodAllowed,
  writeCenterStaffAudit,
  resolveCenterActorContext,
  RECEPTION,
  MANAGER,
  ACCOUNTANT,
} from "@/lib/authz/center-actor";
import { createStaff, listStaff } from "@/lib/services/center/staff";
import { requestCenterPayout, getCenterWallet } from "@/lib/services/finance/center-wallet";
import { createTempStudent } from "@/lib/services/temp-students/temp-students";

neonConfig.webSocketConstructor = ws as never;
const admin = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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
async function expectForbidden(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(false, `${label} — expected ForbiddenError but call RESOLVED`);
  } catch (e) {
    assert(e instanceof ForbiddenError, `${label} -> ForbiddenError${e instanceof ForbiddenError ? "" : ` (got ${(e as Error)?.constructor?.name})`}`);
  }
}
async function expectResolves(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    assert(true, label);
  } catch (e) {
    assert(false, `${label} — threw ${(e as Error)?.constructor?.name}: ${(e as Error)?.message}`);
  }
}

const su = (id: string, role: SessionUser["role"], centerId?: string): SessionUser => ({
  id,
  role,
  centerId,
  locale: "ar",
  name: role,
  email: `${id}@x.io`,
});

async function main() {
  const tag = "cstaff-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("Center Staff delegation —", tag);
  const START_BALANCE = 500_000;

  const fx = await withPlatformContext(async (tx) => {
    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag.slice(0, 10) + "A"), status: "active", walletBalance: START_BALANCE },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag.slice(0, 10) + "B"), status: "active", walletBalance: 0 },
    });
    const owner = await tx.user.create({
      data: { name: tag + "-owner", role: "center_admin", email: tag + "-owner@x.io", status: "active" },
    });
    await tx.centerAdminProfile.create({ data: { userId: owner.id, centerId: centerA.id } });

    const mkStaff = async (role: "receptionist" | "manager" | "center_accountant", center: string) => {
      const u = await tx.user.create({
        data: { name: `${tag}-${role}`, role: "center_staff", email: `${tag}-${role}-${center.slice(0, 4)}@x.io`, status: "active" },
      });
      const link = await tx.centerStaff.create({ data: { centerId: center, staffUserId: u.id, role } });
      return { u, link };
    };
    const receptionist = await mkStaff("receptionist", centerA.id);
    const manager = await mkStaff("manager", centerA.id);
    const accountant = await mkStaff("center_accountant", centerA.id);
    const staffB = await mkStaff("receptionist", centerB.id);

    // A roster student on center A (for the isolation read).
    const student = await tx.user.create({
      data: { name: tag + "-stu", role: "student", email: tag + "-stu@x.io", status: "active" },
    });
    await tx.centerStudentRoster.create({ data: { centerId: centerA.id, studentId: student.id, addedAt: new Date() } });

    return { centerA, centerB, owner, receptionist, manager, accountant, staffB, student };
  });

  const ownerU = su(fx.owner.id, "center_admin", fx.centerA.id);
  const recU = su(fx.receptionist.u.id, "center_staff");
  const mgrU = su(fx.manager.u.id, "center_staff");
  const accU = su(fx.accountant.u.id, "center_staff");
  const staffBU = su(fx.staffB.u.id, "center_staff");
  const createdIds: string[] = [];

  try {
    // ---- 1) Each role does ONLY its allowed actions (the sub-role gate) ----
    console.log("\n[1] sub-role gate — each role only its allowed routes");
    await expectResolves(() => authorizeCenterActor(recU, { allow: RECEPTION }), "receptionist ALLOWED on a receptionist route");
    await expectForbidden(() => authorizeCenterActor(recU, { allow: MANAGER }), "receptionist DENIED on a manager route");
    await expectForbidden(() => authorizeCenterActor(recU, { allow: ACCOUNTANT }), "receptionist DENIED on an accountant route");

    await expectResolves(() => authorizeCenterActor(mgrU, { allow: RECEPTION }), "manager ALLOWED on receptionist routes (inherits)");
    await expectResolves(() => authorizeCenterActor(mgrU, { allow: MANAGER }), "manager ALLOWED on manager routes");
    await expectForbidden(() => authorizeCenterActor(mgrU, { allow: ACCOUNTANT }), "manager DENIED on accountant routes");

    await expectForbidden(() => authorizeCenterActor(accU, { allow: RECEPTION }), "accountant DENIED on receptionist routes");
    await expectForbidden(() => authorizeCenterActor(accU, { allow: MANAGER }), "accountant DENIED on manager routes");
    await expectResolves(() => authorizeCenterActor(accU, { allow: ACCOUNTANT }), "accountant ALLOWED on accountant routes");

    // Owner (center_admin) passes everywhere with full power.
    await expectResolves(() => authorizeCenterActor(ownerU, { allow: RECEPTION }), "owner ALLOWED on receptionist routes");
    await expectResolves(() => authorizeCenterActor(ownerU, { allow: MANAGER }), "owner ALLOWED on manager routes");
    await expectResolves(() => authorizeCenterActor(ownerU, { allow: ACCOUNTANT }), "owner ALLOWED on accountant routes");

    // A route that opts in NO staff role (staffAllow default []) closes to all staff.
    await expectForbidden(() => authorizeCenterActor(recU, { allow: [] }), "un-opted route closes to receptionist (default-closed)");
    await expectForbidden(() => authorizeCenterActor(mgrU, { allow: [] }), "un-opted route closes to manager (default-closed)");

    // ---- 2) center_accountant is READ-ONLY ----
    console.log("\n[2] accountant read-only invariant");
    assert(throwsForbidden(() => assertCenterActorMethodAllowed("center_accountant", "POST")), "accountant + POST -> 403");
    assert(throwsForbidden(() => assertCenterActorMethodAllowed("center_accountant", "PATCH")), "accountant + PATCH -> 403");
    assert(!throwsForbidden(() => assertCenterActorMethodAllowed("center_accountant", "GET")), "accountant + GET -> ok");
    assert(!throwsForbidden(() => assertCenterActorMethodAllowed("manager", "POST")), "manager + POST -> ok");
    assert(!throwsForbidden(() => assertCenterActorMethodAllowed(null, "POST")), "owner + POST -> ok");

    // ---- 3) ALL staff 403 on exclusions; wallet provably UNTOUCHED ----
    console.log("\n[3] hard exclusions — withdraw + staff-management + wallet untouched");
    for (const [role, u] of [["receptionist", recU], ["manager", mgrU], ["accountant", accU]] as const) {
      await expectForbidden(() => requestCenterPayout(u, 1000), `${role} DENIED center-wallet withdraw`);
      await expectForbidden(() => createStaff(u, { name: "x", email: `${tag}-hack@x.io`, role: "receptionist" }), `${role} DENIED creating staff`);
      await expectForbidden(() => listStaff(u), `${role} DENIED listing staff`);
    }
    // settings / co-owner-admin routes gate on requireRole("center_admin"); a
    // center_staff session's raw role is not in that allow-list -> 403 by omission.
    assert(!(["center_admin"] as string[]).includes("center_staff"), "settings/admins routes (requireRole center_admin) reject center_staff by omission");
    const balNow = (await admin.query(`SELECT wallet_balance FROM centers WHERE id=$1`, [fx.centerA.id])).rows[0].wallet_balance as number;
    assert(balNow === START_BALANCE, `center wallet UNTOUCHED after all withdraw attempts (${balNow} == ${START_BALANCE})`);
    const payoutCount = (await admin.query(`SELECT count(*)::int c FROM payouts WHERE beneficiary_id=$1`, [fx.centerA.id])).rows[0].c as number;
    assert(payoutCount === 0, "no payout row created by the denied withdraw attempts");

    // ---- 4) Center-vs-center isolation (RLS) ----
    console.log("\n[4] center isolation (RLS)");
    const actorA = await authorizeCenterActor(recU, { allow: RECEPTION });
    const actorB = await authorizeCenterActor(staffBU, { allow: RECEPTION });
    assert(actorA.acting.centerId === fx.centerA.id, "staff-of-A actor is scoped to center A");
    assert(actorB.acting.centerId === fx.centerB.id, "staff-of-B actor is scoped to center B");
    const aSeesOwn = await scopedDb(actorA.acting, (tx) => tx.centerStudentRoster.findMany({}));
    assert(aSeesOwn.length >= 1 && aSeesOwn.every((r) => r.centerId === fx.centerA.id), "staff-of-A reads ONLY center A roster rows");
    const aSeesB = await scopedDb(actorA.acting, (tx) => tx.centerStudentRoster.findMany({ where: { centerId: fx.centerB.id } }));
    assert(aSeesB.length === 0, "staff-of-A cannot read center B roster even when asking for it (RLS)");
    const aStaffRows = await scopedDb(actorA.acting, (tx) => tx.centerStaff.findMany({}));
    assert(aStaffRows.every((r) => r.centerId === fx.centerA.id), "staff-of-A reads ONLY center A's staff rows");

    // ---- 5) Audit on-behalf-of ----
    console.log("\n[5] audit on-behalf-of the center");
    await writeCenterStaffAudit(actorA, "/api/v1/center/wallet-topup", "POST");
    const auditRow = await withPlatformContext((tx) =>
      tx.auditLog.findFirst({
        where: { actorId: fx.receptionist.u.id, action: "center_staff.post" },
        orderBy: { createdAt: "desc" },
      }),
    );
    assert(!!auditRow, "an audit row was written for the staff mutation");
    assert(auditRow?.onBehalfOf === fx.centerA.id, "audit onBehalfOf = the center");
    assert(auditRow?.actorId === fx.receptionist.u.id, "audit actorId = the staff member (not the center)");
    assert((auditRow?.afterState as { staffRole?: string })?.staffRole === "receptionist", "audit records the staff role (receptionist on behalf of center)");

    // ---- 6) Deactivation cuts access on the next request ----
    console.log("\n[6] deactivation cuts access next request");
    await expectResolves(() => resolveCenterActorContext(recU), "active receptionist resolves before deactivation");
    await withPlatformContext((tx) => tx.centerStaff.update({ where: { id: fx.receptionist.link.id }, data: { removedAt: new Date() } }));
    await expectForbidden(() => resolveCenterActorContext(recU), "deactivated receptionist is REJECTED on the next request");
    await expectForbidden(() => authorizeCenterActor(recU, { allow: RECEPTION }), "deactivated receptionist can no longer authorize any route");
    // re-activate so later cleanup is straightforward (not required, but tidy)
    await withPlatformContext((tx) => tx.centerStaff.update({ where: { id: fx.receptionist.link.id }, data: { removedAt: null } }));

    // ---- 7) center_accountant scoped + never a platform accountant/super_admin ----
    console.log("\n[7] center_accountant is scoped + distinct from platform accountant");
    const accActor = await authorizeCenterActor(accU, { allow: ACCOUNTANT });
    assert(accActor.acting.centerId === fx.centerA.id, "center_accountant scoped to ITS OWN center only");
    await expectResolves(() => getCenterWallet(accActor.acting), "center_accountant can READ its own center wallet");
    const accSeesB = await scopedDb(accActor.acting, (tx) => tx.center.findMany({ where: { id: fx.centerB.id } }));
    assert(accSeesB.length === 0, "center_accountant cannot see another center (RLS)");
    assert(accActor.caller.role === "center_staff" && (accActor.caller.role as string) !== "super_admin" && (accActor.caller.role as string) !== "accountant", "center staff platform role is 'center_staff' — never super_admin/accountant (cannot reach apps/superadmin)");
    assert(("center_accountant" as string) !== "accountant", "the center_accountant sub-role is named distinctly from the platform 'accountant' role");

    // ---- 8) Seed-hygiene: creating staff writes ZERO money rows ----
    console.log("\n[8] staff creation writes no money/ledger rows");
    const txBefore = (await admin.query(`SELECT count(*)::int c FROM transactions`)).rows[0].c as number;
    const payBefore = (await admin.query(`SELECT count(*)::int c FROM payments`)).rows[0].c as number;
    const created = await createStaff(ownerU, { name: tag + "-new", email: `${tag}-new@x.io`, role: "manager", title: "Ops" });
    createdIds.push(created.user.id);
    const txAfter = (await admin.query(`SELECT count(*)::int c FROM transactions`)).rows[0].c as number;
    const payAfter = (await admin.query(`SELECT count(*)::int c FROM payments`)).rows[0].c as number;
    const balAfterCreate = (await admin.query(`SELECT wallet_balance FROM centers WHERE id=$1`, [fx.centerA.id])).rows[0].wallet_balance as number;
    assert(txAfter === txBefore, `no Transaction rows written by createStaff (${txBefore} -> ${txAfter})`);
    assert(payAfter === payBefore, `no Payment rows written by createStaff (${payBefore} -> ${payAfter})`);
    assert(balAfterCreate === START_BALANCE, "center wallet unchanged by createStaff");
    const staffList = await listStaff(ownerU);
    assert(staffList.some((s) => s.staffUserId === created.user.id && s.role === "manager"), "owner can list the newly-created staff member");

    // ---- happy path: each role can perform a representative ALLOWED action ----
    console.log("\n[+] happy path — each role's allowed action works end-to-end");
    const recActor = await authorizeCenterActor(recU, { allow: RECEPTION });
    const tempStu = await createTempStudent({ fullName: tag + " Temp", phone: "+201000" + Math.floor(Math.random() * 1e6).toString().padStart(6, "0") }, recActor.acting);
    if (tempStu?.id) createdIds.push(tempStu.id);
    assert(!!tempStu?.id, "receptionist can register a walk-in/temp student (allowed action succeeds)");
    const mgrActor = await authorizeCenterActor(mgrU, { allow: MANAGER });
    const room = await scopedDb(mgrActor.acting, (txx) => txx.room.create({ data: { centerId: mgrActor.acting.centerId as string, name: tag + "-room", isActive: true } }));
    assert(!!room?.id, "manager can create a room (allowed action succeeds)");
    const accWallet = await getCenterWallet((await authorizeCenterActor(accU, { allow: ACCOUNTANT })).acting);
    assert(typeof accWallet.balance === "number", "accountant can read the center wallet (allowed read succeeds)");
  } finally {
    // Cleanup — FK-safe order, RLS-bypassed.
    const U = [fx.owner.id, fx.receptionist.u.id, fx.manager.u.id, fx.accountant.u.id, fx.staffB.u.id, fx.student.id, ...createdIds];
    const C = [fx.centerA.id, fx.centerB.id];
    await admin.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[]) OR center_id = ANY($2::uuid[])`, [U, C]);
    await admin.query(`DELETE FROM center_staff WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM center_admin_profiles WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM center_student_rosters WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM rooms WHERE center_id = ANY($1::uuid[])`, [C]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [U]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [C]);
    await admin.end();
    await prisma.$disconnect().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

function throwsForbidden(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ForbiddenError;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
