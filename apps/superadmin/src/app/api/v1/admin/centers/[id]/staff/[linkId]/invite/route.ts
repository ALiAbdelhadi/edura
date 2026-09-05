import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminResendStaffInvite } from "@/lib/services/admin/center-people";

export const dynamic = "force-dynamic";

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
