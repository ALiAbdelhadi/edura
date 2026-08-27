import { platformDb, type TenantTx } from "@/lib/db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";
import { notify } from "@/lib/services/notifications/notify";
import {
  centerBlacklistStudent,
  removeBlacklistEntry,
} from "@/lib/services/blacklist/blacklist";
import {
  acceptCollaborationRequest,
  rejectCollaborationRequest,
} from "@repo/server-core/services/collaboration/collaboration";
import { deleteReplacedImage, imageSlot } from "@repo/server-core/media/images";
import type { RoomPricingMethodValue } from "@/lib/services/finance/commission";
import type { Prisma } from "@repo/database";

type AuditInput = {
  action: string;
  targetType: string;
  targetId: string;
  centerId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

async function writeAudit(tx: TenantTx, actor: SessionUser, input: AuditInput) {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      centerId: input.centerId,
      beforeState: (input.before ?? undefined) as never,
      afterState: (input.after ?? undefined) as never,
      onBehalfOf: null,
    },
  });
}

function requireReason(reason: string | undefined | null, what: string): string {
  const r = (reason ?? "").trim();
  if (!r) throw new BusinessRuleError(`A reason is required to ${what}`);
  return r;
}

export async function setCenterStatus(
  centerId: string,
  action: "activate" | "deactivate",
  reason: string | undefined,
  actor: SessionUser,
) {
  const next = action === "activate" ? "active" : "suspended";
  const why = action === "deactivate" ? requireReason(reason, "deactivate a center") : (reason ?? "").trim() || null;

  const { before, adminUserIds, centerName } = await platformDb(
    async (tx) => {
      const center = await tx.center.findUnique({ where: { id: centerId } });
      if (!center) throw new NotFoundError("Center not found");
      if (!["active", "suspended"].includes(center.status)) {
        throw new BusinessRuleError(
          `Cannot ${action} a center in status '${center.status}' — use the registration or blacklist flow`,
        );
      }
      if (center.status === next) {
        throw new ConflictError(`Center is already ${next}`);
      }

      const admins = await tx.centerAdminProfile.findMany({
        where: { centerId },
        select: { userId: true },
      });
      const adminUserIds = admins.map((a) => a.userId);
      const adminsBefore = adminUserIds.length
        ? await tx.user.findMany({
            where: { id: { in: adminUserIds } },
            select: { id: true, status: true },
          })
        : [];

      await tx.center.update({ where: { id: centerId }, data: { status: next } });

      if (adminUserIds.length) {
        await tx.user.updateMany({
          where: { id: { in: adminUserIds } },
          data: { status: next === "active" ? "active" : "suspended" },
        });
      }

      await writeAudit(tx, actor, {
        action: action === "activate" ? "center.activated" : "center.deactivated",
        targetType: "center",
        targetId: centerId,
        centerId,
        before: { status: center.status, admins: adminsBefore },
        after: {
          status: next,
          admins: adminUserIds.map((id) => ({ id, status: next === "active" ? "active" : "suspended" })),
          reason: why,
        },
      });

      return { before: center.status, adminUserIds, centerName: center.name };
    },
    { actorId: actor.id },
  );

  await notify({
    recipients: adminUserIds,
    type: "blacklist_action",
    title: action === "activate" ? "Center reactivated" : "Center deactivated",
    body:
      action === "activate"
        ? `Your center "${centerName}" has been reactivated by the platform.`
        : `Your center "${centerName}" has been deactivated by the platform.${why ? ` Reason: ${why}` : ""}`,
    data: { centerId, action, reason: why },
  });

  return { id: centerId, status: next, previousStatus: before };
}

async function assertMemberOfCenter(
  tx: TenantTx,
  centerId: string,
  userId: string,
  kind: "teacher" | "student",
) {
  if (kind === "teacher") {
    const aff = await tx.centerTeacherAffiliation.findFirst({
      where: { centerId, teacherId: userId, removedAt: null, status: { in: ["pending", "active"] } },
      select: { id: true },
    });
    if (!aff) throw new NotFoundError("Teacher is not affiliated with this center");
    return;
  }
  const roster = await tx.centerStudentRoster.findFirst({
    where: { centerId, studentId: userId, leftAt: null },
    select: { id: true },
  });
  if (!roster) throw new NotFoundError("Student is not on this center's roster");
}

export async function setCenterMemberStatus(
  centerId: string,
  userId: string,
  kind: "teacher" | "student",
  action: "activate" | "deactivate",
  reason: string | undefined,
  actor: SessionUser,
) {
  const next = action === "activate" ? "active" : "suspended";
  const why =
    action === "deactivate" ? requireReason(reason, `deactivate a ${kind}`) : (reason ?? "").trim() || null;

  const { previousStatus, name } = await platformDb(
    async (tx) => {
      const center = await tx.center.findUnique({ where: { id: centerId }, select: { id: true } });
      if (!center) throw new NotFoundError("Center not found");

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true, status: true, deletedAt: true },
      });
      if (!user || user.deletedAt) throw new NotFoundError("User not found");
      if (user.role !== kind) {
        throw new BusinessRuleError(`User is a '${user.role}', not a ${kind}`);
      }
      await assertMemberOfCenter(tx, centerId, userId, kind);

      if (user.status === "blacklisted") {
        throw new BusinessRuleError("This account is blacklisted — lift the blacklist first");
      }
      if (user.status === next) throw new ConflictError(`Account is already ${next}`);

      await tx.user.update({ where: { id: userId }, data: { status: next } });

      await writeAudit(tx, actor, {
        action: action === "activate" ? "user.activated" : "user.deactivated",
        targetType: "user",
        targetId: userId,
        centerId,
        before: { status: user.status, role: user.role },
        after: { status: next, role: user.role, scope: kind, reason: why },
      });

      return { previousStatus: user.status, name: user.name };
    },
    { actorId: actor.id },
  );

  await notify({
    recipients: [userId],
    type: "blacklist_action",
    title: action === "activate" ? "Account reactivated" : "Account deactivated",
    body:
      action === "activate"
        ? "Your account has been reactivated by the platform."
        : `Your account has been deactivated by the platform.${why ? ` Reason: ${why}` : ""}`,
    data: { centerId, action, reason: why },
  });

  return { id: userId, name, status: next, previousStatus };
}

export async function removeStudentFromCenter(
  centerId: string,
  studentId: string,
  reason: string | undefined,
  actor: SessionUser,
) {
  const why = requireReason(reason, "remove a student from a center");
  const entry = await centerBlacklistStudent(studentId, why, actor, centerId);

  await platformDb(
    async (tx) => {
      const journaled = await tx.blacklistCascadeAction.findMany({
        where: { entryId: entry.id },
        select: { id: true, entityType: true, entityId: true, courseId: true, prevStatus: true },
      });
      await writeAudit(tx, actor, {
        action: "center.student_removed",
        targetType: "user",
        targetId: studentId,
        centerId,
        before: { rosterActive: true },
        after: {
          rosterActive: false,
          reason: why,
          blacklistEntryId: entry.id,
          reversible: true,
          cascadeJournal: journaled,
        },
      });
    },
    { actorId: actor.id },
  );

  return { studentId, centerId, blacklistEntryId: entry.id };
}

export async function restoreStudentToCenter(
  centerId: string,
  studentId: string,
  reason: string | undefined,
  actor: SessionUser,
) {
  const entryId = await platformDb(async (tx) => {
    const entry = await tx.blacklistEntry.findFirst({
      where: { targetId: studentId, level: "center", centerId, isActive: true },
      select: { id: true },
    });
    if (!entry) throw new NotFoundError("This student is not blocked at this center");
    return entry.id;
  });

  const updated = await removeBlacklistEntry(entryId, actor, reason);

  await platformDb(
    async (tx) => {
      const replayed = await tx.blacklistCascadeAction.findMany({
        where: { entryId },
        select: { entityType: true, entityId: true, reversal: true, reversedAt: true },
      });
      await writeAudit(tx, actor, {
        action: "center.student_restored",
        targetType: "user",
        targetId: studentId,
        centerId,
        before: { rosterActive: false, blacklistEntryId: entryId },
        after: { rosterActive: true, reason: (reason ?? "").trim() || null, cascadeReplay: replayed },
      });
    },
    { actorId: actor.id },
  );

  return { studentId, centerId, blacklistEntryId: updated.id };
}

export async function decideCollaborationRequest(
  requestId: string,
  decision: "approve" | "reject",
  opts: { reason?: string; pricingMethod?: RoomPricingMethodValue | null },
  actor: SessionUser,
) {
  if (actor.role !== "super_admin") {
    throw new ForbiddenError("Only a super admin can decide a request on behalf of the platform");
  }

  const before = await platformDb(async (tx) => {
    const r = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
    if (!r) throw new NotFoundError("Collaboration request not found");
    return r;
  });

  if (decision === "approve") {
    const result = await acceptCollaborationRequest(requestId, actor, {
      pricingMethod: opts.pricingMethod ?? null,
      as: "platform_override",
    });
    await platformDb(
      async (tx) => {
        await writeAudit(tx, actor, {
          action: "collaboration_request.approved",
          targetType: "collaboration_request",
          targetId: requestId,
          centerId: before.centerId,
          before: { status: before.status, proposedPricingMethod: before.proposedPricingMethod },
          after: {
            status: "accepted",
            courseId: result.course.id,
            affiliationId: result.request.affiliationId,
            pricingMethod: result.course.pricingMethod,
            sessionsGenerated: result.course.sessionsGenerated,
            decidedBy: "platform_override",
            reason: (opts.reason ?? "").trim() || null,
          },
        });
      },
      { actorId: actor.id },
    );
    return { id: requestId, status: "accepted", courseId: result.course.id };
  }

  const why = requireReason(opts.reason, "reject a collaboration request");
  await rejectCollaborationRequest(requestId, why, actor, { as: "platform_override" });
  await platformDb(
    async (tx) => {
      await writeAudit(tx, actor, {
        action: "collaboration_request.rejected",
        targetType: "collaboration_request",
        targetId: requestId,
        centerId: before.centerId,
        before: { status: before.status },
        after: { status: "rejected", reason: why, decidedBy: "platform_override" },
      });
    },
    { actorId: actor.id },
  );
  return { id: requestId, status: "rejected" };
}

export const CENTER_PROFILE_FIELDS = [
  "name",
  "description",
  "address",
  "area",
  "governorate",
  "phone",
  "whatsapp",
  "email",
  "logoUrl",
  "classroomCount",
] as const;

export type CenterProfilePatch = Partial<
  Record<(typeof CENTER_PROFILE_FIELDS)[number], string | number | null>
>;

export async function updateCenterProfile(
  centerId: string,
  patch: CenterProfilePatch,
  actor: SessionUser,
) {
  const keys = Object.keys(patch) as (keyof CenterProfilePatch)[];
  const illegal = keys.filter(
    (k) => !(CENTER_PROFILE_FIELDS as readonly string[]).includes(k as string),
  );
  if (illegal.length) {
    throw new ForbiddenError(`These fields are not editable here: ${illegal.join(", ")}`);
  }
  if (!keys.length) throw new BusinessRuleError("Nothing to update");

  let previousLogoUrl: string | null = null;
  const result = await platformDb(
    async (tx) => {
      const center = await tx.center.findUnique({ where: { id: centerId } });
      if (!center) throw new NotFoundError("Center not found");
      previousLogoUrl = center.logoUrl;

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const data: Prisma.CenterUpdateInput = {};
      for (const k of keys) {
        const current = (center as unknown as Record<string, unknown>)[k];
        const next = patch[k];
        if (current === next) continue;
        before[k] = current ?? null;
        after[k] = next ?? null;
        (data as Record<string, unknown>)[k] = next;
      }
      if (!Object.keys(after).length) {
        return { id: centerId, changed: [] as string[] };
      }

      const updated = await tx.center.update({ where: { id: centerId }, data });
      await writeAudit(tx, actor, {
        action: "center.profile_updated",
        targetType: "center",
        targetId: centerId,
        centerId,
        before,
        after,
      });

      return {
        id: centerId,
        changed: Object.keys(after),
        center: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          address: updated.address,
          area: updated.area,
          governorate: updated.governorate,
          phone: updated.phone,
          whatsapp: updated.whatsapp,
          email: updated.email,
          logoUrl: updated.logoUrl,
          classroomCount: updated.classroomCount,
          status: updated.status,
        },
      };
    },
    { actorId: actor.id },
  );

  if (result.changed.includes("logoUrl")) {
    await deleteReplacedImage(previousLogoUrl, result.center?.logoUrl ?? null, {
      owned: imageSlot("logo", centerId),
    });
  }
  return result;
}

export type RoomProfilePatch = {
  name?: string;
  capacity?: number | null;
  price?: number | null;
  facilities?: string[];
  photos?: string[];
  description?: string | null;
  allowedPricingMethods?: ("whole_room_percent" | "per_attending_student")[];
};

export function updateCenterRoomProfile(
  centerId: string,
  roomId: string,
  patch: RoomProfilePatch,
  actor: SessionUser,
) {
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) {
        throw new NotFoundError("Room not found at this center");
      }
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const k of Object.keys(patch) as (keyof RoomProfilePatch)[]) {
        before[k] = (room as unknown as Record<string, unknown>)[k] ?? null;
        after[k] = patch[k] ?? null;
      }
      const updated = await tx.room.update({ where: { id: roomId }, data: patch });
      await writeAudit(tx, actor, {
        action: "center.room_updated",
        targetType: "room",
        targetId: roomId,
        centerId,
        before,
        after,
      });
      return updated;
    },
    { actorId: actor.id },
  );
}

export function createCenterRoom(
  centerId: string,
  input: { name: string; capacity?: number | null; price?: number | null; description?: string | null },
  actor: SessionUser,
) {
  return platformDb(
    async (tx) => {
      const center = await tx.center.findUnique({ where: { id: centerId }, select: { id: true } });
      if (!center) throw new NotFoundError("Center not found");
      const room = await tx.room.create({
        data: {
          centerId,
          name: input.name,
          capacity: input.capacity ?? null,
          price: input.price ?? null,
          description: input.description ?? null,
        },
      });
      await writeAudit(tx, actor, {
        action: "center.room_created",
        targetType: "room",
        targetId: room.id,
        centerId,
        before: null,
        after: { name: room.name, capacity: room.capacity, price: room.price },
      });
      return room;
    },
    { actorId: actor.id },
  );
}

export function setCenterRoomActive(
  centerId: string,
  roomId: string,
  isActive: boolean,
  actor: SessionUser,
) {
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) {
        throw new NotFoundError("Room not found at this center");
      }
      if (room.isActive === isActive) {
        throw new ConflictError(`Room is already ${isActive ? "active" : "inactive"}`);
      }
      const updated = await tx.room.update({ where: { id: roomId }, data: { isActive } });
      await writeAudit(tx, actor, {
        action: isActive ? "center.room_activated" : "center.room_deactivated",
        targetType: "room",
        targetId: roomId,
        centerId,
        before: { isActive: room.isActive },
        after: { isActive },
      });
      return { id: updated.id, isActive: updated.isActive };
    },
    { actorId: actor.id },
  );
}
