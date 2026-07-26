import type { TenantTx } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";
import { resolveMethod2Rate } from "../finance/commission";

/**
 * Enabling per-student pricing requires a rate that actually resolves for this
 * room/center (room > center > global) — otherwise a Method-2 booking would be
 * rejected at snapshot time anyway. Fail fast here with a clear message.
 *
 * Extracted out of apps/www/src/lib/services/rooms/rooms.ts (which also carries
 * Cloudinary upload code both apps do not need) so the collaboration service
 * can live in the shared kernel. www re-exports this exact function.
 */
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
