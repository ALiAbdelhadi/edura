import type { TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

export type ResolvedCommission = {
  teacherDirectCommissionBp: number;
  platformTeacherFee: number;
  platformCenterFee: number;
  /** Where the values came from (for notes/audit trails). */
  source: "teacher" | "center" | "global" | "fallback";
};

// Code fallback if the global row is ever missing (it is inserted by the
// commission_settings migration, so this should never fire in practice).
const FALLBACK: ResolvedCommission = {
  teacherDirectCommissionBp: 1500,
  platformTeacherFee: 200,
  platformCenterFee: 200,
  source: "fallback",
};

/**
 * Resolve the effective commission config: teacher override > center override
 * > global default > code fallback. Step 4.5 only manages the global row from
 * the back-office; override rows are a future feature that needs NO migration
 * and NO change here.
 */
export async function resolveCommission(
  tx: TenantTx,
  scope: { teacherId?: string | null; centerId?: string | null } = {},
): Promise<ResolvedCommission> {
  const rows = await tx.commissionSetting.findMany({
    where: {
      // Only rows that actually carry a flat commission — split-only override
      // rows (center/room revenue-split rows) leave these NULL and must NOT
      // override the flat commission.
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
    // The flat resolver never queries 'room' rows (see the where clause above),
    // so pick.scope is one of teacher | center | global here. Cast to that
    // subset — assignable to ResolvedCommission["source"] — mirroring the
    // `as` narrowing used by resolveRevenueSplit below.
    source: pick.scope as "teacher" | "center" | "global",
  };
}

// ---------------------------------------------------------------------------
// Room-based 3-way revenue split (platform / teacher / center %).
//
// Stored on the SAME commission_settings scope-rows the platform commission
// uses — extended with a 'room' scope + the *_share_bp columns — so it is NOT
// a parallel money path. Superadmin-only config. Resolution precedence for the
// split differs from the flat commission: per-ROOM override > per-CENTER
// override > global default. The three shares are DB-constrained to sum to
// exactly 10000 bp (= 100%). Adding an override needs no migration (just a row).
// ---------------------------------------------------------------------------

export type ResolvedSplit = {
  platformShareBp: number;
  teacherShareBp: number;
  centerShareBp: number;
  source: "room" | "center" | "global";
};

/**
 * Resolve the effective 3-way split for a room+center pair, room > center >
 * global. Returns null when no split is configured at any scope (caller falls
 * back to the legacy flat commission for that course). Only rows that actually
 * carry a split (platformShareBp NOT NULL) are considered.
 */
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

/**
 * The split columns to FREEZE onto a course at creation time (M4.5: settle at
 * the split in effect when the arrangement was created, never re-rated later).
 * Returns the three snapshot columns for a room-based course, or {} for a
 * no-room / unconfigured course (which then settles on the legacy commission).
 * Spread the result straight into `course.create({ data: {...} })`.
 */
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

// ---------------------------------------------------------------------------
// Room pricing METHOD 2 — per-attending-student center share.
//
// The rate lives on the SAME commission_settings scope rows as the % split
// (superadmin-only), resolution room > center > global. A rate is EITHER a
// flat piasters fee per attending student OR basis points of the per-session
// price per attending student (never both — DB CHECK commission_m2_rate_shape).
// ---------------------------------------------------------------------------

export type ResolvedM2Rate = {
  /** Flat piasters per attending student (exclusive with bp). */
  fee: number | null;
  /** Basis points of perSessionPrice per attending student (exclusive with fee). */
  bp: number | null;
  source: "room" | "center" | "global";
};

/**
 * Resolve the effective Method-2 per-attending-student rate for a room+center
 * pair, room > center > global. Returns null when no rate is configured at any
 * scope — Method 2 is then UNAVAILABLE (never falls back to a flat share).
 */
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

/**
 * `resolveMethod2Rate` for MANY rooms of one center at once — the EFFECTIVE
 * rate each hall settles at, same room > center > global precedence.
 *
 * Exists so the teacher's hall picker can show what a hall will actually take
 * per attending student without one query per room. Same answer as calling
 * `resolveMethod2Rate` per room; a drift proof asserts exactly that.
 */
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
  // Precedence resolved ONCE for the whole center, then a room's own row (if
  // any) wins over it — the same order `resolveMethod2Rate` applies per call.
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

/**
 * The same question `resolveMethod2Rate` answers ("does a rate resolve?"), but
 * for a whole center at once and WITHOUT returning the numbers — the rate is
 * superadmin-only config a center may not see.
 *
 * Exists so the center's room form can DISABLE the per-student checkbox instead
 * of letting an operator fill the whole dialog and be rejected on submit by
 * `assertMethod2Enablable`. Same precedence (room > center > global), expressed
 * as "any row in the chain carries a rate" — which is exactly when
 * `resolveMethod2Rate` returns non-null. One query, not one per room.
 */
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

  // A global/center rate covers every room; a room row only covers its own.
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

/**
 * The FULL pricing snapshot to freeze onto a course at creation (supersedes
 * resolveCourseSplitSnapshot at the two production call sites — that function
 * remains for the % columns alone).
 *
 * - No room → {} (legacy / teacher-direct, unchanged).
 * - Validates requestedMethod against the room's allowed methods; a forced
 *   room imposes its method; an unspecified method on a both-methods room
 *   defaults to whole_room_percent (backward-compatible with pre-feature
 *   requests in flight).
 * - whole_room_percent → exactly the old snapshot behavior ({} when no split
 *   is configured anywhere — course settles on the legacy flat commission).
 * - per_attending_student → THROWS when no rate resolves (a Method-2 course
 *   must never silently settle on the affiliation flat share), and for the
 *   bp-type rate enforces platformBp + rateBp <= 10000 so the teacher's
 *   remainder can never go negative by construction.
 */
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
