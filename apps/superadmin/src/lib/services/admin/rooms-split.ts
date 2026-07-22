import { platformDb, type TenantTx } from "@/lib/db/scope";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/classes";
import { resolveRevenueSplit, resolveMethod2Rate } from "@/lib/services/finance/commission";
import type { SessionUser } from "@/lib/auth/session";
import type { CommissionSetting } from "@repo/database";

// ---------------------------------------------------------------------------
// Superadmin management of room profiles + the per-center / per-room revenue
// split (platform/teacher/center %). Editing the split is SUPER_ADMIN ONLY.
// The three shares must sum to exactly 100% (also DB-enforced). Split override
// rows carry ONLY the *_share_bp columns (flat commission left untouched).
// ---------------------------------------------------------------------------

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

// Method-2 (per-attending-student) rate: EXACTLY one of the two forms.
export type M2RateInput = {
  fee: number | null; // flat piasters per attending student
  bp: number | null; // basis points of the per-session price per attending student
};

function assertM2Rate(i: M2RateInput): void {
  const hasFee = i.fee != null;
  const hasBp = i.bp != null;
  if (hasFee === hasBp) {
    throw new BusinessRuleError(
      "Set exactly one rate form: a flat EGP amount per student OR a percentage per student",
    );
  }
  if (hasFee && (!Number.isInteger(i.fee) || i.fee! < 0 || i.fee! > 99_999_900)) {
    throw new BusinessRuleError("The flat per-student fee must be a whole number of piasters >= 0");
  }
  if (hasBp && (!Number.isInteger(i.bp) || i.bp! < 0 || i.bp! > 10_000)) {
    throw new BusinessRuleError(
      "The per-student percentage must be between 0 and 10000 basis points",
    );
  }
}

function pickM2(row: CommissionSetting | null): M2RateInput | null {
  if (!row || (row.centerPerStudentFee == null && row.centerPerStudentBp == null)) return null;
  return { fee: row.centerPerStudentFee, bp: row.centerPerStudentBp };
}

/** A commission_settings row is deletable only when NOTHING else lives on it. */
function rowIsEmpty(row: CommissionSetting): boolean {
  return (
    row.platformTeacherFee == null &&
    row.platformShareBp == null &&
    row.centerPerStudentFee == null &&
    row.centerPerStudentBp == null
  );
}

async function auditLog(
  tx: TenantTx,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  after?: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: { actorId, action, targetType, targetId, afterState: (after ?? {}) as never },
  });
}

// ---------------------------------------------------------------------------
// Rooms (superadmin cross-tenant view + edit incl. price override)
// ---------------------------------------------------------------------------

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
    // ALL room-scope rows (a row may carry a split override, a Method-2 rate,
    // or both).
    const roomRows = rooms.length
      ? await tx.commissionSetting.findMany({
          where: { scope: "room", roomId: { in: rooms.map((r) => r.id) } },
        })
      : [];
    const rowByRoom = new Map(roomRows.map((r) => [r.roomId as string, r]));

    // What a NEW course in this room would inherit if it has no room override.
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
          // The split a NEW course booking this room would be frozen with.
          effectiveSplit: roomSplitOverride
            ? { ...roomSplitOverride, source: "room" as const }
            : centerSplit,
          // The Method-2 rate a NEW per-student course here would freeze.
          effectiveM2Rate: roomM2Override
            ? { ...roomM2Override, source: "room" as const }
            : centerM2Rate,
        };
      }),
    };
  });
}

export function updateCenterRoom(
  centerId: string,
  roomId: string,
  patch: {
    name?: string;
    capacity?: number | null;
    price?: number | null;
    facilities?: string[];
    photos?: string[];
    description?: string | null;
    allowedPricingMethods?: ("whole_room_percent" | "per_attending_student")[];
  },
  user: SessionUser,
) {
  return platformDb(
    async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      if (!room || room.centerId !== centerId) throw new NotFoundError("Room not found at this center");
      const updated = await tx.room.update({ where: { id: roomId }, data: patch });
      await auditLog(tx, user.id, "room.updated", "room", roomId, patch as Record<string, unknown>);
      return updated;
    },
    { actorId: user.id },
  );
}

// ---------------------------------------------------------------------------
// Global default revenue split (applies to any center/room without an override)
// ---------------------------------------------------------------------------

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
            // Should never happen (migration seeds the global row) — recreate with
            // the code-default flat commission so the row stays valid.
            data: {
              scope: "global",
              teacherDirectCommissionBp: 1500,
              platformTeacherFee: 200,
              platformCenterFee: 200,
              ...data,
            },
          });
      await auditLog(tx, user.id, "revenue_split.global.updated", "commission_setting", row.id, input);
      return pickSplit(row);
    },
    { actorId: user.id },
  );
}

// ---------------------------------------------------------------------------
// Center-level revenue split
// ---------------------------------------------------------------------------

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
      await auditLog(tx, user.id, "revenue_split.center.updated", "center", centerId, input);
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
        // Null the split columns; drop the row only when nothing else lives on
        // it (flat commission or a Method-2 rate may share the row).
        if (rowIsEmpty({ ...existing, platformShareBp: null })) {
          await tx.commissionSetting.delete({ where: { id: existing.id } });
        } else {
          await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { platformShareBp: null, teacherShareBp: null, centerShareBp: null, updatedBy: user.id },
          });
        }
        await auditLog(tx, user.id, "revenue_split.center.cleared", "center", centerId, {});
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}

// ---------------------------------------------------------------------------
// Room-level revenue split (most specific)
// ---------------------------------------------------------------------------

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
      await auditLog(tx, user.id, "revenue_split.room.updated", "room", roomId, input);
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
        // A room row may also carry a Method-2 rate now — preserve it.
        if (rowIsEmpty({ ...existing, platformShareBp: null })) {
          await tx.commissionSetting.delete({ where: { id: existing.id } });
        } else {
          await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { platformShareBp: null, teacherShareBp: null, centerShareBp: null, updatedBy: user.id },
          });
        }
        await auditLog(tx, user.id, "revenue_split.room.cleared", "room", roomId, {});
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}

// ---------------------------------------------------------------------------
// Flat per-affiliation center share (the LEGACY no-room money knob).
//
// Courses with no hall settle on `center_teacher_affiliations.center_share` —
// a flat piasters amount per present student. Neither the teacher nor the
// center may propose it any more (collaboration requests always store 0 and
// acceptance never writes it), so THIS is the only place it can be set.
//
// Unlike the split/rate snapshots, this value is read LIVE at settlement time
// (existing engine behavior, unchanged): editing it changes what future
// sessions of existing no-room courses pay out. Already-settled sessions are
// untouched — the ledger is append-only.
// ---------------------------------------------------------------------------

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

    // How many no-room courses actually consume this flat share (0 = the value
    // is currently inert; every course of theirs is hall-based).
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
        user.id,
        "affiliation.center_share.updated",
        "center_teacher_affiliation",
        affiliationId,
        { centerId, teacherId: aff.teacherId, before: aff.centerShare ?? 0, after: centerShare },
      );
      return { id: updated.id, centerShare: updated.centerShare ?? 0 };
    },
    { actorId: user.id },
  );
}

// ---------------------------------------------------------------------------
// Method-2 (per-attending-student) rate — superadmin-only, same scope rows as
// the split, resolution room > center > global. Frozen onto courses at
// creation like the split (M4.5): edits here never re-rate existing courses.
// ---------------------------------------------------------------------------

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
            // Should never happen (migration seeds the global row) — recreate
            // with the code-default flat commission so the row stays valid.
            data: {
              scope: "global",
              teacherDirectCommissionBp: 1500,
              platformTeacherFee: 200,
              platformCenterFee: 200,
              ...M2_DATA(input, user.id),
            },
          });
      await auditLog(tx, user.id, "m2_rate.global.updated", "commission_setting", row.id, {
        ...input,
      });
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
        // The global row always stays (it carries the flat commission + split).
        await tx.commissionSetting.update({
          where: { id: existing.id },
          data: { centerPerStudentFee: null, centerPerStudentBp: null, updatedBy: user.id },
        });
        await auditLog(tx, user.id, "m2_rate.global.cleared", "commission_setting", existing.id, {});
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
      await auditLog(tx, user.id, "m2_rate.center.updated", "center", centerId, { ...input });
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
        await auditLog(tx, user.id, "m2_rate.center.cleared", "center", centerId, {});
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
      await auditLog(tx, user.id, "m2_rate.room.updated", "room", roomId, { ...input });
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
        await auditLog(tx, user.id, "m2_rate.room.cleared", "room", roomId, {});
      }
      return { cleared: true };
    },
    { actorId: user.id },
  );
}
