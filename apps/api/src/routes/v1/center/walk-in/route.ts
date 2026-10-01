import { z } from "zod";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { phoneSchema } from "@repo/server-core/validation/common";
import { registerWalkIn } from "@repo/server-core/services/walk-in/walk-in";

const bodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    grade: z.string().trim().max(60).optional(),
    locale: z.enum(["ar", "en"]).optional(),
    guardianEmail: z.string().trim().toLowerCase().email().optional(),
    guardianPhone: phoneSchema.optional(),
  })
  .strict();

export const POST = withRateLimit(
  centerStaff(
    async (req, _ctx, { acting: user }) => {
      const body = await parseJson(req, bodySchema);
      return ok(await registerWalkIn(body, user));
    },
    { allow: RECEPTION },
  ),
  30,
  30,
);
