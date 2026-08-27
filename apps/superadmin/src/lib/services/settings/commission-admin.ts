import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

export function getGlobalCommission() {
  return platformDb(async (tx) => {
    const row = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
    return (
      row ?? {
        id: null,
        scope: "global" as const,
        teacherDirectCommissionBp: 1500,
        platformTeacherFee: 200,
        platformCenterFee: 200,
        updatedBy: null,
        updatedAt: null,
      }
    );
  });
}

export function updateGlobalCommission(
  input: {
    teacherDirectCommissionBp: number;
    platformTeacherFee: number;
    platformCenterFee: number;
  },
  user: SessionUser,
) {
  if (
    !Number.isInteger(input.teacherDirectCommissionBp) ||
    input.teacherDirectCommissionBp < 0 ||
    input.teacherDirectCommissionBp > 10000
  ) {
    throw new BusinessRuleError("Commission must be between 0 and 10000 basis points (0–100%)");
  }
  if (
    !Number.isInteger(input.platformTeacherFee) ||
    !Number.isInteger(input.platformCenterFee) ||
    input.platformTeacherFee < 0 ||
    input.platformCenterFee < 0
  ) {
    throw new BusinessRuleError("Fees must be non-negative whole piasters");
  }

  return platformDb(
    async (tx) => {
      const existing = await tx.commissionSetting.findFirst({ where: { scope: "global" } });
      const row = existing
        ? await tx.commissionSetting.update({
            where: { id: existing.id },
            data: { ...input, updatedBy: user.id },
          })
        : await tx.commissionSetting.create({
            data: { scope: "global", ...input, updatedBy: user.id },
          });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "commission.global.updated",
          targetType: "commission_setting",
          targetId: row.id,
          afterState: {
            before: existing
              ? {
                  teacherDirectCommissionBp: existing.teacherDirectCommissionBp,
                  platformTeacherFee: existing.platformTeacherFee,
                  platformCenterFee: existing.platformCenterFee,
                }
              : null,
            after: input,
          } as never,
        },
      });

      return row;
    },
    { actorId: user.id },
  );
}
