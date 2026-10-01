import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminInviteCenterAdmin } from "@repo/server-core/backoffice/admin/center-people";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z.object({ email: z.email().toLowerCase().trim() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  const result = await adminInviteCenterAdmin(user, id, body);
  return ok({ invited: result.invited, existingUser: result.existingUser }, { status: 201 });
});
