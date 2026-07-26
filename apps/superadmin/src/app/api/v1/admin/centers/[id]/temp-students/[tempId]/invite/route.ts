import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminSendTempStudentInvite } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

export const POST = withRateLimit(
  withErrors(async (_req, ctx) => {
    const user = await requireRole("super_admin");
    const { id, tempId } = await ctx.params;
    return ok(await adminSendTempStudentInvite(user, id, tempId));
  }),
  10,
  10,
);
