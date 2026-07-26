import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminLookupStudent } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: z.email().toLowerCase().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .refine((d) => d.email || d.phone, { message: "Provide email or phone" });

// L4: existence-only response, and rate-limited exactly like the www twin so
// the back office is not a softer door onto the same probe.
export const POST = withRateLimit(
  withErrors(async (req, ctx) => {
    const user = await requireRole("super_admin");
    const { id } = await ctx.params;
    const body = await parseJson(req, bodySchema);
    return ok(await adminLookupStudent(user, id, body));
  }),
  20,
  20,
);
