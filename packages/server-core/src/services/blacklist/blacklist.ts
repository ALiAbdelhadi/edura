import { platformDb } from "../../db/scope";
import { runEffects, type WithEffects, type DeferredEffect } from "../../db/effects";
import { NotFoundError, ForbiddenError, BusinessRuleError, ConflictError } from "../../errors/classes";
import { notify } from "../notifications/notify";
import type { SessionUser } from "../../auth/types";
import type { TenantTx } from "../../db/scope";
import { parsePageLimit, type PageLimitInput } from "../../validation/common";
import { isUniqueViolation } from "../../errors/prisma";
import {
  BLACKLIST_CENTER_ONE_ACTIVE,
  BLACKLIST_PLATFORM_ONE_ACTIVE,
  BLACKLIST_TEACHER_ONE_ACTIVE,
} from "../../db/unique-indexes";

// The findFirst checks above each create stay: they give the sequential case its
// message without a failed insert. The partial unique index is what makes them
// real under a concurrent double-submit, and these rethrow its P2002 as the SAME
// message so the loser reads exactly what the sequential case reads (C-5).
function rethrowAsExisting(index: string, message: string) {
  return (err: unknown): never => {
    if (isUniqueViolation(err, index)) throw new ConflictError(message);
    throw err;
  };
}

type CascadeScope =
  | { level: "platform" }
  | { level: "center"; centerId: string }
  | { level: "teacher"; teacherId: string };

function cascadeWhere(studentId: string, scope: CascadeScope) {
  const base = { studentId, status: "active" as const };
  if (scope.level === "center") return { ...base, centerId: scope.centerId };
  if (scope.level === "teacher") return { ...base, course: { teacherId: scope.teacherId } };
  return base; // platform — everything
}

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

async function reverseEnrollmentCascade(
  tx: TenantTx,
  entry: { id: string; targetId: string },
  actorId: string,
): Promise<ReversalSummary> {
  const summary: ReversalSummary = { restored: 0, skipped: 0, overCapacity: [] };

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
    tx.enrollment.findMany({
      where: { studentId: entry.targetId, courseId: { in: courseIds }, status: "active" },
      select: { id: true, courseId: true },
    }),
    tx.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "active" },
      _count: { _all: true },
    }),
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

  const blockedBy = (course: { centerId: string | null; teacherId: string }) =>
    otherEntries.find(
      (e) =>
        e.level === "platform" ||
        (e.level === "center" && e.centerId !== null && e.centerId === course.centerId) ||
        (e.level === "teacher" && e.imposedById === course.teacherId),
    );

  const restoreIds: string[] = [];
  const stamps: { id: string; reversal: string }[] = [];
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
      reversal = "skipped_still_blacklisted";
      transfers.push({ toEntryId: blocker.id, row: j });
    } else {
      const count = activeCount.get(j.courseId) ?? 0;
      const over = count >= course.maxStudents;
      reversal = over ? "restored_over_capacity" : "restored";
      restoreIds.push(j.entityId);
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
    await tx.enrollment.updateMany({
      where: { id: { in: restoreIds } },
      data: { status: "active", unenrolledAt: null },
    });
  }

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
    const entry = await tx.blacklistEntry
      .create({ data: { targetId, level: "platform", imposedById: adminId, reason } })
      .catch(rethrowAsExisting(BLACKLIST_PLATFORM_ONE_ACTIVE, "User is already platform-blacklisted"));
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

export async function centerBlacklistStudent(
  studentId: string,
  reason: string,
  admin: SessionUser,
  explicitCenterId?: string,
) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  if (explicitCenterId && explicitCenterId !== admin.centerId && admin.role !== "super_admin") {
    throw new ForbiddenError("Not authorized to blacklist at another center");
  }
  const { value, effects } = await platformDb(
    (tx) => centerBlacklistStudentTx(tx, studentId, reason, admin, explicitCenterId),
    { actorId: admin.id },
  );
  await runEffects(effects);
  return value;
}

export async function centerBlacklistStudentTx(
  tx: TenantTx,
  studentId: string,
  reason: string,
  admin: SessionUser,
  explicitCenterId?: string,
) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  if (explicitCenterId && explicitCenterId !== admin.centerId && admin.role !== "super_admin") {
    throw new ForbiddenError("Not authorized to blacklist at another center");
  }
  const centerId = (explicitCenterId ?? admin.centerId) as string;
  if (!centerId) throw new BusinessRuleError("A center is required");
  const entry = await (async () => {
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
    const entry = await tx.blacklistEntry
      .create({
        data: { targetId: studentId, level: "center", centerId, imposedById: admin.id, reason },
      })
      .catch(
        rethrowAsExisting(BLACKLIST_CENTER_ONE_ACTIVE, "Student is already blacklisted at this center"),
      );
    await applyEnrollmentCascade(tx, entry.id, studentId, { level: "center", centerId });
    return entry;
  })();

  return {
    value: entry,
    effects: [
      () =>
        notify({
          recipients: [studentId],
          type: "blacklist_action",
          title: "Blocked from a center",
          body: `You have been blocked from booking at a center. Reason: ${reason}`,
          data: { level: "center", centerId, reason },
        }),
    ],
  };
}

export async function teacherBlacklistStudent(studentId: string, reason: string, teacher: SessionUser) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const entry = await platformDb(async (tx) => {
    const existing = await tx.blacklistEntry.findFirst({
      where: { targetId: studentId, level: "teacher", imposedById: teacher.id, isActive: true },
    });
    if (existing) throw new ConflictError("You have already blacklisted this student");
    const entry = await tx.blacklistEntry
      .create({ data: { targetId: studentId, level: "teacher", imposedById: teacher.id, reason } })
      .catch(rethrowAsExisting(BLACKLIST_TEACHER_ONE_ACTIVE, "You have already blacklisted this student"));
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
  const { value, effects } = await platformDb(
    (tx) => removeBlacklistEntryTx(tx, entryId, user, reason),
    { actorId: user.id },
  );
  await runEffects(effects);
  return value;
}

export async function removeBlacklistEntryTx(
  tx: TenantTx,
  entryId: string,
  user: SessionUser,
  reason?: string,
) {
  const { updated, summary, targetId } = await (async () => {
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
  })();

  const effects: DeferredEffect[] = [];
  if (summary.restored > 0) {
    effects.push(() =>
      notify({
        recipients: [targetId],
        type: "blacklist_action",
        title: "Block lifted",
        body: `A block on your account was lifted and ${summary.restored} enrollment(s) were restored.`,
        data: { entryId, restored: summary.restored, skipped: summary.skipped },
      }),
    );
  }
  effects.push(() => notifyOverCapacity(summary.overCapacity, targetId));

  return { value: updated, effects };
}

/**
 * The whole blacklist ledger, for the back office.
 *
 * Despite the name it deliberately spans every LEVEL -- platform, centre and
 * teacher -- because the super admin's job here is to see bans imposed anywhere
 * and lift the ones that were wrong; `level` narrows it when that is what you
 * want. It also spans lifted entries: an entry is never deleted, and the
 * history of who lifted what is the point of keeping them.
 *
 * Rows carry the target's and the imposer's names, because a screen listing
 * bare uuids cannot be acted on.
 */
export function listPlatformBlacklist(
  filters: { level?: string; active?: boolean } & PageLimitInput = {},
) {
  const { page, limit, skip, take } = parsePageLimit(filters, 25);
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.level) where.level = filters.level;
    if (filters.active !== undefined) where.isActive = filters.active;

    const [rows, total] = await Promise.all([
      tx.blacklistEntry.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.blacklistEntry.count({ where }),
    ]);

    const userIds = [
      ...new Set(rows.flatMap((r) => [r.targetId, r.imposedById, r.removedBy].filter(Boolean))),
    ] as string[];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      data: rows.map((r) => ({
        ...r,
        target: byId.get(r.targetId) ?? null,
        imposedBy: r.imposedById ? (byId.get(r.imposedById) ?? null) : null,
        removedByUser: r.removedBy ? (byId.get(r.removedBy) ?? null) : null,
      })),
      total,
      page,
      limit,
    };
  });
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
