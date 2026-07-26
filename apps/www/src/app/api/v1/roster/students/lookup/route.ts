import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { lookupStudent } from "@repo/server-core/services/center/roster";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: z.string().email().toLowerCase().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .refine((d) => d.email || d.phone, { message: "Provide email or phone" });

// L4: this endpoint resolves an account by an exact email/phone the caller
// already holds. We return only two booleans — never the person's id, name, or
// email — so a single probe reveals no PII beyond existence, and rate-limiting
// (20 burst, 20/min per IP) stops it being used to sweep the user base.
export const POST = withRateLimit(
  centerStaff(
    async (req, _ctx, { acting }) => {
      const body = await parseJson(req, bodySchema);
      return ok(await lookupStudent(acting, body));
    },
    { allow: RECEPTION },
  ),
  20,
  20,
);
