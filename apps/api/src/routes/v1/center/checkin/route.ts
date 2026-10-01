import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok, fail } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { counterCheckin } from "@repo/server-core/services/attendance/checkin";

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
