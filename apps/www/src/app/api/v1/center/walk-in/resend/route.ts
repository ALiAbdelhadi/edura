import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { resendWalkIn } from "@/lib/services/walk-in/walk-in";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

/** Re-send the walk-in WhatsApp (fresh one-time link while unclaimed; code reminder after). */
export const POST = withRateLimit(
  centerStaff(
    async (req, _ctx, { acting: user }) => {
      const { studentId, locale } = await parseJson(req, bodySchema);
      return ok(await resendWalkIn(studentId, user, locale));
    },
    { allow: RECEPTION },
  ),
  30,
  30,
);
