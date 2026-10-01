import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseOptionalJson } from "@repo/server-core/validation/zod";
import { approveAgreement } from "@repo/server-core/backoffice/admin/teacher-agreements-admin";

const bodySchema = z.object({ effectiveFrom: z.string().datetime().optional() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseOptionalJson(req, bodySchema);
  return ok(await approveAgreement(id, user, body.effectiveFrom));
});
