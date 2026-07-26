import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminResendStaffInvite } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ locale: z.enum(["ar", "en"]).optional() }).strict();

// Refused once the staff member has set their own password — re-inviting would
// be a password-reset door over someone else's account. That guard lives in the
// kernel service, so it holds from either app.
export const POST = withRateLimit(
  withErrors(async (req, ctx) => {
    const user = await requireRole("super_admin");
    const { id, linkId } = await ctx.params;
    const body = await parseJson(req, bodySchema);
    return ok(await adminResendStaffInvite(user, id, linkId, body));
  }),
  10,
  10,
);
