import { Prisma } from "@repo/database";
import { platformDb } from "../../db/scope";
import { exactQuery, searchTerms } from "@repo/database/search-text";
import { NotFoundError, BusinessRuleError, ConflictError } from "../../errors/classes";
import { isUniqueViolation } from "../../errors/prisma";
import {
  AFFILIATION_ONE_LIVE,
  PARENT_LINK_ONE_LIVE,
} from "../../db/unique-indexes";
import { notifyAfterCommit } from "../../services/notifications/notify";
import { parsePageLimit, type PageLimitInput } from "../../validation/common";
import { writeAdminAudit } from "../../audit/admin-audit";

export function countPendingRegistrations() {
  return platformDb(async (tx) => {
    const [centers, teachers] = await Promise.all([
      tx.center.count({ where: { status: "pending" } }),
      tx.user.count({ where: { role: "teacher", status: "pending" } }),
    ]);
    return { centers, teachers, total: centers + teachers };
  });
}

/**
 * The registrations queue: centers and teachers awaiting (or already given) a
 * decision, both halves paged by the SAME `page`/`limit`.
 *
 * The centers half used to have no bound at all, so the "active" tab returned
 * every active center on the platform in one response; the teachers half had a
 * bare `take: 200`, which is a silent truncation -- the screen showed 200 rows
 * and said nothing about the rest. Both now page, and both report their own
 * total so the screen can say which slice it is showing.
 *
 * One shared page across two lists is deliberate: this is a triage screen whose
 * two halves drain together, and a page past the end of one half simply renders
 * that section empty.
 */
export function listRegistrations(
  status: "pending" | "active" | "rejected" = "pending",
  paging: PageLimitInput = {},
) {
  const { page, limit, skip, take } = parsePageLimit(paging, 20);
  return platformDb(async (tx) => {
    const wantsTeachers = status === "pending" || status === "active";
    const teacherWhere = {
      role: "teacher",
      status: status === "pending" ? "pending" : "active",
    } as const;

    const [centers, centersTotal, teachers, teachersTotal] = await Promise.all([
      tx.center.findMany({
        where: { status },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      tx.center.count({ where: { status } }),
      wantsTeachers
        ? tx.user.findMany({
            where: teacherWhere,
            select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            skip,
            take,
          })
        : [],
      wantsTeachers ? tx.user.count({ where: teacherWhere }) : 0,
    ]);

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

    return {
      centers: centers.map((c) => ({ ...c, admins: adminsByCenter.get(c.id) ?? [] })),
      teachers,
      centersTotal,
      teachersTotal,
      page,
      limit,
    };
  });
}

export function listCenters(filters: {
  status?: string;
  q?: string;
  page?: string;
  limit?: string;
  take?: number;
}) {
  const { page, limit, skip, take } = parsePageLimit(
    { page: filters.page, limit: filters.limit ?? filters.take },
    50,
  );
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    const q = filters.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { shortId: { contains: q, mode: "insensitive" } },
      ];
    }
    const [data, total] = await Promise.all([
      tx.center.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      tx.center.count({ where }),
    ]);
    return { data, total, page, limit };
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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "center.approved",
      targetType: "center",
      targetId: centerId,
      centerId,
      before: { status: center.status },
      after: { status: "active" },
    });
    return { center, adminUserIds };
  }, { actorId: adminId });

  await notifyAfterCommit({
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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "center.rejected",
      targetType: "center",
      targetId: centerId,
      centerId,
      before: { status: center.status },
      after: { status: "rejected", reason },
    });
    return { center, adminUserIds };
  }, { actorId: adminId });

  await notifyAfterCommit({
    recipients: adminUserIds,
    type: "registration_rejected",
    title: "Registration not approved",
    body: `Your center "${center.name}" registration was not approved. Reason: ${reason}`,
    data: { centerId, reason },
  });
  return { id: centerId, status: "rejected" };
}

export function listTeachers(filters: {
  q?: string;
  status?: string;
  mode?: string;
  page?: string;
  limit?: string;
}) {
  const { page, limit } = parsePageLimit(filters, 20);
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = { role: "teacher" };
    if (filters.status) where.status = filters.status;
    if (filters.mode) where.teacherProfile = { is: { attendanceMode: filters.mode } };
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.AND = exactQuery(q, (t) => ({ searchText: { contains: t } }));
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

    // Live centre affiliations ride along: linking and unlinking a centre are
    // administrative overrides, and an operator cannot judge one without
    // seeing where the teacher already teaches.
    const affiliations = rows.length
      ? await tx.centerTeacherAffiliation.findMany({
          where: { teacherId: { in: rows.map((r) => r.id) }, status: { in: ["pending", "active"] } },
          select: { teacherId: true, centerId: true, status: true },
        })
      : [];
    const centerIds = [...new Set(affiliations.map((a) => a.centerId))];
    const centers = centerIds.length
      ? await tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } })
      : [];
    const centerName = new Map(centers.map((c) => [c.id, c.name]));
    const byTeacher = new Map<string, { centerId: string; name: string | null; status: string }[]>();
    for (const a of affiliations) {
      const list = byTeacher.get(a.teacherId) ?? [];
      list.push({ centerId: a.centerId, name: centerName.get(a.centerId) ?? null, status: a.status });
      byTeacher.set(a.teacherId, list);
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        status: r.status,
        createdAt: r.createdAt,
        attendanceMode: r.teacherProfile?.attendanceMode ?? null,
        centers: byTeacher.get(r.id) ?? [],
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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "teacher.attendance_mode_changed",
      targetType: "teacher",
      targetId: teacherUserId,
      before: { attendanceMode: profile.attendanceMode },
      after: { attendanceMode: mode, from: profile.attendanceMode, to: mode },
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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "teacher.approved",
      targetType: "teacher",
      targetId: teacherUserId,
      before: { status: u.status },
      after: { status: "active" },
    });
  }, { actorId: adminId });

  await notifyAfterCommit({
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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "teacher.rejected",
      targetType: "teacher",
      targetId: teacherUserId,
      before: { status: u.status },
      after: { status: "suspended", reason },
    });
  }, { actorId: adminId });

  await notifyAfterCommit({
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

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const aff = await tx.centerTeacherAffiliation
      .create({
        data: { teacherId: teacherUserId, centerId, status: "active", respondedAt: new Date(), expiresAt },
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err, AFFILIATION_ONE_LIVE)) {
          throw new ConflictError("Teacher is already linked to this center");
        }
        throw err;
      });
    await writeAdminAudit(tx, { id: adminId }, {
      action: "teacher.linked_center",
      targetType: "teacher",
      targetId: teacherUserId,
      centerId,
      before: null,
      after: { centerId, affiliationId: aff.id, status: aff.status },
    });
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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "teacher.unlinked_center",
      targetType: "teacher",
      targetId: teacherUserId,
      centerId,
      before: { affiliationId: aff.id, status: aff.status },
      after: { centerId, affiliationId: aff.id, status: row.status },
    });
    return row;
  }, { actorId: adminId });
}

/**
 * The platform-wide student directory. Paged like every other list screen
 * (`page`/`limit` + a real `total`) rather than by cursor: the shared
 * `useListScreen`/`ListShell` pair the app filters and pages with needs a
 * total, and a cursor cannot answer "how many are there".
 */
export function listStudents(
  filters: { grade?: string; centerId?: string; q?: string } & PageLimitInput,
) {
  const { page, limit, skip, take } = parsePageLimit(filters, 20);
  return platformDb(async (tx) => {
    // Roster membership is an EXISTS, not an IN over ids fetched first: the
    // old shape read every active student of a centre into memory and sent
    // them back as a filter, which grows with the centre forever (M-16).
    //
    // Raw SQL decides WHICH rows; Prisma still shapes them, so the hydrating
    // `in` below is bounded by the page and the returned columns are the ones
    // the screen already had.
    const conds: Prisma.Sql[] = [];
    if (filters.centerId) {
      conds.push(Prisma.sql`EXISTS (
        SELECT 1 FROM center_student_rosters r
         WHERE r.student_id = sp.user_id
           AND r.center_id = ${filters.centerId}::uuid
           AND r.left_at IS NULL)`);
    }
    if (filters.grade) conds.push(Prisma.sql`sp.grade = ${filters.grade}`);
    // The terms come from the shared normalizer, so "احمد" and "أحمد" still
    // find the same child — the matching rule is not restated in SQL.
    for (const term of filters.q?.trim() ? searchTerms(filters.q.trim()) : []) {
      conds.push(Prisma.sql`sp.search_text LIKE ${`%${term}%`}`);
    }
    const whereSql = conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
      : Prisma.empty;

    const [idRows, countRows] = await Promise.all([
      tx.$queryRaw<{ id: string }[]>`
        SELECT sp.id
          FROM student_profiles sp
          ${whereSql}
         ORDER BY sp.created_at DESC, sp.id DESC
         LIMIT ${take} OFFSET ${skip}`,
      tx.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM student_profiles sp ${whereSql}`,
    ]);

    const total = Number(countRows[0]?.n ?? 0);
    if (idRows.length === 0) return { data: [], total, page, limit };

    const rows = await tx.studentProfile.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, userId: true, fullName: true, phone: true, grade: true, entityType: true, pointsBalance: true, createdAt: true },
    });
    return { data: rows, total, page, limit };
  });
}

export function getStudent(studentProfileId: string) {
  return platformDb(async (tx) => {
    const student = await tx.studentProfile.findUnique({ where: { id: studentProfileId } });
    if (!student) throw new NotFoundError("Student not found");
    const [enrollments, parents, blacklist] = await Promise.all([
      tx.enrollment.count({ where: { studentId: student.userId ?? "", status: "active" } }),
      student.userId
        ? tx.parentStudentLink.findMany({
            where: { studentId: student.userId, status: "approved" },
            // The LINK id, not just the parent's: unlinkParent is addressed by
            // the link, so a caller given only parentId cannot undo the link it
            // is looking at.
            select: { id: true, parentId: true },
          })
        : Promise.resolve([]),
      student.userId
        ? tx.blacklistEntry.findMany({ where: { targetId: student.userId, isActive: true }, select: { level: true, reason: true } })
        : Promise.resolve([]),
    ]);

    const parentUsers = parents.length
      ? await tx.user.findMany({
          where: { id: { in: parents.map((p) => p.parentId) } },
          select: { id: true, name: true, email: true, phone: true },
        })
      : [];
    const byId = new Map(parentUsers.map((u) => [u.id, u]));

    return {
      student,
      activeEnrollments: enrollments,
      parentIds: parents.map((p) => p.parentId),
      parentLinks: parents.map((p) => ({
        linkId: p.id,
        parentId: p.parentId,
        name: byId.get(p.parentId)?.name ?? null,
        email: byId.get(p.parentId)?.email ?? null,
        phone: byId.get(p.parentId)?.phone ?? null,
      })),
      blacklist,
    };
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
      await writeAdminAudit(tx, { id: adminId }, {
        action: "student.linked_parent",
        targetType: "student",
        targetId: studentUserId,
        before: { linkId: existing.id, status: existing.status },
        after: { parentId: parentUserId, linkId: row.id, status: row.status },
      });
      return row;
    }
    const row = await tx.parentStudentLink
      .create({
        data: { studentId: studentUserId, parentId: parentUserId, status: "approved", initiatedBy: "parent" },
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err, PARENT_LINK_ONE_LIVE)) {
          throw new ConflictError("Parent is already linked to this student");
        }
        throw err;
      });
    await writeAdminAudit(tx, { id: adminId }, {
      action: "student.linked_parent",
      targetType: "student",
      targetId: studentUserId,
      before: null,
      after: { parentId: parentUserId, linkId: row.id, status: row.status },
    });
    return row;
  }, { actorId: adminId });
}

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
    await writeAdminAudit(tx, { id: adminId }, {
      action: "student.unlinked_parent",
      targetType: "student",
      targetId: link.studentId,
      before: { linkId: link.id, status: link.status },
      after: { parentId: link.parentId, linkId: link.id, status: row.status },
    });
    return row;
  }, { actorId: adminId });
}

export function updateUserStatus(userId: string, status: "active" | "suspended", adminId: string) {
  return platformDb(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user) throw new NotFoundError("User not found");
    if (user.status === "blacklisted") throw new BusinessRuleError("Lift the blacklist first");
    const row = await tx.user.update({ where: { id: userId }, data: { status } });
    await writeAdminAudit(tx, { id: adminId }, {
      action: "user.status_changed",
      targetType: "user",
      targetId: userId,
      before: { status: user.status },
      after: { status },
    });
    return { id: userId, status: row.status };
  }, { actorId: adminId });
}

export function notificationsHistory(filters: { type?: string; take?: number; cursor?: string }) {
  const { take } = parsePageLimit({ limit: filters.take }, 50);
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
