import { platformDb, scopedDb, type TenantTx } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import type { CollaborationRequest, Prisma } from "@repo/database";
import { notify } from "@/lib/services/notifications/notify";
import { resolveCenterAdmins } from "@/lib/services/notifications/fanout";
import { generateSessionsTx } from "@/lib/services/sessions/session-generator";
import {
  resolveCoursePricingSnapshot,
  type RoomPricingMethodValue,
} from "@/lib/services/finance/commission";
import { assertMethod2Enablable } from "@/lib/services/rooms/rooms";

const PENDING_TTL_DAYS = 30;
const DEFAULT_COURSE_MONTHS = 3;
const DEFAULT_MAX_STUDENTS = 30;

// ---------------------------------------------------------------------------
// Create (both directions)
// ---------------------------------------------------------------------------

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

  const { request, recipients } = await platformDb(
    async (tx) => {
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

      // Catalog sanity: the subject must actually be offered for the grade
      // (and track when given) — the clean-model guarantee.
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

      // Room-based requests: resolve the pricing method proposal against the
      // room's center-set availability. WHO picks (approved rules): a forced
      // room imposes its method on everyone; a both-methods room is the
      // TEACHER's choice — at creation for teacher-initiated requests, at
      // accept time for center-initiated ones (stored NULL until then; the
      // center may NOT pre-pick for the teacher).
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
          // Teacher is booking — their choice; default to the classic % method
          // for pre-feature clients that send nothing.
          proposedPricingMethod = input.proposedPricingMethod ?? "whole_room_percent";
        } else {
          // Center-initiated on a both-methods room: the teacher picks at
          // accept time. Reject a center-supplied choice instead of silently
          // dropping it.
          if (input.proposedPricingMethod) {
            throw new BusinessRuleError(
              "The teacher chooses the pricing method for this hall when accepting",
            );
          }
          proposedPricingMethod = null;
        }
        // Fail fast at request time when per-student pricing has no configured
        // rate (the accept-time snapshot would throw anyway — worse moment).
        if (proposedPricingMethod === "per_attending_student") {
          await assertMethod2Enablable(
            tx,
            { roomId: input.roomId, centerId: input.centerId },
            ["per_attending_student"],
          );
        }
      }

      // Duplicate guard (also enforced by the partial unique index).
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
          // NO party proposes a money number. Every rate — the room split, the
          // per-student rate, and the flat no-room `affiliation.centerShare` —
          // is SUPERADMIN-ONLY config. This is server-enforced (not merely
          // hidden in the UI), so a crafted request from either side can never
          // smuggle a share onto the affiliation.
          proposedCenterShare: 0,
          proposedPricingMethod,
          message: input.message ?? null,
          expiresAt: new Date(Date.now() + PENDING_TTL_DAYS * 24 * 60 * 60 * 1000),
          createdBy: user.id,
        },
      });

      const recipients =
        initiator === "teacher"
          ? await resolveCenterAdmins(input.centerId)
          : [input.teacherId];
      return { request, recipients };
    },
    { actorId: user.id },
  );

  await notify({
    recipients,
    type: "classroom_request",
    title: "New collaboration request",
    body:
      initiator === "teacher"
        ? "A teacher applied to teach at your center."
        : "A center invited you to teach a class.",
    data: { collaborationRequestId: request.id, initiator },
  });
  return request;
}

// ---------------------------------------------------------------------------
// List (role-scoped) — enriched for the UI
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Accept — THE one-transaction path: affiliation + course + sessions
// ---------------------------------------------------------------------------

function assertResponder(request: CollaborationRequest, user: SessionUser): void {
  if (request.initiator === "teacher") {
    // Teacher applied → the CENTER decides.
    if (user.role !== "center_admin" || user.centerId !== request.centerId) {
      throw new ForbiddenError("Only the invited center can respond to this request");
    }
  } else {
    // Center invited → the TEACHER decides.
    if (user.role !== "teacher" || user.id !== request.teacherId) {
      throw new ForbiddenError("Only the invited teacher can respond to this request");
    }
  }
}

export async function acceptCollaborationRequest(
  requestId: string,
  user: SessionUser,
  opts: { pricingMethod?: RoomPricingMethodValue | null } = {},
) {
  const { request, course, counterpartRecipients } = await platformDb(
    async (tx) => {
      const request = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundError("Collaboration request not found");
      assertResponder(request, user);
      if (request.expiresAt < new Date() && request.status === "pending") {
        await tx.collaborationRequest.update({
          where: { id: requestId },
          data: { status: "expired" },
        });
        throw new BusinessRuleError("This request has expired");
      }

      // Claim: only one responder wins; replays/races fail cleanly.
      const claimed = await tx.collaborationRequest.updateMany({
        where: { id: requestId, status: "pending" },
        data: { status: "accepted", respondedAt: new Date(), respondedBy: user.id },
      });
      if (claimed.count === 0) {
        throw new BusinessRuleError(`Request is already ${request.status}`);
      }

      // 1. Affiliation (active). Its flat `centerShare` (the legacy no-room
      //    money knob) is SUPERADMIN-OWNED — neither side proposes it, so
      //    acceptance never writes it here:
      //      • existing affiliation → centerShare is left EXACTLY as it is,
      //        or a superadmin-set value would be wiped by the next accepted
      //        request between the same teacher and center;
      //      • new affiliation     → starts at 0 until superadmin sets it.
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

      // 2. Course from the request's catalog + schedule fields. price = 0 and
      //    NO plan prices: the owner must configure pricing before students
      //    can subscribe — the UI surfaces this loudly (unpriced state).
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
          ? tx.track.findUnique({ where: { id: request.trackId }, select: { nameEn: true } })
          : null,
      ]);
      if (!subject || !grade) throw new NotFoundError("Catalog entries missing for this request");
      const subjectName = subject.nameEn ?? subject.nameAr;
      const gradeName = grade.nameEn ?? grade.nameAr;

      const endDate =
        request.endDate ??
        (() => {
          const d = new Date(request.startDate);
          d.setMonth(d.getMonth() + DEFAULT_COURSE_MONTHS);
          return d;
        })();

      // Resolve the pricing method for the snapshot. The stored proposal wins;
      // when it is NULL on a both-methods room (center-initiated request), the
      // accepting TEACHER supplies the choice now — required, so the course is
      // never created with an ambiguous method.
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
        } else if (request.initiator === "center" && user.role === "teacher") {
          // The teacher accepts a center invite on a both-methods hall → the
          // choice is theirs, and it must be explicit.
          if (!opts.pricingMethod) {
            throw new BusinessRuleError(
              "Choose a pricing method for this hall to accept the request",
              { code: "method_choice_required" },
            );
          }
          effectiveMethod = opts.pricingMethod;
        } else {
          // Legacy pre-feature request accepted by the center → the classic %
          // method, exactly what those requests meant when created.
          effectiveMethod = "whole_room_percent";
        }
      }

      // Freeze the pricing snapshot onto the course at creation (room-based
      // courses only): the method + the 3-way split % (Method 1) or the
      // platform % + per-student rate (Method 2). Resolves room > center >
      // global from the superadmin config; the snapshot is what settlement
      // reads later, so changing the config never re-rates this course (M4.5).
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
          title: `${subjectName} — ${gradeName}${track?.nameEn ? ` (${track.nameEn})` : ""}`,
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

      // 3. Sessions via the EXISTING generator, inside this same transaction.
      //    A schedule conflict throws ConflictError -> the whole acceptance
      //    (claim + affiliation + course) rolls back; the request stays pending.
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
        // Persist the method the acceptance actually used (fills the NULL left
        // for teacher-picks-at-accept requests — the record of what was agreed).
        data: { courseId: course.id, affiliationId, proposedPricingMethod: effectiveMethod },
      });

      const counterpartRecipients =
        request.initiator === "teacher"
          ? [request.teacherId]
          : await resolveCenterAdmins(request.centerId);
      return {
        request: { ...request, courseId: course.id, affiliationId },
        course: { ...course, sessionsGenerated: sessionIds.length },
        counterpartRecipients,
      };
    },
    { actorId: user.id },
  );

  await notify({
    recipients: counterpartRecipients,
    type: "classroom_request_decided",
    title: "Collaboration accepted",
    body: "The collaboration request was accepted — the class and schedule have been created.",
    data: { collaborationRequestId: request.id, decision: "accepted", courseId: course.id },
  });
  return { request, course };
}

// ---------------------------------------------------------------------------
// Reject / cancel / expire
// ---------------------------------------------------------------------------

export async function rejectCollaborationRequest(
  requestId: string,
  reason: string | undefined,
  user: SessionUser,
) {
  const { request, recipients } = await platformDb(
    async (tx) => {
      const request = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new NotFoundError("Collaboration request not found");
      assertResponder(request, user);

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
      const recipients =
        request.initiator === "teacher"
          ? [request.teacherId]
          : await resolveCenterAdmins(request.centerId);
      return { request, recipients };
    },
    { actorId: user.id },
  );

  await notify({
    recipients,
    type: "classroom_request_decided",
    title: "Collaboration declined",
    body: reason
      ? `The collaboration request was declined. Reason: ${reason}`
      : "The collaboration request was declined.",
    data: { collaborationRequestId: request.id, decision: "rejected", reason: reason ?? null },
  });
  return { id: requestId, status: "rejected" };
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
