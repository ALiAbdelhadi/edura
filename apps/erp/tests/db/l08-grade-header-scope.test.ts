// SECURITY_AUDIT.md L-08 — a grade's HEADER (title, type, max score, course)
// is course data: only an enrolled student, or the parent of one, may read it.
import { withPlatformContext } from "@repo/database";
import { getGrade } from "@repo/server-core/services/grades/grades";
import type { SessionUser } from "@repo/server-core/erp-auth/session";
import { sweepTagQuietly } from "../../../../packages/database/scripts/test-cleanup";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

let __sweepTag = "";
let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) { pass++; console.log("  ✓", msg); } else { fail++; console.error("  ✗", msg); } }
async function caught(fn: () => Promise<unknown>) { try { await fn(); return null; } catch (e) { return e as Error & { status?: number; code?: string }; } }
const rid = () => Math.floor(Math.random() * 1e9).toString(36);

async function main() {
  const tag = "l08-" + rid(); __sweepTag = tag;
  const fx = await withPlatformContext(async (tx) => {
    const owner = await tx.user.create({ data: { name: `${tag}-owner`, role: "center_admin", email: `${tag}-o@x.io`, status: "active" } });
    const center = await tx.center.create({ data: { name: `${tag}-center`, shortId: tag.toUpperCase().slice(0, 18), status: "active", ownerUserId: owner.id } });
    const teacher = await tx.user.create({ data: { name: `${tag}-t`, role: "teacher", email: `${tag}-t@x.io`, status: "active" } });
    const course = await tx.course.create({ data: { centerId: center.id, teacherId: teacher.id, title: `${tag}-c`, subject: "Math", daysOfWeek: [1], startTime: "10:00", endTime: "11:00", startDate: new Date(), maxStudents: 30, status: "active", price: 1000 } });
    const mk = async (k: string) => {
      const u = await tx.user.create({ data: { name: `${tag}-${k}`, role: "student", email: `${tag}-${k}@x.io`, status: "active" } });
      await tx.studentProfile.create({ data: { userId: u.id, fullName: `${tag}-${k}`, familyLinkCode: (tag + rid() + "00").slice(0, 18) } });
      return u.id;
    };
    const enrolled = await mk("in"); const stranger = await mk("out");
    await tx.enrollment.create({ data: { studentId: enrolled, courseId: course.id, centerId: center.id, enrolledBy: teacher.id } });
    const grade = await tx.grade.create({ data: { courseId: course.id, centerId: center.id, teacherId: teacher.id, name: `${tag} quiz`, maxScore: 20, gradeType: "numeric", date: new Date() } });
    await tx.gradeScore.create({ data: { gradeId: grade.id, studentId: enrolled, score: 17 } });
    const parentIn = await tx.user.create({ data: { name: `${tag}-pin`, role: "parent", email: `${tag}-pin@x.io`, status: "active" } });
    await tx.parentProfile.create({ data: { userId: parentIn.id } });
    await tx.parentStudentLink.create({ data: { parentId: parentIn.id, studentId: enrolled, status: "approved", initiatedBy: "parent" } });
    const parentOut = await tx.user.create({ data: { name: `${tag}-pout`, role: "parent", email: `${tag}-pout@x.io`, status: "active" } });
    await tx.parentProfile.create({ data: { userId: parentOut.id } });
    await tx.parentStudentLink.create({ data: { parentId: parentOut.id, studentId: stranger, status: "approved", initiatedBy: "parent" } });
    return { grade: grade.id, enrolled, stranger, parentIn: parentIn.id, parentOut: parentOut.id };
  });
  const as = (id: string, role: string) => ({ id, role } as unknown as SessionUser);

  console.log("\n[1] students");
  const mine = await getGrade(fx.grade, as(fx.enrolled, "student"));
  assert(mine.name.endsWith("quiz") && mine.scores.length === 1 && mine.scores[0]!.score === 17, "an enrolled student reads the header and only their own score");
  const denied = await caught(() => getGrade(fx.grade, as(fx.stranger, "student")));
  assert(denied !== null && /not found/i.test(denied.message), `a student not on the course gets 404, not the header (${denied?.message})`);

  console.log("\n[2] parents");
  const pIn = await getGrade(fx.grade, as(fx.parentIn, "parent"));
  assert(pIn.scores.length === 1, "the parent of an enrolled child reads the header and the child's score");
  const pOut = await caught(() => getGrade(fx.grade, as(fx.parentOut, "parent")));
  assert(pOut !== null && /not found/i.test(pOut.message), "the parent of a non-enrolled child gets 404");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
}
async function runGuarded() {
  await assertDbEnv(["test"], { intent: "suite l08-grade-header-scope.test.ts" });
  try { await main(); } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (__sweepTag) await sweepTagQuietly(__sweepTag); }
  process.exit(process.exitCode ?? 0);
}
runGuarded().catch((e) => { console.error(e); process.exit(1); });
