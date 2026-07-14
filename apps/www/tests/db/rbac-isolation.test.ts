import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { withTenant, withPlatformContext, prisma } from "@repo/database";
import { ForbiddenError } from "@/lib/errors/classes";
import { completeSession } from "@/lib/services/finance/distribution";
import { approveBooking, rejectBooking } from "@/lib/services/bookings/classroom-bookings";
import { cancelSession } from "@/lib/services/session-actions/session-actions";

neonConfig.webSocketConstructor = ws as never;
const adminPool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

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

async function expectThrows(fn: () => Promise<unknown>, ErrClass: new (...a: never[]) => Error, label: string) {
  try {
    await fn();
    assert(false, `${label} — expected ${ErrClass.name} but call RESOLVED`);
  } catch (e) {
    const ok = e instanceof ErrClass;
    const got = (e as Error)?.constructor?.name ?? typeof e;
    const msg = (e as Error)?.message ?? "";
    assert(ok, `${label} -> ${ErrClass.name}${ok ? ` ("${msg}")` : ` (got ${got}: "${msg}")`}`);
  }
}

async function main() {
  const tag = "rbac-" + Math.floor(Math.random() * 1e9).toString(36);
  console.log("RBAC + data-isolation DB tests —", tag);

  const fx = await withPlatformContext(async (tx) => {
    const teacherA = await tx.user.create({
      data: { name: tag + "-teacherA", role: "teacher", email: tag + "-ta@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacherA.id, walletBalance: 0 } });

    const teacherB = await tx.user.create({
      data: { name: tag + "-teacherB", role: "teacher", email: tag + "-tb@x.io", status: "active" },
    });
    await tx.teacherProfile.create({ data: { userId: teacherB.id, walletBalance: 0 } });

    const centerA = await tx.center.create({
      data: { name: tag + "-A", shortId: (tag + "A").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });
    const centerB = await tx.center.create({
      data: { name: tag + "-B", shortId: (tag + "B").slice(0, 12).toUpperCase(), status: "active", walletBalance: 0 },
    });

    const adminB = await tx.user.create({
      data: { name: tag + "-adminB", role: "center_admin", email: tag + "-ab@x.io", status: "active" },
    });
    await tx.centerAdminProfile.create({ data: { userId: adminB.id, centerId: centerB.id } });

    const course = await tx.course.create({
      data: {
        centerId: centerA.id, teacherId: teacherA.id, title: tag + "-course", subject: "Math",
        daysOfWeek: [1], startTime: "10:00", endTime: "11:00",
        startDate: new Date("2026-01-01T00:00:00Z"),
        price: 20000, maxStudents: 30, status: "active",
      },
    });
    const session = await tx.session.create({
      data: {
        courseId: course.id, teacherId: teacherA.id,
        originalDate: new Date("2026-02-02T10:00:00Z"), date: new Date("2026-02-02T10:00:00Z"),
        startTime: "10:00", endTime: "11:00", status: "scheduled",
      },
    });
    const room = await tx.room.create({
      data: { centerId: centerA.id, name: tag + "-room", facilities: [], photos: [], isActive: true },
    });
    const booking = await tx.classroomBooking.create({
      data: {
        centerId: centerA.id, roomId: room.id, sessionId: session.id, courseId: course.id,
        teacherId: teacherA.id, status: "pending",
      },
    });

    return {
      teacherA: teacherA.id, teacherB: teacherB.id, adminB: adminB.id,
      centerA: centerA.id, centerB: centerB.id,
      course: course.id, session: session.id, room: room.id, booking: booking.id,
    };
  });

  try {
    const wrongTeacher = { id: fx.teacherB, role: "teacher" } as never;
    const wrongCenterAdmin = { id: fx.adminB, role: "center_admin", centerId: fx.centerB } as never;

    await expectThrows(
      () => completeSession(fx.session, wrongTeacher),
      ForbiddenError,
      "completeSession by non-owner teacher",
    );

    await expectThrows(
      () => completeSession(fx.session, wrongCenterAdmin),
      ForbiddenError,
      "completeSession by wrong-center admin",
    );

    await expectThrows(
      () => approveBooking(fx.booking, 5000, wrongCenterAdmin),
      ForbiddenError,
      "approveBooking by wrong-center admin",
    );

    await expectThrows(
      () => rejectBooking(fx.booking, "no rooms available", wrongCenterAdmin),
      ForbiddenError,
      "rejectBooking by wrong-center admin",
    );

    await expectThrows(
      () => cancelSession(fx.session, fx.teacherB, "cannot make it"),
      ForbiddenError,
      "cancelSession by non-owner teacher",
    );

    const untouched = await withPlatformContext(async (tx) => {
      const s = await tx.session.findUnique({ where: { id: fx.session }, select: { status: true, distributedAt: true } });
      const b = await tx.classroomBooking.findUnique({ where: { id: fx.booking }, select: { status: true } });
      return { s, b };
    });
    assert(untouched.s?.status === "scheduled" && untouched.s?.distributedAt == null, "session left un-completed / un-distributed after rejected guards");
    assert(untouched.b?.status === "pending", "booking left pending after rejected guards");

    const seenByA = await withTenant(fx.centerA, (tx) => tx.course.findMany({ where: { id: fx.course } }));
    assert(seenByA.length === 1, "tenant A can read its own course");

    const seenByB = await withTenant(fx.centerB, (tx) => tx.course.findMany({ where: { id: fx.course } }));
    assert(seenByB.length === 0, "tenant B is blocked from center A's course (RLS SELECT)");

    await expectThrows(
      () =>
        withTenant(fx.centerB, (tx) =>
          tx.course.create({
            data: {
              centerId: fx.centerA, teacherId: fx.teacherA, title: tag + "-evil", subject: "Math",
              daysOfWeek: [2], startTime: "10:00", endTime: "11:00",
              startDate: new Date("2026-01-01T00:00:00Z"), price: 100, maxStudents: 1,
            },
          }),
        ),
      Error,
      "tenant B insert scoped to center A (RLS WITH CHECK)",
    );

    const evilCount = await withPlatformContext((tx) => tx.course.count({ where: { title: tag + "-evil" } }));
    assert(evilCount === 0, "rejected cross-tenant insert created no row");
  } finally {
    const allUsers = [fx.teacherA, fx.teacherB, fx.adminB];
    const allCenters = [fx.centerA, fx.centerB];
    const c = await adminPool.connect();
    try {
      await c.query(`DELETE FROM classroom_bookings WHERE center_id = ANY($1::uuid[])`, [allCenters]);
      await c.query(`DELETE FROM sessions WHERE id = $1`, [fx.session]);
      await c.query(`DELETE FROM courses WHERE center_id = ANY($1::uuid[])`, [allCenters]);
      await c.query(`DELETE FROM rooms WHERE center_id = ANY($1::uuid[])`, [allCenters]);
      await c.query(`DELETE FROM center_admin_profiles WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM teacher_profiles WHERE user_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1::uuid[])`, [allUsers]);
      await c.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [allCenters]);
      await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allUsers]);
    } finally {
      c.release();
      await adminPool.end();
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  try { await adminPool.end(); } catch { /* already ended */ }
  process.exit(1);
});
