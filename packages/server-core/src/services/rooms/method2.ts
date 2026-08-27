import type { TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";
import { resolveMethod2Rate } from "../finance/commission";

export async function assertMethod2Enablable(
  tx: TenantTx,
  scope: { roomId?: string | null; centerId?: string | null },
  methods: readonly string[] | undefined,
) {
  if (!methods?.includes("per_attending_student")) return;
  const rate = await resolveMethod2Rate(tx, scope);
  if (!rate) {
    throw new BusinessRuleError(
      "Per-student pricing is not configured for this hall yet — the platform must set the rate first",
    );
  }
}
