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
    // Guardian contact, captured at the counter where the guardian is standing.
    // BOTH optional on purpose: registration must never be blocked on it. The
    // email is what opens adult-facing messaging; the phone is kept for the
    // record and for a future SMS/WhatsApp channel.
    guardianEmail: z.string().trim().toLowerCase().email().optional(),
    guardianPhone: phoneSchema.optional(),
  })
  .strict();

/**
 * Step 7 walk-in registration: shell student + studentCode + the tokenized
 * onboarding link EMAILED TO THE GUARDIAN (or a code reminder when the phone
 * already has an account — never a duplicate).
 *
 * A minor with no guardian email gets no email at all — the response carries
 * the claim link so the counter hands it over in person, and flags that a
 * guardian email is still owed.
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
