import "./helpers/bind-auth";
// PoC for SECURITY_AUDIT.md M-01 — a `center_staff` (receptionist) of centre A
// can read centre B's session row and its attendance/coverage by id. Written in
// Phase 3 from the Appendix A-4 curl recipe, at the route level: the two GET
// handlers are invoked directly with a center_staff session (the same
// `__setSessionOverrideForTests` + `new Request` pattern invite-claim.test.ts
// uses). NOT RUN by the audit.
//
// Expected TODAY (vulnerable): both asserts in [2] FAIL — 200 with the session
// row, 200 with records[]/coverage[].
// Expected AFTER the fix: 403 on both, and the staff member's OWN centre's
// session still reads 200 ([3]) so the fix is scoping, not a lockout.
import { withPlatformContext } from "@repo/database";
import type { SessionUser } from "@repo/server-core/erp-auth/session";
import { __setSessionOverrideForTests } from "@repo/server-core/erp-auth/session";
import { GET as sessionGet } from "api/routes/v1/sessions/[id]/route";
import { GET as attendanceGet } from "api/routes/v1/sessions/[id]/attendance/route";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
const SUITE_NAME = "poc-m01-staff-session-idor.test.ts";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(handler: RouteHandler, user: SessionUser, sessionId: string, path: string) {
  __setSessionOverrideForTests(() => user);
  try {
    const res = await handler(
      new Request(`http://localhost:3002/api/v1/sessions/${sessionId}${path}`, { method: "GET" }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    return { status: res.status, body: (await res.json()) as { data?: unknown } };
  } finally {
    __setSessionOverrideForTests(null);
  }
}

async function main() {
  const tag = "m01-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const mk = async (k: string) => {
      const c = await tx.center.create({ data: { name: `${tag}-${k}`, shortId: ("C" + rid() + rid()).slice(0, 12).toUpperCase(), status: "active" } });
      const t = await tx.user.create({ data: { name: `${tag}-${k}-t`, role: "teacher", email: `${tag}-${k}-t@x.io`, status: "active" } });
      const course = await tx.course.create({ data: { centerId: c.id, teacherId: t.id, title: `${tag}-${k}-course`, subject: "math", daysOfWeek: [1], startTime: "16:00", endTime: "18:00", startDate: new Date("2027-03-01T00:00:00Z"), price: 1000, maxStudents: 10, status: "active" } });
      const s = await tx.session.create({ data: { courseId: course.id, teacherId: t.id, originalDate: new Date("2027-03-01T00:00:00Z"), date: new Date("2027-03-01T00:00:00Z"), startTime: "16:00", endTime: "18:00", status: "scheduled" } });
      const stu = await tx.user.create({ data: { name: `${tag}-${k}-s`, role: "student", email: `${tag}-${k}-s@x.io`, status: "active" } });
      await tx.studentProfile.create({ data: { userId: stu.id, fullName: `${tag}-${k}-s`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
      await tx.enrollment.create({ data: { studentId: stu.id, courseId: course.id, centerId: c.id, enrolledBy: t.id } });
      await tx.attendanceRecord.create({ data: { sessionId: s.id, studentId: stu.id, courseId: course.id, centerId: c.id, status: "present", markedBy: t.id } });
      return { centerId: c.id, sessionId: s.id };
    };
    const A = await mk("A");
    const B = await mk("B");
    const staff = await tx.user.create({ data: { name: `${tag}-staff`, role: "center_staff", email: `${tag}-staff@x.io`, status: "active" } });
    await tx.centerStaff.create({ data: { staffUserId: staff.id, centerId: A.centerId, role: "receptionist" } });
    return { A, B, staffId: staff.id };
  });
  const staff = { id: fx.staffId, role: "center_staff", locale: "en", name: "staff", email: null } as unknown as SessionUser;

  console.log("\n[1] receptionist of centre A, session id of centre B");
  const row = await call(sessionGet as unknown as RouteHandler, staff, fx.B.sessionId, "");
  const att = await call(attendanceGet as unknown as RouteHandler, staff, fx.B.sessionId, "/attendance");
  console.log(`   GET /sessions/{B} -> ${row.status}; GET /sessions/{B}/attendance -> ${att.status}`);

  console.log("\n[2] cross-centre reads MUST be refused");
  assert(row.status === 403 || row.status === 404, `session row of another centre is refused (got ${row.status})`);
  assert(att.status === 403 || att.status === 404, `attendance + coverage of another centre is refused (got ${att.status})`);

  console.log("\n[3] the same staff member still reads their OWN centre");
  const own = await call(sessionGet as unknown as RouteHandler, staff, fx.A.sessionId, "");
  const ownAtt = await call(attendanceGet as unknown as RouteHandler, staff, fx.A.sessionId, "/attendance");
  assert(own.status === 200, `own centre session reads 200 (got ${own.status})`);
  assert(ownAtt.status === 200 && Array.isArray((ownAtt.body.data as { records?: unknown[] })?.records), `own centre attendance reads 200 with records[] (got ${ownAtt.status})`);

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
