import type { TenantTx } from "../../db/scope";

export type MeetingLinkCourse = {
  id: string;
  teacherId: string;
  centerId: string | null;
  onlineUrl: string | null;
};

export type MeetingLinkViewer = {
  id: string;
  role: string;
  centerId?: string | null;
};

/**
 * Who may see a course's meeting link. The link is the thing being paid for —
 * anyone holding it can sit in the online lesson for free — so it goes only to
 * the owning teacher, the owning centre, and students (or their parents) whose
 * PAID coverage includes today.
 *
 * SECURITY_AUDIT.md (2026-09-11) DIFF-02: "inside the course" used to mean an
 * active `enrollment`. Decision #2 makes the enrollment the roster link and
 * the subscription the coverage, and a refund cancels the subscription while
 * leaving the enrollment alone — so that check kept handing the link to
 * refunded and expired students. The gate is now an active subscription
 * covering today: a monthly window that contains now, or a per-session pass
 * for a lesson that has not passed. Same reading as the counter's coverage.
 */
export async function canSeeMeetingLink(
  tx: TenantTx,
  course: MeetingLinkCourse,
  viewer: MeetingLinkViewer | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (!course.onlineUrl || !viewer) return false;
  if (viewer.id === course.teacherId) return true;
  if (course.centerId && viewer.centerId === course.centerId) return true;

  if (viewer.role === "student") return coveredToday(tx, course.id, [viewer.id], now);
  if (viewer.role === "parent") {
    const links = await tx.parentStudentLink.findMany({
      where: { parentId: viewer.id, status: "approved" },
      select: { studentId: true },
    });
    return coveredToday(tx, course.id, links.map((l) => l.studentId), now);
  }
  return false;
}

async function coveredToday(
  tx: TenantTx,
  courseId: string,
  studentIds: string[],
  now: Date,
): Promise<boolean> {
  if (studentIds.length === 0) return false;
  const subs = await tx.subscription.findMany({
    where: {
      studentId: { in: studentIds },
      courseId,
      status: "active",
      OR: [
        { plan: "monthly", periodStart: { lte: now }, periodEnd: { gte: now } },
        { plan: "per_session", sessionId: { not: null } },
      ],
    },
    select: { plan: true, sessionId: true },
  });
  if (subs.some((s) => s.plan === "monthly")) return true;
  const sessionIds = subs.flatMap((s) => (s.sessionId ? [s.sessionId] : []));
  if (sessionIds.length === 0) return false;
  // Sessions are dated at midnight; a pass for today's lesson still counts.
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  return (
    (await tx.session.count({ where: { id: { in: sessionIds }, date: { gte: startOfToday } } })) >
    0
  );
}
