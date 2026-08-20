import { platformDb } from "@/lib/db/scope";
import {
  matchesSearchTerms,
  narrowQuery,
  searchTerms,
} from "@repo/database/search-text";
import { NotFoundError } from "@/lib/errors/classes";
import type { Prisma } from "@repo/database";

const STATUSES = new Set(["pending", "accepted", "rejected", "cancelled", "expired"]);
const INITIATORS = new Set(["teacher", "center"]);

export async function listCollaborationRequests(filters: {
  q?: string;
  status?: string;
  initiator?: string;
  page?: string;
  limit?: string;
}) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "20", 10) || 20));

  return platformDb(async (tx) => {
    const where: Prisma.CollaborationRequestWhereInput = {};
    if (filters.status && STATUSES.has(filters.status)) where.status = filters.status as never;
    if (filters.initiator && INITIATORS.has(filters.initiator)) {
      where.initiator = filters.initiator as never;
    }
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      const terms = searchTerms(q);

      // These are BOUNDED SUB-QUERIES, not pages, so they get the full
      // two-stage match — narrow in SQL, decide in JS. `contains` is ILIKE,
      // which folds ASCII case and nothing else, so a request could not be
      // found by the name of the teacher or the center on it whenever that name
      // carried a hamza the operator did not type. The 500-row cap that was
      // already here still bounds the read.
      const [teacherRows, centerRows] = await Promise.all([
        tx.user.findMany({
          where: {
            role: "teacher",
            AND: narrowQuery(q, (f) => [
              { name: { contains: f, mode: "insensitive" as const } },
            ]),
          },
          select: { id: true, name: true },
          take: 500,
        }),
        tx.center.findMany({
          where: {
            AND: narrowQuery(q, (f) => [
              { name: { contains: f, mode: "insensitive" as const } },
            ]),
          },
          select: { id: true, name: true },
          take: 500,
        }),
      ]);
      const teachers = teacherRows.filter((t) => matchesSearchTerms([t.name], terms));
      const centers = centerRows.filter((c) => matchesSearchTerms([c.name], terms));

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
