import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError, ConflictError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";

/**
 * Super-admin platform surface (PRD §4.2) + registration-approval flow (§5.2).
 * super_admin ONLY — routes guard with requireRole("super_admin"). Runs under
 * platformDb (cross-tenant is legitimate for the platform operator); the
 * app-layer role guard is the authorization boundary.
 *
 * Every approve/reject/link/toggle writes an explicit audit_logs row (the action
 * string is the PRD's, e.g. 'center.approved') in addition to the generic
 * audit-extension entry, so the platform action is unambiguous in the log.
 */

async function audit(
  tx: TenantTx,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  after?: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: { actorId, action, targetType, targetId, afterState: (after ?? {}) as never },
  });
}

// ---------------------------------------------------------------------------
// §5.2 Registration approval queue
// ---------------------------------------------------------------------------
export function listRegistrations(status: "pending" | "active" | "rejected" = "pending") {
  return platformDb(async (tx) => {
    const centers = await tx.center.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
    });
    const centerIds = centers.map((c) => c.id);
    const admins = centerIds.length
      ? await tx.centerAdminProfile.findMany({
          where: { centerId: { in: centerIds } },
          select: { centerId: true, userId: true },
        })
      : [];
    const adminUsers = admins.length
      ? await tx.user.findMany({
          where: { id: { in: admins.map((a) => a.userId) } },
          select: { id: true, name: true, email: true, phone: true, status: true },
        })
      : [];
    const userById = new Map(adminUsers.map((u) => [u.id, u]));
    const adminsByCenter = new Map<string, typeof adminUsers>();
    for (const a of admins) {
      const u = userById.get(a.userId);
      if (!u) continue;
      const list = adminsByCenter.get(a.centerId) ?? [];
      list.push(u);
      adminsByCenter.set(a.centerId, list);
    }

    // Pending teachers (self-registered, awaiting approval).
    const teachers =
      status === "pending" || status === "active"
        ? await tx.user.findMany({
            where: { role: "teacher", status: status === "pending" ? "pending" : "active" },
            select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : [];

    return {
      centers: centers.map((c) => ({ ...c, admins: adminsByCenter.get(c.id) ?? [] })),
      teachers,
    };
  });
}

// ---------------------------------------------------------------------------
// §4.2 Centers
// ---------------------------------------------------------------------------
export function listCenters(filters: { status?: string; take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, filters.take ?? 50));
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    const rows = await tx.center.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take].id : null;
    return { data: rows.slice(0, take), nextCursor };
  });
}

export function getCenter(id: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id } });
    if (!center) throw new NotFoundError("Center not found");
    const admins = await tx.centerAdminProfile.findMany({ where: { centerId: id }, select: { userId: true } });
    const [teacherCount, studentCount, courseCount] = await Promise.all([
      tx.centerTeacherAffiliation.count({ where: { centerId: id, status: "active" } }),
      tx.centerStudentRoster.count({ where: { centerId: id, leftAt: null } }),
      tx.course.count({ where: { centerId: id } }),
    ]);
    return { center, adminUserIds: admins.map((a) => a.userId), teacherCount, studentCount, courseCount };
  });
}

export async function approveCenter(centerId: string, adminId: string) {
  const { center, adminUserIds } = await platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id: centerId } });
    if (!center) throw new NotFoundError("Center not found");
    if (center.status !== "pending") throw new BusinessRuleError(`Center is already ${center.status}`);

    await tx.center.update({ where: { id: centerId }, data: { status: "active" } });
    const admins = await tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } });
    const adminUserIds = admins.map((a) => a.userId);
    if (adminUserIds.length) {
      await tx.user.updateMany({ where: { id: { in: adminUserIds }, status: "pending" }, data: { status: "active" } });
    }
    await audit(tx, adminId, "center.approved", "center", centerId, { status: "active" });
    return { center, adminUserIds };
  }, { actorId: adminId });

  await notify({
    recipients: adminUserIds,
    type: "registration_approved",
    title: "Registration approved",
    body: `Your center "${center.name}" has been approved. You can now sign in.`,
    data: { centerId, entity: "center" },
  });
  return { id: centerId, status: "active" };
}

export async function rejectCenter(centerId: string, reason: string, adminId: string) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const { center, adminUserIds } = await platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id: centerId } });
    if (!center) throw new NotFoundError("Center not found");
    if (center.status !== "pending") throw new BusinessRuleError(`Center is already ${center.status}`);

    await tx.center.update({ where: { id: centerId }, data: { status: "rejected" } });
    const admins = await tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } });
    const adminUserIds = admins.map((a) => a.userId);
    if (adminUserIds.length) {
      await tx.user.updateMany({ where: { id: { in: adminUserIds } }, data: { status: "suspended" } });
    }
    // Record kept for audit (PRD §5.2 step 4b) — not deleted.
    await audit(tx, adminId, "center.rejected", "center", centerId, { status: "rejected", reason });
    return { center, adminUserIds };
  }, { actorId: adminId });

  await notify({
    recipients: adminUserIds,
    type: "registration_rejected",
    title: "Registration not approved",
    body: `Your center "${center.name}" registration was not approved. Reason: ${reason}`,
    data: { centerId, reason },
  });
  return { id: centerId, status: "rejected" };
}

export async function blacklistCenter(centerId: string, reason: string, adminId: string) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const { center, adminUserIds } = await platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id: centerId } });
    if (!center) throw new NotFoundError("Center not found");
    if (center.status === "blacklisted") throw new ConflictError("Center is already blacklisted");
    await tx.center.update({ where: { id: centerId }, data: { status: "blacklisted" } });
    const admins = await tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } });
    const adminUserIds = admins.map((a) => a.userId);
    if (adminUserIds.length) {
      await tx.user.updateMany({ where: { id: { in: adminUserIds } }, data: { status: "suspended" } });
    }
    await audit(tx, adminId, "center.blacklisted", "center", centerId, { status: "blacklisted", reason });
    return { center, adminUserIds };
  }, { actorId: adminId });

  await notify({
    recipients: adminUserIds,
    type: "blacklist_action",
    title: "Center suspended",
    body: `Your center "${center.name}" has been blacklisted. Reason: ${reason}`,
    data: { centerId, level: "platform", reason },
  });
  return { id: centerId, status: "blacklisted" };
}

export async function toggleCenter(centerId: string, adminId: string) {
  const updated = await platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id: centerId } });
    if (!center) throw new NotFoundError("Center not found");
    if (!["active", "suspended"].includes(center.status)) {
      throw new BusinessRuleError(`Cannot toggle a center in status '${center.status}'`);
    }
    const next = center.status === "active" ? "suspended" : "active";
    const row = await tx.center.update({ where: { id: centerId }, data: { status: next } });
    // Keep admin logins in sync with the center's enabled state.
    const admins = await tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } });
    if (admins.length) {
      await tx.user.updateMany({
        where: { id: { in: admins.map((a) => a.userId) } },
        data: { status: next === "active" ? "active" : "suspended" },
      });
    }
    await audit(tx, adminId, "center.toggled", "center", centerId, { status: next });
    return row;
  }, { actorId: adminId });
  return { id: centerId, status: updated.status };
}

// ---------------------------------------------------------------------------
// §4.2 Teachers
// ---------------------------------------------------------------------------
export function listTeachers(filters: { status?: string; take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, filters.take ?? 50));
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = { role: "teacher" };
    if (filters.status) where.status = filters.status;
    const rows = await tx.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take].id : null;
    return { data: rows.slice(0, take), nextCursor };
  });
}

export async function approveTeacher(teacherUserId: string, adminId: string) {
  await platformDb(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: teacherUserId }, select: { role: true, status: true } });
    if (!u || u.role !== "teacher") throw new NotFoundError("Teacher not found");
    if (u.status !== "pending") throw new BusinessRuleError(`Teacher is already ${u.status}`);
    await tx.user.update({ where: { id: teacherUserId }, data: { status: "active" } });
    await audit(tx, adminId, "teacher.approved", "teacher", teacherUserId, { status: "active" });
  }, { actorId: adminId });

  await notify({
    recipients: [teacherUserId],
    type: "registration_approved",
    title: "Registration approved",
    body: "Your teacher account has been approved. You can now sign in.",
    data: { entity: "teacher" },
  });
  return { id: teacherUserId, status: "active" };
}

export async function rejectTeacher(teacherUserId: string, reason: string, adminId: string) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  await platformDb(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: teacherUserId }, select: { role: true, status: true } });
    if (!u || u.role !== "teacher") throw new NotFoundError("Teacher not found");
    if (u.status !== "pending") throw new BusinessRuleError(`Teacher is already ${u.status}`);
    await tx.user.update({ where: { id: teacherUserId }, data: { status: "suspended" } });
    await audit(tx, adminId, "teacher.rejected", "teacher", teacherUserId, { status: "suspended", reason });
  }, { actorId: adminId });

  await notify({
    recipients: [teacherUserId],
    type: "registration_rejected",
    title: "Registration not approved",
    body: `Your teacher account was not approved. Reason: ${reason}`,
    data: { reason },
  });
  return { id: teacherUserId, status: "suspended" };
}

export async function linkTeacherCenter(teacherUserId: string, centerId: string, adminId: string) {
  return platformDb(async (tx) => {
    const [teacher, center] = await Promise.all([
      tx.user.findUnique({ where: { id: teacherUserId }, select: { role: true } }),
      tx.center.findUnique({ where: { id: centerId }, select: { id: true } }),
    ]);
    if (!teacher || teacher.role !== "teacher") throw new NotFoundError("Teacher not found");
    if (!center) throw new NotFoundError("Center not found");

    const existing = await tx.centerTeacherAffiliation.findFirst({
      where: { teacherId: teacherUserId, centerId, status: { in: ["pending", "active"] } },
    });
    if (existing) throw new ConflictError("Teacher is already linked to this center");

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const aff = await tx.centerTeacherAffiliation.create({
      data: { teacherId: teacherUserId, centerId, status: "active", respondedAt: new Date(), expiresAt },
    });
    await audit(tx, adminId, "teacher.linked_center", "teacher", teacherUserId, { centerId });
    return aff;
  }, { actorId: adminId });
}

export async function unlinkTeacherCenter(teacherUserId: string, centerId: string, adminId: string) {
  return platformDb(async (tx) => {
    const aff = await tx.centerTeacherAffiliation.findFirst({
      where: { teacherId: teacherUserId, centerId, status: { in: ["pending", "active"] } },
    });
    if (!aff) throw new NotFoundError("Active affiliation not found");
    const row = await tx.centerTeacherAffiliation.update({
      where: { id: aff.id },
      data: { status: "removed", removedAt: new Date() },
    });
    await audit(tx, adminId, "teacher.unlinked_center", "teacher", teacherUserId, { centerId });
    return row;
  }, { actorId: adminId });
}

// ---------------------------------------------------------------------------
// §4.2 Students
// ---------------------------------------------------------------------------
export function listStudents(filters: { grade?: string; centerId?: string; take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, filters.take ?? 50));
  return platformDb(async (tx) => {
    // If filtering by center, resolve student ids from that center's roster.
    let idFilter: string[] | undefined;
    if (filters.centerId) {
      const roster = await tx.centerStudentRoster.findMany({
        where: { centerId: filters.centerId, leftAt: null },
        select: { studentId: true },
      });
      idFilter = roster.map((r) => r.studentId);
      if (idFilter.length === 0) return { data: [], nextCursor: null };
    }
    const where: Record<string, unknown> = {};
    if (filters.grade) where.grade = filters.grade;
    if (idFilter) where.userId = { in: idFilter };
    const rows = await tx.studentProfile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, fullName: true, phone: true, grade: true, entityType: true, pointsBalance: true, createdAt: true },
    });
    const nextCursor = rows.length > take ? rows[take].id : null;
    return { data: rows.slice(0, take), nextCursor };
  });
}

export function getStudent(studentProfileId: string) {
  return platformDb(async (tx) => {
    const student = await tx.studentProfile.findUnique({ where: { id: studentProfileId } });
    if (!student) throw new NotFoundError("Student not found");
    const [enrollments, parents, blacklist] = await Promise.all([
      tx.enrollment.count({ where: { studentId: student.userId ?? "", status: "active" } }),
      student.userId
        ? tx.parentStudentLink.findMany({ where: { studentId: student.userId, status: "approved" }, select: { parentId: true } })
        : Promise.resolve([]),
      student.userId
        ? tx.blacklistEntry.findMany({ where: { targetId: student.userId, isActive: true }, select: { level: true, reason: true } })
        : Promise.resolve([]),
    ]);
    return { student, activeEnrollments: enrollments, parentIds: parents.map((p) => p.parentId), blacklist };
  });
}

export async function linkParent(studentUserId: string, parentUserId: string, adminId: string) {
  return platformDb(async (tx) => {
    const [student, parent] = await Promise.all([
      tx.user.findUnique({ where: { id: studentUserId }, select: { role: true } }),
      tx.user.findUnique({ where: { id: parentUserId }, select: { role: true } }),
    ]);
    if (!student || student.role !== "student") throw new NotFoundError("Student not found");
    if (!parent || parent.role !== "parent") throw new NotFoundError("Parent not found");

    const existing = await tx.parentStudentLink.findFirst({
      where: { studentId: studentUserId, parentId: parentUserId, status: { in: ["pending", "approved"] } },
    });
    if (existing) {
      if (existing.status === "approved") throw new ConflictError("Parent is already linked to this student");
      const row = await tx.parentStudentLink.update({ where: { id: existing.id }, data: { status: "approved" } });
      await audit(tx, adminId, "student.linked_parent", "student", studentUserId, { parentId: parentUserId });
      return row;
    }
    const row = await tx.parentStudentLink.create({
      data: { studentId: studentUserId, parentId: parentUserId, status: "approved", initiatedBy: "parent" },
    });
    await audit(tx, adminId, "student.linked_parent", "student", studentUserId, { parentId: parentUserId });
    return row;
  }, { actorId: adminId });
}

export async function unlinkParent(linkId: string, adminId: string) {
  return platformDb(async (tx) => {
    const link = await tx.parentStudentLink.findUnique({ where: { id: linkId } });
    if (!link || link.status !== "approved") throw new NotFoundError("Active parent link not found");
    const row = await tx.parentStudentLink.update({
      where: { id: linkId },
      data: { status: "revoked", revokedBy: "parent" },
    });
    await audit(tx, adminId, "student.unlinked_parent", "student", link.studentId, { parentId: link.parentId });
    return row;
  }, { actorId: adminId });
}

// ---------------------------------------------------------------------------
// §4.2 Permissions (read/patch a user's role-status view)
// ---------------------------------------------------------------------------
export function getUserPermissions(userId: string) {
  return platformDb(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, name: true, email: true },
    });
    if (!user) throw new NotFoundError("User not found");
    const centerAdmin = user.role === "center_admin"
      ? await tx.centerAdminProfile.findUnique({ where: { userId }, select: { centerId: true } })
      : null;
    return { ...user, centerId: centerAdmin?.centerId ?? null };
  });
}

export function updateUserStatus(userId: string, status: "active" | "suspended", adminId: string) {
  return platformDb(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user) throw new NotFoundError("User not found");
    if (user.status === "blacklisted") throw new BusinessRuleError("Lift the blacklist first");
    const row = await tx.user.update({ where: { id: userId }, data: { status } });
    await audit(tx, adminId, "user.status_changed", "user", userId, { status });
    return { id: userId, status: row.status };
  }, { actorId: adminId });
}

// ---------------------------------------------------------------------------
// §4.2 Notifications history (platform-wide)
// ---------------------------------------------------------------------------
export function notificationsHistory(filters: { type?: string; take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, filters.take ?? 50));
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.type) where.type = filters.type;
    const rows = await tx.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const nextCursor = rows.length > take ? rows[take].id : null;
    return { data: rows.slice(0, take), nextCursor };
  });
}
