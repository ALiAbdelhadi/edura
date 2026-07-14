import { platformDb, scopedDb } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError, ForbiddenError, ConflictError } from "@/lib/errors/classes";
import { notify } from "@/lib/services/notifications/notify";
import { resolveCenterAdmins } from "@/lib/services/notifications/fanout";
import type { SessionUser } from "@/lib/auth/session";


export async function createBookingRequest(
  input: { classroomId: string; lessonId: string },
  teacher: SessionUser,
) {
  const { booking, centerAdmins } = await platformDb(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: input.classroomId } });
    if (!room || !room.isActive) throw new NotFoundError("Classroom not found");

    const session = await tx.session.findUnique({ where: { id: input.lessonId } });
    if (!session) throw new NotFoundError("Session not found");
    if (session.teacherId !== teacher.id) {
      throw new ForbiddenError("You can only request a room for your own session");
    }
    const course = await tx.course.findUnique({ where: { id: session.courseId }, select: { centerId: true } });
    if (!course) throw new NotFoundError("Course not found");

    const existing = await tx.classroomBooking.findFirst({
      where: { roomId: input.classroomId, sessionId: input.lessonId, status: { in: ["pending", "approved"] } },
    });
    if (existing) throw new ConflictError("A booking request already exists for this room and session");

    const booking = await tx.classroomBooking.create({
      data: {
        centerId: room.centerId,
        roomId: input.classroomId,
        sessionId: input.lessonId,
        courseId: session.courseId,
        teacherId: teacher.id,
        status: "pending",
      },
    });
    const centerAdmins = await resolveCenterAdmins(room.centerId);
    return { booking, centerAdmins };
  }, { actorId: teacher.id });

  await notify({
    recipients: centerAdmins,
    type: "classroom_request",
    title: "New classroom booking request",
    body: "A teacher requested one of your classrooms for a session.",
    data: { bookingId: booking.id, roomId: booking.roomId, sessionId: booking.sessionId },
  });
  return booking;
}

export function listBookingRequests(user: SessionUser, status?: string) {
  return scopedDb(user, (tx) =>
    tx.classroomBooking.findMany({
      where: {
        centerId: user.centerId,
        ...(status && ["pending", "approved", "rejected"].includes(status) ? { status: status as "pending" } : {}),
      },
      orderBy: { requestedAt: "desc" },
      take: 100,
    }),
  );
}

export async function approveBooking(bookingId: string, centerShare: number, admin: SessionUser) {
  if (!Number.isInteger(centerShare) || centerShare < 0 || centerShare > 99999900) {
    throw new BusinessRuleError("center_share must be an integer between 0 and 99,999,900 piasters");
  }
  const { booking } = await platformDb(async (tx) => {
    const booking = await tx.classroomBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking request not found");
    if (booking.centerId !== admin.centerId) throw new ForbiddenError("Booking belongs to a different center");

    const claimed = await tx.classroomBooking.updateMany({
      where: { id: bookingId, status: "pending" },
      data: { status: "approved", centerShare, decidedAt: new Date(), decidedBy: admin.id },
    });
    if (claimed.count === 0) throw new BusinessRuleError("Booking request is no longer pending");

    const aff = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId: booking.centerId, teacherId: booking.teacherId, status: { in: ["pending", "active"] } },
    });
    if (aff) {
      await tx.centerTeacherAffiliation.update({ where: { id: aff.id }, data: { centerShare } });
    } else {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await tx.centerTeacherAffiliation.create({
        data: { centerId: booking.centerId, teacherId: booking.teacherId, status: "active", centerShare, respondedAt: new Date(), expiresAt },
      });
    }
    return { booking };
  }, { actorId: admin.id });

  await notify({
    recipients: [booking.teacherId],
    type: "classroom_request_decided",
    title: "Classroom request approved",
    body: "Your classroom booking request was approved.",
    data: { bookingId, decision: "approved", centerShare },
  });
  return { id: bookingId, status: "approved", centerShare };
}

export async function rejectBooking(bookingId: string, reason: string, admin: SessionUser) {
  if (!reason?.trim()) throw new BusinessRuleError("Reason is required");
  const { booking } = await platformDb(async (tx) => {
    const booking = await tx.classroomBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking request not found");
    if (booking.centerId !== admin.centerId) throw new ForbiddenError("Booking belongs to a different center");

    const claimed = await tx.classroomBooking.updateMany({
      where: { id: bookingId, status: "pending" },
      data: { status: "rejected", rejectReason: reason, decidedAt: new Date(), decidedBy: admin.id },
    });
    if (claimed.count === 0) throw new BusinessRuleError("Booking request is no longer pending");
    return { booking };
  }, { actorId: admin.id });

  await notify({
    recipients: [booking.teacherId],
    type: "classroom_request_decided",
    title: "Classroom request rejected",
    body: `Your classroom booking request was rejected. Reason: ${reason}`,
    data: { bookingId, decision: "rejected", reason },
  });
  return { id: bookingId, status: "rejected" };
}
