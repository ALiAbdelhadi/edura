import { z } from "zod";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { lookupStudent } from "@repo/server-core/services/center/roster";

const bodySchema = z
  .object({
    email: z.string().email().toLowerCase().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .refine((d) => d.email || d.phone, { message: "Provide email or phone" });

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
