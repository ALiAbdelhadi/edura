import { platformDb } from "../../db/scope";
import { searchTerms } from "@repo/database/search-text";
import { NotFoundError } from "../../errors/classes";
import { Prisma } from "@repo/database";
import { parsePageLimit } from "../../validation/common";

const STATUSES = new Set(["pending", "accepted", "rejected", "cancelled", "expired"]);
const INITIATORS = new Set(["teacher", "center"]);

const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

const DATE_KEYS = ["startDate", "endDate", "respondedAt", "expiresAt", "createdAt", "updatedAt"] as const;

function requestJson(a: string) {
  const ts = (col: string) => Prisma.sql`to_char(${Prisma.raw(`${a}.${col}`)} AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)})`;
  return Prisma.sql`
    'id', ${Prisma.raw(a)}.id,
    'initiator', ${Prisma.raw(a)}.initiator,
    'teacherId', ${Prisma.raw(a)}.teacher_id,
    'centerId', ${Prisma.raw(a)}.center_id,
    'subjectId', ${Prisma.raw(a)}.subject_id,
    'gradeLevelId', ${Prisma.raw(a)}.grade_level_id,
    'trackId', ${Prisma.raw(a)}.track_id,
    'roomId', ${Prisma.raw(a)}.room_id,
    'daysOfWeek', coalesce(${Prisma.raw(a)}.days_of_week, '{}'),
    'startTime', ${Prisma.raw(a)}.start_time,
    'endTime', ${Prisma.raw(a)}.end_time,
    'startDate', ${ts("start_date")},
    'endDate', ${ts("end_date")},
    'expectedStudents', ${Prisma.raw(a)}.expected_students,
    'proposedCenterShare', ${Prisma.raw(a)}.proposed_center_share,
    'proposedPricingMethod', ${Prisma.raw(a)}.proposed_pricing_method,
    'message', ${Prisma.raw(a)}.message,
    'status', ${Prisma.raw(a)}.status,
    'respondedAt', ${ts("responded_at")},
    'respondedBy', ${Prisma.raw(a)}.responded_by,
    'responseNote', ${Prisma.raw(a)}.response_note,
    'courseId', ${Prisma.raw(a)}.course_id,
    'affiliationId', ${Prisma.raw(a)}.affiliation_id,
    'expiresAt', ${ts("expires_at")},
    'createdBy', ${Prisma.raw(a)}.created_by,
    'createdAt', ${ts("created_at")},
    'updatedAt', ${ts("updated_at")}`;
}

function reviveDates<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = { ...row };
  for (const k of DATE_KEYS) {
    const v = out[k];
    out[k] = typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

type RequestJson = Record<string, unknown> & {
  initiator: "teacher" | "center";
  status: "pending" | "accepted" | "rejected" | "cancelled" | "expired";
};

type ListRow = { total: number; data: (RequestJson & { teacherName: string | null; centerName: string | null; subjectName: string | null })[] };

export async function listCollaborationRequests(filters: {
  q?: string;
  status?: string;
  initiator?: string;
  page?: string;
  limit?: string;
}) {
  const { page, limit, skip, take } = parsePageLimit(filters, 20);

  return platformDb(async (tx) => {
    const conds: Prisma.Sql[] = [];
    if (filters.status && STATUSES.has(filters.status)) {
      conds.push(Prisma.sql`cr.status = ${filters.status}::collaboration_status`);
    }
    if (filters.initiator && INITIATORS.has(filters.initiator)) {
      conds.push(Prisma.sql`cr.initiator = ${filters.initiator}::collaboration_initiator`);
    }
    if (filters.q?.trim()) {
      const terms = searchTerms(filters.q.trim());
      const uConds = [Prisma.sql`role = 'teacher'`, Prisma.sql`deleted_at IS NULL`];
      const cConds: Prisma.Sql[] = [];
      for (const t of terms) {
        uConds.push(Prisma.sql`search_text LIKE ${"%" + t + "%"}`);
        cConds.push(Prisma.sql`search_text LIKE ${"%" + t + "%"}`);
      }
      const cWhere = cConds.length ? Prisma.sql`WHERE ${Prisma.join(cConds, " AND ")}` : Prisma.empty;
      conds.push(Prisma.sql`(
        cr.teacher_id IN (SELECT id FROM users WHERE ${Prisma.join(uConds, " AND ")} LIMIT 500)
        OR cr.center_id IN (SELECT id FROM centers ${cWhere} LIMIT 500))`);
    }
    const whereSql = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;

    const [row] = await tx.$queryRaw<ListRow[]>`
      WITH pg AS (
        SELECT cr.*, row_number() OVER (ORDER BY cr.created_at DESC) AS rn
          FROM collaboration_requests cr
          ${whereSql}
         ORDER BY rn
         LIMIT ${take} OFFSET ${skip}
      )
      SELECT
        (SELECT count(*)::int FROM collaboration_requests cr ${whereSql}) AS total,
        (SELECT coalesce(json_agg(json_build_object(
            ${requestJson("pg")},
            'teacherName', (SELECT u.name FROM users u WHERE u.id = pg.teacher_id AND u.deleted_at IS NULL),
            'centerName', (SELECT c.name FROM centers c WHERE c.id = pg.center_id),
            'subjectName', (SELECT coalesce(s.name_en, s.name_ar) FROM subjects s WHERE s.id = pg.subject_id)
          ) ORDER BY pg.rn), '[]'::json)
           FROM pg) AS data`;

    return {
      data: row!.data.map((r) => reviveDates(r) as never as typeof r),
      total: row!.total,
      page,
      limit,
    };
  });
}

export async function getCollaborationRequest(id: string) {
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<{ data: Record<string, unknown> }[]>`
      SELECT json_build_object(
        ${requestJson("r")},
        'teacher', (SELECT json_build_object('id', u.id, 'name', u.name, 'email', u.email) FROM users u WHERE u.id = r.teacher_id),
        'center', (SELECT json_build_object('id', c.id, 'name', c.name) FROM centers c WHERE c.id = r.center_id),
        'subject', (SELECT json_build_object('nameEn', s.name_en, 'nameAr', s.name_ar) FROM subjects s WHERE s.id = r.subject_id),
        'grade', (SELECT json_build_object('nameEn', g.name_en, 'nameAr', g.name_ar) FROM grade_levels g WHERE g.id = r.grade_level_id),
        'course', (SELECT json_build_object('id', co.id, 'title', co.title, 'status', co.status) FROM courses co WHERE co.id = r.course_id),
        'affiliation', (SELECT json_build_object('id', af.id, 'status', af.status, 'centerShare', af.center_share)
                          FROM center_teacher_affiliations af WHERE af.id = r.affiliation_id)
      ) AS data
        FROM collaboration_requests r
       WHERE r.id = ${id}::uuid`;
    if (!row) throw new NotFoundError("Collaboration request not found");
    return reviveDates(row.data);
  });
}
