import { platformDb } from "@/lib/db/scope";
import { BusinessRuleError } from "@/lib/errors/classes";
import type { SessionUser } from "@/lib/auth/session";

const DEFAULTS = { minTopup: 1000, maxTopup: 500000 }; // mirrors getWalletSettings()

const ABSOLUTE_MAX = 100_000_000;

export function getWalletPolicy() {
  return platformDb(async (tx) => {
    const row = await tx.walletSettings.findFirst();
    return {
      id: row?.id ?? null,
      minTopup: row?.minTopup ?? DEFAULTS.minTopup,
      maxTopup: row?.maxTopup ?? DEFAULTS.maxTopup,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export function updateWalletPolicy(
  input: { minTopup: number; maxTopup: number },
  user: SessionUser,
) {
  if (!Number.isInteger(input.minTopup) || input.minTopup < 1) {
    throw new BusinessRuleError("Minimum top-up must be a positive whole number of piasters");
  }
  if (!Number.isInteger(input.maxTopup) || input.maxTopup < 1) {
    throw new BusinessRuleError("Maximum top-up must be a positive whole number of piasters");
  }
  if (input.maxTopup < input.minTopup) {
    throw new BusinessRuleError("Maximum top-up cannot be lower than the minimum");
  }
  if (input.maxTopup > ABSOLUTE_MAX) {
    throw new BusinessRuleError(
      `Maximum top-up cannot exceed ${(ABSOLUTE_MAX / 100).toLocaleString()} EGP`,
    );
  }

  return platformDb(
    async (tx) => {
      const existing = await tx.walletSettings.findFirst();
      if (existing) {
        return tx.walletSettings.update({
          where: { id: existing.id },
          data: { ...input, updatedBy: user.id },
        });
      }
      return tx.walletSettings.create({ data: { ...input, updatedBy: user.id } });
    },
    { actorId: user.id },
  );
}
