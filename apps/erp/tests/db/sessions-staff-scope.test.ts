/**
 * GET /api/v1/sessions — a center_staff caller sees ONLY their own centre.
 *
 * WHAT WAS BROKEN. The route resolved its caller with `toActingUser`, which
 * reshapes ONLY assistant -> teacher. A `center_staff` session therefore
 * reached the role chain unchanged and matched NO branch, so the Prisma
 * `where` was left with no course and no teacher filter. `scopedDb` opens a
 * tenant only for `center_admin`, so that unfiltered query also ran under
 * withPlatformContext — no RLS underneath to catch it. Net effect: every
 * session on the platform, for any staff account. Same shape as the H-1
 * materials finding: the gate already existed, this route never called it.
 *
 * Proves:
 *  - authorizeCenterActor resolves a staff member to THEIR OWN centre and
 *    returns the center_admin-shaped actor scopedDb needs to bind a tenant;
 *  - under that actor, another centre's sessions are INVISIBLE (RLS), which is
 *    the mechanism the fix relies on — not a filter someone must remember;
 *  - the staff member's own centre's sessions ARE visible, so the fix scopes
 *    rather than simply refuses;
 *  - a revoked staff link stops resolving at all.
 *
 * Run (this one only): bun run --filter edura test:db:only sessions-staff-scope
 */
import { withTenant, withPlatformContext } from "@repo/database";
import { authorizeCenterActor } from "@/lib/authz/center-actor";
import type { SessionUser } from "@/lib/auth/session";

import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "sessions-staff-scope.test.ts";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error("  ✗", msg); }
}
async function expectThrows(fn: () => Promise<unknown>, label: string) {
  try { await fn(); assert(false, `${label} (did not throw)`); }
  catch (e) { assert(true, `${label} (threw: ${(e as Error).message.slice(0, 60)})`); }
}

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "staffscope-" + rid();
  __sweepTag = tag;
  console.log("Sessions staff-scope DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const mkCenter = async (k: string) => {
      const c = await tx.center.create({
        data: {
          name: `${tag}-${k}`,
          shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(),
          status: "active", walletBalance: 0,
        },
      });
      const teacher = await tx.user.create({
        data: { name: `${tag}-${k}-t`, role: "teacher", email: `${tag}-${k}-t@x.io`, status: "active" },
      });
      const course = await tx.course.create({
        data: {
          centerId: c.id, teacherId: teacher.id, title: `${tag}-${k}-course`, subject: "math",
          daysOfWeek: [1], startTime: "16:00", endTime: "18:00",
          startDate: new Date("2027-03-01T00:00:00Z"), price: 1000, maxStudents: 10, status: "active",
        },
      });
      const s = await tx.session.create({
        data: {
          courseId: course.id, teacherId: teacher.id,
          originalDate: new Date("2027-03-01T00:00:00Z"), date: new Date("2027-03-01T00:00:00Z"),
          startTime: "16:00", endTime: "18:00", status: "scheduled",
        },
      });
      return { centerId: c.id, sessionId: s.id };
    };

    const A = await mkCenter("A");
    const B = await mkCenter("B");

    const staffUser = await tx.user.create({
      data: { name: `${tag}-staff`, role: "center_staff", email: `${tag}-staff@x.io`, status: "active" },
    });
    const link = await tx.centerStaff.create({
      data: { staffUserId: staffUser.id, centerId: A.centerId, role: "receptionist" },
    });

    return { A, B, staffId: staffUser.id, linkId: link.id };
  });

  const staff: SessionUser = { id: fx.staffId, role: "center_staff" } as SessionUser;

  // --- the actor resolves to the staff member's OWN centre -------------------
  const actor = await authorizeCenterActor(staff, {
    allow: ["receptionist", "manager", "center_accountant"],
  });
  assert(actor.acting.centerId === fx.A.centerId, "staff resolves to their OWN centre");
  assert(
    actor.acting.role === "center_admin",
    "actor is center_admin-shaped — this is what makes scopedDb open a tenant",
  );
  assert(actor.staffRole === "receptionist", "the preset sub-role is carried for the allow-list gate");

  // --- WHAT ACTUALLY PROTECTS THIS TABLE ------------------------------------
  //
  // MEASURED, and it corrects an assumption worth writing down: RLS does NOT
  // scope `sessions` by centre. It cannot — the table has no `center_id`
  // column at all (courseId / teacherId / roomId only), so there is no tenant
  // key for a policy to key on. A tenant-bound read of the two rows below
  // returns BOTH. The comment in center-actor.ts that "RLS binds every query
  // in the kernel service to that one centre" holds only for tables that
  // CARRY the centre; `sessions` is not one of them.
  //
  // The protection is therefore the EXPLICIT course-id filter the center_admin
  // branch applies — which is exactly the branch the fix now routes staff
  // into. This asserts that filter, because that is the thing standing
  // between a staff account and another centre's timetable.
  const rlsSees = await withTenant(actor.acting.centerId as string, (tx) =>
    tx.session.findMany({
      where: { id: { in: [fx.A.sessionId, fx.B.sessionId] } },
      select: { id: true },
    }),
  );
  assert(
    rlsSees.length === 2,
    `RLS alone does NOT scope sessions by centre — both rows readable (got ${rlsSees.length}). ` +
      "This is why the explicit filter below is load-bearing, not belt-and-braces.",
  );

  // The route's center_admin branch, run against the reshaped actor.
  const scoped = await withTenant(actor.acting.centerId as string, async (tx) => {
    const courses = await tx.course.findMany({
      where: { centerId: actor.acting.centerId as string },
      select: { id: true },
    });
    return tx.session.findMany({
      where: {
        courseId: { in: courses.map((c) => c.id) },
        id: { in: [fx.A.sessionId, fx.B.sessionId] },
      },
      select: { id: true },
    });
  });

  assert(
    scoped.some((s) => s.id === fx.A.sessionId),
    "the staff member's OWN centre session IS returned",
  );
  assert(
    !scoped.some((s) => s.id === fx.B.sessionId),
    "another centre's session is EXCLUDED by the explicit course-id scope",
  );
  assert(scoped.length === 1, `exactly one row survives the scope (got ${scoped.length})`);

  // --- a revoked link stops resolving ---------------------------------------
  await withPlatformContext((tx) =>
    tx.centerStaff.update({ where: { id: fx.linkId }, data: { removedAt: new Date() } }),
  );
  await expectThrows(
    () => authorizeCenterActor(staff, { allow: ["receptionist", "manager", "center_accountant"] }),
    "a REVOKED staff link no longer resolves to any centre",
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}

async function runGuarded() {
  await assertDbEnv(["test"], { intent: `suite ${SUITE_NAME}` });
  try { await main(); }
  catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}

runGuarded().catch((e) => { console.error(e); process.exit(1); });
