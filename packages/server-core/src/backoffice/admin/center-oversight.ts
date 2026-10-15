import { platformDb, type TenantTx } from "../../db/scope";
import { NotFoundError } from "../../errors/classes";
import { centerStatement } from "../finance/finance-reports";
import { listTransactions } from "../finance/accountant";
import { Prisma } from "@repo/database";
import { parsePageLimit } from "../../validation/common";

const DEFAULT_LIMIT = 50;

export type PageArgs = { page?: string; limit?: string; from?: string; to?: string };

function paging(args: PageArgs) {
  return parsePageLimit(args, DEFAULT_LIMIT);
}

function dateRange(args: PageArgs): Prisma.DateTimeFilter | undefined {
  if (!args.from && !args.to) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (args.from) f.gte = new Date(args.from);
  if (args.to) f.lte = new Date(args.to);
  return f;
}

async function assertCenter(tx: TenantTx, centerId: string) {
  const center = await tx.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, shortId: true, status: true },
  });
  if (!center) throw new NotFoundError("Center not found");
  return center;
}

async function centerCourseIds(tx: TenantTx, centerId: string): Promise<string[]> {
  const rows = await tx.course.findMany({ where: { centerId }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function userMap(tx: TenantTx, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { id: string; name: string; email: string | null; status: string }>();
  const users = await tx.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true, status: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

type OverviewCenter = Omit<Prisma.CenterGetPayload<object>, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type OverviewRow = {
  center: OverviewCenter | null;
  admins: { id: string; name: string | null; email?: string | null; status?: string }[];
  counts: {
    teachers: number;
    students: number;
    courses: number;
    rooms: number;
    staff: number;
    activeSubscriptions: number;
    pendingCollaborations: number;
    sessions: number;
  };
};

const ISO_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

export function centerOverview(centerId: string) {
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<OverviewRow[]>`
      SELECT
        (SELECT json_build_object(
          'id', c.id, 'ownerUserId', c.owner_user_id, 'name', c.name, 'shortId', c.short_id,
          'description', c.description, 'address', c.address, 'area', c.area,
          'subjects', coalesce(c.subjects, '{}'), 'searchText', c.search_text, 'lat', c.lat, 'lng', c.lng,
          'phone', c.phone, 'whatsapp', c.whatsapp, 'email', c.email, 'logoUrl', c.logo_url,
          'classroomCount', c.classroom_count, 'entityType', c.entity_type, 'status', c.status,
          'walletBalance', c.wallet_balance, 'creditBalance', c.credit_balance,
          'receiptSeq', c.receipt_seq, 'governorate', c.governorate,
          'onboardingCompleted', c.onboarding_completed, 'onboardingDraft', c.onboarding_draft,
          'isDemo', c.is_demo,
          'createdAt', to_char(c.created_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)}),
          'updatedAt', to_char(c.updated_at AT TIME ZONE 'UTC', ${Prisma.raw(ISO_MS)})
        ) FROM centers c WHERE c.id = ${centerId}::uuid) AS center,
        (SELECT coalesce(json_agg(
          CASE WHEN u.id IS NULL THEN json_build_object('id', a.user_id, 'name', NULL)
               ELSE json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'status', u.status)
          END), '[]'::json)
          FROM center_admin_profiles a
          LEFT JOIN users u ON u.id = a.user_id AND u.deleted_at IS NULL
          WHERE a.center_id = ${centerId}::uuid) AS admins,
        json_build_object(
          'teachers', (SELECT count(*)::int FROM center_teacher_affiliations
                       WHERE center_id = ${centerId}::uuid AND status = 'active' AND removed_at IS NULL),
          'students', (SELECT count(*)::int FROM center_student_rosters
                       WHERE center_id = ${centerId}::uuid AND left_at IS NULL),
          'courses', (SELECT count(*)::int FROM courses WHERE center_id = ${centerId}::uuid),
          'rooms', (SELECT count(*)::int FROM rooms WHERE center_id = ${centerId}::uuid AND is_active),
          'staff', (SELECT count(*)::int FROM center_staff
                    WHERE center_id = ${centerId}::uuid AND removed_at IS NULL),
          'activeSubscriptions', (SELECT count(*)::int FROM subscriptions
                                  WHERE center_id = ${centerId}::uuid AND status = 'active'),
          'pendingCollaborations', (SELECT count(*)::int FROM collaboration_requests
                                    WHERE center_id = ${centerId}::uuid AND status = 'pending'),
          'sessions', (SELECT count(*)::int FROM sessions s JOIN courses co ON co.id = s.course_id
                       WHERE co.center_id = ${centerId}::uuid)
        ) AS counts`;

    if (!row?.center) throw new NotFoundError("Center not found");
    const { center, admins, counts } = row;

    return {
      center: { ...center, createdAt: new Date(center.createdAt), updatedAt: new Date(center.updatedAt) },
      admins,
      counts,
    };
  });
}


const dt = (v: string | null) => (v ? new Date(v) : null);
const ts = (col: string) => Prisma.raw(`to_char(${col} AT TIME ZONE 'UTC', ${ISO_MS})`);
const isBad = (d: Date | undefined) => !!d && Number.isNaN(d.getTime());
const badDate = (r: Prisma.DateTimeFilter | undefined) =>
  isBad(r?.gte as Date | undefined) || isBad(r?.lte as Date | undefined);
const rangeSql = (col: string, r: Prisma.DateTimeFilter | undefined) => [
  r?.gte ? Prisma.sql` AND ${Prisma.raw(col)} >= ${r.gte as Date}::timestamptz` : Prisma.empty,
  r?.lte ? Prisma.sql` AND ${Prisma.raw(col)} <= ${r.lte as Date}::timestamptz` : Prisma.empty,
];
const statusSql = (enumName: string, status: string | undefined) => ({
  ok: status
    ? Prisma.sql`(${status}::text = ANY (enum_range(NULL::${Prisma.raw(enumName)})::text[]))`
    : Prisma.sql`true`,
  where: status ? Prisma.sql` AND status::text = ${status}` : Prisma.empty,
});

async function rejectBadFilter(tx: TenantTx, centerId: string, probe: () => Promise<unknown>): Promise<never> {
  await assertCenter(tx, centerId);
  await probe();
  throw new Error("Invalid filter");
}

export function centerStudents(centerId: string, args: PageArgs & { q?: string; includeLeft?: boolean } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    const left = args.includeLeft ? Prisma.empty : Prisma.sql` AND left_at IS NULL`;
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        total: number;
        rows: {
          rosterId: string;
          studentId: string;
          userName: string | null;
          fullName: string | null;
          email: string | null;
          accountStatus: string | null;
          studentCode: string | null;
          phone: string | null;
          walletBalance: number | null;
          pointsBalance: number | null;
          addedAt: string;
          leftAt: string | null;
          blacklisted: boolean;
          blacklistReason: string | null;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        (SELECT count(*)::int FROM center_student_rosters
          WHERE center_id = ${centerId}::uuid${left}) AS total,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT r.rn, json_build_object(
            'rosterId', r.id, 'studentId', r.student_id,
            'userName', u.name, 'fullName', p.full_name, 'email', u.email, 'accountStatus', u.status,
            'studentCode', p.student_code, 'phone', p.phone,
            'walletBalance', p.wallet_balance, 'pointsBalance', p.points_balance,
            'addedAt', ${ts("r.added_at")}, 'leftAt', ${ts("r.left_at")},
            'blacklisted', r.blacklisted, 'blacklistReason', r.blacklist_reason
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM center_student_rosters x
              WHERE x.center_id = ${centerId}::uuid${left}
              ORDER BY x.added_at DESC OFFSET ${skip} LIMIT ${take}
            ) q
          ) r
          LEFT JOIN users u ON u.id = r.student_id AND u.deleted_at IS NULL
          LEFT JOIN student_profiles p ON p.user_id = r.student_id
        ) t) AS rows`;
    if (!row?.ok) throw new NotFoundError("Center not found");

    return {
      data: row.rows.map((r) => ({
        rosterId: r.rosterId,
        studentId: r.studentId,
        name: r.userName ?? r.fullName ?? null,
        email: r.email ?? null,
        accountStatus: r.accountStatus ?? null,
        studentCode: r.studentCode ?? null,
        phone: r.phone ?? null,
        walletBalance: r.walletBalance ?? 0,
        pointsBalance: r.pointsBalance ?? 0,
        addedAt: new Date(r.addedAt),
        leftAt: dt(r.leftAt),
        blacklisted: r.blacklisted,
        blacklistReason: r.blacklistReason,
      })),
      total: row.total,
      page,
      limit,
    };
  });
}

export function centerCourses(centerId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        total: number;
        rows: {
          id: string;
          title: string;
          status: string;
          teacherId: string;
          teacherName: string | null;
          roomId: string | null;
          roomName: string | null;
          daysOfWeek: number[];
          startTime: string;
          endTime: string;
          startDate: string;
          endDate: string | null;
          maxStudents: number;
          activeEnrollments: number;
          pricePerMonth: number | null;
          pricePerSession: number | null;
          pricingMethod: string | null;
          splitPlatformBp: number | null;
          splitTeacherBp: number | null;
          splitCenterBp: number | null;
          createdAt: string;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        (SELECT count(*)::int FROM courses WHERE center_id = ${centerId}::uuid) AS total,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT c.rn, json_build_object(
            'id', c.id, 'title', c.title, 'status', c.status, 'teacherId', c.teacher_id,
            'teacherName', u.name, 'roomId', c.default_room_id, 'roomName', rm.name,
            'daysOfWeek', coalesce(c.days_of_week, '{}'), 'startTime', c.start_time, 'endTime', c.end_time,
            'startDate', ${ts("c.start_date")}, 'endDate', ${ts("c.end_date")},
            'maxStudents', c.max_students,
            'activeEnrollments', (SELECT count(*)::int FROM enrollments e
                                  WHERE e.course_id = c.id AND e.status = 'active'),
            'pricePerMonth', c.price_per_month, 'pricePerSession', c.price_per_session,
            'pricingMethod', c.pricing_method, 'splitPlatformBp', c.split_platform_bp,
            'splitTeacherBp', c.split_teacher_bp, 'splitCenterBp', c.split_center_bp,
            'createdAt', ${ts("c.created_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM courses x
              WHERE x.center_id = ${centerId}::uuid
              ORDER BY x.created_at DESC OFFSET ${skip} LIMIT ${take}
            ) q
          ) c
          LEFT JOIN users u ON u.id = c.teacher_id AND u.deleted_at IS NULL
          LEFT JOIN rooms rm ON rm.id = c.default_room_id
        ) t) AS rows`;
    if (!row?.ok) throw new NotFoundError("Center not found");

    return {
      data: row.rows.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        teacherId: c.teacherId,
        teacherName: c.teacherName ?? null,
        roomId: c.roomId,
        roomName: c.roomName ?? null,
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        startDate: new Date(c.startDate),
        endDate: dt(c.endDate),
        maxStudents: c.maxStudents,
        activeEnrollments: c.activeEnrollments,
        pricePerMonth: c.pricePerMonth,
        pricePerSession: c.pricePerSession,
        pricingMethod: c.pricingMethod,
        splitPlatformBp: c.splitPlatformBp,
        splitTeacherBp: c.splitTeacherBp,
        splitCenterBp: c.splitCenterBp,
        createdAt: new Date(c.createdAt),
      })),
      total: row.total,
      page,
      limit,
    };
  });
}

export function centerSessions(centerId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    if (badDate(range)) {
      await assertCenter(tx, centerId);
      const courseIds = await centerCourseIds(tx, centerId);
      if (!courseIds.length) return { data: [], total: 0, page, limit };
      await tx.session.count({ where: { courseId: { in: courseIds }, date: range } });
    }
    const [gte, lte] = rangeSql("date", range);
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        total: number;
        rows: {
          id: string;
          courseId: string;
          courseTitle: string | null;
          teacherId: string;
          teacherName: string | null;
          roomId: string | null;
          date: string;
          startTime: string;
          endTime: string;
          status: string;
          distributedAt: string | null;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        (SELECT count(*)::int FROM sessions s JOIN courses co ON co.id = s.course_id
          WHERE co.center_id = ${centerId}::uuid${gte}${lte}) AS total,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT s.rn, json_build_object(
            'id', s.id, 'courseId', s.course_id, 'courseTitle', co.title,
            'teacherId', s.teacher_id, 'teacherName', u.name, 'roomId', s.room_id,
            'date', ${ts("s.date")}, 'startTime', s.start_time, 'endTime', s.end_time,
            'status', s.status, 'distributedAt', ${ts("s.distributed_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM sessions x
              WHERE x.course_id IN (SELECT id FROM courses WHERE center_id = ${centerId}::uuid)${gte}${lte}
              ORDER BY x.date DESC OFFSET ${skip} LIMIT ${take}
            ) q
          ) s
          LEFT JOIN users u ON u.id = s.teacher_id AND u.deleted_at IS NULL
          LEFT JOIN courses co ON co.id = s.course_id
        ) t) AS rows`;
    if (!row?.ok) throw new NotFoundError("Center not found");

    return {
      data: row.rows.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseTitle: s.courseTitle ?? null,
        teacherId: s.teacherId,
        teacherName: s.teacherName ?? null,
        roomId: s.roomId,
        date: new Date(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        distributedAt: dt(s.distributedAt),
      })),
      total: row.total,
      page,
      limit,
    };
  });
}

export function centerEnrollments(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    const st = statusSql("enrollment_status", args.status);
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        statusOk: boolean;
        total: number;
        rows: {
          id: string;
          studentId: string;
          studentName: string | null;
          courseId: string;
          courseTitle: string | null;
          status: string;
          enrolledAt: string;
          unenrolledAt: string | null;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        ${st.ok} AS "statusOk",
        (SELECT count(*)::int FROM enrollments
          WHERE center_id = ${centerId}::uuid${st.where}) AS total,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT e.rn, json_build_object(
            'id', e.id, 'studentId', e.student_id, 'studentName', u.name,
            'courseId', e.course_id, 'courseTitle', co.title, 'status', e.status,
            'enrolledAt', ${ts("e.enrolled_at")}, 'unenrolledAt', ${ts("e.unenrolled_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM enrollments x
              WHERE x.center_id = ${centerId}::uuid${st.where}
              ORDER BY x.enrolled_at DESC OFFSET ${skip} LIMIT ${take}
            ) q
          ) e
          LEFT JOIN users u ON u.id = e.student_id AND u.deleted_at IS NULL
          LEFT JOIN courses co ON co.id = e.course_id
        ) t) AS rows`;
    if (!row?.ok) throw new NotFoundError("Center not found");
    if (!row.statusOk) {
      await tx.enrollment.count({ where: { centerId, status: args.status as never } });
    }

    return {
      data: row.rows.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: e.studentName ?? null,
        courseId: e.courseId,
        courseTitle: e.courseTitle ?? null,
        status: e.status,
        enrolledAt: new Date(e.enrolledAt),
        unenrolledAt: dt(e.unenrolledAt),
      })),
      total: row.total,
      page,
      limit,
    };
  });
}

export function centerSubscriptions(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    if (badDate(range)) {
      await rejectBadFilter(tx, centerId, () =>
        tx.subscription.count({ where: { centerId, createdAt: range } }),
      );
    }
    const st = statusSql("subscription_status", args.status);
    const [gte, lte] = rangeSql("created_at", range);
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        statusOk: boolean;
        total: number;
        totals: { status: string; count: number; amount: number }[];
        rows: {
          id: string;
          studentId: string;
          studentName: string | null;
          teacherId: string;
          teacherName: string | null;
          courseId: string;
          courseTitle: string | null;
          plan: string;
          price: number;
          status: string;
          paymentMethod: string | null;
          source: string;
          periodStart: string | null;
          periodEnd: string | null;
          activatedAt: string | null;
          cancelledAt: string | null;
          createdAt: string;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        ${st.ok} AS "statusOk",
        (SELECT count(*)::int FROM subscriptions
          WHERE center_id = ${centerId}::uuid${st.where}${gte}${lte}) AS total,
        (SELECT coalesce(json_agg(json_build_object('status', g.status, 'count', g.cnt, 'amount', g.amt)), '[]'::json)
          FROM (SELECT status, count(*)::int AS cnt, coalesce(sum(price), 0) AS amt
                FROM subscriptions WHERE center_id = ${centerId}::uuid GROUP BY status) g) AS totals,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT s.rn, json_build_object(
            'id', s.id, 'studentId', s.student_id, 'studentName', su.name,
            'teacherId', s.teacher_id, 'teacherName', tu.name,
            'courseId', s.course_id, 'courseTitle', co.title,
            'plan', s.plan, 'price', s.price, 'status', s.status,
            'paymentMethod', s.payment_method, 'source', s.source,
            'periodStart', ${ts("s.period_start")}, 'periodEnd', ${ts("s.period_end")},
            'activatedAt', ${ts("s.activated_at")}, 'cancelledAt', ${ts("s.cancelled_at")},
            'createdAt', ${ts("s.created_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM subscriptions x
              WHERE x.center_id = ${centerId}::uuid${st.where}${gte}${lte}
              ORDER BY x.created_at DESC OFFSET ${skip} LIMIT ${take}
            ) q
          ) s
          LEFT JOIN users su ON su.id = s.student_id AND su.deleted_at IS NULL
          LEFT JOIN users tu ON tu.id = s.teacher_id AND tu.deleted_at IS NULL
          LEFT JOIN courses co ON co.id = s.course_id
        ) t) AS rows`;
    if (!row?.ok) throw new NotFoundError("Center not found");
    if (!row.statusOk) {
      await tx.subscription.count({ where: { centerId, status: args.status as never } });
    }

    return {
      data: row.rows.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        studentName: s.studentName ?? null,
        teacherId: s.teacherId,
        teacherName: s.teacherName ?? null,
        courseId: s.courseId,
        courseTitle: s.courseTitle ?? null,
        plan: s.plan,
        price: s.price,
        status: s.status,
        paymentMethod: s.paymentMethod,
        source: s.source,
        periodStart: dt(s.periodStart),
        periodEnd: dt(s.periodEnd),
        activatedAt: dt(s.activatedAt),
        cancelledAt: dt(s.cancelledAt),
        createdAt: new Date(s.createdAt),
      })),
      totals: row.totals,
      total: row.total,
      page,
      limit,
    };
  });
}

export function centerAttendance(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    if (badDate(range)) {
      await rejectBadFilter(tx, centerId, () =>
        tx.attendanceRecord.count({ where: { centerId, createdAt: range } }),
      );
    }
    const st = statusSql("attendance_status", args.status);
    const [gte, lte] = rangeSql("created_at", range);
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        statusOk: boolean;
        total: number;
        summary: { status: string; count: number }[];
        rows: {
          id: string;
          studentId: string;
          studentName: string | null;
          courseId: string;
          courseTitle: string | null;
          sessionId: string;
          sessionDate: string | null;
          status: string;
          counterAt: string | null;
          doorAt: string | null;
          synced: boolean;
          createdAt: string;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        ${st.ok} AS "statusOk",
        (SELECT count(*)::int FROM attendance_records
          WHERE center_id = ${centerId}::uuid${st.where}${gte}${lte}) AS total,
        (SELECT coalesce(json_agg(json_build_object('status', g.status, 'count', g.cnt)), '[]'::json)
          FROM (SELECT status, count(*)::int AS cnt
                FROM attendance_records WHERE center_id = ${centerId}::uuid GROUP BY status) g) AS summary,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT a.rn, json_build_object(
            'id', a.id, 'studentId', a.student_id, 'studentName', u.name,
            'courseId', a.course_id, 'courseTitle', co.title,
            'sessionId', a.session_id, 'sessionDate', ${ts("se.date")}, 'status', a.status,
            'counterAt', ${ts("a.counter_at")}, 'doorAt', ${ts("a.door_at")},
            'synced', a.synced, 'createdAt', ${ts("a.created_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM attendance_records x
              WHERE x.center_id = ${centerId}::uuid${st.where}${gte}${lte}
              ORDER BY x.created_at DESC OFFSET ${skip} LIMIT ${take}
            ) q
          ) a
          LEFT JOIN users u ON u.id = a.student_id AND u.deleted_at IS NULL
          LEFT JOIN courses co ON co.id = a.course_id
          LEFT JOIN sessions se ON se.id = a.session_id
        ) t) AS rows`;
    if (!row?.ok) throw new NotFoundError("Center not found");
    if (!row.statusOk) {
      await tx.attendanceRecord.count({ where: { centerId, status: args.status as never } });
    }

    return {
      data: row.rows.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentName: a.studentName ?? null,
        courseId: a.courseId,
        courseTitle: a.courseTitle ?? null,
        sessionId: a.sessionId,
        sessionDate: dt(a.sessionDate),
        status: a.status,
        counterAt: dt(a.counterAt),
        doorAt: dt(a.doorAt),
        synced: a.synced,
        createdAt: new Date(a.createdAt),
      })),
      summary: row.summary,
      total: row.total,
      page,
      limit,
    };
  });
}

export function centerStaffAccounts(centerId: string, args: { includeRemoved?: boolean } = {}) {
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.CenterStaffWhereInput = { centerId };
    if (!args.includeRemoved) where.removedAt = null;
    const rows = await tx.centerStaff.findMany({ where, orderBy: { createdAt: "desc" } });
    const users = await userMap(tx, rows.map((r) => r.staffUserId));
    return {
      data: rows.map((s) => ({
        id: s.id,
        staffUserId: s.staffUserId,
        name: users.get(s.staffUserId)?.name ?? null,
        email: users.get(s.staffUserId)?.email ?? null,
        accountStatus: users.get(s.staffUserId)?.status ?? null,
        role: s.role,
        title: s.title,
        removedAt: s.removedAt,
        createdAt: s.createdAt,
      })),
    };
  });
}

export function centerPendingItems(centerId: string) {
  return platformDb(async (tx) => {
    const [row] = await tx.$queryRaw<
      {
        ok: boolean;
        collabs: {
          id: string;
          initiator: string;
          teacherId: string;
          teacherName: string | null;
          subjectName: string | null;
          roomId: string | null;
          proposedPricingMethod: string | null;
          daysOfWeek: number[];
          startTime: string;
          endTime: string;
          startDate: string;
          expiresAt: string;
          createdAt: string;
        }[];
        requests: {
          id: string;
          studentId: string;
          studentName: string | null;
          courseId: string;
          courseTitle: string | null;
          submittedAt: string;
          expiresAt: string;
        }[];
        affiliations: {
          id: string;
          teacherId: string;
          teacherName: string | null;
          invitedAt: string;
          expiresAt: string;
        }[];
      }[]
    >`
      SELECT
        EXISTS (SELECT 1 FROM centers WHERE id = ${centerId}::uuid) AS ok,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT c.rn, json_build_object(
            'id', c.id, 'initiator', c.initiator, 'teacherId', c.teacher_id, 'teacherName', u.name,
            'subjectName', coalesce(sb.name_en, sb.name_ar), 'roomId', c.room_id,
            'proposedPricingMethod', c.proposed_pricing_method,
            'daysOfWeek', coalesce(c.days_of_week, '{}'), 'startTime', c.start_time, 'endTime', c.end_time,
            'startDate', ${ts("c.start_date")}, 'expiresAt', ${ts("c.expires_at")},
            'createdAt', ${ts("c.created_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM collaboration_requests x
              WHERE x.center_id = ${centerId}::uuid AND x.status = 'pending'
              ORDER BY x.created_at DESC LIMIT 100
            ) q
          ) c
          LEFT JOIN users u ON u.id = c.teacher_id AND u.deleted_at IS NULL
          LEFT JOIN subjects sb ON sb.id = c.subject_id
        ) t) AS collabs,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT e.rn, json_build_object(
            'id', e.id, 'studentId', e.student_id, 'studentName', u.name,
            'courseId', e.course_id, 'courseTitle', co.title,
            'submittedAt', ${ts("e.submitted_at")}, 'expiresAt', ${ts("e.expires_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM enrollment_requests x
              WHERE x.center_id = ${centerId}::uuid AND x.status = 'pending'
              ORDER BY x.submitted_at DESC LIMIT 100
            ) q
          ) e
          LEFT JOIN users u ON u.id = e.student_id AND u.deleted_at IS NULL
          LEFT JOIN courses co ON co.id = e.course_id
        ) t) AS requests,
        (SELECT coalesce(json_agg(t.j ORDER BY t.rn), '[]'::json) FROM (
          SELECT a.rn, json_build_object(
            'id', a.id, 'teacherId', a.teacher_id, 'teacherName', u.name,
            'invitedAt', ${ts("a.invited_at")}, 'expiresAt', ${ts("a.expires_at")}
          ) AS j
          FROM (
            SELECT q.*, row_number() OVER () AS rn FROM (
              SELECT x.*
              FROM center_teacher_affiliations x
              WHERE x.center_id = ${centerId}::uuid AND x.status = 'pending' AND x.removed_at IS NULL
              ORDER BY x.invited_at DESC LIMIT 100
            ) q
          ) a
          LEFT JOIN users u ON u.id = a.teacher_id AND u.deleted_at IS NULL
        ) t) AS affiliations`;
    if (!row?.ok) throw new NotFoundError("Center not found");

    return {
      collaborationRequests: row.collabs.map((c) => ({
        id: c.id,
        initiator: c.initiator,
        teacherId: c.teacherId,
        teacherName: c.teacherName ?? null,
        subjectName: c.subjectName ?? null,
        roomId: c.roomId,
        proposedPricingMethod: c.proposedPricingMethod,
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        startDate: new Date(c.startDate),
        expiresAt: new Date(c.expiresAt),
        createdAt: new Date(c.createdAt),
      })),
      enrollmentRequests: row.requests.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: e.studentName ?? null,
        courseId: e.courseId,
        courseTitle: e.courseTitle ?? null,
        submittedAt: new Date(e.submittedAt),
        expiresAt: new Date(e.expiresAt),
      })),
      affiliations: row.affiliations.map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: a.teacherName ?? null,
        invitedAt: new Date(a.invitedAt),
        expiresAt: new Date(a.expiresAt),
      })),
    };
  });
}

export function centerFinanceSummary(centerId: string, args: { from?: string; to?: string } = {}) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true, walletBalance: true, creditBalance: true },
    });
    if (!center) throw new NotFoundError("Center not found");

    const range = dateRange(args);
    const txWhere: Prisma.TransactionWhereInput = { centerId };
    if (range) txWhere.createdAt = range;

    const [byType, payments, refundPayments, payouts, settlements, invoices, walletTopUps] =
      await Promise.all([
        tx.transaction.groupBy({
          by: ["type", "status"],
          where: txWhere,
          _count: { _all: true },
          _sum: { amount: true },
        }),
        tx.payment.aggregate({
          where: { centerId, amount: { gt: 0 }, ...(range ? { paidAt: range } : {}) },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        tx.payment.aggregate({
          where: { centerId, amount: { lt: 0 }, ...(range ? { paidAt: range } : {}) },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        tx.payout.groupBy({
          by: ["status"],
          where: { centerId, ...(range ? { createdAt: range } : {}) },
          _count: { _all: true },
          _sum: { netPayable: true },
        }),
        tx.sessionSettlement.aggregate({
          where: { centerId, ...(range ? { createdAt: range } : {}) },
          _count: { _all: true },
          _sum: { platformTotal: true, centerTotal: true, teacherTotal: true },
        }),
        tx.invoice.groupBy({
          by: ["status"],
          where: { centerId, ...(range ? { createdAt: range } : {}) },
          _count: { _all: true },
          _sum: { netAmount: true },
        }),
        tx.walletLedger.aggregate({
          where: { centerId, ...(range ? { createdAt: range } : {}) },
          _count: { _all: true },
          _sum: { delta: true },
        }),
      ]);

    return {
      center,
      walletBalance: center.walletBalance,
      creditBalance: center.creditBalance,
      transactions: byType.map((t) => ({
        type: t.type,
        status: t.status,
        count: t._count._all,
        amount: t._sum.amount ?? 0,
      })),
      payments: {
        count: payments._count._all,
        amount: payments._sum.amount ?? 0,
        refundCount: refundPayments._count._all,
        refundAmount: refundPayments._sum.amount ?? 0,
      },
      payouts: payouts.map((p) => ({
        status: p.status,
        count: p._count._all,
        netPayable: p._sum.netPayable ?? 0,
      })),
      settlements: {
        count: settlements._count._all,
        platformTotal: settlements._sum.platformTotal ?? 0,
        centerTotal: settlements._sum.centerTotal ?? 0,
        teacherTotal: settlements._sum.teacherTotal ?? 0,
      },
      invoices: invoices.map((i) => ({
        status: i.status,
        count: i._count._all,
        netAmount: i._sum.netAmount ?? 0,
      })),
      walletMovements: {
        count: walletTopUps._count._all,
        netDelta: walletTopUps._sum.delta ?? 0,
      },
    };
  });
}

export function centerTransactions(
  centerId: string,
  args: PageArgs & { type?: string; status?: string } = {},
) {
  return listTransactions({
    centerId,
    type: args.type,
    status: args.status,
    from: args.from,
    to: args.to,
    page: args.page,
    limit: args.limit,
  });
}

export function centerPayments(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.PaymentWhereInput = { centerId };
    if (args.status) where.status = args.status as never;
    if (range) where.paidAt = range;

    const [rows, total] = await Promise.all([
      tx.payment.findMany({ where, orderBy: { paidAt: "desc" }, skip, take }),
      tx.payment.count({ where }),
    ]);
    const students = await userMap(
      tx,
      rows.map((r) => r.studentId).filter(Boolean) as string[],
    );
    const recorders = await userMap(tx, rows.map((r) => r.recordedBy));
    return {
      data: rows.map((p) => ({
        ...p,
        studentName: (p.studentId ? students.get(p.studentId)?.name : null) ?? null,
        recordedByName: recorders.get(p.recordedBy)?.name ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

export function centerPayouts(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.PayoutWhereInput = { centerId };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      tx.payout.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.payout.count({ where }),
    ]);
    const beneficiaries = await userMap(tx, rows.map((r) => r.beneficiaryId));
    return {
      data: rows.map((p) => ({
        ...p,
        beneficiaryName: beneficiaries.get(p.beneficiaryId)?.name ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

export function centerSettlements(centerId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.SessionSettlementWhereInput = { centerId };
    if (range) where.createdAt = range;

    const [rows, total] = await Promise.all([
      tx.sessionSettlement.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.sessionSettlement.count({ where }),
    ]);
    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    const teachers = await userMap(tx, rows.map((r) => r.teacherId));
    return {
      data: rows.map((s) => ({
        ...s,
        courseTitle: titleById.get(s.courseId) ?? null,
        teacherName: teachers.get(s.teacherId)?.name ?? null,
      })),
      total,
      page,
      limit,
    };
  });
}

export function centerInvoices(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.InvoiceWhereInput = { centerId };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;
    const [rows, total] = await Promise.all([
      tx.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.invoice.count({ where }),
    ]);
    return { data: rows, total, page, limit };
  });
}

export function centerWalletMovements(
  centerId: string,
  args: PageArgs & { scope?: "center" | "roster" } = {},
) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  const scope = args.scope === "roster" ? "roster" : "center";
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);

    // The roster scope is an EXISTS, not an IN over ids fetched first: reading
    // every active student of a centre into memory to build a filter grows
    // with the centre forever (M-16). Raw SQL decides WHICH ledger rows;
    // Prisma still fetches them, so the hydrating `in` is bounded by the page
    // and the returned row shape is unchanged.
    const conds: Prisma.Sql[] = [
      scope === "roster"
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM center_student_rosters r
             WHERE r.student_id = w.student_id
               AND r.center_id = ${centerId}::uuid
               AND r.left_at IS NULL)`
        : Prisma.sql`w.center_id = ${centerId}::uuid`,
    ];
    if (range?.gte) conds.push(Prisma.sql`w.created_at >= ${range.gte}`);
    if (range?.lte) conds.push(Prisma.sql`w.created_at <= ${range.lte}`);
    const whereSql = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;

    const [idRows, countRows] = await Promise.all([
      tx.$queryRaw<{ id: string }[]>`
        SELECT w.id
          FROM wallet_ledger w
          ${whereSql}
         ORDER BY w.created_at DESC
         LIMIT ${take} OFFSET ${skip}`,
      tx.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM wallet_ledger w ${whereSql}`,
    ]);

    const total = Number(countRows[0]?.n ?? 0);
    if (idRows.length === 0) return { data: [], total, page, limit, scope };

    const rows = await tx.walletLedger.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      orderBy: { createdAt: "desc" },
    });
    const students = await userMap(tx, rows.map((r) => r.studentId));
    return {
      data: rows.map((w) => ({
        ...w,
        studentName: students.get(w.studentId)?.name ?? null,
      })),
      total,
      page,
      limit,
      scope,
    };
  });
}

export const centerFinanceStatement = centerStatement;
