import type { TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

export type ResolvedCommission = {
  teacherDirectCommissionBp: number;
  platformTeacherFee: number;
  platformCenterFee: number;
  source: "teacher" | "center" | "global" | "fallback";
};

const FALLBACK: ResolvedCommission = {
  teacherDirectCommissionBp: 1500,
  platformTeacherFee: 200,
  platformCenterFee: 200,
  source: "fallback",
};

export async function resolveCommission(
  tx: TenantTx,
  scope: { teacherId?: string | null; centerId?: string | null } = {},
): Promise<ResolvedCommission> {
  const rows = await tx.commissionSetting.findMany({
    where: {
      platformTeacherFee: { not: null },
      OR: [
        { scope: "global" },
        ...(scope.teacherId ? [{ scope: "teacher" as const, teacherId: scope.teacherId }] : []),
        ...(scope.centerId ? [{ scope: "center" as const, centerId: scope.centerId }] : []),
      ],
    },
  });

  const pick =
    rows.find((r) => r.scope === "teacher") ??
    rows.find((r) => r.scope === "center") ??
    rows.find((r) => r.scope === "global");
  if (!pick) return FALLBACK;

  return {
    teacherDirectCommissionBp: pick.teacherDirectCommissionBp ?? FALLBACK.teacherDirectCommissionBp,
    platformTeacherFee: pick.platformTeacherFee ?? FALLBACK.platformTeacherFee,
    platformCenterFee: pick.platformCenterFee ?? FALLBACK.platformCenterFee,
    source: pick.scope as "teacher" | "center" | "global",
  };
}

export type ResolvedSplit = {
  platformShareBp: number;
  teacherShareBp: number;
  centerShareBp: number;
  source: "room" | "center" | "global";
};

export async function resolveRevenueSplit(
  tx: TenantTx,
  scope: { roomId?: string | null; centerId?: string | null } = {},
): Promise<ResolvedSplit | null> {
  const rows = await tx.commissionSetting.findMany({
    where: {
      platformShareBp: { not: null },
      OR: [
        { scope: "global" },
        ...(scope.centerId ? [{ scope: "center" as const, centerId: scope.centerId }] : []),
        ...(scope.roomId ? [{ scope: "room" as const, roomId: scope.roomId }] : []),
      ],
    },
  });

  const pick =
    rows.find((r) => r.scope === "room") ??
    rows.find((r) => r.scope === "center") ??
    rows.find((r) => r.scope === "global");
  if (!pick || pick.platformShareBp == null) return null;

  return {
    platformShareBp: pick.platformShareBp,
    teacherShareBp: pick.teacherShareBp as number,
    centerShareBp: pick.centerShareBp as number,
    source: pick.scope as "room" | "center" | "global",
  };
}

export async function resolveCourseSplitSnapshot(
  tx: TenantTx,
  scope: { roomId?: string | null; centerId?: string | null },
): Promise<
  | { splitPlatformBp: number; splitTeacherBp: number; splitCenterBp: number }
  | Record<string, never>
> {
  if (!scope.roomId) return {};
  const split = await resolveRevenueSplit(tx, scope);
  if (!split) return {};
  return {
    splitPlatformBp: split.platformShareBp,
    splitTeacherBp: split.teacherShareBp,
    splitCenterBp: split.centerShareBp,
  };
}

export type ResolvedM2Rate = {
  fee: number | null;
  bp: number | null;
  source: "room" | "center" | "global";
};

export async function resolveMethod2Rate(
  tx: TenantTx,
  scope: { roomId?: string | null; centerId?: string | null } = {},
): Promise<ResolvedM2Rate | null> {
  const rows = await tx.commissionSetting.findMany({
    where: {
      OR: [
        { centerPerStudentFee: { not: null } },
        { centerPerStudentBp: { not: null } },
      ],
      AND: {
        OR: [
          { scope: "global" },
          ...(scope.centerId ? [{ scope: "center" as const, centerId: scope.centerId }] : []),
          ...(scope.roomId ? [{ scope: "room" as const, roomId: scope.roomId }] : []),
        ],
      },
    },
  });

  const pick =
    rows.find((r) => r.scope === "room") ??
    rows.find((r) => r.scope === "center") ??
    rows.find((r) => r.scope === "global");
  if (!pick) return null;

  return {
    fee: pick.centerPerStudentFee,
    bp: pick.centerPerStudentBp,
    source: pick.scope as "room" | "center" | "global",
  };
}

export async function resolveMethod2RatesForRooms(
  tx: TenantTx,
  scope: { centerId?: string | null; roomIds: readonly string[] },
): Promise<Record<string, ResolvedM2Rate | null>> {
  const { centerId, roomIds } = scope;
  if (!roomIds.length) return {};

  const rows = await tx.commissionSetting.findMany({
    where: {
      OR: [
        { centerPerStudentFee: { not: null } },
        { centerPerStudentBp: { not: null } },
      ],
      AND: {
        OR: [
          { scope: "global" },
          ...(centerId ? [{ scope: "center" as const, centerId }] : []),
          { scope: "room" as const, roomId: { in: [...roomIds] } },
        ],
      },
    },
  });

  const toRate = (r: (typeof rows)[number]): ResolvedM2Rate => ({
    fee: r.centerPerStudentFee,
    bp: r.centerPerStudentBp,
    source: r.scope as "room" | "center" | "global",
  });
  const inherited =
    rows.find((r) => r.scope === "center") ?? rows.find((r) => r.scope === "global");
  const byRoom = new Map(rows.filter((r) => r.scope === "room" && r.roomId).map((r) => [r.roomId!, r]));

  return Object.fromEntries(
    roomIds.map((id) => {
      const pick = byRoom.get(id) ?? inherited;
      return [id, pick ? toRate(pick) : null];
    }),
  );
}

export async function resolveMethod2Availability(
  tx: TenantTx,
  scope: { centerId?: string | null; roomIds?: readonly string[] } = {},
): Promise<{ center: boolean; rooms: Record<string, boolean> }> {
  const roomIds = scope.roomIds ?? [];
  const rows = await tx.commissionSetting.findMany({
    where: {
      OR: [
        { centerPerStudentFee: { not: null } },
        { centerPerStudentBp: { not: null } },
      ],
      AND: {
        OR: [
          { scope: "global" },
          ...(scope.centerId ? [{ scope: "center" as const, centerId: scope.centerId }] : []),
          ...(roomIds.length ? [{ scope: "room" as const, roomId: { in: [...roomIds] } }] : []),
        ],
      },
    },
    select: { scope: true, roomId: true },
  });

  const inherited = rows.some((r) => r.scope === "global" || r.scope === "center");
  const own = new Set(rows.filter((r) => r.scope === "room" && r.roomId).map((r) => r.roomId));
  return {
    center: inherited,
    rooms: Object.fromEntries(roomIds.map((id) => [id, inherited || own.has(id)])),
  };
}

export type RoomPricingMethodValue = "whole_room_percent" | "per_attending_student";

export type CoursePricingSnapshot =
  | Record<string, never>
  | {
      pricingMethod: "whole_room_percent";
      splitPlatformBp: number;
      splitTeacherBp: number;
      splitCenterBp: number;
    }
  | {
      pricingMethod: "per_attending_student";
      splitPlatformBp: number;
      m2CenterFee: number | null;
      m2CenterBp: number | null;
    };

export async function resolveCoursePricingSnapshot(
  tx: TenantTx,
  scope: {
    roomId?: string | null;
    centerId?: string | null;
    requestedMethod?: RoomPricingMethodValue | null;
  },
): Promise<CoursePricingSnapshot> {
  if (!scope.roomId) return {};

  const room = await tx.room.findUnique({
    where: { id: scope.roomId },
    select: { allowedPricingMethods: true },
  });
  if (!room) throw new BusinessRuleError("Hall not found");
  const allowed = room.allowedPricingMethods as RoomPricingMethodValue[];

  let method: RoomPricingMethodValue;
  if (allowed.length === 1) {
    if (scope.requestedMethod && scope.requestedMethod !== allowed[0]) {
      throw new BusinessRuleError("This hall does not offer the requested pricing method");
    }
    method = allowed[0];
  } else {
    if (scope.requestedMethod && !allowed.includes(scope.requestedMethod)) {
      throw new BusinessRuleError("This hall does not offer the requested pricing method");
    }
    method = scope.requestedMethod ?? "whole_room_percent";
  }

  if (method === "whole_room_percent") {
    const split = await resolveRevenueSplit(tx, scope);
    if (!split) return {};
    return {
      pricingMethod: "whole_room_percent",
      splitPlatformBp: split.platformShareBp,
      splitTeacherBp: split.teacherShareBp,
      splitCenterBp: split.centerShareBp,
    };
  }

  const rate = await resolveMethod2Rate(tx, scope);
  if (!rate) {
    throw new BusinessRuleError(
      "Per-student pricing is not configured for this hall yet — the platform must set the rate first",
    );
  }
  const platformBp = (await resolveRevenueSplit(tx, scope))?.platformShareBp ?? 0;
  if (rate.bp != null && platformBp + rate.bp > 10_000) {
    throw new BusinessRuleError(
      "Per-student rate plus the platform share exceeds 100% of the lesson price",
    );
  }
  return {
    pricingMethod: "per_attending_student",
    splitPlatformBp: platformBp,
    m2CenterFee: rate.fee,
    m2CenterBp: rate.bp,
  };
}
