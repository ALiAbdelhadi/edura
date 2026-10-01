import { platformDb } from "../../db/scope";

export async function resolveCourseStudentsAndParents(
  courseId: string,
): Promise<string[]> {
  const enrollments = await platformDb((tx) =>
    tx.enrollment.findMany({
      where: { courseId, status: "active" },
      select: { studentId: true },
    }),
  );

  return withParentFallbackMany(enrollments.map((e) => e.studentId));
}

export async function resolveCenterAdmins(centerId: string): Promise<string[]> {
  const admins = await platformDb((tx) =>
    tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } }),
  );
  return admins.map((a) => a.userId);
}

export async function resolveCenterTeamPeers(
  centerId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const [admins, staff] = await Promise.all([
    resolveCenterAdmins(centerId),
    platformDb((tx) =>
      tx.centerStaff.findMany({
        where: { centerId, removedAt: null },
        select: { staffUserId: true },
      }),
    ),
  ]);
  const ids = new Set([...admins, ...staff.map((s) => s.staffUserId)]);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

export async function resolveTeacherTeamPeers(
  teacherId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const assistants = await platformDb((tx) =>
    tx.teacherAssistant.findMany({
      where: { teacherId, removedAt: null },
      select: { assistantId: true },
    }),
  );
  const ids = new Set([teacherId, ...assistants.map((a) => a.assistantId)]);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

export async function withParentFallback(studentId: string): Promise<string[]> {
  return resolvedParentOrStudent(studentId);
}

const LINK_LOOKUP_CHUNK = 5000;

export async function withParentFallbackMany(
  studentIds: string[],
): Promise<string[]> {
  const ids = [...new Set(studentIds)];
  if (!ids.length) return [];
  const parentOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += LINK_LOOKUP_CHUNK) {
    const chunk = ids.slice(i, i + LINK_LOOKUP_CHUNK);
    const links = await platformDb((tx) =>
      tx.parentStudentLink.findMany({
        where: { studentId: { in: chunk }, status: "approved" },
        select: { studentId: true, parentId: true },
      }),
    );
    for (const l of links) {
      if (!parentOf.has(l.studentId)) parentOf.set(l.studentId, l.parentId);
    }
  }
  return [...new Set(ids.map((id) => parentOf.get(id) ?? id))];
}

/**
 * The back-office people who reconcile money: every active super_admin and
 * accountant. Used when a capture lands somewhere a human has to look at
 * (SECURITY_AUDIT.md H-03 / H-04).
 */
export async function resolveFinanceStaff(): Promise<string[]> {
  const rows = await platformDb((tx) =>
    tx.user.findMany({
      where: { role: { in: ["super_admin", "accountant"] }, status: "active" },
      select: { id: true },
    }),
  );
  return rows.map((r) => r.id);
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
