import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminResendWalkIn } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ studentId: z.uuid() }).strict();

export const POST = withRateLimit(
  withErrors(async (req, ctx) => {
    const user = await requireRole("super_admin");
    const { id } = await ctx.params;
    const { studentId } = await parseJson(req, bodySchema);
    return ok(await adminResendWalkIn(user, id, studentId));
  }),
  10,
  10,
);
