import { platformDb, type TenantTx } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { writeAdminAudit as writeAudit } from "../../audit/admin-audit";
import { notifyAfterCommit } from "../../services/notifications/notify";
import {
  centerBlacklistStudentTx,
  removeBlacklistEntryTx,
} from "../../services/blacklist/blacklist";
import {
  acceptCollaborationRequestTx,
  rejectCollaborationRequestTx,
} from "../../services/collaboration/collaboration";
import { runEffects } from "../../db/effects";
import { deleteReplacedImage, imageSlot } from "../../media/images";
import type { RoomPricingMethodValue } from "../../services/finance/commission";
import type { Prisma } from "@repo/database";

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
      // `pending` and `rejected` belong to the registration flow
      // (approveCenter / rejectCenter). `blacklisted` is a legacy CenterStatus
      // value that NO door sets any more: `blacklistCenter` was deleted on
      // 2026-09-12 (docs/follow-ups.md #7) because it was a one-way flip — it
      // suspended every centre admin and nothing could lift it, while every
      // other blacklist in the product is a reversible `blacklist_entries` row.
      // Deactivating is the reversible way to shut a centre down and has the
      // same effect on access. A row still carrying the old value can only be
      // moved by a migration, which is why it is refused rather than ignored.
      if (!["active", "suspended"].includes(center.status)) {
        throw new BusinessRuleError(
          `Cannot ${action} a center in status '${center.status}' — use the registration flow`,
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

  await notifyAfterCommit({
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

  await notifyAfterCommit({
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
  const { value: entry, effects } = await platformDb(
    async (tx) => {
      const { value: entry, effects } = await centerBlacklistStudentTx(
        tx,
        studentId,
        why,
        actor,
        centerId,
      );
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
      return { value: entry, effects };
    },
    { actorId: actor.id },
  );
  await runEffects(effects);

  return { studentId, centerId, blacklistEntryId: entry.id };
}

export async function restoreStudentToCenter(
  centerId: string,
  studentId: string,
  reason: string | undefined,
  actor: SessionUser,
) {
  const { value: updated, effects } = await platformDb(
    async (tx) => {
      const entry = await tx.blacklistEntry.findFirst({
        where: { targetId: studentId, level: "center", centerId, isActive: true },
        select: { id: true },
      });
      if (!entry) throw new NotFoundError("This student is not blocked at this center");
      const entryId = entry.id;

      const { value: updated, effects } = await removeBlacklistEntryTx(tx, entryId, actor, reason);

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
      return { value: updated, effects };
    },
    { actorId: actor.id },
  );
  await runEffects(effects);

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

  if (decision === "approve") {
    const { value, effects } = await platformDb(
      async (tx) => {
        const before = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
        if (!before) throw new NotFoundError("Collaboration request not found");

        const outcome = await acceptCollaborationRequestTx(tx, requestId, actor, {
          pricingMethod: opts.pricingMethod ?? null,
          as: "platform_override",
        });
        // An expired request is marked, committed and refused — there is no
        // decision to audit (see acceptCollaborationRequestTx).
        if (outcome.value.expired) return outcome;

        const result = outcome.value;
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
        return outcome;
      },
      { actorId: actor.id },
    );
    if (value.expired) throw new BusinessRuleError("This request has expired");
    await runEffects(effects);
    return { id: requestId, status: "accepted", courseId: value.course.id };
  }

  const why = requireReason(opts.reason, "reject a collaboration request");
  const { effects } = await platformDb(
    async (tx) => {
      const before = await tx.collaborationRequest.findUnique({ where: { id: requestId } });
      if (!before) throw new NotFoundError("Collaboration request not found");

      const outcome = await rejectCollaborationRequestTx(tx, requestId, why, actor, {
        as: "platform_override",
      });
      await writeAudit(tx, actor, {
        action: "collaboration_request.rejected",
        targetType: "collaboration_request",
        targetId: requestId,
        centerId: before.centerId,
        before: { status: before.status },
        after: { status: "rejected", reason: why, decidedBy: "platform_override" },
      });
      return outcome;
    },
    { actorId: actor.id },
  );
  await runEffects(effects);
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
