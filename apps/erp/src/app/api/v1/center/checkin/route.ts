import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok, fail } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { BusinessRuleError } from "@/lib/errors/classes";
import { counterCheckin } from "@/lib/services/attendance/checkin";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ studentId: z.string().uuid(), sessionId: z.string().uuid() })
  .strict();

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
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
  },
  { allow: RECEPTION },
);
