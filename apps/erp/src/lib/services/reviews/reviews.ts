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

/**
 * The teacher's headline rating — ONE VOTE PER STUDENT.
 *
 * Counts only OVERALL reviews (`lessonId: null`). Per-lesson ratings are about
 * a lesson, and a student who rates twelve lessons must not outweigh eleven
 * other students in the number shown on a teacher's profile. Every row that
 * existed before per-lesson ratings has `lessonId` NULL, so this filter leaves
 * every already-computed ratingAvg/ratingCount byte-identical.
 */
async function recomputeRating(tx: TenantTx, teacherId: string) {
  const reviews = await tx.review.findMany({
    where: { teacherId, lessonId: null },
    select: { rating: true },
  });
  const count = reviews.length;
  const avg = count === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / count;
  await tx.teacherProfile.updateMany({
    where: { userId: teacherId },
    data: { ratingAvg: Math.round(avg * 100) / 100, ratingCount: count },
  });
}

/**
 * You may rate only what you actually attended.
 *
 * Two shapes, one rule. Rating a TEACHER needs one present attendance with
 * that teacher, anywhere. Rating a LESSON needs a present attendance at THAT
 * lesson — and the lesson must be the named teacher's, so a lesson cannot be
 * rated under someone else's name (which is also what keeps the
 * reviews_one_per_lesson index, keyed on student+lesson, sufficient).
 *
 * Returns the centerId to stamp on the review, taken from the attendance
 * record rather than from the caller.
 */
async function checkEligibility(
  tx: TenantTx,
  studentId: string,
  teacherId: string,
  lessonId?: string | null,
) {
  if (lessonId) {
    const lesson = await tx.session.findUnique({
      where: { id: lessonId },
      select: { id: true, teacherId: true },
    });
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (lesson.teacherId !== teacherId) {
      throw new ForbiddenError("That lesson is not taught by this teacher");
    }

    const record = await tx.attendanceRecord.findFirst({
      where: { studentId, sessionId: lessonId, status: "present" },
    });
    if (!record) {
      throw new ForbiddenError("You must have attended this lesson to rate it");
    }
    return record.centerId;
  }

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
  return record.centerId;
}

export async function createReview(
  input: { teacherId: string; rating: number; text?: string; lessonId?: string | null },
  user: SessionUser,
) {
  const lessonId = input.lessonId ?? null;

  return scopedDb(user, async (tx) => {
    const centerId = await checkEligibility(tx, user.id, input.teacherId, lessonId);

    const teacher = await tx.user.findFirst({
      where: { id: input.teacherId, role: "teacher" },
    });
    if (!teacher) throw new NotFoundError("Teacher not found");

    // The duplicate check is scoped to the SAME axis the database enforces, so
    // the friendly 409 and the index agree about what a duplicate is. Overall
    // reviews collide per teacher; lesson ratings collide per lesson. Checking
    // the old way (any row for this teacher) would have refused a student's
    // second lesson rating with "you already reviewed this teacher".
    const existing = await tx.review.findFirst({
      where: lessonId
        ? { studentId: user.id, lessonId }
        : { studentId: user.id, teacherId: input.teacherId, lessonId: null },
    });
    if (existing) {
      throw new ConflictError(
        lessonId ? "You already rated this lesson" : "You already reviewed this teacher",
      );
    }

    const review = await tx.review.create({
      data: {
        studentId: user.id,
        teacherId: input.teacherId,
        centerId,
        lessonId,
        rating: input.rating,
        text: input.text ?? null,
      },
    });

    await recomputeRating(tx, input.teacherId);

    // Points for the STANDING review only. `teacher_rating` is worth 15 points
    // (seed.ts), and a student can attend dozens of lessons — awarding per
    // lesson rating would turn the new per-lesson path into a points farm.
    // Restricting it here also keeps the award identical to what every
    // existing review earned, since those are all overall reviews.
    if (!lessonId) {
      await awardPoints(tx, user.id, "teacher_rating", { reason: "Submitted a rating" });
    }

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

    // Overall reviews only: rating one lesson must not remove the teacher from
    // the "teachers you can review" list, which is about the standing review.
    const reviewed = await tx.review.findMany({
      where: { studentId, lessonId: null },
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
