import { z } from "zod";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { adminResendStaffInvite } from "@repo/server-core/backoffice/admin/center-people";

const bodySchema = z.object({ locale: z.enum(["ar", "en"]).optional() }).strict();

export const POST = withRateLimit(
  withRole("super_admin", async (user, req, ctx) => {
    const { id, linkId } = await ctx.params;
    const body = await parseJson(req, bodySchema);
    return ok(await adminResendStaffInvite(user, id, linkId, body));
  }),
  10,
  10,
);
