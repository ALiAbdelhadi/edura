export function computeLessonSplit(
  lessonPrice: number,
  centerShare: number,
  fees: { platformTeacherFee: number; platformCenterFee: number },
) {
  return {
    teacherNet: lessonPrice - fees.platformTeacherFee - centerShare,
    centerNet: centerShare - fees.platformCenterFee,
    platformNet: fees.platformTeacherFee + fees.platformCenterFee,
  };
}

export function computeNoRoomLessonSplit(
  perSessionPrice: number,
  rawCenterShare: number,
  resolved: { platformTeacherFee: number; platformCenterFee: number },
): {
  centerShare: number;
  fees: { platformTeacherFee: number; platformCenterFee: number };
  clamped: boolean;
} {
  const price = Math.max(0, perSessionPrice);
  const rawShare = Math.max(0, rawCenterShare);

  const platformTeacherFee = Math.min(resolved.platformTeacherFee, price);
  const centerShare = Math.min(rawShare, price - platformTeacherFee);
  const platformCenterFee = Math.min(resolved.platformCenterFee, centerShare);

  return {
    centerShare,
    fees: { platformTeacherFee, platformCenterFee },
    clamped:
      platformTeacherFee !== resolved.platformTeacherFee ||
      centerShare !== rawShare ||
      platformCenterFee !== resolved.platformCenterFee,
  };
}

export function computeTeacherDirectSplit(price: number, commissionBp: number) {
  const commission = Math.round((price * commissionBp) / 10_000);
  return { teacherNet: price - commission, platformCommission: commission };
}

export function resolveLessonPrice(
  course: {
    price: number;
    pricePerSession?: number | null;
    settlementBasis?: "course_price" | "session_price" | "subscription" | null;
  },
  plannedSessions: number,
): number {
  const amortised =
    course.price > 0
      ? plannedSessions > 0
        ? Math.round(course.price / plannedSessions)
        : course.price
      : 0;
  const perSession = course.pricePerSession ?? 0;

  if (course.settlementBasis === "session_price") return perSession || amortised;
  return amortised || perSession;
}

export function computeAgreementSplit(
  perSessionPrice: number,
  agreement: {
    basis: "percent_of_net" | "fixed_per_student";
    rateBp: number | null;
    rateFlat: number | null;
    residual: "teacher" | "center";
  },
  resolved: { platformTeacherFee: number; platformCenterFee: number },
): {
  centerShare: number;
  fees: { platformTeacherFee: number; platformCenterFee: number };
  clamped: boolean;
} {
  const price = Math.max(0, perSessionPrice);
  const teacherFee = Math.min(resolved.platformTeacherFee, price);
  const centerFee = Math.min(resolved.platformCenterFee, price - teacherFee);
  const net = price - teacherFee - centerFee;

  const rawTake =
    agreement.basis === "percent_of_net"
      ? Math.round((net * (agreement.rateBp ?? 0)) / 10_000)
      : Math.max(0, agreement.rateFlat ?? 0);

  if (agreement.residual === "center") {
    const teacherTake = Math.min(rawTake, net);
    return {
      centerShare: price - teacherFee - teacherTake,
      fees: { platformTeacherFee: teacherFee, platformCenterFee: centerFee },
      clamped:
        teacherFee !== resolved.platformTeacherFee ||
        centerFee !== resolved.platformCenterFee ||
        teacherTake !== rawTake,
    };
  }

  const noRoom = computeNoRoomLessonSplit(price, Math.min(rawTake, net), resolved);
  return {
    centerShare: noRoom.centerShare,
    fees: noRoom.fees,
    clamped: noRoom.clamped || rawTake > net,
  };
}
