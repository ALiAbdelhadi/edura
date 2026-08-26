import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { toActingUser } from "@/lib/authz/teacher-actor";
import { authorizeCenterActor } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import {
  approvedChildIds,
  assertApprovedChild,
} from "@/lib/services/wallet/parent-wallet";
import { enrichSessions } from "@/lib/services/sessions/enrich";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  // `toActingUser` reshapes ONLY assistant -> teacher. A center_staff caller
  // used to reach the role chain below unchanged, match no branch, and so be
  // handed a `where` with no course/teacher scoping at all — and because
  // scopedDb only opens a tenant for `center_admin`, that query also ran under
  // withPlatformContext with no RLS to catch it. The result was every session
  // on the platform, for any staff account. Same shape as the H-1 materials
  // finding: the gate existed, this route just never called it.
  //
  // authorizeCenterActor re-checks the live staff link and returns a
  // center_admin-shaped actor carrying the staff member's OWN centerId, which
  // is what makes scopedDb bind withTenant(centerId). The allow-list matches
  // the one /api/v1/search already uses for a read of the centre's own data.
  const user =
    session.role === "center_staff"
      ? (
          await authorizeCenterActor(session, {
            allow: ["receptionist", "manager", "center_accountant"],
          })
        ).acting
      : await toActingUser(session);

  const url = new URL(req.url);

  const courseId = url.searchParams.get("courseId");
  const teacherId = url.searchParams.get("teacherId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const studentIdParam = url.searchParams.get("studentId");

  const enriched = await scopedDb(user, async (tx) => {
    const where: Prisma.SessionWhereInput = {};

    if (courseId) where.courseId = courseId;
    if (teacherId) where.teacherId = teacherId;
    if (from || to) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);
      where.date = dateFilter;
    }

    if (user.role === "center_admin") {
      const courses = await tx.course.findMany({
        where: { centerId: user.centerId as string },
        select: { id: true },
      });
      const centerCourseIds = courses.map((c) => c.id);
      if (courseId) {
        if (!centerCourseIds.includes(courseId)) {
          throw new ForbiddenError("Course not in your center");
        }
      } else {
        where.courseId = { in: centerCourseIds };
      }
    } else if (user.role === "teacher") {
      where.teacherId = user.id;
    } else if (user.role === "student") {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: user.id, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    } else if (user.role === "parent") {
      // A PARENT MAY NARROW TO ONE CHILD. Without `studentId` this route
      // returned the union of every child's courses and had no way to say which
      // child a session belonged to — so a multi-child parent read one
      // undifferentiated timetable (PARENT_IA_AUDIT.md §7.1, finding 1).
      //
      // The union stays the default, because existing callers depend on it and
      // narrowing by force would silently hide a child. What is new is that
      // asking for one child is now possible, and answered.
      //
      // The gate is `assertApprovedChild` — the SAME function every parent money
      // path calls, not a second inline link lookup. `pending`, `rejected` and
      // `revoked` all fail there, which is the point of it.
      let studentIds: string[];
      if (studentIdParam && studentIdParam !== "me") {
        await assertApprovedChild(tx, user.id, studentIdParam);
        studentIds = [studentIdParam];
      } else {
        studentIds = await approvedChildIds(tx, user.id);
        if (studentIds.length === 0) throw new ForbiddenError("No linked children");
      }
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: { in: studentIds }, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    } else {
      // FAIL CLOSED. Every role this endpoint serves is named above; a role
      // that reaches here is one nobody scoped, and returning an unfiltered
      // query is how a read endpoint becomes a platform-wide dump. A refusal
      // is visible and fixable; a silent full-table read is neither.
      throw new ForbiddenError("This role has no session scope on this route");
    }

    if (studentIdParam === "me" && user.role === "student") {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId: user.id, status: "active" },
        select: { courseId: true },
      });
      where.courseId = { in: enrollments.map((e) => e.courseId) };
    }

    const sessions = await tx.session.findMany({
      where,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // T-8: the joins (incl. centerName through Course.centerId — Session has
    // no center column) live in enrichSessions so the shape is testable and
    // the three portal heroes share it instead of re-joining client-side.
    return enrichSessions(tx, sessions);
  });

  return ok({ items: enriched });
});
