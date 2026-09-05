import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { getCenterRoomsWithSplit, getCenterAffiliations } from "@/lib/services/admin/rooms-split";
import { centerStatement } from "@/lib/services/finance/finance-reports";
import { listTransactions } from "@/lib/services/finance/accountant";
import { Prisma } from "@repo/database";
import { parsePageLimit } from "@/lib/validation/common";

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

export function centerOverview(centerId: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({ where: { id: centerId } });
    if (!center) throw new NotFoundError("Center not found");

    const [
      admins,
      teacherCount,
      studentCount,
      courseCount,
      roomCount,
      staffCount,
      activeSubs,
      pendingCollabs,
      sessionCount,
    ] = await Promise.all([
      tx.centerAdminProfile.findMany({ where: { centerId }, select: { userId: true } }),
      tx.centerTeacherAffiliation.count({ where: { centerId, status: "active", removedAt: null } }),
      tx.centerStudentRoster.count({ where: { centerId, leftAt: null } }),
      tx.course.count({ where: { centerId } }),
      tx.room.count({ where: { centerId, isActive: true } }),
      tx.centerStaff.count({ where: { centerId, removedAt: null } }),
      tx.subscription.count({ where: { centerId, status: "active" } }),
      tx.collaborationRequest.count({ where: { centerId, status: "pending" } }),
      tx.course.findMany({ where: { centerId }, select: { id: true } }).then((cs) =>
        cs.length ? tx.session.count({ where: { courseId: { in: cs.map((c) => c.id) } } }) : 0,
      ),
    ]);

    const adminUsers = await userMap(tx, admins.map((a) => a.userId));

    return {
      center,
      admins: admins.map((a) => adminUsers.get(a.userId) ?? { id: a.userId, name: null }),
      counts: {
        teachers: teacherCount,
        students: studentCount,
        courses: courseCount,
        rooms: roomCount,
        staff: staffCount,
        activeSubscriptions: activeSubs,
        pendingCollaborations: pendingCollabs,
        sessions: sessionCount,
      },
    };
  });
}

export const centerRooms = getCenterRoomsWithSplit;
export const centerTeachers = getCenterAffiliations;

export function centerStudents(centerId: string, args: PageArgs & { q?: string; includeLeft?: boolean } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.CenterStudentRosterWhereInput = { centerId };
    if (!args.includeLeft) where.leftAt = null;

    const [rows, total] = await Promise.all([
      tx.centerStudentRoster.findMany({ where, orderBy: { addedAt: "desc" }, skip, take }),
      tx.centerStudentRoster.count({ where }),
    ]);

    const profiles = rows.length
      ? await tx.studentProfile.findMany({
          where: { userId: { in: rows.map((r) => r.studentId) } },
          select: {
            userId: true,
            fullName: true,
            studentCode: true,
            phone: true,
            gradeLevelId: true,
            walletBalance: true,
            pointsBalance: true,
          },
        })
      : [];
    const byUser = new Map(profiles.map((p) => [p.userId as string, p]));
    const users = await userMap(tx, rows.map((r) => r.studentId));

    return {
      data: rows.map((r) => {
        const u = users.get(r.studentId);
        const p = byUser.get(r.studentId);
        return {
          rosterId: r.id,
          studentId: r.studentId,
          name: u?.name ?? p?.fullName ?? null,
          email: u?.email ?? null,
          accountStatus: u?.status ?? null,
          studentCode: p?.studentCode ?? null,
          phone: p?.phone ?? null,
          walletBalance: p?.walletBalance ?? 0,
          pointsBalance: p?.pointsBalance ?? 0,
          addedAt: r.addedAt,
          leftAt: r.leftAt,
          blacklisted: r.blacklisted,
          blacklistReason: r.blacklistReason,
        };
      }),
      total,
      page,
      limit,
    };
  });
}

export function centerCourses(centerId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.CourseWhereInput = { centerId };
    const [rows, total] = await Promise.all([
      tx.course.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.course.count({ where }),
    ]);
    const teachers = await userMap(tx, rows.map((r) => r.teacherId));
    const roomIds = [...new Set(rows.map((r) => r.defaultRoomId).filter(Boolean) as string[])];
    const rooms = roomIds.length
      ? await tx.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } })
      : [];
    const roomById = new Map(rooms.map((r) => [r.id, r.name]));

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
        status: c.status,
        teacherId: c.teacherId,
        teacherName: teachers.get(c.teacherId)?.name ?? null,
        roomId: c.defaultRoomId,
        roomName: c.defaultRoomId ? (roomById.get(c.defaultRoomId) ?? null) : null,
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        startDate: c.startDate,
        endDate: c.endDate,
        maxStudents: c.maxStudents,
        activeEnrollments: enrolledByCourse.get(c.id) ?? 0,
        pricePerMonth: c.pricePerMonth,
        pricePerSession: c.pricePerSession,
        pricingMethod: c.pricingMethod,
        splitPlatformBp: c.splitPlatformBp,
        splitTeacherBp: c.splitTeacherBp,
        splitCenterBp: c.splitCenterBp,
        createdAt: c.createdAt,
      })),
      total,
      page,
      limit,
    };
  });
}

export function centerSessions(centerId: string, args: PageArgs = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const courseIds = await centerCourseIds(tx, centerId);
    if (!courseIds.length) return { data: [], total: 0, page, limit };

    const where: Prisma.SessionWhereInput = { courseId: { in: courseIds } };
    if (range) where.date = range;

    const [rows, total] = await Promise.all([
      tx.session.findMany({ where, orderBy: { date: "desc" }, skip, take }),
      tx.session.count({ where }),
    ]);
    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    const teachers = await userMap(tx, rows.map((r) => r.teacherId));

    return {
      data: rows.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseTitle: titleById.get(s.courseId) ?? null,
        teacherId: s.teacherId,
        teacherName: teachers.get(s.teacherId)?.name ?? null,
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

export function centerEnrollments(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.EnrollmentWhereInput = { centerId };
    if (args.status) where.status = args.status as never;

    const [rows, total] = await Promise.all([
      tx.enrollment.findMany({ where, orderBy: { enrolledAt: "desc" }, skip, take }),
      tx.enrollment.count({ where }),
    ]);
    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    const students = await userMap(tx, rows.map((r) => r.studentId));

    return {
      data: rows.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: students.get(e.studentId)?.name ?? null,
        courseId: e.courseId,
        courseTitle: titleById.get(e.courseId) ?? null,
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

export function centerSubscriptions(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.SubscriptionWhereInput = { centerId };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total, totals] = await Promise.all([
      tx.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.subscription.count({ where }),
      tx.subscription.groupBy({ by: ["status"], where: { centerId }, _count: { _all: true }, _sum: { price: true } }),
    ]);
    const students = await userMap(tx, rows.map((r) => r.studentId));
    const teachers = await userMap(tx, rows.map((r) => r.teacherId));
    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));

    return {
      data: rows.map((s) => ({
        id: s.id,
        studentId: s.studentId,
        studentName: students.get(s.studentId)?.name ?? null,
        teacherId: s.teacherId,
        teacherName: teachers.get(s.teacherId)?.name ?? null,
        courseId: s.courseId,
        courseTitle: titleById.get(s.courseId) ?? null,
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
      totals: totals.map((t) => ({ status: t.status, count: t._count._all, amount: t._sum.price ?? 0 })),
      total,
      page,
      limit,
    };
  });
}

export function centerAttendance(centerId: string, args: PageArgs & { status?: string } = {}) {
  const { page, limit, skip, take } = paging(args);
  const range = dateRange(args);
  return platformDb(async (tx) => {
    await assertCenter(tx, centerId);
    const where: Prisma.AttendanceRecordWhereInput = { centerId };
    if (args.status) where.status = args.status as never;
    if (range) where.createdAt = range;

    const [rows, total, byStatus] = await Promise.all([
      tx.attendanceRecord.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      tx.attendanceRecord.count({ where }),
      tx.attendanceRecord.groupBy({ by: ["status"], where: { centerId }, _count: { _all: true } }),
    ]);
    const students = await userMap(tx, rows.map((r) => r.studentId));
    const courses = await tx.course.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.courseId))] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    const sessions = rows.length
      ? await tx.session.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.sessionId))] } },
          select: { id: true, date: true, startTime: true },
        })
      : [];
    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    return {
      data: rows.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        studentName: students.get(a.studentId)?.name ?? null,
        courseId: a.courseId,
        courseTitle: titleById.get(a.courseId) ?? null,
        sessionId: a.sessionId,
        sessionDate: sessionById.get(a.sessionId)?.date ?? null,
        status: a.status,
        counterAt: a.counterAt,
        doorAt: a.doorAt,
        synced: a.synced,
        createdAt: a.createdAt,
      })),
      summary: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      total,
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
    await assertCenter(tx, centerId);
    const [collabs, enrollmentRequests, affiliations] = await Promise.all([
      tx.collaborationRequest.findMany({
        where: { centerId, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.enrollmentRequest.findMany({
        where: { centerId, status: "pending" },
        orderBy: { submittedAt: "desc" },
        take: 100,
      }),
      tx.centerTeacherAffiliation.findMany({
        where: { centerId, status: "pending", removedAt: null },
        orderBy: { invitedAt: "desc" },
        take: 100,
      }),
    ]);

    const teachers = await userMap(tx, [
      ...collabs.map((c) => c.teacherId),
      ...affiliations.map((a) => a.teacherId),
    ]);
    const students = await userMap(tx, enrollmentRequests.map((e) => e.studentId));
    const subjects = collabs.length
      ? await tx.subject.findMany({
          where: { id: { in: [...new Set(collabs.map((c) => c.subjectId))] } },
          select: { id: true, nameEn: true, nameAr: true },
        })
      : [];
    const subjectById = new Map(subjects.map((s) => [s.id, s.nameEn ?? s.nameAr]));
    const courses = enrollmentRequests.length
      ? await tx.course.findMany({
          where: { id: { in: [...new Set(enrollmentRequests.map((e) => e.courseId))] } },
          select: { id: true, title: true },
        })
      : [];
    const courseById = new Map(courses.map((c) => [c.id, c.title]));

    return {
      collaborationRequests: collabs.map((c) => ({
        id: c.id,
        initiator: c.initiator,
        teacherId: c.teacherId,
        teacherName: teachers.get(c.teacherId)?.name ?? null,
        subjectName: subjectById.get(c.subjectId) ?? null,
        roomId: c.roomId,
        proposedPricingMethod: c.proposedPricingMethod,
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        startDate: c.startDate,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      })),
      enrollmentRequests: enrollmentRequests.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: students.get(e.studentId)?.name ?? null,
        courseId: e.courseId,
        courseTitle: courseById.get(e.courseId) ?? null,
        submittedAt: e.submittedAt,
        expiresAt: e.expiresAt,
      })),
      affiliations: affiliations.map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: teachers.get(a.teacherId)?.name ?? null,
        invitedAt: a.invitedAt,
        expiresAt: a.expiresAt,
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
