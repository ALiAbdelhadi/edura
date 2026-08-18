import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError, ConflictError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";


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

export function listTeachers(filters: {
  q?: string;
  status?: string;
  mode?: string;
  page?: string;
  limit?: string;
}) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "20", 10) || 20));
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = { role: "teacher" };
    if (filters.status) where.status = filters.status;
    if (filters.mode) where.teacherProfile = { is: { attendanceMode: filters.mode } };
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ];
    }
    const [rows, total] = await Promise.all([
      tx.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          teacherProfile: { select: { attendanceMode: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.user.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        status: r.status,
        createdAt: r.createdAt,
        attendanceMode: r.teacherProfile?.attendanceMode ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

export async function setTeacherAttendanceMode(
  teacherUserId: string,
  mode: "counter_only" | "counter_and_door",
  adminId: string,
) {
  await platformDb(async (tx) => {
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacherUserId },
      select: { userId: true, attendanceMode: true },
    });
    if (!profile) throw new NotFoundError("Teacher not found");
    if (profile.attendanceMode === mode) return;
    await tx.teacherProfile.update({ where: { userId: teacherUserId }, data: { attendanceMode: mode } });
    await audit(tx, adminId, "teacher.attendance_mode_changed", "teacher", teacherUserId, {
      from: profile.attendanceMode,
      to: mode,
    });
  }, { actorId: adminId });
  return { id: teacherUserId, attendanceMode: mode };
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

export function listStudents(filters: { grade?: string; centerId?: string; take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, filters.take ?? 50));
  return platformDb(async (tx) => {
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

/**
 * Revoke a parent-student link.
 *
 * `studentId` is the student named in the REQUEST PATH and is load-bearing, not
 * decoration: the link used to be selected by `linkId` alone, so
 * `DELETE /admin/students/<A>/unlink-parent?linkId=<B's link>` happily revoked
 * B's link and then wrote an audit row for an action whose URL named A. That is
 * not a privilege hole — a super_admin may unlink anything — but it makes the
 * audit trail unable to reconstruct what was intended, and a parent link is
 * exactly what the messaging guardian gate consults for a minor.
 *
 * A mismatch is reported as NOT FOUND rather than forbidden: from the caller's
 * position that link does not exist under that student, and saying so avoids
 * confirming the existence of a link belonging to someone else.
 *
 * NOTE: `revokedBy` is the `link_actor` enum, whose only values are `parent`
 * and `student` — it cannot express "revoked by an admin", so an admin
 * revocation is still recorded as `parent`. Widening that enum is a migration
 * and needs its own approved plan; the `audit_logs` row written below is the
 * accurate record of who acted.
 */
export async function unlinkParent(linkId: string, studentId: string, adminId: string) {
  return platformDb(async (tx) => {
    const link = await tx.parentStudentLink.findUnique({ where: { id: linkId } });
    if (!link || link.status !== "approved") throw new NotFoundError("Active parent link not found");
    if (link.studentId !== studentId) {
      throw new NotFoundError("Active parent link not found");
    }
    const row = await tx.parentStudentLink.update({
      where: { id: linkId },
      data: { status: "revoked", revokedBy: "parent" },
    });
    await audit(tx, adminId, "student.unlinked_parent", "student", link.studentId, { parentId: link.parentId });
    return row;
  }, { actorId: adminId });
}

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
