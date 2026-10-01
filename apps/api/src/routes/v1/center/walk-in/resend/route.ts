import { z } from "zod";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { resendWalkIn } from "@repo/server-core/services/walk-in/walk-in";

const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

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
