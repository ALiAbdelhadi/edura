import { platformDb } from "@/lib/db/scope";

/**
 * Returns all active student IDs enrolled in a course, plus their linked parents
 * (or the student themselves if no approved parent link exists).
 */
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

/**
 * Returns all center_admin userIds for a given centerId.
 */
export async function resolveCenterAdmins(centerId: string): Promise<string[]> {
  const admins = await platformDb((tx) =>
    tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } }),
  );
  return admins.map((a) => a.userId);
}

/**
 * For a student: returns parent userId if an approved link exists, otherwise the student's own id.
 */
export async function withParentFallback(studentId: string): Promise<string[]> {
  return resolvedParentOrStudent(studentId);
}

/**
 * The student PLUS any approved linked parents (PRD §6 rows that go to
 * "Student + Parent": new payment, new grade). Deduped.
 */
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
