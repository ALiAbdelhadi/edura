import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
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
  withErrors(async (req) => {
    const user = await requireRole("center_admin");
    const { studentId, locale } = await parseJson(req, bodySchema);
    return ok(await resendWalkIn(studentId, user, locale));
  }),
  30,
  30,
);
