import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { resolveRevenueSplit, resolveMethod2Rate } from "@/lib/services/finance/commission";
import type { SessionUser } from "@/lib/auth/session";
import { writeAdminAudit } from "@/lib/services/admin/admin-audit";
import type { CommissionSetting } from "@repo/database";

export type SplitInput = {
  platformShareBp: number;
  teacherShareBp: number;
  centerShareBp: number;
};

function assertSplit(i: SplitInput): void {
  const vals = [i.platformShareBp, i.teacherShareBp, i.centerShareBp];
  if (vals.some((v) => !Number.isInteger(v) || v < 0 || v > 10000)) {
    throw new BusinessRuleError(
      "Each share must be a whole number of basis points between 0 and 10000",
    );
  }
  if (vals[0] + vals[1] + vals[2] !== 10000) {
    throw new BusinessRuleError("The three shares must sum to exactly 100% (10000 basis points)");
  }
}

function pickSplit(row: CommissionSetting): SplitInput | null {
  if (row.platformShareBp == null || row.teacherShareBp == null || row.centerShareBp == null) {
    return null;
  }
  return {
    platformShareBp: row.platformShareBp,
    teacherShareBp: row.teacherShareBp,
    centerShareBp: row.centerShareBp,
  };
}

export type { M2RateInput } from "@repo/server-core/services/rooms/room-rate";
import {
  type M2RateInput,
  assertM2RateShape as assertM2Rate,
  pickM2,
  m2RowIsEmpty as rowIsEmpty,
} from "@repo/server-core/services/rooms/room-rate";

// Split and rate rows are keyed by scope, so the row's previous values are the
// `before`; the shared writer keeps both sides.
function auditLog(
  tx: TenantTx,
  actor: SessionUser,
  action: string,
  targetType: string,
  targetId: string,
  after?: Record<string, unknown>,
  before?: unknown,
) {
  return writeAdminAudit(tx, actor, {
    action,
    targetType,
    targetId,
    before: before ?? null,
    after: after ?? {},
  });
}

export function getCenterRoomsWithSplit(centerId: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true, shortId: true },
    });
    if (!center) throw new NotFoundError("Center not found");

    const rooms = await tx.room.findMany({
      where: { centerId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const roomRows = rooms.length
      ? await tx.commissionSetting.findMany({
          where: { scope: "room", roomId: { in: rooms.map((r) => r.id) } },
        })
      : [];
    const rowByRoom = new Map(roomRows.map((r) => [r.roomId as string, r]));

    const centerSplit = await resolveRevenueSplit(tx, { centerId });
    const centerM2Rate = await resolveMethod2Rate(tx, { centerId });

    return {
      center,
      centerSplit,
      centerM2Rate,
      rooms: rooms.map((room) => {
        const ov = rowByRoom.get(room.id) ?? null;
        const roomSplitOverride = ov ? pickSplit(ov) : null;
        const roomM2Override = pickM2(ov);
        return {
          id: room.id,
          name: room.name,
          capacity: room.capacity,
          facilities: room.facilities,
          photos: room.photos,
          price: room.price,
          description: room.description,
          allowedPricingMethods: room.allowedPricingMethods,
          roomSplitOverride,
          roomM2Override,
          effectiveSplit: roomSplitOverride
            ? { ...roomSplitOverride, source: "room" as const }
            : centerSplit,
          effectiveM2Rate: roomM2Override
            ? { ...roomM2Override, source: "room" as const }
            : centerM2Rate,
        };
      }),
    };
  });
}

export { updateCenterRoomProfile as updateCenterRoom } from "@/lib/services/admin/center-control";

export function getGlobalSplit() {
  return platformDb(async (tx) => {
    const row = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
    return {
      split: row ? pickSplit(row) : null,
      m2Rate: pickM2(row),
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export function updateGlobalSplit(input: SplitInput, user: SessionUser) {
  assertSplit(input);
  return platformDb(
    async (tx) => {
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
      const data = {
        platformShareBp: input.platformShareBp,
        teacherShareBp: input.teacherShareBp,
        centerShareBp: input.centerShareBp,
        updatedBy: user.id,
      };
      const row = existing
        ? await tx.commissionSetting.update({ where: { id: existing.id }, data })
        : await tx.commissionSetting.create({
            data: {
              scope: "global",
              teacherDirectCommissionBp: 1500,
              platformTeacherFee: 200,
              platformCenterFee: 200,
              ...data,
            },
          });
      await auditLog(tx, user, "revenue_split.global.updated", "commission_setting", row.id, input, existing ? pickSplit(existing) : null);
      return pickSplit(row);
    },
    { actorId: user.id },
  );
}

export function getCenterSplit(centerId: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true, shortId: true, status: true },
    });
    if (!center) throw new NotFoundError("Center not found");
    const centerRow = await tx.commissionSetting.findFirst({
      where: { scope: "center", centerId },
    });
    const global = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
    const resolved = await resolveRevenueSplit(tx, { centerId });
    const m2Resolved = await resolveMethod2Rate(tx, { centerId });
    return {
      center,
      override: centerRow ? pickSplit(centerRow) : null,
      global: global ? pickSplit(global) : null,
      resolved,
      m2Rate: {
        override: pickM2(centerRow),
        global: pickM2(global),
        resolved: m2Resolved,
      },
    };
  });
}

export function upsertCenterSplit(centerId: string, input: SplitInput, user: SessionUser) {
  assertSplit(input);
  return platformDb(
    async (tx) => {
      const center = await tx.center.findUnique({ where: { id: centerId }, select: { id: true } });
      if (!center) throw new NotFoundError("Center not found");
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "center", centerId } });
      const data = {
        platformShareBp: input.platformShareBp,
        teacherShareBp: input.teacherShareBp,
        centerShareBp: input.centerShareBp,
        updatedBy: user.id,
      };
      const row = existing
        ? await tx.commissionSetting.update({ where: { id: existing.id }, data })
        : await tx.commissionSetting.create({ data: { scope: "center", centerId, ...data } });
      await auditLog(tx, user, "revenue_split.center.updated", "center", centerId, input, existing ? pickSplit(existing) : null);
      return pickSplit(row);
    },
    { actorId: user.id },
  );
}

export function clearCenterSplit(centerId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "center", centerId } });
      if (existing) {
        if (rowIsEmpty({ ...existing, platformShareBp: null })) {
          await tx.commissionSetting.delete({ where: { id: existing.id } });
        } else {
          await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { platformShareBp: null, teacherShareBp: null, centerShareBp: null, updatedBy: user.id },
          });
        }
        await auditLog(tx, user, "revenue_split.center.cleared", "center", centerId, {}, pickSplit(existing));
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}

export function upsertRoomSplit(
  centerId: string,
  roomId: string,
  input: SplitInput,
  user: SessionUser,
) {
  assertSplit(input);
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) throw new NotFoundError("Room not found at this center");
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "room", roomId } });
      const data = {
        platformShareBp: input.platformShareBp,
        teacherShareBp: input.teacherShareBp,
        centerShareBp: input.centerShareBp,
        updatedBy: user.id,
      };
      const row = existing
        ? await tx.commissionSetting.update({ where: { id: existing.id }, data })
        : await tx.commissionSetting.create({ data: { scope: "room", roomId, ...data } });
      await auditLog(tx, user, "revenue_split.room.updated", "room", roomId, input, existing ? pickSplit(existing) : null);
      return pickSplit(row);
    },
    { actorId: user.id },
  );
}

export function clearRoomSplit(centerId: string, roomId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) throw new NotFoundError("Room not found at this center");
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "room", roomId } });
      if (existing) {
        if (rowIsEmpty({ ...existing, platformShareBp: null })) {
          await tx.commissionSetting.delete({ where: { id: existing.id } });
        } else {
          await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { platformShareBp: null, teacherShareBp: null, centerShareBp: null, updatedBy: user.id },
          });
        }
        await auditLog(tx, user, "revenue_split.room.cleared", "room", roomId, {}, pickSplit(existing));
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}

export function getCenterAffiliations(centerId: string) {
  return platformDb(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true },
    });
    if (!center) throw new NotFoundError("Center not found");

    const rows = await tx.centerTeacherAffiliation.findMany({
      where: { centerId, status: { in: ["pending", "active"] }, removedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const teachers = rows.length
      ? await tx.user.findMany({
          where: { id: { in: rows.map((r) => r.teacherId) } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const nameById = new Map(teachers.map((t) => [t.id, t]));

    const noRoomCounts = rows.length
      ? await tx.course.groupBy({
          by: ["teacherId"],
          where: { centerId, defaultRoomId: null, status: "active" },
          _count: { _all: true },
        })
      : [];
    const noRoomByTeacher = new Map(noRoomCounts.map((c) => [c.teacherId, c._count._all]));

    return {
      center,
      affiliations: rows.map((r) => ({
        id: r.id,
        teacherId: r.teacherId,
        teacherName: nameById.get(r.teacherId)?.name ?? null,
        teacherEmail: nameById.get(r.teacherId)?.email ?? null,
        status: r.status,
        centerShare: r.centerShare ?? 0,
        noRoomCourses: noRoomByTeacher.get(r.teacherId) ?? 0,
      })),
    };
  });
}

export function updateAffiliationCenterShare(
  centerId: string,
  affiliationId: string,
  centerShare: number,
  user: SessionUser,
) {
  if (!Number.isInteger(centerShare) || centerShare < 0 || centerShare > 99_999_900) {
    throw new BusinessRuleError(
      "The center share must be a whole number of piasters between 0 and 999,999",
    );
  }
  return platformDb(
    async (tx) => {
      const aff = await tx.centerTeacherAffiliation.findUnique({ where: { id: affiliationId } });
      if (!aff || aff.centerId !== centerId) {
        throw new NotFoundError("Affiliation not found at this center");
      }
      const updated = await tx.centerTeacherAffiliation.update({
        where: { id: affiliationId },
        data: { centerShare },
      });
      await auditLog(
        tx,
        user,
        "affiliation.center_share.updated",
        "center_teacher_affiliation",
        affiliationId,
        { centerId, teacherId: aff.teacherId, before: aff.centerShare ?? 0, after: centerShare },
        { centerId, teacherId: aff.teacherId, centerShare: aff.centerShare ?? 0 },
      );
      return { id: updated.id, centerShare: updated.centerShare ?? 0 };
    },
    { actorId: user.id },
  );
}

const M2_DATA = (input: M2RateInput, userId: string) => ({
  centerPerStudentFee: input.fee,
  centerPerStudentBp: input.bp,
  updatedBy: userId,
});

export function updateGlobalM2Rate(input: M2RateInput, user: SessionUser) {
  assertM2Rate(input);
  return platformDb(
    async (tx) => {
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
      const row = existing
        ? await tx.commissionSetting.update({
            where: { id: existing.id },
            data: M2_DATA(input, user.id),
          })
        : await tx.commissionSetting.create({
            data: {
              scope: "global",
              teacherDirectCommissionBp: 1500,
              platformTeacherFee: 200,
              platformCenterFee: 200,
              ...M2_DATA(input, user.id),
            },
          });
      await auditLog(
        tx,
        user,
        "m2_rate.global.updated",
        "commission_setting",
        row.id,
        { ...input },
        existing ? pickM2(existing) : null,
      );
      return pickM2(row);
    },
    { actorId: user.id },
  );
}

export function clearGlobalM2Rate(user: SessionUser) {
  return platformDb(
    async (tx) => {
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
      if (existing) {
        await tx.commissionSetting.update({
          where: { id: existing.id },
          data: { centerPerStudentFee: null, centerPerStudentBp: null, updatedBy: user.id },
        });
        await auditLog(tx, user, "m2_rate.global.cleared", "commission_setting", existing.id, {}, pickM2(existing));
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}

export function upsertCenterM2Rate(centerId: string, input: M2RateInput, user: SessionUser) {
  assertM2Rate(input);
  return platformDb(
    async (tx) => {
      const center = await tx.center.findUnique({ where: { id: centerId }, select: { id: true } });
      if (!center) throw new NotFoundError("Center not found");
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "center", centerId } });
      const row = existing
        ? await tx.commissionSetting.update({
            where: { id: existing.id },
            data: M2_DATA(input, user.id),
          })
        : await tx.commissionSetting.create({
            data: { scope: "center", centerId, ...M2_DATA(input, user.id) },
          });
      await auditLog(tx, user, "m2_rate.center.updated", "center", centerId, { ...input }, existing ? pickM2(existing) : null);
      return pickM2(row);
    },
    { actorId: user.id },
  );
}

export function clearCenterM2Rate(centerId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "center", centerId } });
      if (existing) {
        if (rowIsEmpty({ ...existing, centerPerStudentFee: null, centerPerStudentBp: null })) {
          await tx.commissionSetting.delete({ where: { id: existing.id } });
        } else {
          await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { centerPerStudentFee: null, centerPerStudentBp: null, updatedBy: user.id },
          });
        }
        await auditLog(tx, user, "m2_rate.center.cleared", "center", centerId, {}, pickM2(existing));
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}

export function upsertRoomM2Rate(
  centerId: string,
  roomId: string,
  input: M2RateInput,
  user: SessionUser,
) {
  assertM2Rate(input);
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) throw new NotFoundError("Room not found at this center");
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "room", roomId } });
      const row = existing
        ? await tx.commissionSetting.update({
            where: { id: existing.id },
            data: M2_DATA(input, user.id),
          })
        : await tx.commissionSetting.create({
            data: { scope: "room", roomId, ...M2_DATA(input, user.id) },
          });
      await auditLog(tx, user, "m2_rate.room.updated", "room", roomId, { ...input }, existing ? pickM2(existing) : null);
      return pickM2(row);
    },
    { actorId: user.id },
  );
}

export function clearRoomM2Rate(centerId: string, roomId: string, user: SessionUser) {
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) throw new NotFoundError("Room not found at this center");
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "room", roomId } });
      if (existing) {
        if (rowIsEmpty({ ...existing, centerPerStudentFee: null, centerPerStudentBp: null })) {
          await tx.commissionSetting.delete({ where: { id: existing.id } });
        } else {
          await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { centerPerStudentFee: null, centerPerStudentBp: null, updatedBy: user.id },
          });
        }
        await auditLog(tx, user, "m2_rate.room.cleared", "room", roomId, {}, pickM2(existing));
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}
