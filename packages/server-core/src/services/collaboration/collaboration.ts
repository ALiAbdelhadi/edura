import { platformDb, scopedDb, type TenantTx } from "../../db/scope";
import { runEffects, type WithEffects } from "../../db/effects";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import type { CollaborationRequest, Course, Prisma } from "@repo/database";
import { notify } from "../notifications/notify";
import { generateSessionsTx } from "../sessions/session-generator";
import {
  resolveCoursePricingSnapshot,
  type RoomPricingMethodValue,
} from "../finance/commission";
import { assertMethod2Enablable } from "../rooms/method2";

const PENDING_TTL_DAYS = 30;
const DEFAULT_COURSE_MONTHS = 3;
const DEFAULT_MAX_STUDENTS = 30;

export type ResponderMode = "party" | "platform_override";

export type CollaborationInput = {
  teacherId: string; // target teacher (center-initiated) or self (teacher-initiated)
  centerId: string; // target center (teacher-initiated) or own (center-initiated)
  subjectId: string;
  gradeLevelId: string;
  trackId?: string | null;
  roomId?: string | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: Date;
  endDate?: Date | null;
  expectedStudents?: number | null;
  proposedPricingMethod?: RoomPricingMethodValue | null;
  message?: string | null;
};

export async function createCollaborationRequest(
  input: CollaborationInput,
  user: SessionUser,
) {
  const initiator = user.role === "teacher" ? "teacher" : "center";
  if (initiator === "teacher" && input.teacherId !== user.id) {
    throw new ForbiddenError("Teachers can only apply as themselves");
  }
  if (initiator === "center" && input.centerId !== user.centerId) {
    throw new ForbiddenError("Centers can only invite to their own center");
  }

  const { value, effects } = await platformDb(
    (tx) => createCollaborationRequestTx(tx, input, user),
    { actorId: user.id },
  );
  await runEffects(effects);
  return value;
}

export async function createCollaborationRequestTx(
  tx: TenantTx,
  input: CollaborationInput,
  user: SessionUser,
) {
  const initiator = user.role === "teacher" ? "teacher" : "center";
  if (initiator === "teacher" && input.teacherId !== user.id) {
    throw new ForbiddenError("Teachers can only apply as themselves");
  }
  if (initiator === "center" && input.centerId !== user.centerId) {
    throw new ForbiddenError("Centers can only invite to their own center");
  }

  const { request, recipients } = await (async () => {
    {
      const [teacher, center] = await Promise.all([
        tx.user.findFirst({
          where: { id: input.teacherId, role: "teacher", status: "active" },
          select: { id: true, name: true },
        }),
        tx.center.findFirst({
          where: { id: input.centerId, status: "active" },
          select: { id: true, name: true },
        }),
      ]);
      if (!teacher) throw new NotFoundError("Teacher not found or not active");
      if (!center) throw new NotFoundError("Center not found or not active");

      const offering = await tx.subjectOffering.findFirst({
        where: {
          subjectId: input.subjectId,
          gradeLevelId: input.gradeLevelId,
          isActive: true,
          OR: [{ trackId: null }, ...(input.trackId ? [{ trackId: input.trackId }] : [])],
        },
        select: { id: true },
      });
      if (!offering) {
        throw new BusinessRuleError("This subject is not offered for the chosen grade/track");
      }

      let proposedPricingMethod: RoomPricingMethodValue | null = null;
      if (input.roomId) {
        const room = await tx.room.findFirst({
          where: { id: input.roomId, centerId: input.centerId, isActive: true },
          select: { id: true, allowedPricingMethods: true },
        });
        if (!room) throw new NotFoundError("Hall not found at this center");

        const allowed = room.allowedPricingMethods as RoomPricingMethodValue[];
        if (input.proposedPricingMethod && !allowed.includes(input.proposedPricingMethod)) {
          throw new BusinessRuleError("This hall does not offer the requested pricing method");
        }
        if (allowed.length === 1) {
          proposedPricingMethod = allowed[0];
        } else if (initiator === "teacher") {
          proposedPricingMethod = input.proposedPricingMethod ?? "whole_room_percent";
        } else {
          if (input.proposedPricingMethod) {
            throw new BusinessRuleError(
              "The teacher chooses the pricing method for this hall when accepting",
            );
          }
          proposedPricingMethod = null;
        }
        if (proposedPricingMethod === "per_attending_student") {
          await assertMethod2Enablable(
            tx,
            { roomId: input.roomId, centerId: input.centerId },
            ["per_attending_student"],
          );
        }
      }

      const open = await tx.collaborationRequest.findFirst({
        where: {
          teacherId: input.teacherId,
          centerId: input.centerId,
          subjectId: input.subjectId,
          status: "pending",
        },
        select: { id: true },
      });
      if (open) {
        throw new ConflictError(
          "An open collaboration request between this teacher, center, and subject already exists",
        );
      }

      const request = await tx.collaborationRequest.create({
        data: {
          initiator,
          teacherId: input.teacherId,
          centerId: input.centerId,
          subjectId: input.subjectId,
          gradeLevelId: input.gradeLevelId,
          trackId: input.trackId ?? null,
          roomId: input.roomId ?? null,
          daysOfWeek: input.daysOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          expectedStudents: input.expectedStudents ?? null,
          proposedCenterShare: 0,
          proposedPricingMethod,
          message: input.message ?? null,
          expiresAt: new Date(Date.now() + PENDING_TTL_DAYS * 24 * 60 * 60 * 1000),
          createdBy: user.id,
        },
      });

      // Read on the caller's transaction, as resolveDecisionRecipients does:
      // `resolveCenterAdmins` opens a second connection while this one is
      // still held, and at pool size that deadlocks the instance. Both
      // callers run under platformDb, so the rows are the same ones.
      const recipients =
        initiator === "teacher"
          ? (
              await tx.centerAdminProfile.findMany({
                where: { centerId: input.centerId },
                select: { userId: true },
              })
            ).map((a) => a.userId)
          : [input.teacherId];
      return { request, recipients };
    }
  })();

  return {
    value: request,
    effects: [
      () =>
        notify({
          recipients,
          type: "classroom_request",
          title: "New collaboration request",
          body:
            initiator === "teacher"
              ? "A teacher applied to teach at your center."
              : "A center invited you to teach a class.",
          data: { collaborationRequestId: request.id, initiator },
        }),
    ],
  };
}

export async function listCollaborationRequests(user: SessionUser, status?: string) {
  const where: Prisma.CollaborationRequestWhereInput = {};
  if (status && ["pending", "accepted", "rejected", "cancelled", "expired"].includes(status)) {
    where.status = status as never;
  }

  if (user.role === "teacher") {
    where.teacherId = user.id;
  } else if (user.role === "center_admin" && user.centerId) {
    where.centerId = user.centerId;
  } else {
    throw new ForbiddenError();
  }

  return scopedDb(user, async (tx) => {
    const rows = await tx.collaborationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return enrichRequests(tx, rows);
  });
}

async function enrichRequests(tx: TenantTx, rows: CollaborationRequest[]) {
  const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
  const centerIds = [...new Set(rows.map((r) => r.centerId))];
  const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
  const gradeIds = [...new Set(rows.map((r) => r.gradeLevelId))];
  const roomIds = [...new Set(rows.map((r) => r.roomId).filter(Boolean) as string[])];
  const [teachers, centers, subjects, grades, rooms] = await Promise.all([
    tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }),
    tx.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true } }),
    tx.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, nameAr: true, nameEn: true },
    }),
    tx.gradeLevel.findMany({
      where: { id: { in: gradeIds } },
      select: { id: true, nameAr: true, nameEn: true },
    }),
    tx.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } }),
  ]);
  const tMap = new Map(teachers.map((x) => [x.id, x]));
  const cMap = new Map(centers.map((x) => [x.id, x]));
  const sMap = new Map(subjects.map((x) => [x.id, x]));
  const gMap = new Map(grades.map((x) => [x.id, x]));
  const rMap = new Map(rooms.map((x) => [x.id, x]));
  return rows.map((r) => ({
    ...r,
    teacherName: tMap.get(r.teacherId)?.name ?? null,
    centerName: cMap.get(r.centerId)?.name ?? null,
    subjectName: sMap.get(r.subjectId) ?? null,
    gradeName: gMap.get(r.gradeLevelId) ?? null,
    roomName: r.roomId ? (rMap.get(r.roomId)?.name ?? null) : null,
  }));
}

function assertResponder(
  request: CollaborationRequest,
  user: SessionUser,
  mode: ResponderMode,
): void {
  if (mode === "platform_override") {
    if (user.role !== "super_admin") {
      throw new ForbiddenError("Only a super admin can decide a request on behalf of the platform");
    }
    return;
  }
  if (request.initiator === "teacher") {
    if (user.role !== "center_admin" || user.centerId !== request.centerId) {
      throw new ForbiddenError("Only the invited center can respond to this request");
    }
  } else {
    if (user.role !== "teacher" || user.id !== request.teacherId) {
      throw new ForbiddenError("Only the invited teacher can respond to this request");
    }
  }
}

export type AcceptCollaborationOutcome =
  | { expired: true }
  | {
      expired: false;
      request: CollaborationRequest & { courseId: string; affiliationId: string };
      course: Course & { sessionsGenerated: number };
    };

export async function acceptCollaborationRequest(
  requestId: string,
  user: SessionUser,
  opts: { pricingMethod?: RoomPricingMethodValue | null; as?: ResponderMode } = {},
) {
  const { value, effects } = await platformDb(
    (tx) => acceptCollaborationRequestTx(tx, requestId, user, opts),
    { actorId: user.id },
  );
  if (value.expired) throw new BusinessRuleError("This request has expired");
  await runEffects(effects);
  return { request: value.request, course: value.course };
}

// The expiry mark is the one write that must survive the caller's refusal, so
// it is returned as an outcome instead of thrown: the transaction commits with
// the request marked `expired`, and the opener throws AFTER commit. A caller
// joining this function to its own transaction must do the same (commit, then
// refuse) rather than write an audit row for a decision that never happened.
export async function acceptCollaborationRequestTx(
  tx: TenantTx,
  requestId: string,
  user: SessionUser,
  opts: { pricingMethod?: RoomPricingMethodValue | null; as?: ResponderMode } = {},
): Promise<WithEffects<AcceptCollaborationOutcome>> {
  const mode: ResponderMode = opts.as ?? "party";
  const request = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Collaboration request not found");
  assertResponder(request, user, mode);
  if (request.expiresAt < new Date() && request.status === "pending") {
    await tx.collaborationRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: { status: "expired" },
    });
    return { value: { expired: true }, effects: [] };
  }

  const claimed = await tx.collaborationRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: { status: "accepted", respondedAt: new Date(), respondedBy: user.id },
  });
  if (claimed.count === 0) {
    throw new BusinessRuleError(`Request is already ${request.status}`);
  }

  const existingAff = await tx.centerTeacherAffiliation.findFirst({
    where: {
      centerId: request.centerId,
      teacherId: request.teacherId,
      status: { in: ["pending", "active"] },
    },
  });
  let affiliationId: string;
  if (existingAff) {
    const updated = await tx.centerTeacherAffiliation.update({
      where: { id: existingAff.id },
      data: {
        status: "active",
        respondedAt: new Date(),
      },
    });
    affiliationId = updated.id;
  } else {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const created = await tx.centerTeacherAffiliation.create({
      data: {
        centerId: request.centerId,
        teacherId: request.teacherId,
        status: "active",
        centerShare: 0,
        respondedAt: new Date(),
        expiresAt,
      },
    });
    affiliationId = created.id;
  }

  const [subject, grade, track] = await Promise.all([
    tx.subject.findUnique({
      where: { id: request.subjectId },
      select: { nameAr: true, nameEn: true },
    }),
    tx.gradeLevel.findUnique({
      where: { id: request.gradeLevelId },
      select: { nameAr: true, nameEn: true },
    }),
    request.trackId
      ? tx.track.findUnique({
          where: { id: request.trackId },
          select: { nameAr: true, nameEn: true },
        })
      : null,
  ]);
  if (!subject || !grade) throw new NotFoundError("Catalog entries missing for this request");
  const subjectName = subject.nameAr ?? subject.nameEn;
  const gradeName = grade.nameAr ?? grade.nameEn;
  const trackName = track ? (track.nameAr ?? track.nameEn) : null;

  const endDate =
    request.endDate ??
    (() => {
      const start = new Date(request.startDate);
      const lastDayOfTargetMonth = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth() + DEFAULT_COURSE_MONTHS + 1,
          0,
        ),
      ).getUTCDate();
      const d = new Date(start);
      d.setUTCMonth(
        start.getUTCMonth() + DEFAULT_COURSE_MONTHS,
        Math.min(start.getUTCDate(), lastDayOfTargetMonth),
      );
      return d;
    })();

  let effectiveMethod: RoomPricingMethodValue | null =
    (request.proposedPricingMethod as RoomPricingMethodValue | null) ?? null;
  if (request.roomId && !effectiveMethod) {
    const room = await tx.room.findUnique({
      where: { id: request.roomId },
      select: { allowedPricingMethods: true },
    });
    const allowed = (room?.allowedPricingMethods ?? []) as RoomPricingMethodValue[];
    if (allowed.length === 1) {
      effectiveMethod = allowed[0];
    } else if (
      request.initiator === "center" &&
      (user.role === "teacher" || mode === "platform_override")
    ) {
      if (!opts.pricingMethod) {
        throw new BusinessRuleError(
          "Choose a pricing method for this hall to accept the request",
          { code: "method_choice_required" },
        );
      }
      effectiveMethod = opts.pricingMethod;
    } else {
      effectiveMethod = "whole_room_percent";
    }
  }

  const splitSnapshot = await resolveCoursePricingSnapshot(tx, {
    roomId: request.roomId,
    centerId: request.centerId,
    requestedMethod: effectiveMethod,
  });

  const course = await tx.course.create({
    data: {
      centerId: request.centerId,
      teacherId: request.teacherId,
      defaultRoomId: request.roomId,
      title: `${subjectName} — ${gradeName}${trackName ? ` (${trackName})` : ""}`,
      subject: subjectName, // legacy free-text column
      subjectId: request.subjectId,
      gradeLevelId: request.gradeLevelId,
      trackId: request.trackId,
      daysOfWeek: request.daysOfWeek,
      startTime: request.startTime,
      endTime: request.endTime,
      startDate: request.startDate,
      endDate,
      price: 0, // unpriced until the owner configures plans (Step 4 model)
      maxStudents: request.expectedStudents ?? DEFAULT_MAX_STUDENTS,
      status: "active",
      ...splitSnapshot,
    },
  });

  const sessionIds = await generateSessionsTx(tx, {
    id: course.id,
    teacherId: course.teacherId,
    defaultRoomId: course.defaultRoomId,
    schedulePattern: {
      daysOfWeek: request.daysOfWeek,
      startTime: request.startTime,
      endTime: request.endTime,
      startDate: request.startDate,
      endDate,
    },
  });

  await tx.collaborationRequest.update({
    where: { id: requestId },
    data: { courseId: course.id, affiliationId, proposedPricingMethod: effectiveMethod },
  });

  const counterpartRecipients = await resolveDecisionRecipients(tx, request, mode);
  return {
    value: {
      expired: false,
      request: { ...request, courseId: course.id, affiliationId },
      course: { ...course, sessionsGenerated: sessionIds.length },
    },
    effects: [
      () =>
        notify({
          recipients: counterpartRecipients,
          type: "classroom_request_decided",
          title: "Collaboration accepted",
          body: "The collaboration request was accepted — the class and schedule have been created.",
          data: { collaborationRequestId: request.id, decision: "accepted", courseId: course.id },
        }),
    ],
  };
}

// Who hears about a decision. Read on the caller's transaction rather than
// through `resolveCenterAdmins`, which opens a second connection while this
// one is still holding the row.
async function resolveDecisionRecipients(
  tx: TenantTx,
  request: CollaborationRequest,
  mode: ResponderMode,
): Promise<string[]> {
  const centerAdmins = async () =>
    (
      await tx.centerAdminProfile.findMany({
        where: { centerId: request.centerId },
        select: { userId: true },
      })
    ).map((a) => a.userId);
  if (mode === "platform_override") return [request.teacherId, ...(await centerAdmins())];
  return request.initiator === "teacher" ? [request.teacherId] : centerAdmins();
}

export async function rejectCollaborationRequest(
  requestId: string,
  reason: string | undefined,
  user: SessionUser,
  opts: { as?: ResponderMode } = {},
) {
  const { value, effects } = await platformDb(
    (tx) => rejectCollaborationRequestTx(tx, requestId, reason, user, opts),
    { actorId: user.id },
  );
  await runEffects(effects);
  return value;
}

export async function rejectCollaborationRequestTx(
  tx: TenantTx,
  requestId: string,
  reason: string | undefined,
  user: SessionUser,
  opts: { as?: ResponderMode } = {},
): Promise<WithEffects<{ id: string; status: "rejected" }>> {
  const mode: ResponderMode = opts.as ?? "party";
  const request = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Collaboration request not found");
  assertResponder(request, user, mode);

  const claimed = await tx.collaborationRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: {
      status: "rejected",
      respondedAt: new Date(),
      respondedBy: user.id,
      responseNote: reason ?? null,
    },
  });
  if (claimed.count === 0) {
    throw new BusinessRuleError(`Request is already ${request.status}`);
  }
  const recipients = await resolveDecisionRecipients(tx, request, mode);

  return {
    value: { id: requestId, status: "rejected" },
    effects: [
      () =>
        notify({
          recipients,
          type: "classroom_request_decided",
          title: "Collaboration declined",
          body: reason
            ? `The collaboration request was declined. Reason: ${reason}`
            : "The collaboration request was declined.",
          data: { collaborationRequestId: request.id, decision: "rejected", reason: reason ?? null },
        }),
    ],
  };
}

export async function cancelCollaborationRequest(requestId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const request = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundError("Collaboration request not found");
      const isInitiator =
        request.initiator === "teacher"
          ? user.role === "teacher" && user.id === request.teacherId
          : user.role === "center_admin" && user.centerId === request.centerId;
      if (!isInitiator) throw new ForbiddenError("Only the initiator can cancel a request");

      const claimed = await tx.collaborationRequest.updateMany({
        where: { id: requestId, status: "pending" },
        data: { status: "cancelled", respondedAt: new Date(), respondedBy: user.id },
      });
      if (claimed.count === 0) {
        throw new BusinessRuleError(`Request is already ${request.status}`);
      }
      return { id: requestId, status: "cancelled" };
    },
    { actorId: user.id },
  );
}

export async function expireCollaborationRequests(now: Date) {
  const res = await platformDb((tx) =>
    tx.collaborationRequest.updateMany({
      where: { status: "pending", expiresAt: { lt: now } },
      data: { status: "expired" },
    }),
  );
  return { expired: res.count };
}
