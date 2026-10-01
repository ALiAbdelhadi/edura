import { platformDb } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";
import { isUniqueViolation } from "../../errors/prisma";
import { WALLET_SETTINGS_ONE_ROW } from "../../db/unique-indexes";
import type { SessionUser } from "../../auth/types";

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

export async function updateWalletPolicy(
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

  const save = () =>
    platformDb(
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

  try {
    return await save();
  } catch (err) {
    if (!isUniqueViolation(err, WALLET_SETTINGS_ONE_ROW)) throw err;
    /*
     * Two concurrent FIRST saves: both read no row and both insert, and
     * `wallet_settings_one_row` refuses the second. Converge instead of
     * erroring -- the loser simply saves over the winner, which is what a
     * second admin pressing Save a moment later would have got anyway.
     *
     * The retry has to be a NEW transaction: a failed statement poisons the
     * Postgres transaction it fired in, so recovering inside the same `tx` is
     * not possible. Exactly one retry is enough, and is not a loop: the index
     * guarantees the row now EXISTS, so the retry takes the update branch and
     * cannot conflict again.
     */
    return await save();
  }
}
