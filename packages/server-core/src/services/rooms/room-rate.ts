import type { CommissionSetting } from "@repo/database";
import type { TenantTx } from "../../db/scope";
import { BusinessRuleError, NotFoundError } from "../../errors/classes";
import { resolveMethod2Rate } from "../finance/commission";

export type M2RateInput = {
  fee: number | null;
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

export function m2RowIsEmpty(row: CommissionSetting): boolean {
  return (
    row.platformTeacherFee == null &&
    row.platformShareBp == null &&
    row.centerPerStudentFee == null &&
    row.centerPerStudentBp == null
  );
}

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

export function resolveRoomRateCeiling(tx: TenantTx, centerId: string) {
  return resolveMethod2Rate(tx, { centerId });
}

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
