import { platformDb } from "../../db/scope";
import { NotFoundError, ForbiddenError, BusinessRuleError, ConflictError } from "../../errors/classes";
import { notify } from "../notifications/notify";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";

// ---------------------------------------------------------------------------
// H-04 — the blacklist cascade is REVERSIBLE.
//
// A blacklist removes the student from the enrollments in its scope. Lifting it
// must put back exactly those, and nothing else — not an enrollment they left
// for an unrelated reason, not one a course ended out from under, not a second
// copy of one somebody re-created by hand in the meantime.
//
// "Exactly those" is answered by a JOURNAL (`blacklist_cascade_actions`), not by
// timestamps: one row per enrollment removed, keyed to the blacklist entry that
// removed it, written in the SAME transaction as the removal. The lift replays
// the journal. Level scoping therefore needs no re-derivation at lift time (a
// center entry only ever journaled that center's rows), and blacklist → lift →
// blacklist cycles are independent (each entry owns its own rows, and a row is
// considered exactly once because the lift stamps `reversedAt`).
//
// MONEY: this whole file is roster bookkeeping. Neither the cascade nor its
// reversal reads or writes transactions, payments, payment_intents, wallets,
// wallet_ledger, subscriptions, session_settlements, payouts or points_ledger.
// Blacklisting never refunded anything and never cancelled a subscription, so
// lifting has nothing to re-charge: payment coverage is exactly what it was on
// both legs.
// ---------------------------------------------------------------------------

type CascadeScope =
  | { level: "platform" }
  | { level: "center"; centerId: string }
  | { level: "teacher"; teacherId: string };

/** Which of the student's active enrollments this blacklist level reaches. */
function cascadeWhere(studentId: string, scope: CascadeScope) {
  const base = { studentId, status: "active" as const };
  if (scope.level === "center") return { ...base, centerId: scope.centerId };
  if (scope.level === "teacher") return { ...base, course: { teacherId: scope.teacherId } };
  return base; // platform — everything
}

/**
 * Remove the in-scope enrollments and journal each removal against `entryId`.
 * Runs inside the caller's transaction, so the removal and its record commit
 * together or not at all.
 */
async function applyEnrollmentCascade(
  tx: TenantTx,
  entryId: string,
  studentId: string,
  scope: CascadeScope,
): Promise<number> {
  const affected = await tx.enrollment.findMany({
    where: cascadeWhere(studentId, scope),
    select: { id: true, centerId: true, courseId: true, status: true },
  });
  if (affected.length === 0) return 0;

  await tx.enrollment.updateMany({
    where: { id: { in: affected.map((e) => e.id) } },
    data: { status: "unenrolled", unenrolledAt: new Date() },
  });
  await tx.blacklistCascadeAction.createMany({
    data: affected.map((e) => ({
      entryId,
      targetId: studentId,
      entityType: "enrollment",
      entityId: e.id,
      centerId: e.centerId,
      courseId: e.courseId,
      prevStatus: e.status,
    })),
  });
  return affected.length;
}

type OverCapacity = {
  courseId: string;
  courseTitle: string;
  centerId: string | null;
  teacherId: string;
  maxStudents: number;
  activeCount: number;
};

type ReversalSummary = {
  restored: number;
  skipped: number;
  overCapacity: OverCapacity[];
};

/**
 * Put back what — and only what — `entry` took away. Runs inside the caller's
 * transaction so the restore and its stamp commit with the lift itself.
 */
async function reverseEnrollmentCascade(
  tx: TenantTx,
  entry: { id: string; targetId: string },
  actorId: string,
): Promise<ReversalSummary> {
  const summary: ReversalSummary = { restored: 0, skipped: 0, overCapacity: [] };

  // Outstanding rows only: an already-stamped row belongs to an earlier cycle.
  const journal = await tx.blacklistCascadeAction.findMany({
    where: { entryId: entry.id, entityType: "enrollment", reversedAt: null },
    orderBy: { appliedAt: "asc" },
  });
  if (journal.length === 0) return summary;

  const enrollmentIds = journal.map((j) => j.entityId);
  const courseIds = [...new Set(journal.map((j) => j.courseId))];

  const [rows, courses, liveActive, activeCounts, otherEntries] = await Promise.all([
    tx.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, status: true, courseId: true },
    }),
    tx.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, status: true, centerId: true, teacherId: true, maxStudents: true },
    }),
    // Anything already active for this student in these courses — a manual
    // re-enrollment during the blacklist, which we must never duplicate.
    tx.enrollment.findMany({
      where: { studentId: entry.targetId, courseId: { in: courseIds }, status: "active" },
      select: { id: true, courseId: true },
    }),
    tx.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "active" },
      _count: { _all: true },
    }),
    // Lifting THIS entry must not resurrect an enrollment a DIFFERENT active
    // blacklist still bars (e.g. platform lifted while a center ban stands).
    tx.blacklistEntry.findMany({
      where: { targetId: entry.targetId, isActive: true, id: { not: entry.id } },
      select: { id: true, level: true, centerId: true, imposedById: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const activeCourseIds = new Set(liveActive.map((e) => e.courseId));
  const activeCount = new Map(activeCounts.map((g) => [g.courseId, g._count._all]));

  // Which OTHER active blacklist still bars this course, if any (same scope
  // predicate as assertNotBlacklisted).
  const blockedBy = (course: { centerId: string | null; teacherId: string }) =>
    otherEntries.find(
      (e) =>
        e.level === "platform" ||
        (e.level === "center" && e.centerId !== null && e.centerId === course.centerId) ||
        (e.level === "teacher" && e.imposedById === course.teacherId),
    );

  const restoreIds: string[] = [];
  const stamps: { id: string; reversal: string }[] = [];
  // Obligations handed over to a blacklist that still stands — see below.
  const transfers: { toEntryId: string; row: (typeof journal)[number] }[] = [];

  for (const j of journal) {
    const row = rowById.get(j.entityId);
    const course = courseById.get(j.courseId);
    const blocker = course ? blockedBy(course) : undefined;

    let reversal: string;
    if (!row || !course) {
      reversal = "skipped_missing";
    } else if (row.status === "active") {
      reversal = "skipped_already_active";
    } else if (activeCourseIds.has(j.courseId)) {
      reversal = "skipped_duplicate";
    } else if (course.status !== "active") {
      reversal = "skipped_course_ended";
    } else if (blocker) {
      // Another blacklist still covers this scope, so the student does not get
      // the seat back yet — but the obligation must NOT die here, or lifting
      // that other blacklist later would leave the enrollment gone for good
      // (H-04 all over again). Stamp this row as the audit fact and hand the
      // outstanding removal to the entry that is still blocking it.
      reversal = "skipped_still_blacklisted";
      transfers.push({ toEntryId: blocker.id, row: j });
    } else {
      // The seat was taken from them by a platform action, not given up, so a
      // course that filled up meanwhile does not cost them the seat — but the
      // owner is told, because the course is now over its cap.
      const count = activeCount.get(j.courseId) ?? 0;
      const over = count >= course.maxStudents;
      reversal = over ? "restored_over_capacity" : "restored";
      restoreIds.push(j.entityId);
      // Claim the seat locally so two journal rows for the same course cannot
      // both read the pre-restore count.
      activeCount.set(j.courseId, count + 1);
      activeCourseIds.add(j.courseId);
      if (over) {
        summary.overCapacity.push({
          courseId: course.id,
          courseTitle: course.title,
          centerId: course.centerId,
          teacherId: course.teacherId,
          maxStudents: course.maxStudents,
          activeCount: count + 1,
        });
      }
    }
    stamps.push({ id: j.id, reversal });
  }

  if (restoreIds.length > 0) {
    // Reactivate the ORIGINAL rows — nothing is ever inserted, so a duplicate
    // is structurally impossible (and `enrollments_active_student_course`, the
    // partial unique, is the DB backstop if this logic ever slipped).
    await tx.enrollment.updateMany({
      where: { id: { in: restoreIds } },
      data: { status: "active", unenrolledAt: null },
    });
  }

  // Hand over before stamping, so the blocking entry owns an OPEN row the
  // moment this one closes. `skipDuplicates` covers the case where the blocking
  // entry already journaled the same enrollment itself.
  if (transfers.length > 0) {
    await tx.blacklistCascadeAction.createMany({
      data: transfers.map((t) => ({
        entryId: t.toEntryId,
        targetId: t.row.targetId,
        entityType: t.row.entityType,
        entityId: t.row.entityId,
        centerId: t.row.centerId,
        courseId: t.row.courseId,
        prevStatus: t.row.prevStatus,
      })),
      skipDuplicates: true,
    });
  }

  const now = new Date();
  for (const s of stamps) {
    await tx.blacklistCascadeAction.update({
      where: { id: s.id },
      data: { reversedAt: now, reversal: s.reversal, reversedBy: actorId },
    });
    if (s.reversal.startsWith("restored")) summary.restored++;
    else summary.skipped++;
  }

  return summary;
}

/** Tell the course owner a restore pushed their course over `maxStudents`. */
async function notifyOverCapacity(overCapacity: OverCapacity[], studentId: string) {
  if (overCapacity.length === 0) return;

  const centerIds = [...new Set(overCapacity.map((c) => c.centerId).filter(Boolean))] as string[];
  const admins = centerIds.length
    ? await platformDb((tx) =>
        tx.centerAdminProfile.findMany({
          where: { centerId: { in: centerIds } },
          select: { userId: true, centerId: true },
        }),
      )
    : [];

  for (const c of overCapacity) {
    const recipients = new Set<string>([c.teacherId]);
    for (const a of admins) if (a.centerId === c.centerId) recipients.add(a.userId);
    await notify({
      recipients: [...recipients],
      type: "enrollment_restored_over_capacity",
      title: "Course is over capacity",
      body: `A blacklisted student was restored to "${c.courseTitle}", which now has ${c.activeCount} active students against a limit of ${c.maxStudents}.`,
      data: {
        courseId: c.courseId,
        studentId,
        activeCount: c.activeCount,
        maxStudents: c.maxStudents,
      },
    });
  }
}

export async function assertNotBlacklisted(
  studentId: string,
  centerId: string | null, // NULL for teacher-direct courses — center-level check skipped
  teacherId?: string,
): Promise<void> {
  await platformDb(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: studentId }, select: { status: true } });
    if (user?.status === "blacklisted") {
      throw new ForbiddenError("Student is blacklisted from the platform");
    }
    const entries = await tx.blacklistEntry.findMany({
      where: { targetId: studentId, isActive: true },
      select: { level: true, centerId: true, imposedById: true },
    });
    for (const e of entries) {
      if (e.level === "platform") throw new ForbiddenError("Student is blacklisted from the platform");
      if (e.level === "center" && e.centerId === centerId) {
        throw new ForbiddenError("Student is blacklisted at this center");
      }
      if (e.level === "teacher" && teacherId && e.imposedById === teacherId) {
        throw new ForbiddenError("Student is blacklisted by this teacher");
      }
    }
  });
}

export async function platformBlacklistUser(targetId: string, reason: string, adminId: string) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const { entry, target } = await platformDb(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, status: true } });
    if (!target) throw new NotFoundError("User not found");
    const existing = await tx.blacklistEntry.findFirst({
      where: { targetId, level: "platform", isActive: true },
    });
    if (existing) throw new ConflictError("User is already platform-blacklisted");

    await tx.user.update({ where: { id: targetId }, data: { status: "blacklisted" } });
    // The entry is created BEFORE the cascade: its id is what the journal keys
    // on, and the whole thing is one transaction anyway.
    const entry = await tx.blacklistEntry.create({
      data: { targetId, level: "platform", imposedById: adminId, reason },
    });
    await applyEnrollmentCascade(tx, entry.id, targetId, { level: "platform" });
    return { entry, target };
  }, { actorId: adminId });

  await notify({
    recipients: [target.id],
    type: "blacklist_action",
    title: "Account suspended",
    body: `Your account has been blacklisted. Reason: ${reason}`,
    data: { level: "platform", reason },
  });
  return entry;
}

export async function centerBlacklistStudent(studentId: string, reason: string, admin: SessionUser) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const centerId = admin.centerId as string;
  const entry = await platformDb(async (tx) => {
    const roster = await tx.centerStudentRoster.findFirst({
      where: { centerId, studentId, leftAt: null },
    });
    if (!roster) throw new NotFoundError("Student is not in this center's roster");

    const existing = await tx.blacklistEntry.findFirst({
      where: { targetId: studentId, level: "center", centerId, isActive: true },
    });
    if (existing) throw new ConflictError("Student is already blacklisted at this center");

    await tx.centerStudentRoster.update({
      where: { id: roster.id },
      data: { blacklisted: true, blacklistReason: reason, blacklistedAt: new Date(), blacklistedBy: admin.id },
    });
    const entry = await tx.blacklistEntry.create({
      data: { targetId: studentId, level: "center", centerId, imposedById: admin.id, reason },
    });
    // Scoped to THIS center: a ban that leaves the student attending the very
    // center that banned them is not a ban. Reversible via the journal.
    await applyEnrollmentCascade(tx, entry.id, studentId, { level: "center", centerId });
    return entry;
  }, { actorId: admin.id });

  await notify({
    recipients: [studentId],
    type: "blacklist_action",
    title: "Blocked from a center",
    body: `You have been blocked from booking at a center. Reason: ${reason}`,
    data: { level: "center", centerId, reason },
  });
  return entry;
}

export async function teacherBlacklistStudent(studentId: string, reason: string, teacher: SessionUser) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const entry = await platformDb(async (tx) => {
    const existing = await tx.blacklistEntry.findFirst({
      where: { targetId: studentId, level: "teacher", imposedById: teacher.id, isActive: true },
    });
    if (existing) throw new ConflictError("You have already blacklisted this student");
    const entry = await tx.blacklistEntry.create({
      data: { targetId: studentId, level: "teacher", imposedById: teacher.id, reason },
    });
    // Scoped to THIS teacher's courses — other teachers at the same center, and
    // the student's own teacher-direct courses elsewhere, are untouched.
    await applyEnrollmentCascade(tx, entry.id, studentId, { level: "teacher", teacherId: teacher.id });
    return entry;
  }, { actorId: teacher.id });

  await notify({
    recipients: [studentId],
    type: "blacklist_action",
    title: "Blocked by a teacher",
    body: `You have been blocked from booking a teacher's lessons. Reason: ${reason}`,
    data: { level: "teacher", teacherId: teacher.id, reason },
  });
  return entry;
}

export async function removeBlacklistEntry(entryId: string, user: SessionUser, reason?: string) {
  const { updated, summary, targetId } = await platformDb(async (tx) => {
    const entry = await tx.blacklistEntry.findUnique({ where: { id: entryId } });
    if (!entry || !entry.isActive) throw new NotFoundError("Active blacklist entry not found");

    if (entry.level === "platform") {
      if (user.role !== "super_admin") throw new ForbiddenError("Only super_admin can lift a platform blacklist");
    } else if (entry.level === "center") {
      if (user.role !== "super_admin" && !(user.role === "center_admin" && user.centerId === entry.centerId)) {
        throw new ForbiddenError("Not authorized to lift this center blacklist");
      }
    } else if (entry.level === "teacher") {
      if (user.role !== "super_admin" && !(user.role === "teacher" && user.id === entry.imposedById)) {
        throw new ForbiddenError("Not authorized to lift this teacher blacklist");
      }
    }

    if (entry.level === "platform") {
      await tx.user.update({ where: { id: entry.targetId }, data: { status: "active" } });
    } else if (entry.level === "center" && entry.centerId) {
      await tx.centerStudentRoster.updateMany({
        where: { centerId: entry.centerId, studentId: entry.targetId },
        data: { blacklisted: false, blacklistReason: null, blacklistedAt: null, blacklistedBy: null },
      });
    }

    // Deactivate the entry BEFORE replaying the journal, so the "is this scope
    // still barred by another blacklist" test cannot see the entry being lifted.
    const updated = await tx.blacklistEntry.update({
      where: { id: entryId },
      data: {
        isActive: false,
        removedAt: new Date(),
        removedBy: user.id,
        reason: reason ? `${entry.reason} | removed: ${reason}` : entry.reason,
      },
    });
    const summary = await reverseEnrollmentCascade(tx, entry, user.id);
    return { updated, summary, targetId: entry.targetId };
  }, { actorId: user.id });

  if (summary.restored > 0) {
    await notify({
      recipients: [targetId],
      type: "blacklist_action",
      title: "Block lifted",
      body: `A block on your account was lifted and ${summary.restored} enrollment(s) were restored.`,
      data: { entryId, restored: summary.restored, skipped: summary.skipped },
    });
  }
  await notifyOverCapacity(summary.overCapacity, targetId);

  return updated;
}

export function listPlatformBlacklist() {
  return platformDb((tx) => tx.blacklistEntry.findMany({ orderBy: { createdAt: "desc" } }));
}

export function listCenterBlacklist(centerId: string) {
  return platformDb((tx) =>
    tx.blacklistEntry.findMany({
      where: { level: "center", centerId, isActive: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}

export function listTeacherBlacklist(teacherId: string) {
  return platformDb((tx) =>
    tx.blacklistEntry.findMany({
      where: { level: "teacher", imposedById: teacherId, isActive: true },
      orderBy: { createdAt: "desc" },
    }),
  );
}
