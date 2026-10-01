import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { rejectAgreement } from "@repo/server-core/backoffice/admin/teacher-agreements-admin";

export const POST = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await rejectAgreement(id, user));
});
