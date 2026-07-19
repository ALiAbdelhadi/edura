import { platformDb } from "../../db/scope";
import { NotFoundError, ForbiddenError, BusinessRuleError, ConflictError } from "../../errors/classes";
import { notify } from "../notifications/notify";
import type { SessionUser } from "../../auth/types";


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
    await tx.enrollment.updateMany({
      where: { studentId: targetId, status: "active" },
      data: { status: "unenrolled", unenrolledAt: new Date() },
    });
    const entry = await tx.blacklistEntry.create({
      data: { targetId, level: "platform", imposedById: adminId, reason },
    });
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
    return tx.blacklistEntry.create({
      data: { targetId: studentId, level: "center", centerId, imposedById: admin.id, reason },
    });
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
    return tx.blacklistEntry.create({
      data: { targetId: studentId, level: "teacher", imposedById: teacher.id, reason },
    });
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
  return platformDb(async (tx) => {
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

    return tx.blacklistEntry.update({
      where: { id: entryId },
      data: { isActive: false, removedAt: new Date(), removedBy: user.id, reason: reason ? `${entry.reason} | removed: ${reason}` : entry.reason },
    });
  }, { actorId: user.id });
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
