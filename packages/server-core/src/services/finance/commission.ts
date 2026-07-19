import type { TenantTx } from "../../db/scope";

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
    teacherDirectCommissionBp: pick.teacherDirectCommissionBp,
    platformTeacherFee: pick.platformTeacherFee,
    platformCenterFee: pick.platformCenterFee,
    source: pick.scope,
  };
}
