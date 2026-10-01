import { platformDb } from "../../db/scope";
import { exactQuery } from "@repo/database/search-text";
import { NotFoundError } from "../../errors/classes";
import type { Prisma } from "@repo/database";
import { parsePageLimit } from "../../validation/common";

const STATUSES = new Set(["pending", "accepted", "rejected", "cancelled", "expired"]);
const INITIATORS = new Set(["teacher", "center"]);

export async function listCollaborationRequests(filters: {
  q?: string;
  status?: string;
  initiator?: string;
  page?: string;
  limit?: string;
}) {
  const { page, limit } = parsePageLimit(filters, 20);

  return platformDb(async (tx) => {
    const where: Prisma.CollaborationRequestWhereInput = {};
    if (filters.status && STATUSES.has(filters.status)) where.status = filters.status as never;
    if (filters.initiator && INITIATORS.has(filters.initiator)) {
      where.initiator = filters.initiator as never;
    }
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      const [teachers, centers] = await Promise.all([
        tx.user.findMany({
          where: {
            role: "teacher",
            AND: exactQuery(q, (t) => ({ searchText: { contains: t } })),
          },
          select: { id: true },
          take: 500,
        }),
        tx.center.findMany({
          where: { AND: exactQuery(q, (t) => ({ searchText: { contains: t } })) },
          select: { id: true },
          take: 500,
        }),
      ]);

      where.OR = [
        { teacherId: { in: teachers.map((t) => t.id) } },
        { centerId: { in: centers.map((c) => c.id) } },
      ];
    }

    const [rows, total] = await Promise.all([
      tx.collaborationRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.collaborationRequest.count({ where }),
    ]);

    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const centerIds = [...new Set(rows.map((r) => r.centerId))];
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const [teachers, centers, subjects] = await Promise.all([
      tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }),
      tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } }),
      tx.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, nameEn: true, nameAr: true },
      }),
    ]);
    const tMap = new Map(teachers.map((x) => [x.id, x.name]));
    const cMap = new Map(centers.map((x) => [x.id, x.name]));
    const sMap = new Map(subjects.map((x) => [x.id, x.nameEn ?? x.nameAr]));

    return {
      data: rows.map((r) => ({
        ...r,
        teacherName: tMap.get(r.teacherId) ?? null,
        centerName: cMap.get(r.centerId) ?? null,
        subjectName: sMap.get(r.subjectId) ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

export async function getCollaborationRequest(id: string) {
  return platformDb(async (tx) => {
    const r = await tx.collaborationRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundError("Collaboration request not found");
    const [teacher, center, subject, grade, course, affiliation] = await Promise.all([
      tx.user.findUnique({ where: { id: r.teacherId }, select: { id: true, name: true, email: true } }),
      tx.center.findUnique({ where: { id: r.centerId }, select: { id: true, name: true } }),
      tx.subject.findUnique({ where: { id: r.subjectId }, select: { nameEn: true, nameAr: true } }),
      tx.gradeLevel.findUnique({ where: { id: r.gradeLevelId }, select: { nameEn: true, nameAr: true } }),
      r.courseId
        ? tx.course.findUnique({ where: { id: r.courseId }, select: { id: true, title: true, status: true } })
        : null,
      r.affiliationId
        ? tx.centerTeacherAffiliation.findUnique({
            where: { id: r.affiliationId },
            select: { id: true, status: true, centerShare: true },
          })
        : null,
    ]);
    return { ...r, teacher, center, subject, grade, course, affiliation };
  });
}
