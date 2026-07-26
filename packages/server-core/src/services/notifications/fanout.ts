import { platformDb } from "../../db/scope";

// Moved here from apps/www so both apps resolve notification recipients
// identically. apps/www/src/lib/services/notifications/fanout.ts is a
// re-export shim.

export async function resolveCourseStudentsAndParents(
  courseId: string,
): Promise<string[]> {
  const enrollments = await platformDb((tx) =>
    tx.enrollment.findMany({
      where: { courseId, status: "active" },
      select: { studentId: true },
    }),
  );

  const studentIds = enrollments.map((e) => e.studentId);
  const recipients = new Set<string>();

  await Promise.all(
    studentIds.map(async (sid) => {
      const parentIds = await resolvedParentOrStudent(sid);
      for (const id of parentIds) recipients.add(id);
    }),
  );

  return [...recipients];
}

export async function resolveCenterAdmins(centerId: string): Promise<string[]> {
  const admins = await platformDb((tx) =>
    tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } }),
  );
  return admins.map((a) => a.userId);
}

export async function withParentFallback(studentId: string): Promise<string[]> {
  return resolvedParentOrStudent(studentId);
}

export async function studentAndParents(studentId: string): Promise<string[]> {
  const link = await platformDb((tx) =>
    tx.parentStudentLink.findMany({
      where: { studentId, status: "approved" },
      select: { parentId: true },
    }),
  );
  return [...new Set([studentId, ...link.map((l) => l.parentId)])];
}

async function resolvedParentOrStudent(studentId: string): Promise<string[]> {
  const link = await platformDb((tx) =>
    tx.parentStudentLink.findFirst({
      where: { studentId, status: "approved" },
      select: { parentId: true },
    }),
  );

  return link ? [link.parentId] : [studentId];
}
