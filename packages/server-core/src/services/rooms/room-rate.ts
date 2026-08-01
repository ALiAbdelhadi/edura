import type { CommissionSetting } from "@repo/database";
import type { TenantTx } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import { resolveMethod2Rate } from "../finance/commission";

/**
 * Method-2 (per-attending-student) rate primitives, shared by BOTH writers:
 * the superadmin (unrestricted, any scope) and the CENTER (its own halls only,
 * bounded by the platform's published rate — see `assertWithinCeiling`).
 *
 * They live here rather than in either app so the shape rules, the row layout
 * and the "is this row still carrying something?" question have exactly one
 * implementation. apps/superadmin re-exports these; a second copy would drift.
 */

/** EXACTLY one of the two forms — never both (DB CHECK commission_m2_rate_shape). */
export type M2RateInput = {
  /** Flat piasters per attending student. */
  fee: number | null;
  /** Basis points of the per-session price per attending student. */
  bp: number | null;
};

export function assertM2RateShape(i: M2RateInput): void {
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

export const m2RateData = (input: M2RateInput, userId: string) => ({
  centerPerStudentFee: input.fee,
  centerPerStudentBp: input.bp,
  updatedBy: userId,
});

export function pickM2(row: CommissionSetting | null): M2RateInput | null {
  if (!row || (row.centerPerStudentFee == null && row.centerPerStudentBp == null)) return null;
  return { fee: row.centerPerStudentFee, bp: row.centerPerStudentBp };
}

/** A commission_settings row is deletable only when NOTHING else lives on it. */
export function m2RowIsEmpty(row: CommissionSetting): boolean {
  return (
    row.platformTeacherFee == null &&
    row.platformShareBp == null &&
    row.centerPerStudentFee == null &&
    row.centerPerStudentBp == null
  );
}

/**
 * The CENTER-ONLY bound. A center owns its hall and prices it, but the teacher
 * accepting the booking CANNOT SEE this number — a per-student-only hall shows
 * no price to the teacher on purpose, because the cost depends on attendance
 * (see apps/www .../centers/[id]/rooms). An unbounded center-set rate would
 * therefore let the hall take a share the other party never agreed to and only
 * discovers at settlement. So the platform's published rate (center > global)
 * is the CEILING: the center prices anywhere from 0 up to it, never above.
 *
 * The two forms are not comparable without a lesson price (piasters vs basis
 * points), so the center must quote in the SAME form the platform published.
 * The superadmin is not bound by any of this — it sets the ceiling.
 */
export function assertWithinCeiling(input: M2RateInput, ceiling: M2RateInput | null): void {
  if (!ceiling) {
    throw new BusinessRuleError(
      "Per-student pricing is not configured for this hall yet — the platform must set the rate first",
    );
  }
  if (ceiling.bp != null) {
    if (input.bp == null) {
      throw new BusinessRuleError(
        "The platform publishes this rate as a percentage — your hall's rate must be a percentage too",
      );
    }
    if (input.bp > ceiling.bp) {
      throw new BusinessRuleError(
        `Your hall's per-student share may not exceed the platform maximum of ${ceiling.bp / 100}%`,
      );
    }
    return;
  }
  if (input.fee == null) {
    throw new BusinessRuleError(
      "The platform publishes this rate as a flat amount — your hall's rate must be a flat amount too",
    );
  }
  if (input.fee > ceiling.fee!) {
    throw new BusinessRuleError(
      `Your hall's per-student share may not exceed the platform maximum of ${ceiling.fee! / 100} EGP`,
    );
  }
}

type RoomScope = { roomId: string; centerId: string; actorId: string };

async function assertOwnRoom(tx: TenantTx, roomId: string, centerId: string) {
  const room = await tx.room.findUnique({ where: { id: roomId }, select: { centerId: true } });
  if (!room || room.centerId !== centerId) {
    throw new NotFoundError("Room not found at this center");
  }
}

/**
 * Resolve the ceiling for a center's hall: the platform's rate WITHOUT the
 * room's own row, so a hall that already overrides is still measured against
 * the platform's number and not against itself.
 */
export function resolveRoomRateCeiling(tx: TenantTx, centerId: string) {
  return resolveMethod2Rate(tx, { centerId });
}

/**
 * A CENTER setting its own hall's per-student rate. Runs INSIDE the caller's
 * transaction so it can be written in the same commit as the room itself.
 * Ownership, shape and ceiling are all re-checked here — this function is the
 * gate, not the UI.
 */
export async function setRoomM2RateAsCenter(
  tx: TenantTx,
  { roomId, centerId, actorId }: RoomScope,
  input: M2RateInput,
): Promise<M2RateInput | null> {
  assertM2RateShape(input);
  await assertOwnRoom(tx, roomId, centerId);
  assertWithinCeiling(input, await resolveRoomRateCeiling(tx, centerId));

  const existing = await tx.commissionSetting.findFirst({ where: { scope: "room", roomId } });
  const row = existing
    ? await tx.commissionSetting.update({
        where: { id: existing.id },
        data: m2RateData(input, actorId),
      })
    : await tx.commissionSetting.create({
        data: { scope: "room", roomId, ...m2RateData(input, actorId) },
      });

  await tx.auditLog.create({
    data: {
      actorId,
      action: "m2_rate.room.updated",
      targetType: "room",
      targetId: roomId,
      centerId,
      beforeState: (pickM2(existing) ?? undefined) as never,
      afterState: { ...input } as never,
    },
  });
  return pickM2(row);
}

/** Drop a hall's own rate so it inherits the platform's again. */
export async function clearRoomM2RateAsCenter(
  tx: TenantTx,
  { roomId, centerId, actorId }: RoomScope,
): Promise<void> {
  await assertOwnRoom(tx, roomId, centerId);
  const existing = await tx.commissionSetting.findFirst({ where: { scope: "room", roomId } });
  if (!existing) return;

  if (m2RowIsEmpty({ ...existing, centerPerStudentFee: null, centerPerStudentBp: null })) {
    await tx.commissionSetting.delete({ where: { id: existing.id } });
  } else {
    // The row also carries a split — keep it, drop only the rate columns.
    await tx.commissionSetting.update({
      where: { id: existing.id },
      data: { centerPerStudentFee: null, centerPerStudentBp: null, updatedBy: actorId },
    });
  }
  await tx.auditLog.create({
    data: {
      actorId,
      action: "m2_rate.room.cleared",
      targetType: "room",
      targetId: roomId,
      centerId,
      beforeState: (pickM2(existing) ?? undefined) as never,
    },
  });
}
