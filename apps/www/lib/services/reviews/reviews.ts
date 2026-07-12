import { scopedDb, platformDb, type TenantTx } from "@/lib/db/scope";
import { awardPoints } from "@/lib/services/points/points";
import type { Prisma } from "@repo/database";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BusinessRuleError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

async function recomputeRating(tx: TenantTx, teacherId: string) {
  const reviews = await tx.review.findMany({
    where: { teacherId },
    select: { rating: true },
  });
  const count = reviews.length;
  const avg = count === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / count;
  // updateOne-style: no-op (not an error) when the profile row is missing.
  await tx.teacherProfile.updateMany({
    where: { userId: teacherId },
    data: { ratingAvg: Math.round(avg * 100) / 100, ratingCount: count },
  });
}

async function checkEligibility(tx: TenantTx, studentId: string, teacherId: string) {
  // Student must have at least one present attendance in a session taught by target teacher
  const sessions = await tx.session.findMany({
    where: { teacherId },
    select: { id: true },
  });
  if (sessions.length === 0) throw new ForbiddenError("No attendance found with this teacher");

  const sessionIds = sessions.map((s) => s.id);
  const record = await tx.attendanceRecord.findFirst({
    where: {
      studentId,
      sessionId: { in: sessionIds },
      status: "present",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new ForbiddenError("You must have at least one present attendance for this teacher");
  }
  // The center where the student actually studied with this teacher.
  return record.centerId;
}

export async function createReview(
  input: { teacherId: string; rating: number; text?: string },
  user: SessionUser,
) {
  return scopedDb(user, async (tx) => {
    const centerId = await checkEligibility(tx, user.id, input.teacherId);

    const teacher = await tx.user.findFirst({
      where: { id: input.teacherId, role: "teacher" },
    });
    if (!teacher) throw new NotFoundError("Teacher not found");

    const existing = await tx.review.findFirst({
      where: { studentId: user.id, teacherId: input.teacherId },
    });
    if (existing) throw new ConflictError("You already reviewed this teacher");

    const review = await tx.review.create({
      data: {
        studentId: user.id,
        teacherId: input.teacherId,
        centerId,
        rating: input.rating,
        text: input.text ?? null,
      },
    });

    await recomputeRating(tx, input.teacherId);

    // Engagement points for submitting a rating (PRD §5.7).
    await awardPoints(tx, user.id, "teacher_rating", { reason: "Submitted a rating" });

    return review;
  });
}

export async function listReviews(
  filters: { teacherId?: string; studentId?: string; centerId?: string; page?: string; limit?: string },
) {
  const where: Prisma.ReviewWhereInput = {};
  if (filters.teacherId) where.teacherId = filters.teacherId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.centerId) where.centerId = filters.centerId;

  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "20", 10) || 20));
  const skip = (page - 1) * limit;

  return platformDb(async (tx) => {
    const [rows, total] = await Promise.all([
      tx.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      tx.review.count({ where }),
    ]);

    // No Prisma relation from Review -> User; hydrate the referenced student and
    // teacher names in a single follow-up query (replaces the old .populate()).
    const userIds = [
      ...new Set(rows.flatMap((r) => [r.studentId, r.teacherId])),
    ];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const reviews = rows.map((r) => ({
      ...r,
      studentId: byId.get(r.studentId) ?? r.studentId,
      teacherId: byId.get(r.teacherId) ?? r.teacherId,
    }));

    return { reviews, total, page, limit };
  });
}

export async function updateReview(
  reviewId: string,
  input: { rating?: number; text?: string },
  user: SessionUser,
) {
  return scopedDb(user, async (tx) => {
    const review = await tx.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundError("Review not found");
    if (review.studentId !== user.id) {
      throw new ForbiddenError("Not your review");
    }

    // PRD §8.3: a review may only be edited within 24h of submission.
    const ageMs = Date.now() - review.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      throw new BusinessRuleError("Reviews can only be edited within 24 hours of submission");
    }

    if (input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
      throw new BusinessRuleError("Rating must be 1–5");
    }

    const updated = await tx.review.update({
      where: { id: reviewId },
      data: {
        ...(input.rating !== undefined && { rating: input.rating }),
        ...(input.text !== undefined && { text: input.text }),
      },
    });

    await recomputeRating(tx, review.teacherId);
    return updated;
  });
}

export async function getEligibleTeachers(studentId: string) {
  return platformDb(async (tx) => {
    const attendance = await tx.attendanceRecord.findMany({
      where: { studentId, status: "present" },
      select: { sessionId: true },
    });

    const sessionIds = attendance.map((a) => a.sessionId);
    if (sessionIds.length === 0) return [];

    const sessions = await tx.session.findMany({
      where: { id: { in: sessionIds } },
      select: { teacherId: true },
    });

    const teacherIds = [...new Set(sessions.map((s) => s.teacherId))];

    const reviewed = await tx.review.findMany({
      where: { studentId },
      select: { teacherId: true },
    });
    const reviewedIds = new Set(reviewed.map((r) => r.teacherId));

    const eligibleIds = teacherIds.filter((id) => !reviewedIds.has(id));
    if (eligibleIds.length === 0) return [];

    const teachers = await tx.user.findMany({
      where: { id: { in: eligibleIds }, role: "teacher" },
      select: { id: true, name: true, email: true },
    });

    return teachers;
  });
}

export async function getTeacherPublicProfile(teacherId: string) {
  return platformDb(async (tx) => {
    const teacher = await tx.user.findFirst({
      where: { id: teacherId, role: "teacher", status: "active" },
      // Public endpoint — do NOT expose email or other contact/PII.
      select: { id: true, name: true },
    });
    if (!teacher) throw new NotFoundError("Teacher not found");

    const profile = await tx.teacherProfile.findUnique({
      where: { userId: teacherId },
    });

    return {
      ...teacher,
      bio: profile?.bio ?? "",
      subjects: profile?.subjects ?? [],
      qualifications: profile?.qualifications ?? "",
      experienceYears: profile?.experienceYears ?? 0,
      photoUrl: profile?.photoUrl ?? null,
      ratingAvg: profile?.ratingAvg ?? 0,
      ratingCount: profile?.ratingCount ?? 0,
    };
  });
}
