import { platformDb, type TenantTx } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import { teacherStatement } from "../finance/finance-reports";
import { parsePageLimit } from "../../validation/common";
import { Prisma } from "@repo/database";
import { searchTerms } from "@repo/database/search-text";

/**
 * The teacher counterpart of `center-oversight.ts`, and deliberately the same
 * shape: every reader is `platformDb`, takes `PageArgs`, asserts the subject
 * exists first and returns `{ data, total, page, limit }` so the tab
 * components can be written once.
 *
 * The one structural difference is what "belongs to" means. A centre owns rows
 * through `center_id`; a teacher owns them through their COURSES, because
 * `payments`, `enrollments` and `attendance_records` carry no teacher column.
 * `teacherCourseIds` is that join, and it is bounded -- a teacher's course
 * count is small and does not grow with the platform, unlike the student and
 * ledger reads, which page at the database (M-16).
 */

const DEFAULT_LIMIT = 50;

export type PageArgs = { page?: string; limit?: string; from?: string; to?: string };

function paging(args: PageArgs) {
  return parsePageLimit(args, DEFAULT_LIMIT);
}

function dateRange(args: PageArgs): Prisma.DateTimeFilter | undefined {
  if (!args.from && !args.to) return undefined;
  const f: Prisma.DateTimeFilter = {};
  // DIFF-05: a garbage date used to reach Prisma as `Invalid Date` and 500.
  const parse = (v: string) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new BusinessRuleError("Invalid date filter");
    return d;
  };
  if (args.from) f.gte = parse(args.from);
  if (args.to) f.lte = parse(args.to);
  return f;
}

async function assertTeacher(tx: TenantTx, teacherId: string) {
  const teacher = await tx.user.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
  });
  if (!teacher || teacher.deletedAt || teacher.role !== "teacher") {
    throw new NotFoundError("Teacher not found");
  }
  return teacher;
}

async function teacherCourseIds(tx: TenantTx, teacherId: string): Promise<string[]> {
  const rows = await tx.course.findMany({ where: { teacherId }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function userMap(tx: TenantTx, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) {
    return new Map<string, { id: string; name: string; email: string | null; status: string }>();
  }
  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true, status: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

async function courseTitles(tx: TenantTx, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const rows = await tx.course.findMany({
    where: { id: { in: unique } },
    select: { id: true, title: true },
  });
  return new Map(rows.map((c) => [c.id, c.title]));
}

async function centerNames(tx: TenantTx, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const rows = await tx.center.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((c) => [c.id, c.name]));
}

type OverviewTeacher = Omit<
  Prisma.UserGetPayload<{
    select: {
      id: true; name: true; email: true; phone: true; role: true; status: true; locale: true;
      emailVerified: true; twoFactorEnabled: true; isDemo: true; createdAt: true; updatedAt: true; deletedAt: true;
    };
  }>,
  "createdAt" | "updatedAt" | "deletedAt"
> & { createdAt: string; updatedAt: string; deletedAt: string | null };

type OverviewProfile = Omit<Prisma.TeacherProfileGetPayload<object>, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type OverviewRow = {
  teacher: OverviewTeacher | null;
  profile: OverviewProfile | null;
  managedByCenter: Prisma.CenterGetPayload<{ select: { id: true; name: true; status: true } }> | null;
  counts: {
    courses: number;
    activeCourses: number;
    sessions: number;
    students: number;
    activeSubscriptions: number;
    centers: number;
    assistants: number;
    pendingCollaborations: number;
    settlements: number;
  };
};

const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

export function teacherOverview(teacherId: string) {
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<OverviewRow[]>`
      WITH t AS (
        SELECT u.* FROM users u
         WHERE u.id = ${teacherId}::uuid AND u.deleted_at IS NULL AND u.role = 'teacher'
      ), p AS (
        SELECT tp.* FROM teacher_profiles tp JOIN t ON tp.user_id = t.id
      )
      SELECT
        (SELECT json_build_object(
          'id', t.id, 'name', t.name, 'email', t.email, 'phone', t.phone, 'role', t.role,
          'status', t.status, 'locale', t.locale, 'emailVerified', t.email_verified,
          'twoFactorEnabled', t.two_factor_enabled, 'isDemo', t.is_demo,
          'createdAt', to_char(t.created_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}),
          'updatedAt', to_char(t.updated_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}),
          'deletedAt', NULL
        ) FROM t) AS teacher,
        (SELECT json_build_object(
          'id', p.id, 'userId', p.user_id, 'bio', p.bio, 'subjects', coalesce(p.subjects, '{}'),
          'qualifications', p.qualifications, 'experienceYears', p.experience_years,
          'photoUrl', p.photo_url, 'lessonPrice', p.lesson_price, 'ratingAvg', p.rating_avg,
          'ratingCount', p.rating_count, 'walletBalance', p.wallet_balance,
          'certificates', p.certificates, 'onboardingCompleted', p.onboarding_completed,
          'onboardingDraft', p.onboarding_draft, 'attendanceMode', p.attendance_mode,
          'systemStatus', p.system_status, 'accessLevel', p.access_level,
          'managedByCenterId', p.managed_by_center_id, 'dataSource', p.data_source,
          'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}),
          'updatedAt', to_char(p.updated_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)})
        ) FROM p) AS profile,
        (SELECT json_build_object('id', c.id, 'name', c.name, 'status', c.status)
           FROM p JOIN centers c ON c.id = p.managed_by_center_id) AS "managedByCenter",
        json_build_object(
          'courses', (SELECT count(*)::int FROM courses WHERE teacher_id = ${teacherId}::uuid),
          'activeCourses', (SELECT count(*)::int FROM courses
                            WHERE teacher_id = ${teacherId}::uuid AND status = 'active'),
          'sessions', (SELECT count(*)::int FROM sessions s JOIN courses co ON co.id = s.course_id
                       WHERE co.teacher_id = ${teacherId}::uuid),
          'students', (SELECT count(DISTINCT e.student_id)::int FROM enrollments e
                       JOIN courses co ON co.id = e.course_id
                       WHERE co.teacher_id = ${teacherId}::uuid AND e.status = 'active'),
          'activeSubscriptions', (SELECT count(*)::int FROM subscriptions
                                  WHERE teacher_id = ${teacherId}::uuid AND status = 'active'),
          'centers', (SELECT count(*)::int FROM center_teacher_affiliations
                      WHERE teacher_id = ${teacherId}::uuid AND status = 'active' AND removed_at IS NULL),
          'assistants', (SELECT count(*)::int FROM teacher_assistants
                         WHERE teacher_id = ${teacherId}::uuid AND removed_at IS NULL),
          'pendingCollaborations', (SELECT count(*)::int FROM collaboration_requests
                                    WHERE teacher_id = ${teacherId}::uuid AND status = 'pending'),
          'settlements', (SELECT count(*)::int FROM session_settlements
                          WHERE teacher_id = ${teacherId}::uuid)
        ) AS counts`;

    if (!row?.teacher) throw new NotFoundError("Teacher not found");
    const { teacher, profile, managedByCenter, counts } = row;

    return {
      teacher: {
        ...teacher,
        createdAt: new Date(teacher.createdAt),
        updatedAt: new Date(teacher.updatedAt),
        deletedAt: null as Date | null,
      },
      profile: profile
        ? { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt) }
        : null,
      managedByCenter,
      counts,
    };
  });
}

type CentersRow = {
  teacherOk: boolean;
  data: {
    id: string;
    centerId: string;
    centerName: string | null;
    status: Prisma.CenterTeacherAffiliationGetPayload<{ select: { status: true } }>["status"];
    centerShare: number | null;
    dataSource: Prisma.CenterTeacherAffiliationGetPayload<{ select: { dataSource: true } }>["dataSource"];
    invitedAt: string;
    respondedAt: string | null;
    removedAt: string | null;
    expiresAt: string;
    courses: number;
  }[];
};

export function teacherCenters(teacherId: string, args: { includeRemoved?: boolean } = {}) {
  return platformDb(async (tx) => {
    const removedSql = args.includeRemoved ? Prisma.empty : Prisma.sql`AND a.removed_at IS NULL`;
    const iso = (col: string) =>
      Prisma.sql`to_char(${Prisma.raw(col)} AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)})`;

    const [row] = await tx.$queryRaw<CentersRow[]>`
      SELECT
        EXISTS (SELECT 1 FROM users WHERE id = ${teacherId}::uuid
                 AND deleted_at IS NULL AND role = 'teacher') AS "teacherOk",
        (SELECT coalesce(json_agg(json_build_object(
            'id', a.id, 'centerId', a.center_id, 'centerName', ce.name,
            'status', a.status, 'centerShare', a.center_share, 'dataSource', a.data_source,
            'invitedAt', ${iso("a.invited_at")},
            'respondedAt', ${iso("a.responded_at")},
            'removedAt', ${iso("a.removed_at")},
            'expiresAt', ${iso("a.expires_at")},
            'courses', (SELECT COUNT(*)::int FROM courses c
                         WHERE c.teacher_id = ${teacherId}::uuid AND c.center_id = a.center_id)
          ) ORDER BY a.created_at DESC), '[]'::json)
           FROM center_teacher_affiliations a
           LEFT JOIN centers ce ON ce.id = a.center_id
          WHERE a.teacher_id = ${teacherId}::uuid ${removedSql}) AS data`;

    if (!row?.teacherOk) throw new NotFoundError("Teacher not found");

    const date = (v: string | null) => (v === null ? null : new Date(v));
    return {
      data: row.data.map((a) => ({
        ...a,
        invitedAt: new Date(a.invitedAt),
        respondedAt: date(a.respondedAt),
        removedAt: date(a.removedAt),
        expiresAt: new Date(a.expiresAt),
      })),
      total: row.data.length,
    };
  });
}

export function teacherAssistants(teacherId: string, args: { includeRemoved?: boolean } = {}) {
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const rows = await tx.teacherAssistant.findMany({
      where: { teacherId, ...(args.includeRemoved ? {} : { removedAt: null }) },
      orderBy: { createdAt: "desc" },
    });
    const users = await userMap(tx, rows.map((r) => r.assistantId));
    return {
      data: rows.map((a) => ({
        id: a.id,
        assistantId: a.assistantId,
        assistantName: users.get(a.assistantId)?.name ?? null,
        assistantEmail: users.get(a.assistantId)?.email ?? null,
        assistantStatus: users.get(a.assistantId)?.status ?? null,
        title: a.title,
        removedAt: a.removedAt,
        createdAt: a.createdAt,
      })),
      total: rows.length,
    };
  });
}

export function teacherCourses(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const where: Prisma.CourseWhereInput = { teacherId };
    if (args.status) where.status = args.status as never;

    const [rows, total] = await Promise.all([
      tx.course.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.course.count({ where }),
    ]);
    const names = await centerNames(tx, rows.map((r) => r.centerId).filter(Boolean) as string[]);
    const counts = rows.length
      ? await tx.enrollment.groupBy({
          by: ["courseId"],
          where: { courseId: { in: rows.map((r) => r.id) }, status: "active" },
          _count: { _all: true },
        })
      : [];
    const enrolledByCourse = new Map(counts.map((c) => [c.courseId, c._count._all]));

    return {
      data: rows.map((c) => ({
        id: c.id,
        title: c.title,
        subject: c.subject,
        status: c.status,
        centerId: c.centerId,
        // A null centre is a teacher-direct course, not missing data: decision
        // #2 gives `Course.centerId` teacher-owned semantics with no shadow
        // centre. The screen renders it as "direct".
        centerName: c.centerId ? (names.get(c.centerId) ?? null) : null,
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        startDate: c.startDate,
        endDate: c.endDate,
        maxStudents: c.maxStudents,
        activeEnrollments: enrolledByCourse.get(c.id) ?? 0,
        price: c.price,
        pricePerMonth: c.pricePerMonth,
        pricePerSession: c.pricePerSession,
        pricingMethod: c.pricingMethod,
        splitPlatformBp: c.splitPlatformBp,
        splitTeacherBp: c.splitTeacherBp,
        splitCenterBp: c.splitCenterBp,
        settlementBasis: c.settlementBasis,
        location: c.location,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
    };
  });
}

export function teacherSessions(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    // `sessions.teacher_id` is the session's own teacher, which is what a
    // reassignment changes -- so this reads the sessions this teacher is
    // actually on, not the sessions of courses they once owned.
    const where: Prisma.SessionWhereInput = { teacherId };
    if (args.status) where.status = args.status as never;
    if (range) where.date = range;

    const [rows, total] = await Promise.all([
      tx.session.findMany({ where, orderBy: { date: "desc" }, skip, take }),
      tx.session.count({ where }),
    ]);
    const titles = await courseTitles(tx, rows.map((r) => r.courseId));

    return {
      data: rows.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseTitle: titles.get(s.courseId) ?? null,
        roomId: s.roomId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        distributedAt: s.distributedAt,
      })),
      total,
      page,
      limit,
    };
  });
}

type StudentsRow = {
  teacherOk: boolean;
  total: number;
  data: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: Prisma.UserGetPayload<{ select: { status: true } }>["status"];
    createdAt: string;
    studentCode: string | null;
    courses: { courseId: string; title: string | null }[];
  }[];
};

export function teacherStudents(teacherId: string, args: PageArgs & { q?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    // Distinct students across every course this teacher runs. The page is cut
    // at the database rather than by reading every enrollment into memory --
    // a teacher's roster grows without bound, unlike their course list.
    const conds: Prisma.Sql[] = [
      Prisma.sql`e.course_id IN (SELECT id FROM tc)`,
      Prisma.sql`e.status = 'active'`,
    ];
    // `users.search_text` is a STORED generated column holding the normalized
    // haystack plus the same text with its spaces closed up. Comparing a raw
    // term against it silently matches nothing the moment the query carries a
    // hyphen or an Arabic form the normalizer folds — so the term is put
    // through the SAME normalizer, one AND per term, exactly as
    // `exactQuery(q, t => ({ searchText: { contains: t } }))` does elsewhere.
    for (const term of searchTerms(args.q ?? "")) {
      conds.push(Prisma.sql`u.search_text LIKE ${"%" + term + "%"}`);
    }
    const whereSql = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;

    const [row] = await tx.$queryRaw<StudentsRow[]>`
      WITH tc AS (SELECT id FROM courses WHERE teacher_id = ${teacherId}::uuid),
      pg AS (
        SELECT e.student_id, row_number() OVER (ORDER BY MAX(e.enrolled_at) DESC) AS rn
          FROM enrollments e
          JOIN users u ON u.id = e.student_id
          ${whereSql}
         GROUP BY e.student_id
         ORDER BY rn
         LIMIT ${take} OFFSET ${skip}
      )
      SELECT
        EXISTS (SELECT 1 FROM users WHERE id = ${teacherId}::uuid
                 AND deleted_at IS NULL AND role = 'teacher') AS "teacherOk",
        (SELECT COUNT(DISTINCT e.student_id)::int
           FROM enrollments e
           JOIN users u ON u.id = e.student_id
           ${whereSql}) AS total,
        (SELECT coalesce(json_agg(json_build_object(
            'id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone, 'status', u.status,
            'createdAt', to_char(u.created_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}),
            'studentCode', sp.student_code,
            'courses', (SELECT coalesce(json_agg(json_build_object('courseId', e2.course_id, 'title', c2.title)), '[]'::json)
                          FROM enrollments e2 JOIN courses c2 ON c2.id = e2.course_id
                         WHERE e2.student_id = pg.student_id AND c2.teacher_id = ${teacherId}::uuid
                           AND e2.status = 'active')
          ) ORDER BY pg.rn), '[]'::json)
           FROM pg
           JOIN users u ON u.id = pg.student_id AND u.deleted_at IS NULL
           LEFT JOIN student_profiles sp ON sp.user_id = u.id) AS data`;

    if (!row?.teacherOk) throw new NotFoundError("Teacher not found");

    return {
      data: row.data.map((s) => ({ ...s, createdAt: new Date(s.createdAt) })),
      total: row.total,
      page,
      limit,
    };
  });
}

export function teacherEnrollments(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const courseIds = await teacherCourseIds(tx, teacherId);
    if (!courseIds.length) return { data: [], total: 0, page, limit };

    const where: Prisma.EnrollmentWhereInput = { courseId: { in: courseIds } };
    if (args.status) where.status = args.status as never;

    const [rows, total] = await Promise.all([
      tx.enrollment.findMany({ where, orderBy: { enrolledAt: "desc" }, skip, take }),
      tx.enrollment.count({ where }),
    ]);
    const titles = await courseTitles(tx, rows.map((r) => r.courseId));
    const students = await userMap(tx, rows.map((r) => r.studentId));

    return {
      data: rows.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: students.get(e.studentId)?.name ?? null,
        courseId: e.courseId,
        courseTitle: titles.get(e.courseId) ?? null,
        centerId: e.centerId,
        status: e.status,
        enrolledAt: e.enrolledAt,
        unenrolledAt: e.unenrolledAt,
      })),
      total,
      page,
      limit,
    };
  });
}

export function teacherSubscriptions(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const where: Prisma.SubscriptionWhereInput = { teacherId };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total, totals] = await Promise.all([
      tx.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.subscription.count({ where }),
      tx.subscription.groupBy({
        by: ["status"],
        where: { teacherId },
        _count: { _all: true },
        _sum: { price: true },
      }),
    ]);
    const students = await userMap(tx, rows.map((r) => r.studentId));
    const titles = await courseTitles(tx, rows.map((r) => r.courseId));
    const names = await centerNames(tx, rows.map((r) => r.centerId).filter(Boolean) as string[]);

    return {
      data: rows.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        studentName: students.get(s.studentId)?.name ?? null,
        courseId: s.courseId,
        courseTitle: titles.get(s.courseId) ?? null,
        centerId: s.centerId,
        centerName: s.centerId ? (names.get(s.centerId) ?? null) : null,
        targetType: s.targetType,
        plan: s.plan,
        price: s.price,
        status: s.status,
        paymentMethod: s.paymentMethod,
        source: s.source,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        activatedAt: s.activatedAt,
        cancelledAt: s.cancelledAt,
        createdAt: s.createdAt,
      })),
      totals: totals.map((t) => ({
        status: t.status,
        count: t._count._all,
        amount: t._sum.price ?? 0,
      })),
      total,
      page,
      limit,
    };
  });
}

export function teacherAttendance(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const courseIds = await teacherCourseIds(tx, teacherId);
    if (!courseIds.length) return { data: [], total: 0, page, limit, byStatus: [] };

    const where: Prisma.AttendanceRecordWhereInput = { courseId: { in: courseIds } };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total, byStatus] = await Promise.all([
      tx.attendanceRecord.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.attendanceRecord.count({ where }),
      tx.attendanceRecord.groupBy({
        by: ["status"],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      }),
    ]);
    const students = await userMap(tx, rows.map((r) => r.studentId));
    const titles = await courseTitles(tx, rows.map((r) => r.courseId));

    return {
      data: rows.map((a) => ({
        id: a.id,
        sessionId: a.sessionId,
        studentId: a.studentId,
        studentName: students.get(a.studentId)?.name ?? null,
        courseId: a.courseId,
        courseTitle: titles.get(a.courseId) ?? null,
        centerId: a.centerId,
        status: a.status,
        createdAt: a.createdAt,
      })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      total,
      page,
      limit,
    };
  });
}

/**
 * The money summary. Every figure is read from the ledger, never re-derived --
 * an oversight screen that computes its own totals is a second set of books
 * (the report-export decision).
 */
export function teacherFinanceSummary(teacherId: string, args: { from?: string; to?: string } = {}) {
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacherId },
      select: { walletBalance: true },
    });
    const createdAt = range ? { createdAt: range } : {};

    const [earned, commission, payouts, pendingPayouts, settlements, byType] = await Promise.all([
      tx.transaction.aggregate({
        where: { toEntityId: teacherId, type: "payment", ...createdAt },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      tx.transaction.aggregate({
        where: { fromEntityId: teacherId, type: "commission", ...createdAt },
        _sum: { amount: true },
      }),
      tx.transaction.aggregate({
        where: { toEntityId: teacherId, type: "payout", ...createdAt },
        _sum: { amount: true },
      }),
      tx.payout.aggregate({
        where: { beneficiaryId: teacherId, beneficiaryType: "teacher", status: "pending" },
        _sum: { netPayable: true },
        _count: { _all: true },
      }),
      tx.sessionSettlement.aggregate({
        where: { teacherId, ...createdAt },
        _sum: { teacherTotal: true },
        _count: { _all: true },
      }),
      tx.transaction.groupBy({
        by: ["type"],
        where: {
          OR: [{ toEntityId: teacherId }, { fromEntityId: teacherId }],
          ...createdAt,
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      walletBalance: profile?.walletBalance ?? 0,
      earned: earned._sum.amount ?? 0,
      earnedCount: earned._count._all,
      commission: commission._sum.amount ?? 0,
      paidOut: payouts._sum.amount ?? 0,
      pendingPayouts: {
        amount: pendingPayouts._sum.netPayable ?? 0,
        count: pendingPayouts._count._all,
      },
      settled: {
        amount: settlements._sum.teacherTotal ?? 0,
        count: settlements._count._all,
      },
      byType: byType.map((t) => ({
        type: t.type,
        count: t._count._all,
        amount: t._sum.amount ?? 0,
      })),
    };
  });
}

export function teacherTransactions(
  teacherId: string,
  args: PageArgs & { type?: string; status?: string } = {},
) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    // Both directions: money reaching the teacher (payment, payout) and money
    // leaving them (commission). `listTransactions` cannot express this -- it
    // filters on centerId -- so this is its own read rather than a widening of
    // the accountant's.
    const where: Prisma.TransactionWhereInput = {
      OR: [{ toEntityId: teacherId }, { fromEntityId: teacherId }],
    };
    if (args.type) where.type = args.type as never;
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      tx.transaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.transaction.count({ where }),
    ]);
    return {
      data: rows.map((t) => ({
        ...t,
        direction: t.toEntityId === teacherId ? "in" : "out",
      })),
      total,
      page,
      limit,
    };
  });
}

export function teacherPayouts(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const where: Prisma.PayoutWhereInput = {
      beneficiaryId: teacherId,
      beneficiaryType: "teacher",
    };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      tx.payout.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.payout.count({ where }),
    ]);
    const names = await centerNames(tx, rows.map((r) => r.centerId).filter(Boolean) as string[]);
    return {
      data: rows.map((p) => ({
        ...p,
        centerName: p.centerId ? (names.get(p.centerId) ?? null) : null,
      })),
      total,
      page,
      limit,
    };
  });
}

export function teacherSettlements(teacherId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const where: Prisma.SessionSettlementWhereInput = { teacherId };
    if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      tx.sessionSettlement.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.sessionSettlement.count({ where }),
    ]);
    const titles = await courseTitles(tx, rows.map((r) => r.courseId));
    const names = await centerNames(tx, rows.map((r) => r.centerId));
    return {
      data: rows.map((s) => ({
        ...s,
        courseTitle: titles.get(s.courseId) ?? null,
        centerName: names.get(s.centerId) ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

export function teacherPayments(teacherId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const courseIds = await teacherCourseIds(tx, teacherId);
    if (!courseIds.length) return { data: [], total: 0, page, limit };

    // `payments` carries no teacher column, so a teacher's receipts are the
    // receipts of their courses.
    const where: Prisma.PaymentWhereInput = { courseId: { in: courseIds } };
    if (args.status) where.status = args.status as never;
    if (range) where.paidAt = range;

    const [rows, total] = await Promise.all([
      tx.payment.findMany({ where, orderBy: { paidAt: "desc" }, skip, take }),
      tx.payment.count({ where }),
    ]);
    const students = await userMap(tx, rows.map((r) => r.studentId).filter(Boolean) as string[]);
    const recorders = await userMap(tx, rows.map((r) => r.recordedBy));
    const titles = await courseTitles(tx, rows.map((r) => r.courseId).filter(Boolean) as string[]);
    return {
      data: rows.map((p) => ({
        ...p,
        studentName: (p.studentId ? students.get(p.studentId)?.name : null) ?? null,
        courseTitle: (p.courseId ? titles.get(p.courseId) : null) ?? null,
        recordedByName: recorders.get(p.recordedBy)?.name ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

/** Everything the platform has done TO this teacher, newest first. */
export function teacherAuditLog(teacherId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const where: Prisma.AuditLogWhereInput = {
      targetId: teacherId,
      targetType: { in: ["teacher", "user"] },
    };
    if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      tx.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.auditLog.count({ where }),
    ]);
    const actors = await userMap(tx, rows.map((r) => r.actorId).filter(Boolean) as string[]);
    return {
      data: rows.map((a) => ({
        id: a.id,
        action: a.action,
        actorId: a.actorId,
        actorName: (a.actorId ? actors.get(a.actorId)?.name : null) ?? null,
        targetType: a.targetType,
        centerId: a.centerId,
        beforeState: a.beforeState,
        afterState: a.afterState,
        createdAt: a.createdAt,
      })),
      total,
      page,
      limit,
    };
  });
}

/** Requests waiting on somebody, so an operator can see why a teacher is stuck. */
export function teacherPendingItems(teacherId: string) {
  return platformDb(async (tx) => {
    await assertTeacher(tx, teacherId);
    const [collabs, affiliations] = await Promise.all([
      tx.collaborationRequest.findMany({
        where: { teacherId, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      tx.centerTeacherAffiliation.findMany({
        where: { teacherId, status: "pending", removedAt: null },
        orderBy: { invitedAt: "desc" },
        take: 50,
      }),
    ]);
    const names = await centerNames(tx, [
      ...collabs.map((c) => c.centerId),
      ...affiliations.map((a) => a.centerId),
    ]);
    return {
      collaborationRequests: collabs.map((c) => ({
        id: c.id,
        centerId: c.centerId,
        centerName: names.get(c.centerId) ?? null,
        subjectId: c.subjectId,
        status: c.status,
        initiator: c.initiator,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      })),
      affiliations: affiliations.map((a) => ({
        id: a.id,
        centerId: a.centerId,
        centerName: names.get(a.centerId) ?? null,
        status: a.status,
        invitedAt: a.invitedAt,
        expiresAt: a.expiresAt,
      })),
    };
  });
}

/**
 * The statement, and the SAME function the accountant's teacher statement runs
 * (`m16-teacher-statement`). A report that re-derives its own totals is a
 * second set of books.
 */
export const teacherFinanceStatement = teacherStatement;
