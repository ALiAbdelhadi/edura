import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok, fail } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { BusinessRuleError } from "@/lib/errors/classes";
import { counterCheckin } from "@/lib/services/attendance/checkin";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ studentId: z.string().uuid(), sessionId: z.string().uuid() })
  .strict();

/**
 * Counter check-in (front desk). Uncovered students return 402 needs_payment —
 * the UI then runs the EXISTING Step 4 walk-in per-session cash path
 * (center/subscriptions) and retries; no money code lives in check-in.
 */
export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);
  try {
    return ok(await counterCheckin(body, user));
  } catch (err) {
    if (
      err instanceof BusinessRuleError &&
      (err.details as { code?: string } | undefined)?.code === "needs_payment"
    ) {
      return fail(402, "needs_payment", err.message, {
        details: err.details as Record<string, unknown>,
      });
    }
    throw err;
  }
});
