import { platformDb, type TenantTx } from "../../db/scope";
import { ForbiddenError, NotFoundError, BusinessRuleError } from "../../errors/classes";
import { awardPoints } from "../points/points";
import { nextTxnRefs } from "./ref-numbers";
import type { SessionUser } from "../../auth/types";
import { computeAgreementSplit, computeLessonSplit, computeNoRoomLessonSplit, resolveLessonPrice } from "./fees";
import { resolveCommission } from "./commission";
import { lockSessionRow } from "../attendance/lesson-lock";
import { creditMove, resolveFundingLegs, type FundingSource } from "./center-credit";
import { resolveTeacherAgreement, type ResolvedAgreement } from "./agreements";

export { computeLessonSplit };

type Distribution = {
  distributed: boolean;
  reason?: string;
  presentCount?: number;
  perSessionPrice?: number;
  centerShare?: number;
  teacherNetTotal?: number;
  centerNetTotal?: number;
  platformEarned?: number;
  platformHeldGross?: number;
  centerHeldGross?: number;
  creditDebited?: number;
};

type LessonCourseShape = {
  pricingMethod: string | null;
  splitPlatformBp: number | null;
  splitCenterBp: number | null;
  m2CenterFee: number | null;
  m2CenterBp: number | null;
};
type LessonEconomics = {
  centerShare: number;
  fees: { platformTeacherFee: number; platformCenterFee: number };
  clampedNote: string;
  feeExceedsPrice: boolean;
};
type LessonRates = {
  affiliationCenterShare: number;
  commission: { platformTeacherFee: number; platformCenterFee: number };
  agreement: ResolvedAgreement | null;
};

async function loadLessonRates(
  tx: TenantTx,
  args: { centerId: string; teacherId: string; onDate: Date },
): Promise<LessonRates> {
  const affiliation = await tx.centerTeacherAffiliation.findFirst({
    where: { centerId: args.centerId, teacherId: args.teacherId, status: "active" },
    select: { centerShare: true },
  });
  const commission = await resolveCommission(tx, {
    teacherId: args.teacherId,
    centerId: args.centerId,
  });
  const agreement = await resolveTeacherAgreement(tx, {
    centerId: args.centerId,
    teacherId: args.teacherId,
    onDate: args.onDate,
  });
  return { affiliationCenterShare: affiliation?.centerShare ?? 0, commission, agreement };
}

function economicsAt(
  perSessionPrice: number,
  course: LessonCourseShape,
  rates: LessonRates,
): LessonEconomics {
  if (course.pricingMethod === "per_attending_student") {
    const platformCut = Math.round((perSessionPrice * (course.splitPlatformBp ?? 0)) / 10_000);
    const centerShare =
      course.m2CenterFee ?? Math.round((perSessionPrice * (course.m2CenterBp ?? 0)) / 10_000);
    return {
      centerShare,
      fees: { platformTeacherFee: platformCut, platformCenterFee: 0 },
      clampedNote: "",
      feeExceedsPrice: perSessionPrice - platformCut - centerShare < 0,
    };
  }

  if (course.splitPlatformBp != null && course.splitCenterBp != null) {
    const platformCut = Math.round((perSessionPrice * course.splitPlatformBp) / 10_000);
    return {
      centerShare: Math.round((perSessionPrice * course.splitCenterBp) / 10_000),
      fees: { platformTeacherFee: platformCut, platformCenterFee: 0 },
      clampedNote: "",
      feeExceedsPrice: false,
    };
  }

  if (rates.agreement) {
    const ag = computeAgreementSplit(perSessionPrice, rates.agreement, rates.commission);
    return {
      centerShare: ag.centerShare,
      fees: ag.fees,
      clampedNote: ag.clamped ? " — capped to the lesson's value (agreement)" : "",
      feeExceedsPrice: false,
    };
  }

  const noRoom = computeNoRoomLessonSplit(
    perSessionPrice,
    rates.affiliationCenterShare,
    rates.commission,
  );
  return {
    centerShare: noRoom.centerShare,
    fees: noRoom.fees,
    clampedNote: noRoom.clamped
      ? ` — capped to the lesson's value (price ${perSessionPrice}, center share ${rates.affiliationCenterShare})`
      : "",
    feeExceedsPrice: false,
  };
}

async function resolveLessonEconomics(
  tx: TenantTx,
  args: {
    course: LessonCourseShape;
    centerId: string;
    teacherId: string;
    perSessionPrice: number;
    onDate: Date;
  },
): Promise<LessonEconomics> {
  const rates = await loadLessonRates(tx, {
    centerId: args.centerId,
    teacherId: args.teacherId,
    onDate: args.onDate,
  });
  return economicsAt(args.perSessionPrice, args.course, rates);
}

// Exported for the L-02 proof (l02-monthly-remainder.test.ts); the engine is
// its only production caller.
export async function resolveStudentLessonPrices(
  tx: TenantTx,
  args: {
    course: { id: string; price: number; pricePerSession: number | null; settlementBasis: string };
    sessionId: string;
    sessionDate: Date;
    studentIds: string[];
    courseLevelPrice: number;
  },
): Promise<Map<string, number>> {
  const { course, sessionId, sessionDate, studentIds, courseLevelPrice } = args;
  const out = new Map<string, number>();

  if (course.settlementBasis !== "subscription") {
    for (const id of studentIds) out.set(id, courseLevelPrice);
    return out;
  }

  const subs = await tx.subscription.findMany({
    where: { courseId: course.id, studentId: { in: studentIds }, status: "active" },
    select: {
      studentId: true,
      plan: true,
      price: true,
      sessionId: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  const lessonsInPeriod = new Map<string, number>();
  const countFor = async (from: Date, to: Date) => {
    const key = `${from.toISOString()}|${to.toISOString()}`;
    const cached = lessonsInPeriod.get(key);
    if (cached !== undefined) return cached;
    const n = await tx.session.count({
      where: { courseId: course.id, date: { gte: from, lte: to }, status: { not: "cancelled" } },
    });
    lessonsInPeriod.set(key, n);
    return n;
  };

  for (const id of studentIds) {
    const mine = subs.filter((s) => s.studentId === id);
    const pass = mine.find((s) => s.plan === "per_session" && s.sessionId === sessionId);
    if (pass) {
      out.set(id, pass.price);
      continue;
    }
    const monthly = mine.find(
      (s) =>
        s.plan === "monthly" &&
        s.periodStart != null &&
        s.periodEnd != null &&
        s.periodStart <= sessionDate &&
        sessionDate <= s.periodEnd,
    );
    if (monthly) {
      const from = monthly.periodStart as Date;
      const to = monthly.periodEnd as Date;
      const n = await countFor(from, to);
      if (n <= 0) {
        out.set(id, monthly.price);
        continue;
      }
      // L-02: floor per lesson; the LAST lesson of the period carries the
      // remainder, so Σ(lesson shares) === monthly.price exactly. "Last" is by
      // (date, id) among the period's non-cancelled sessions, so two sessions
      // on one day still order deterministically.
      const base = Math.floor(monthly.price / n);
      const before = await tx.session.count({
        where: {
          courseId: course.id,
          date: { gte: from, lte: to },
          status: { not: "cancelled" },
          OR: [{ date: { lt: sessionDate } }, { date: sessionDate, id: { lt: sessionId } }],
        },
      });
      const isLast = before === n - 1;
      out.set(id, isLast ? monthly.price - base * (n - 1) : base);
      continue;
    }
    out.set(id, 0);
  }
  return out;
}

export async function distributeSessionRevenue(
  tx: TenantTx,
  sessionId: string,
  settledBy?: string,
): Promise<Distribution> {
  await lockSessionRow(tx, sessionId);
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({ where: { id: session.courseId } });
  if (!course) throw new NotFoundError("Course not found");

  if (!course.centerId) {
    return { distributed: false, reason: "teacher_direct_settled_at_payment" };
  }
  const centerId = course.centerId;
  const teacherId = course.teacherId;

  const present = await tx.attendanceRecord.findMany({
    where: { sessionId, status: "present" },
    select: { studentId: true },
  });
  if (present.length === 0) return { distributed: false, reason: "no_present_students" };

  const plannedSessions = await tx.session.count({ where: { courseId: course.id } });
  const courseLevelPrice = resolveLessonPrice(course, plannedSessions);
  const priceFor = await resolveStudentLessonPrices(tx, {
    course,
    sessionId,
    sessionDate: session.date,
    studentIds: present.map((p) => p.studentId),
    courseLevelPrice,
  });

  const fundingFor = await resolveFundingLegs(tx, {
    courseId: course.id,
    sessionId,
    sessionDate: session.date,
    studentIds: present.map((p) => p.studentId),
  });

  const claim = await tx.session.updateMany({
    where: { id: sessionId, distributedAt: null },
    data: { distributedAt: new Date() },
  });
  if (claim.count === 0) return { distributed: false, reason: "already_distributed" };

  const rates = await loadLessonRates(tx, { centerId, teacherId, onDate: session.date });

  for (const { studentId } of present) {
    if (economicsAt(priceFor.get(studentId) ?? 0, course, rates).feeExceedsPrice) {
      throw new BusinessRuleError(
        "The hall's per-student fee exceeds this lesson's price — set the course pricing before completing sessions",
      );
    }
  }

  if (present.every(({ studentId }) => (priceFor.get(studentId) ?? 0) <= 0)) {
    throw new BusinessRuleError(
      "This lesson has no price — set the class pricing before completing sessions",
    );
  }

  const methodNote =
    course.pricingMethod === "per_attending_student"
      ? course.m2CenterFee != null
        ? ` — per-student method, ${(course.m2CenterFee / 100).toFixed(2)} EGP/student`
        : ` — per-student method, ${(course.m2CenterBp ?? 0) / 100}%/student`
      : "";

  const refs = await nextTxnRefs(tx, present.length * 3);

  let teacherNetTotal = 0;
  let centerNetTotal = 0;
  let platformTotal = 0;
  let grossTotal = 0;
  let platformHeldGross = 0;
  let centerHeldGross = 0;
  let centerNetPlatformHeld = 0;
  let centerHeldTeacherNet = 0;
  let centerHeldFees = 0;

  const rows: Parameters<TenantTx["transaction"]["createMany"]>[0]["data"] = [];
  for (let i = 0; i < present.length; i++) {
    const { studentId } = present[i];
    const studentPrice = priceFor.get(studentId) ?? 0;
    const { centerShare, fees, clampedNote } = economicsAt(studentPrice, course, rates);
    const { teacherNet, centerNet } = computeLessonSplit(studentPrice, centerShare, fees);
    const noteSuffix = methodNote + clampedNote;
    const funding: FundingSource = fundingFor.get(studentId) ?? "center_held";
    teacherNetTotal += teacherNet;
    centerNetTotal += centerNet;
    platformTotal += fees.platformTeacherFee + fees.platformCenterFee;
    grossTotal += studentPrice;
    if (funding === "platform_held") {
      platformHeldGross += studentPrice;
      centerNetPlatformHeld += centerNet;
    } else {
      centerHeldGross += studentPrice;
      centerHeldTeacherNet += teacherNet;
      centerHeldFees += fees.platformTeacherFee + fees.platformCenterFee;
    }

    const [paymentRef, teacherFeeRef, centerFeeRef] = refs.slice(i * 3, i * 3 + 3);
    rows.push(
      {
        refNumber: paymentRef,
        type: "payment",
        amount: studentPrice,
        fromEntityId: studentId,
        toEntityId: centerId,
        centerId,
        lessonId: sessionId,
        status: "completed",
        funding,
        dataSource: course.dataSource,
        notes: "Lesson revenue",
      },
      {
        refNumber: teacherFeeRef,
        type: "commission",
        amount: fees.platformTeacherFee,
        fromEntityId: teacherId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        dataSource: course.dataSource,
        notes: `Platform fee (teacher side)${noteSuffix}`,
      },
      {
        refNumber: centerFeeRef,
        type: "commission",
        amount: fees.platformCenterFee,
        fromEntityId: centerId,
        toEntityId: null,
        centerId,
        lessonId: sessionId,
        status: "completed",
        dataSource: course.dataSource,
        notes: `Platform fee (center side)${noteSuffix}`,
      },
    );
    await awardPoints(tx, studentId, "attendance", { reason: "Attended a lesson" });
  }

  await tx.transaction.createMany({ data: rows });

  {
    await tx.sessionSettlement.create({
      data: {
        sessionId,
        courseId: course.id,
        centerId,
        teacherId,
        roomId: session.roomId ?? course.defaultRoomId,
        pricingMethod: course.pricingMethod,
        presentCount: present.length,
        perSessionPrice: Math.round(grossTotal / present.length),
        platformHeldGross,
        centerHeldGross,
        platformTotal,
        centerTotal: centerNetTotal,
        teacherTotal: teacherNetTotal,
        m2CenterFee: course.m2CenterFee,
        m2CenterBp: course.m2CenterBp,
        settledBy: settledBy ?? teacherId,
      },
    });
  }

  if (teacherNetTotal !== 0) {
    await tx.teacherProfile.updateMany({
      where: { userId: teacherId },
      data: { walletBalance: { increment: teacherNetTotal } },
    });
  }
  if (centerNetPlatformHeld !== 0) {
    await tx.center.update({
      where: { id: centerId },
      data: { walletBalance: { increment: centerNetPlatformHeld } },
    });
  }
  if (centerHeldTeacherNet > 0) {
    await creditMove(tx, {
      centerId,
      type: "teacher_debit",
      delta: -centerHeldTeacherNet,
      sessionId,
      recordedBy: settledBy ?? teacherId,
      reason: "Teacher share of center-collected lesson revenue",
    });
  }
  if (centerHeldFees > 0) {
    await creditMove(tx, {
      centerId,
      type: "commission_debit",
      delta: -centerHeldFees,
      sessionId,
      recordedBy: settledBy ?? teacherId,
      reason: "Platform fees on center-collected lesson revenue",
    });
  }

  return {
    distributed: true,
    presentCount: present.length,
    perSessionPrice: Math.round(grossTotal / present.length),
    teacherNetTotal,
    centerNetTotal,
    platformEarned: platformTotal,
    platformHeldGross,
    centerHeldGross,
    creditDebited: centerHeldTeacherNet + centerHeldFees,
  };
}

async function assertMaySettle(
  tx: TenantTx,
  sessionId: string,
  user: SessionUser,
): Promise<{
  session: NonNullable<Awaited<ReturnType<TenantTx["session"]["findUnique"]>>>;
  course: { centerId: string | null; teacherId: string };
}> {
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("Session not found");

  const course = await tx.course.findUnique({
    where: { id: session.courseId },
    select: { centerId: true, teacherId: true },
  });
  if (!course) throw new NotFoundError("Course not found");

  if (user.role === "teacher") {
    if (session.teacherId !== user.id) {
      throw new ForbiddenError("Only the session's teacher can complete it");
    }
  } else if (user.role === "center_admin") {
    if (course.centerId !== user.centerId) {
      throw new ForbiddenError("Session belongs to a different center");
    }
  } else {
    throw new ForbiddenError();
  }

  return { session, course };
}

export async function previewSessionSettlement(sessionId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const { session, course } = await assertMaySettle(tx, sessionId, user);

      const [presentRows, counterOnlyCount, plannedSessions, full] = await Promise.all([
        tx.attendanceRecord.findMany({
          where: { sessionId, status: "present" },
          select: { studentId: true },
        }),
        tx.attendanceRecord.count({ where: { sessionId, status: "counter_only" } }),
        tx.session.count({ where: { courseId: session.courseId } }),
        tx.course.findUnique({
          where: { id: session.courseId },
          select: {
            id: true,
            title: true,
            price: true,
            pricePerSession: true,
            settlementBasis: true,
            pricingMethod: true,
            splitPlatformBp: true,
            splitTeacherBp: true,
            splitCenterBp: true,
            m2CenterFee: true,
            m2CenterBp: true,
          },
        }),
      ]);
      const present = presentRows.length;

      const courseLevelPrice = resolveLessonPrice(
        {
          price: full?.price ?? 0,
          pricePerSession: full?.pricePerSession ?? null,
          settlementBasis: full?.settlementBasis ?? null,
        },
        plannedSessions,
      );

      const priceFor = full
        ? await resolveStudentLessonPrices(tx, {
            course: {
              id: full.id,
              price: full.price,
              pricePerSession: full.pricePerSession,
              settlementBasis: full.settlementBasis,
            },
            sessionId,
            sessionDate: session.date,
            studentIds: presentRows.map((p) => p.studentId),
            courseLevelPrice,
          })
        : new Map<string, number>();

      const courseShape = {
        pricingMethod: full?.pricingMethod ?? null,
        splitPlatformBp: full?.splitPlatformBp ?? null,
        splitCenterBp: full?.splitCenterBp ?? null,
        m2CenterFee: full?.m2CenterFee ?? null,
        m2CenterBp: full?.m2CenterBp ?? null,
      };
      const rates =
        course.centerId && present > 0
          ? await loadLessonRates(tx, {
              centerId: course.centerId,
              teacherId: course.teacherId,
              onDate: session.date,
            })
          : null;

      const previewFunding =
        course.centerId && present > 0
          ? await resolveFundingLegs(tx, {
              courseId: session.courseId,
              sessionId,
              sessionDate: session.date,
              studentIds: presentRows.map((p) => p.studentId),
            })
          : new Map<string, FundingSource>();

      let gross = 0,
        teacherTotal = 0,
        centerTotal = 0,
        platformTotal = 0,
        pvPlatformHeld = 0,
        pvCenterHeld = 0,
        feeExceeds = false;
      if (rates) {
        for (const { studentId } of presentRows) {
          const price = priceFor.get(studentId) ?? 0;
          const e = economicsAt(price, courseShape, rates);
          const s = computeLessonSplit(price, e.centerShare, e.fees);
          gross += price;
          teacherTotal += s.teacherNet;
          centerTotal += s.centerNet;
          platformTotal += e.fees.platformTeacherFee + e.fees.platformCenterFee;
          if ((previewFunding.get(studentId) ?? "center_held") === "platform_held") {
            pvPlatformHeld += price;
          } else {
            pvCenterHeld += price;
          }
          feeExceeds = feeExceeds || e.feeExceedsPrice;
        }
      }
      const perSessionPrice = present > 0 ? Math.round(gross / present) : courseLevelPrice;
      const split = rates && present > 0 ? { teacherTotal, centerTotal, platformTotal } : null;

      return {
        sessionId,
        courseTitle: full?.title ?? null,
        status: session.status,
        alreadySettled: session.distributedAt !== null,
        settledAt: session.distributedAt,
        cancelled: session.status === "cancelled",
        unpriced: present > 0 ? gross <= 0 : courseLevelPrice <= 0,
        nothingToSettle: present === 0,
        counterOnlyCount,
        platformHeldGross: pvPlatformHeld,
        centerHeldGross: pvCenterHeld,
        feeExceedsPrice: feeExceeds,
        isTeacherDirect: course.centerId === null,

        presentCount: present,
        plannedSessions,
        perSessionPrice,
        settlementBasis: full?.settlementBasis ?? null,
        perStudent: split
          ? {
              platform: Math.round(split.platformTotal / present),
              center: Math.round(split.centerTotal / present),
              teacher: Math.round(split.teacherTotal / present),
            }
          : null,
        total: split
          ? {
              platform: split.platformTotal,
              center: split.centerTotal,
              teacher: split.teacherTotal,
              gross,
            }
          : null,
        pricingMethod: full?.pricingMethod ?? null,
        splitPlatformBp: full?.splitPlatformBp ?? null,
        splitTeacherBp: full?.splitTeacherBp ?? null,
        splitCenterBp: full?.splitCenterBp ?? null,
      };
    },
    { actorId: user.id },
  );
}

export async function completeSession(sessionId: string, user: SessionUser) {
  return platformDb((tx) => completeSessionTx(tx, sessionId, user), { actorId: user.id });
}

export async function completeSessionTx(
  tx: TenantTx,
  sessionId: string,
  user: SessionUser,
) {
  return (async () => {
    {
      const { session } = await assertMaySettle(tx, sessionId, user);

      if (session.status === "cancelled") {
        throw new BusinessRuleError("A cancelled session cannot be completed");
      }

      const wasCompleted = session.status === "completed";
      const updated = wasCompleted
        ? session
        : await tx.session.update({
            where: { id: sessionId },
            data: { status: "completed", editedAt: new Date() },
          });

      const distribution = await distributeSessionRevenue(tx, sessionId, user.id);
      return { session: updated, distribution };
    }
  })();
}
