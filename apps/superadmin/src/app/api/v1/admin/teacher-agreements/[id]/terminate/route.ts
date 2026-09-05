import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { terminateAgreement } from "@/lib/services/admin/teacher-agreements-admin";

export const dynamic = "force-dynamic";

export const POST = withRole("super_admin", async (user, _req, ctx) => {
  const { id } = await ctx.params;
  return ok(await terminateAgreement(id, user));
});
