import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminResendStaffInvite } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ locale: z.enum(["ar", "en"]).optional() }).strict();

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
