import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { ConflictError, NotFoundError, BusinessRuleError, ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { notify } from "@/lib/services/notifications/notify";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  studentId: z.string().min(1),
});

export const GET = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const url = new URL(req.url);
  const blacklisted = url.searchParams.get("blacklisted");
  const courseId = url.searchParams.get("courseId");
  const q = url.searchParams.get("q");

  if (!user.centerId) throw new ForbiddenError("Admin has no center scope");

  const items = await scopedDb(user, async (tx) => {
    const rosterFilter: Prisma.CenterStudentRosterWhereInput = {
      leftAt: null,
      centerId: user.centerId as string,
    };
    if (blacklisted === "true") rosterFilter.blacklisted = true;
    if (blacklisted === "false") rosterFilter.blacklisted = false;

    if (courseId) {
      const enrollments = await tx.enrollment.findMany({
        where: { courseId, centerId: user.centerId as string, status: "active" },
        select: { studentId: true },
      });
      rosterFilter.studentId = { in: enrollments.map((e) => e.studentId) };
    }

    const rosters = await tx.centerStudentRoster.findMany({ where: rosterFilter });
    const ids = rosters.map((r) => r.studentId);

    const userFilter: Prisma.UserWhereInput = {
      id: { in: ids },
      status: { not: "deleted" },
    };
    if (q) {
      userFilter.name = { startsWith: q, mode: "insensitive" };
    }

    const users = await tx.user.findMany({
      where: userFilter,
      select: { id: true, name: true, email: true, phone: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return rosters.map((r) => {
      const u = userMap.get(r.studentId);
      return {
        id: r.studentId,
        studentId: r.studentId,
        rosterId: r.id,
        blacklisted: r.blacklisted,
        blacklistReason: r.blacklistReason,
        addedAt: r.addedAt,
        leftAt: r.leftAt,
        name: u?.name,
        email: u?.email,
        phone: u?.phone,
        status: u?.status,
        user: u ? { name: u.name, email: u.email, phone: u.phone, status: u.status } : null,
      };
    });
  });

  return ok({ items });
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const { studentId } = await parseJson(req, addSchema);

  const entry = await scopedDb(user, async (tx) => {
    const student = await tx.user.findFirst({
      where: { id: studentId, role: "student", status: { not: "deleted" } },
    });
    if (!student) throw new NotFoundError("Student not found");

    const exists = await tx.centerStudentRoster.findFirst({
      where: { centerId: user.centerId as string, studentId, leftAt: null },
    });
    if (exists) throw new ConflictError("Student already in roster");

    if (student.status === "shell") {
      throw new BusinessRuleError("Use invite for shell accounts");
    }

    try {
      return await tx.centerStudentRoster.create({
        data: {
          centerId: user.centerId as string,
          studentId,
          addedAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Student already in roster");
      }
      throw err;
    }
  });

  await notify({
    recipients: [studentId],
    type: "student_added_to_roster",
    title: "You have been added to a center",
    body: "A center has added you to their student roster.",
    data: { centerId: user.centerId },
  });

  return ok(entry, { status: 201 });
});
