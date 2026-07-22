import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { phoneSchema } from "@/lib/validation/common";
import { registerWalkIn } from "@/lib/services/walk-in/walk-in";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    grade: z.string().trim().max(60).optional(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict();

/**
 * Step 7 walk-in registration: shell student + studentCode + WhatsApp with the
 * tokenized onboarding link (or a code reminder when the phone already has an
 * account — never a duplicate).
 */
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
